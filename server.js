
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
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
app.use(express.json());

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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    const user = {
      ...newUser,
      email: normalizedEmail,
      resetToken: hashedToken,
      resetTokenExpiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      isFirstLogin: true
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
    const idParam = req.params.id;
    let filter;
    if (ObjectId.isValid(idParam)) {
      filter = { _id: new ObjectId(idParam) };
    } else {
      filter = { id: idParam };
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
    const idParam = req.params.id;
    if (ObjectId.isValid(idParam)) {
      await db.collection("users").deleteOne({ _id: new ObjectId(idParam) });
    } else {
      await db.collection("users").deleteOne({ id: idParam });
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
    let { provider, idToken, providerId, email, name, avatar } = req.body;
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
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
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
    const userId = req.query.userId;
    const filter = userId ? { userId } : {};
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
    const newRoutine = { ...routine, coachId, status: 'ACTIVE', createdAt: new Date().toISOString() };
    await db.collection("routines").updateMany({ userId: routine.userId }, { $set: { status: 'ARCHIVED' } });
    const result = await db.collection("routines").insertOne(newRoutine);
    await writeAuditLog(coachId || 'COACH', 'CREATE_ROUTINE', { routineId: result.insertedId.toString(), userId: routine.userId });
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
  const data = await db.collection("config").findOne({ id: 'exerciseMedia' });
  res.json(data?.content || {});
});

app.put('/api/exercises/media', async (req, res) => {
  const { exerciseName, url } = req.body;
  await db.collection("config").updateOne({ id: 'exerciseMedia' }, { $set: { [`content.${exerciseName}`]: url } }, { upsert: true });
  await writeAuditLog(req.body.adminId || req.body.currentUser?.id || 'ADMIN', 'UPDATE_EXERCISE_MEDIA', { exerciseName, url });
  res.json({ success: true });
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

// Servir archivos estáticos de la carpeta 'dist'
app.use(express.static(path.join(__dirname, 'dist')));

// Cualquier ruta que no sea de la API o docs, sirve el index.html (soporte para SPA)
app.get('*', (req, res) => {
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
