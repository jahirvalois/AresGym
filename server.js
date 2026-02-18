
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
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
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = process.env.MONGODB_URI;
const dbName = 'AresGymCloud';
let db;
let mailer;

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
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
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
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
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
      const { token, hashedToken, expiresAt } = generateResetToken();
      await db.collection("users").updateOne(
        { _id: existingUser._id },
        {
          $set: {
            resetToken: hashedToken,
            resetTokenExpiresAt: expiresAt.toISOString()
          }
        }
      );

      await sendResetEmail(normalizedEmail, token);

      return res.status(409).json({
        error: 'USER_EXISTS',
        message: 'Usuario existe. Se envio un enlace para cambiar la contrasena (10 min).',
        resetEmailSent: true
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

    await sendInviteEmail(normalizedEmail, user.name || 'Guerrero', token);

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
    res.json({ success: true });
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

    return res.status(200).json({ message: 'Password reset successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Rutinas
app.get('/api/routines', async (req, res) => {
  try {
    const userId = req.query.userId;
    const filter = userId ? { userId } : {};
    const routines = await db.collection("routines").find(filter).sort({ createdAt: -1 }).toArray();
    res.json(routines);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/routines', async (req, res) => {
  try {
    const { coachId, routine } = req.body;
    const newRoutine = { ...routine, coachId, status: 'ACTIVE', createdAt: new Date().toISOString() };
    await db.collection("routines").updateMany({ userId: routine.userId }, { $set: { status: 'ARCHIVED' } });
    const result = await db.collection("routines").insertOne(newRoutine);
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
  res.json({ success: true });
});

// Admin endpoints for exercise bank management
app.post('/api/exercises/bank/category', async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) return res.status(400).json({ error: 'category is required' });
    const key = category;
    await db.collection('config').updateOne({ id: 'exerciseBank' }, { $set: { [`content.${key}`]: [] } }, { upsert: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/exercises/bank/category/:category/exercise', async (req, res) => {
  try {
    const category = decodeURIComponent(req.params.category);
    const { exercise } = req.body;
    if (!exercise) return res.status(400).json({ error: 'exercise is required' });
    await db.collection('config').updateOne({ id: 'exerciseBank' }, { $addToSet: { [`content.${category}`]: exercise } }, { upsert: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/exercises/bank/category/:category/exercise/:exercise', async (req, res) => {
  try {
    const category = decodeURIComponent(req.params.category);
    const exercise = decodeURIComponent(req.params.exercise);
    await db.collection('config').updateOne({ id: 'exerciseBank' }, { $pull: { [`content.${category}`]: exercise } });
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
  app.listen(PORT, () => {
    console.log(`Servidor Ares Pro corriendo en puerto ${PORT}`);
    console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
  });
});
