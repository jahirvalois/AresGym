#!/usr/bin/env node
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set.');
  process.exit(1);
}

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node scripts/inspect_user_routines.mjs <userId>');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('AresGymCloud');
    const routines = await db.collection('routines').find({ userId }).toArray();
    if (!routines || routines.length === 0) {
      console.log('No routines found for', userId);
      return;
    }
    console.log(`Found ${routines.length} routine(s) for ${userId}:`);
    for (const r of routines) {
      console.log('--- Routine id:', r.id || r._id || '(no id)');
      console.log(' status:', r.status);
      const weeks = r.weeks || [];
      console.log(' weeks:', weeks.length);
      for (let wi=0; wi<weeks.length; wi++) {
        const w = weeks[wi];
        const days = w.days || [];
        for (let di=0; di<days.length; di++) {
          const d = days[di];
          const exercises = d.exercises || [];
          for (const ex of exercises) {
            const exId = (ex && (ex.id || ex._id || ex.name)) ? (ex.id || ex._id || ex.name) : ex;
            console.log(`  week ${wi} day ${di} exercise:`, JSON.stringify({ raw: ex, exId }));
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to inspect routines:', err?.message || err);
    process.exitCode = 2;
  } finally {
    await client.close();
  }
}

main();
