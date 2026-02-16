
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';

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
    const user = { ...newUser, createdAt: new Date().toISOString(), isFirstLogin: true };
    const result = await db.collection("users").insertOne(user);
    res.status(201).json({ ...user, _id: result.insertedId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    const { updates } = req.body;
    await db.collection("users").updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await db.collection("users").deleteOne({ _id: new ObjectId(req.params.id) });
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
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

// Servir archivos estáticos de la carpeta 'dist'
app.use(express.static(path.join(__dirname, 'dist')));

// Cualquier ruta que no sea de la API, sirve el index.html (soporte para SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor Ares Pro corriendo en puerto ${PORT}`);
  });
});
