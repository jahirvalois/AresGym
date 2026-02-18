import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = 'AresGymCloud';

async function main() {
  if (!uri) {
    console.error('MONGODB_URI not set in .env');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log('Connected to Cosmos DB');
    const db = client.db(dbName);

    const bankDoc = await db.collection('config').findOne({ id: 'exerciseBank' });
    const mediaDoc = await db.collection('config').findOne({ id: 'exerciseMedia' });

    console.log('\n--- exerciseBank ---');
    console.log(JSON.stringify(bankDoc?.content || {}, null, 2));

    console.log('\n--- exerciseMedia ---');
    console.log(JSON.stringify(mediaDoc?.content || {}, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

main();
