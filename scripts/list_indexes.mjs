#!/usr/bin/env node
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Please set it in .env or the environment.');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('AresGymCloud');
    console.log('Connected to MongoDB / Cosmos (Mongo API)');

    const collections = ['logs', 'audit', 'routines'];
    for (const name of collections) {
      try {
        const idx = await db.collection(name).indexes();
        console.log(`Indexes for ${name}:`);
        console.log(JSON.stringify(idx, null, 2));
      } catch (e) {
        console.warn(`Failed to get indexes for ${name}:`, e?.message || e);
      }
    }
  } catch (err) {
    console.error('Failed to list indexes:', err?.message || err);
    process.exitCode = 2;
  } finally {
    await client.close();
  }
}

main();
