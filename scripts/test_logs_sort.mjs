#!/usr/bin/env node
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set.');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('AresGymCloud');
    console.log('Connected to DB');

    const sample = await db.collection('logs').findOne();
    if (!sample) {
      console.warn('No documents found in logs collection.');
      return;
    }
    const userId = sample.userId;
    console.log('Using userId:', userId);

    // Try server-side sort + limit to ensure it doesn't error
    try {
      const docs = await db.collection('logs').find({ userId }).sort({ date: -1 }).limit(5).toArray();
      console.log('Sorted query succeeded. Returned', docs.length, 'documents. Sample dates:');
      for (const d of docs) console.log(' -', d.date);
    } catch (e) {
      console.error('Sorted query failed with error:', e?.message || e);
      process.exitCode = 2;
    }
  } catch (err) {
    console.error('Failed to run test:', err?.message || err);
    process.exitCode = 2;
  } finally {
    await client.close();
  }
}

main();
