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

    // Create descending index on timestamp to support ORDER BY timestamp desc
    const result = await db.collection('audit').createIndex({ timestamp: -1 });
    console.log('Created index on audit.timestamp:', result);
  } catch (err) {
    console.error('Failed to create index:', err?.message || err);
    process.exitCode = 2;
  } finally {
    await client.close();
  }
}

main();
