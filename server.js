
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

// Load environment variables from .env (if present)
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({ origin: true, credentials: true }));
// Add relaxed COOP/COEP headers to avoid opener-policy blocking postMessage from tooling
app.use((req, res, next) => {
  try {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  } catch (e) {}
  return next();
});
// Allow larger JSON payloads for base64 uploads (use with care)
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Rate limiter for API endpoints to mitigate DoS risk
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 10000 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests, please try again later.' }
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Rate limiter for static assets / SPA routes (higher limits)
const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3000, // allow more requests for static assets
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.'
});

const AZ_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || 'exercise-media';
const AZ_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING || '';

function parseConnectionString(conn) {
  const parts = conn.split(';').reduce((acc, cur) => {
    const [k, v] = cur.split('=');
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  return { accountName: parts.AccountName, accountKey: parts.AccountKey };
}

function parseJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const buf = Buffer.from(b64, 'base64');
    return JSON.parse(buf.toString('utf8'));
  } catch (e) { return null; }
}

// MongoDB Connection
const uri = process.env.MONGODB_URI;
const dbName = 'AresGymCloud';
let db;
let mailer;

// Helper: write audit log entries
async function writeAuditLog(userId, action, details) {
  try {
    if (!db) return;
    const entry = {
      timestamp: new Date().toISOString(),
      userId: userId || 'SYSTEM',
      action: action || 'UNKNOWN',
      details: typeof details === 'string' ? details : JSON.stringify(details || {})
    };
    await db.collection('audit').insertOne(entry);
    // also append to local fallback
    appendLocalAudit(entry).catch(() => {});
  } catch (err) {
    console.warn('Failed to write audit log', err);
    // still append locally when DB write fails
    try { appendLocalAudit({ timestamp: new Date().toISOString(), userId: userId || 'SYSTEM', action: action || 'UNKNOWN', details: details }); } catch (e) {}
  }
}

// Also append to local audit file as fallback so events are preserved
async function appendLocalAudit(entry) {
  try {
    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'audit.log');
    fs.appendFileSync(file, JSON.stringify(entry) + os.EOL);
  } catch (e) {
    console.warn('Failed to append local audit file', e);
  }
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  // Fast reject overly long input to avoid catastrophic regex backtracking
  if (email.length === 0 || email.length > 254) return false;
  // Split local and domain parts to do lightweight checks first
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;
  if (local.length > 64) return false; // per RFC limits
  if (/[\s]/.test(local) || /[\s]/.test(domain)) return false;
  // Simple, non-backtracking regex checks for allowed characters
  const localOk = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local);
  const domainOk = /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(domain);
  return !!(localOk && domainOk);
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildEmailQuery(email) {
  const escaped = escapeRegExp(email);
  return { email: new RegExp(`^${escaped}$`, 'i') };
}

function generateResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  return {
    token,
    hashedToken,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  };
}

async function getTransporter() {
  if (mailer) return mailer;
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    }
  });
  await mailer.verify();
  return mailer;
}

async function sendResetEmail(userEmail, resetToken) {
  const appUrl = process.env.APP_URL || 'https://aresgym.com.mx';
  const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;
  const transporter = await getTransporter();

  return transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: userEmail,
    subject: 'Password Reset - Ares Gym',
    text: `Password Reset Request\n\nClick this link to reset your password: ${resetUrl}\n\nThis link will expire in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your password for your Ares Gym account.</p>
        <p>Click the link below to proceed with the password reset. This link will expire in 10 minutes.</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">
          Reset Password
        </a>
        <p>If you didn't request this reset, you can safely ignore this email.</p>
        <hr style="margin-top: 40px; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666;">Ares Gym Pro © 2026</p>
      </div>
    `
  });
}

