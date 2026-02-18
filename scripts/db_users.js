import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();
const uri = process.env.MONGODB_URI;
const dbName = 'AresGymCloud';

async function main() {
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const users = await db.collection('users').find({}).toArray();
    console.log('Users:', users.map(u => ({ _id: u._id, email: u.email, status: u.status })));

    const target = users.find(u => u.status !== 'ACTIVE');
    if (target) {
      console.log('Updating user to ACTIVE:', target.email);
      await db.collection('users').updateOne({ _id: target._id }, { $set: { status: 'ACTIVE' } });
      const updated = await db.collection('users').findOne({ _id: target._id });
      console.log('Updated:', { email: updated.email, status: updated.status });
    } else {
      console.log('No non-ACTIVE users found.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main();