async function sendInviteEmail(userEmail, userName, inviteToken) {
  const appUrl = process.env.APP_URL || 'https://aresgym.com.mx';
  const inviteUrl = `${appUrl}/reset-password?token=${inviteToken}`;
  const transporter = await getTransporter();

  return transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: userEmail,
    subject: 'Invitacion - Ares Gym',
    text: `Bienvenido a Ares Gym, ${userName}!\n\nEstablece tu contrasena aqui: ${inviteUrl}\n\nEste enlace expira en 10 minutos.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Bienvenido a Ares Gym, ${userName}!</h2>
        <p>Tu cuenta ha sido creada por un administrador.</p>
        <p>Usa el siguiente enlace para establecer tu contrasena. El enlace expira en 10 minutos.</p>
        <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">
          Establecer contrasena
        </a>
        <p>Si no esperabas este correo, puedes ignorarlo.</p>
        <hr style="margin-top: 40px; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666;">Ares Gym Pro © 2026</p>
      </div>
    `
  });
}

async function connectDB() {
  if (!uri) {
    console.warn("MONGODB_URI no definida. El servidor correrá pero la API fallará.");
    return;
  }
  const client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  console.log("Conectado a Cosmos DB for MongoDB");
}

// --- API ROUTES ---

// Usuarios
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.collection("users").find({}).toArray();
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', async (req, res) => {
  try {
    const { newUser } = req.body;
    if (!newUser?.email || !isValidEmail(newUser.email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const normalizedEmail = normalizeEmail(newUser.email);
    const existingUser = await db.collection("users").findOne(buildEmailQuery(normalizedEmail));

    if (existingUser) {
      await writeAuditLog(req.body.currentUser?.id || 'ADMIN', 'CREATE_USER_EXISTS', { email: normalizedEmail });
      // User exists: do NOT auto-send reset email here. Mail should only be sent
      // when the user explicitly requests a password reset (forgot password flow).
      return res.status(409).json({
        error: 'USER_EXISTS',
        message: 'Usuario existe',
        resetEmailSent: false
      });
    }

    const { token, hashedToken, expiresAt } = generateResetToken();

    // Normalize subscriptionEndDate to date-only string (YYYY-MM-DD)
    const normalizeToDateOnly = (val) => {
      if (!val) return undefined;
      // If already YYYY-MM-DD, keep as-is
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
      // Parse and format in America/Chihuahua timezone to avoid off-by-one
      try {
        const d = new Date(val);
        const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Chihuahua', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
        const y = parts.find(p => p.type === 'year').value;
        const m = parts.find(p => p.type === 'month').value;
        const dd = parts.find(p => p.type === 'day').value;
        return `${y}-${m}-${dd}`;
      } catch (e) {
        return undefined;
      }
    };

    const normalizedSubscription = normalizeToDateOnly(newUser?.subscriptionEndDate);

    const user = {
      ...newUser,
      email: normalizedEmail,
      resetToken: hashedToken,
      resetTokenExpiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      isFirstLogin: true,
      ...(normalizedSubscription ? { subscriptionEndDate: normalizedSubscription } : {})
    };

    const result = await db.collection("users").insertOne(user);

    let inviteSent = false;
    try {
      await sendInviteEmail(normalizedEmail, user.name || 'Guerrero', token);
      inviteSent = true;
    } catch (mailErr) {
      console.warn('Failed to send invite email', mailErr?.message || mailErr);
    }

    await writeAuditLog(req.body.currentUser?.id || 'ADMIN', 'CREATE_USER', { userId: result.insertedId.toString(), email: normalizedEmail, name: user.name, inviteSent });

    const responseUser = { ...user, _id: result.insertedId };
    delete responseUser.resetToken;
    delete responseUser.resetTokenExpiresAt;
    res.status(201).json(responseUser);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    const { updates } = req.body;
    const idParam = String(req.params.id || '');
    let filter;
    if (ObjectId.isValid(idParam)) {
      filter = { _id: new ObjectId(idParam) };
    } else {
      filter = { id: { $eq: idParam } };
    }
    // If subscriptionEndDate is being updated, normalize to YYYY-MM-DD in America/Chihuahua
    if (updates && updates.subscriptionEndDate) {
      const normalizeToDateOnly = (val) => {
        if (!val) return undefined;
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
        try {
          const d = new Date(val);
          const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Chihuahua', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
          const y = parts.find(p => p.type === 'year').value;
          const m = parts.find(p => p.type === 'month').value;
          const dd = parts.find(p => p.type === 'day').value;
          return `${y}-${m}-${dd}`;
        } catch (e) {
          return undefined;
        }
      };
      const normalized = normalizeToDateOnly(updates.subscriptionEndDate);
      if (normalized) updates.subscriptionEndDate = normalized;
      else delete updates.subscriptionEndDate;
    }

    await db.collection("users").updateOne(filter, { $set: updates });
    // Fetch and return the updated user document
    const updatedUser = await db.collection('users').findOne(filter);
    await writeAuditLog(req.body.currentUser?.id || 'ADMIN', 'UPDATE_USER', { userId: idParam, updates });
    if (updatedUser) {
      // remove sensitive fields before returning
      const resp = { ...updatedUser };
      delete resp.password;
      delete resp.resetToken;
      delete resp.resetTokenExpiresAt;
      return res.json(resp);
    }
    return res.status(404).json({ error: 'NOT_FOUND' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const idParam = String(req.params.id || '');
    if (ObjectId.isValid(idParam)) {
      await db.collection("users").deleteOne({ _id: new ObjectId(idParam) });
    } else {
      await db.collection("users").deleteOne({ id: { $eq: idParam } });
    }
    await writeAuditLog(req.body.currentUser?.id || 'ADMIN', 'DELETE_USER', { userId: idParam });
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Auth - Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await db.collection("users").findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(200).json({ message: 'If the email exists, a reset link has been sent' });
    }

    const { token, hashedToken, expiresAt } = generateResetToken();
    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          resetToken: hashedToken,
          resetTokenExpiresAt: expiresAt.toISOString()
        }
      }
    );

    await sendResetEmail(normalizedEmail, token);
    await writeAuditLog(null, 'FORGOT_PASSWORD_REQUEST', { email: normalizedEmail });
    return res.status(200).json({ message: 'If the email exists, a reset link has been sent' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Auth - Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await db.collection("users").findOne({
      resetToken: hashedToken,
      resetTokenExpiresAt: { $gt: new Date().toISOString() }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired reset token' });
    }

    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          password: newPassword,
          isFirstLogin: false
        },
        $unset: {
          resetToken: 1,
          resetTokenExpiresAt: 1
        }
      }
    );
    await writeAuditLog(user._id?.toString() || 'UNKNOWN', 'RESET_PASSWORD', { userId: user._id?.toString() });

    return res.status(200).json({ message: 'Password reset successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Auth - Social Login (Google)
app.post('/api/auth/social-login', async (req, res) => {
  try {
    let { provider, idToken, providerId, accessToken, email, name, avatar } = req.body;
    let resolvedName;
    let resolvedAvatar;
    if (!provider) return res.status(400).json({ error: 'provider is required' });

    let normalizedEmail = null;
    let finalProviderId = providerId;

    if (provider === 'google' && idToken) {
      try {
        const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
        if (!resp.ok) return res.status(401).json({ error: 'Invalid Google token' });
        const tokenInfo = await resp.json();
        const expectedAud = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
        if (expectedAud && tokenInfo.aud && tokenInfo.aud !== expectedAud) {
          return res.status(401).json({ error: 'Invalid token audience' });
        }
        if (!tokenInfo.email || (tokenInfo.email_verified !== 'true' && tokenInfo.email_verified !== true)) {
          return res.status(401).json({ error: 'Unverified Google account' });
        }
        normalizedEmail = normalizeEmail(String(tokenInfo.email));
        finalProviderId = tokenInfo.sub || finalProviderId;
        // Force-resolve token values (prefer explicit body, otherwise tokenInfo)
        resolvedName = (name && name.trim()) ? name : (tokenInfo.name || undefined);
        resolvedAvatar = (avatar && avatar.trim()) ? avatar : (tokenInfo.picture || undefined);
      } catch (e) {
        console.error('google token verify failed', e);
        try {
          const logDir = path.join(__dirname, 'data');
          if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
          const logFile = path.join(logDir, 'social_login_error.log');
          const msg = `${new Date().toISOString()} - ${e && e.stack ? e.stack : String(e)}\n`;
          fs.appendFileSync(logFile, msg);
        } catch (ee) {
          console.warn('Failed to write social login error log', ee);
        }
        return res.status(500).json({ error: 'Failed to verify Google token' });
      }
    }

    if (provider === 'microsoft' && accessToken) {
      try {
        const resp = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!resp.ok) return res.status(401).json({ error: 'Invalid Microsoft token' });
        const profile = await resp.json();
        const expectedEmail = profile.mail || profile.userPrincipalName;
        if (!expectedEmail) return res.status(401).json({ error: 'Microsoft account has no email' });
        normalizedEmail = normalizeEmail(String(expectedEmail));
        finalProviderId = profile.id || finalProviderId;
        resolvedName = (name && name.trim()) ? name : (profile.displayName || undefined);
        // profile photo requires additional Graph call; skip for now
      } catch (e) {
        console.error('microsoft token verify failed', e);
        try {
          const logDir = path.join(__dirname, 'data');
          if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
          const logFile = path.join(logDir, 'social_login_error.log');
          const msg = `${new Date().toISOString()} - ${e && e.stack ? e.stack : String(e)}\n`;
          fs.appendFileSync(logFile, msg);
        } catch (ee) {
          console.warn('Failed to write social login error log', ee);
        }
        return res.status(500).json({ error: 'Failed to verify Microsoft token' });
      }
    }

    if (provider === 'apple' && idToken) {
      try {
        const parsed = parseJwt(idToken);
        if (!parsed) return res.status(401).json({ error: 'Invalid Apple token' });
        const expectedAud = process.env.APPLE_CLIENT_ID || process.env.VITE_APPLE_CLIENT_ID;
        if (expectedAud && parsed.aud && parsed.aud !== expectedAud) {
          return res.status(401).json({ error: 'Invalid Apple token audience' });
        }
        // Apple may not always include email on subsequent sign-ins; prefer token email, fallback to body
        const tokenEmail = parsed.email || email;
        if (!tokenEmail) return res.status(401).json({ error: 'Apple token missing email' });
        normalizedEmail = normalizeEmail(String(tokenEmail));
        finalProviderId = parsed.sub || finalProviderId;
        resolvedName = (name && name.trim()) ? name : (parsed.name || undefined);
      } catch (e) {
        console.error('apple token verify failed', e);
        try {
          const logDir = path.join(__dirname, 'data');
          if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
          const logFile = path.join(logDir, 'social_login_error.log');
          const msg = `${new Date().toISOString()} - ${e && e.stack ? e.stack : String(e)}\n`;
          fs.appendFileSync(logFile, msg);
        } catch (ee) {
          console.warn('Failed to write social login error log', ee);
        }
        return res.status(500).json({ error: 'Failed to verify Apple token' });
      }
    }

    if (!normalizedEmail && (!providerId || !email)) {
      return res.status(400).json({ error: 'providerId and email are required' });
    }

    if (!normalizedEmail) normalizedEmail = normalizeEmail(email);

    // If we still don't have resolvedName/avatar, try to decode the idToken payload
    if (!resolvedName && idToken) {
      try {
        const parsed = parseJwt(idToken);
        if (parsed) {
          if (!resolvedName && parsed.name) resolvedName = parsed.name;
          if (!resolvedAvatar && parsed.picture) resolvedAvatar = parsed.picture;
        }
      } catch (e) { /* ignore */ }
    }

    // Try to find existing user by email
    let user = await db.collection('users').findOne({ email: normalizedEmail });
    if (user) {
      // Update provider info if missing
      const updates = {};
      if (!user.provider) updates.provider = provider;
      if (!user.providerId && finalProviderId) updates.providerId = finalProviderId;
      if ((typeof resolvedAvatar !== 'undefined') && !user.profilePicture) updates.profilePicture = resolvedAvatar;
      // If existing user has default placeholder name, prefer Google name
      if (resolvedName && (!user.name || user.name === 'Guerrero')) updates.name = resolvedName;
      if (Object.keys(updates).length > 0) {
        await db.collection('users').updateOne({ _id: user._id }, { $set: updates });
      }
      const { password, resetToken, resetTokenExpiresAt, ...userWithoutSensitive } = user;
      await writeAuditLog(null, 'SOCIAL_LOGIN_EXISTING', { email: normalizedEmail, provider, providerId: finalProviderId });
      return res.status(200).json({ user: userWithoutSensitive });
    }

    // Create new INACTIVE user for social signup
    const formatDateOnlyInTZ = (date) => {
      const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Chihuahua', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      const y = parts.find(p => p.type === 'year').value;
      const m = parts.find(p => p.type === 'month').value;
      const dd = parts.find(p => p.type === 'day').value;
      return `${y}-${m}-${dd}`;
    };

    const newUser = {
      email: normalizedEmail,
      name: (typeof resolvedName !== 'undefined' ? resolvedName : (name || 'Guerrero')),
      role: 'USER',
      status: 'INACTIVE',
      provider,
      providerId: finalProviderId,
      profilePicture: (typeof resolvedAvatar !== 'undefined' ? resolvedAvatar : avatar),
      createdAt: new Date().toISOString(),
      isFirstLogin: true,
      subscriptionEndDate: formatDateOnlyInTZ(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
    };

    const result = await db.collection('users').insertOne(newUser);
    await writeAuditLog(null, 'SOCIAL_SIGNUP', { email: normalizedEmail, userId: result.insertedId.toString() });
    const responseUser = { ...newUser, _id: result.insertedId };
    return res.status(201).json(responseUser);
  } catch (err) {
    console.error('social-login error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Rutinas
app.get('/api/routines', async (req, res) => {
  try {
    const rawUserId = req.query.userId;
    let userId;
    if (rawUserId && typeof rawUserId === 'string') {
      const trimmed = rawUserId.trim();
      if (trimmed !== '') userId = trimmed;
    } else if (typeof rawUserId === 'number') {
      userId = rawUserId;
    }
    const filter = userId ? { userId: { $eq: userId } } : {};
    try {
      const routines = await db.collection("routines").find(filter).sort({ createdAt: -1 }).toArray();
      return res.json(routines);
    } catch (err) {
      console.warn('Routines query with sort failed, falling back to in-memory sort:', err?.message || err);
      const routines = await db.collection('routines').find(filter).toArray();
      routines.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.json(routines);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/routines', async (req, res) => {
  try {
    const { coachId, routine } = req.body;
    const userId = routine?.userId;
    if (!userId || (typeof userId !== 'string' && typeof userId !== 'number')) {
      return res.status(400).json({ error: 'Invalid userId' });
    }
    const newRoutine = { ...routine, coachId, status: 'ACTIVE', createdAt: new Date().toISOString() };
    await db.collection("routines").updateMany({ userId: { $eq: userId } }, { $set: { status: 'ARCHIVED' } });
    const result = await db.collection("routines").insertOne(newRoutine);
    await writeAuditLog(coachId || 'COACH', 'CREATE_ROUTINE', { routineId: result.insertedId.toString(), userId });
    res.status(201).json({ ...newRoutine, _id: result.insertedId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ejercicios y Media
app.get('/api/exercises/bank', async (req, res) => {
  const data = await db.collection("config").findOne({ id: 'exerciseBank' });
  res.json(data?.content || {});
});

app.put('/api/exercises/bank', async (req, res) => {
  const { category, exercises } = req.body;
  await db.collection("config").updateOne({ id: 'exerciseBank' }, { $set: { [`content.${category}`]: exercises } }, { upsert: true });
  await writeAuditLog(req.body.adminId || req.body.currentUser?.id || 'ADMIN', 'UPDATE_EXERCISE_BANK', { category, count: (exercises || []).length });
  res.json({ success: true });
});

// Admin endpoints for exercise bank management
app.post('/api/exercises/bank/category', async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) return res.status(400).json({ error: 'category is required' });
    const key = category;
    await db.collection('config').updateOne({ id: 'exerciseBank' }, { $set: { [`content.${key}`]: [] } }, { upsert: true });
    await writeAuditLog(req.body.adminId || req.body.currentUser?.id || 'ADMIN', 'CREATE_EXERCISE_CATEGORY', { category: key });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/exercises/bank/category/:category', async (req, res) => {
  try {
    const category = decodeURIComponent(req.params.category);
    const doc = await db.collection('config').findOne({ id: 'exerciseBank' });
    const bank = doc?.content || {};
    delete bank[category];
    await db.collection('config').updateOne({ id: 'exerciseBank' }, { $set: { content: bank } }, { upsert: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/exercises/bank/category/:category/exercise', async (req, res) => {
  try {
    const category = decodeURIComponent(req.params.category);
    const { exercise } = req.body;
    if (!exercise) return res.status(400).json({ error: 'exercise is required' });
    await db.collection('config').updateOne({ id: 'exerciseBank' }, { $addToSet: { [`content.${category}`]: exercise } }, { upsert: true });
    await writeAuditLog(req.body.adminId || req.body.currentUser?.id || 'ADMIN', 'ADD_EXERCISE', { category, exercise });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/exercises/bank/category/:category/exercise/:exercise', async (req, res) => {
  try {
    const category = decodeURIComponent(req.params.category);
    const exercise = decodeURIComponent(req.params.exercise);
    await db.collection('config').updateOne({ id: 'exerciseBank' }, { $pull: { [`content.${category}`]: exercise } });
    await writeAuditLog(req.body.adminId || req.body.currentUser?.id || 'ADMIN', 'REMOVE_EXERCISE', { category, exercise });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/exercises/bank/category/rename', async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) return res.status(400).json({ error: 'oldName and newName required' });
    const doc = await db.collection('config').findOne({ id: 'exerciseBank' });
    const bank = doc?.content || {};
    bank[newName] = bank[oldName] || [];
    delete bank[oldName];
    await db.collection('config').updateOne({ id: 'exerciseBank' }, { $set: { content: bank } }, { upsert: true });
    await writeAuditLog(req.body.adminId || req.body.currentUser?.id || 'ADMIN', 'RENAME_EXERCISE_CATEGORY', { oldName, newName });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/exercises/media', async (req, res) => {
  try {
    const data = await db.collection("config").findOne({ id: 'exerciseMedia' });
    const content = data?.content || {};

    // If storage connection is available, generate short-lived READ SAS for blobs
    if (AZ_CONN) {
      try {
        const { accountName, accountKey } = parseConnectionString(AZ_CONN);
        if (accountName && accountKey) {
          const creds = new StorageSharedKeyCredential(accountName, accountKey);
          const signed = {};
          const containerSegment = `/${AZ_CONTAINER}/`;
          const startsOn = new Date();
          const expiresOn = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

          // Aggressively sign any entry that points to our storage account + container
          for (const [k, v] of Object.entries(content)) {
            try {
              if (!v || typeof v !== 'string') { signed[k] = String(v); continue; }
              // If URL already contains a SAS (sv=) return as-is
              if (v.includes('?') && v.includes('sv=')) { signed[k] = v; continue; }

              // Detect if this URL references our storage account and container
              const isSameAccount = v.includes(`${accountName}.blob.core.windows.net`);
              const containerIdx = v.indexOf(containerSegment);

              if (isSameAccount && containerIdx !== -1) {
                // Extract blob name (strip container prefix and any query string)
                let blobName = v.substring(containerIdx + containerSegment.length);
                const qIdx = blobName.indexOf('?');
                if (qIdx !== -1) blobName = blobName.substring(0, qIdx);
                blobName = decodeURIComponent(blobName || '');

                try {
                  const sas = generateBlobSASQueryParameters({ containerName: AZ_CONTAINER, blobName, permissions: BlobSASPermissions.parse('r'), startsOn, expiresOn }, creds).toString();
                  signed[k] = `https://${accountName}.blob.core.windows.net/${AZ_CONTAINER}/${encodeURIComponent(blobName)}?${sas}`;
                  continue;
                } catch (signErr) {
                  // If signing fails for any reason, fall back to original URL
                  console.warn('Failed to sign blob for', k, signErr?.message || signErr);
                  signed[k] = v;
                  continue;
                }
              }

              // Not a blob we can sign — leave as-is
              signed[k] = v;
            } catch (inner) {
              signed[k] = v;
            }
          }

          return res.json(signed);
        }
      } catch (e) {
        console.warn('Failed to generate read SAS for exercise media', e);
      }
    }

    return res.json(content);
  } catch (err) {
    console.error('exercises/media read error', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

app.put('/api/exercises/media', async (req, res) => {
  const { exerciseName, url } = req.body;
  await db.collection("config").updateOne({ id: 'exerciseMedia' }, { $set: { [`content.${exerciseName}`]: url } }, { upsert: true });
  await writeAuditLog(req.body.adminId || req.body.currentUser?.id || 'ADMIN', 'UPDATE_EXERCISE_MEDIA', { exerciseName, url });
  res.json({ success: true });
});

// (upload-base64 endpoint removed; SAS-only uploads are used)

// Generate SAS URL for direct client upload
app.get('/api/exercises/sas', async (req, res) => {
  try {
    const filename = req.query.filename ? String(req.query.filename) : `${Date.now()}`;
    if (!AZ_CONN) return res.status(500).json({ error: 'MISSING_AZ_CONN' });
    const { accountName, accountKey } = parseConnectionString(AZ_CONN);
    if (!accountName || !accountKey) return res.status(500).json({ error: 'INVALID_CONN' });

    const creds = new StorageSharedKeyCredential(accountName, accountKey);
    const blobName = `${Date.now()}-${filename}`.replace(/\s+/g, '_');
    const startsOn = new Date();
    const expiresOn = new Date(Date.now() + (1000 * 60 * 60));

    const sas = generateBlobSASQueryParameters({ containerName: AZ_CONTAINER, blobName, permissions: BlobSASPermissions.parse('cw'), startsOn, expiresOn }, creds).toString();
    const uploadUrl = `https://${accountName}.blob.core.windows.net/${AZ_CONTAINER}/${blobName}?${sas}`;
    const blobUrl = `https://${accountName}.blob.core.windows.net/${AZ_CONTAINER}/${blobName}`;
    res.json({ uploadUrl, blobUrl, expiresOn: expiresOn.toISOString() });
  } catch (err) { console.error('sas error', err); res.status(500).json({ error: err?.message || String(err) }); }
});

// Server-side upload proxy to avoid CORS issues from browser -> Blob
app.post('/api/exercises/upload-proxy', async (req, res) => {
  try {
    const { filename, contentBase64, contentType, exerciseName, adminId } = req.body || {};
    if (!filename || !contentBase64 || !exerciseName) return res.status(400).json({ error: 'MISSING_FIELDS' });
    if (!AZ_CONN) return res.status(500).json({ error: 'MISSING_AZ_CONN' });

    // Upload to blob storage
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZ_CONN);
    const containerClient = blobServiceClient.getContainerClient(AZ_CONTAINER);
    const blobName = `${Date.now()}-${filename}`.replace(/\s+/g, '_');
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const buffer = Buffer.from(contentBase64, 'base64');

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType || 'application/octet-stream' }
    });

    const { accountName } = parseConnectionString(AZ_CONN);
    const blobUrl = `https://${accountName}.blob.core.windows.net/${AZ_CONTAINER}/${blobName}`;

    // Persist mapping in config (same as client flow)
    try {
      await db.collection('config').updateOne({ id: 'exerciseMedia' }, { $set: { [`content.${exerciseName}`]: blobUrl } }, { upsert: true });
    } catch (e) {
      console.warn('Failed to persist exercise media mapping', e);
    }

    await writeAuditLog(adminId || req.body.currentUser?.id || 'SYSTEM', 'UPLOAD_EXERCISE_MEDIA', { exerciseName, blobUrl });

    return res.json({ blobUrl });
  } catch (err) {
    console.error('upload-proxy error', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

// --- SERVIR FRONTEND ---

// OpenAPI spec (basic)
const openapiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Ares Gym Pro API',
    version: '1.0.0',
    description: 'API para Ares Gym Pro',
  },
  servers: [{ url: `http://localhost:${PORT}` }],
  paths: {
    '/api/users': {
      get: {
        summary: 'List users',
        responses: { '200': { description: 'OK' } }
      },
      post: { summary: 'Create user', responses: { '201': { description: 'Created' } } }
    },
    '/api/users/{id}': {
      patch: { summary: 'Update user', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
      delete: { summary: 'Delete user', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'No Content' } } }
    },
    '/api/routines': {
      get: { summary: 'List routines', responses: { '200': { description: 'OK' } } },
      post: { summary: 'Create routine', responses: { '201': { description: 'Created' } } }
    },
    '/api/exercises/bank': {
      get: { summary: 'Get exercise bank', responses: { '200': { description: 'OK' } } },
      put: { summary: 'Update exercise bank', responses: { '200': { description: 'OK' } } }
    },
    '/api/exercises/media': {
      get: { summary: 'Get exercise media', responses: { '200': { description: 'OK' } } },
      put: { summary: 'Upsert exercise media', responses: { '200': { description: 'OK' } } }
    }
  }
};

// Serve OpenAPI JSON
app.get('/openapi.json', (req, res) => res.json(openapiSpec));

// Audit logs endpoint
app.get('/api/audit', async (req, res) => {
  try {
    const logs = await db.collection('audit').find({}).toArray();
    // Sort in-memory to avoid provider index/order-by restrictions
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return res.json(logs.slice(0, 1000));
  } catch (err) {
    console.warn('Audit read failed, falling back to local file:', err?.message || err);
    // Fallback: read local audit file
    try {
      const file = path.join(__dirname, 'data', 'audit.log');
      if (!fs.existsSync(file)) return res.json([]);
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
      const entries = lines.map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return res.json(entries.slice(0, 1000));
    } catch (e) {
      console.warn('Failed reading local audit file', e?.message || e);
      return res.json([]);
    }
  }
});

// Serve Swagger UI at /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

// Servir archivos estáticos de la carpeta 'dist' (rate-limited)
app.use('/', staticLimiter, express.static(path.join(__dirname, 'dist')));

// Cualquier ruta que no sea de la API o docs, sirve el index.html (soporte para SPA)
app.get('*', staticLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start
connectDB().then(() => {
  // Log important env values for debugging social login
  try {
    console.log('ENV GOOGLE_CLIENT_ID =', process.env.GOOGLE_CLIENT_ID);
    console.log('ENV VITE_GOOGLE_CLIENT_ID =', process.env.VITE_GOOGLE_CLIENT_ID);
    console.log('ENV VITE_API_BASE_URL =', process.env.VITE_API_BASE_URL);
  } catch (e) {
    console.warn('Failed to read env vars', e);
  }

  app.listen(PORT, () => {
    console.log(`Servidor Ares Pro corriendo en puerto ${PORT}`);
    console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
  });
});
