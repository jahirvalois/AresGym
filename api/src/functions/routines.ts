
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase } from "../lib/mongodb";
import { ObjectId } from 'mongodb';

export async function routinesHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const { db } = await connectToDatabase();
    const collection = db.collection("routines");
    const indieCollection = db.collection("independent_routines");

    if (request.method === 'GET') {
        const userId = request.query.get('userId');
        if (userId) {
            const [r1, r2] = await Promise.all([
                collection.find({ userId }).toArray(),
                indieCollection.find({ userId }).toArray()
            ]);
            const merged = [...(r1 || []), ...(r2 || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return { jsonBody: merged };
        }
        // no userId: return regular routines only
        const routines = await collection.find({}).sort({ createdAt: -1 }).toArray();
        return { jsonBody: routines };
    }

    if (request.method === 'POST') {
        const body: any = await request.json();
        const routine = {
            ...body.routine,
            coachId: body.coachId,
            status: 'ACTIVE',
            createdAt: new Date().toISOString()
        };
        // If routine is flagged independent, store in separate collection
        const isIndependent = routine.source === 'independent' || routine.independent === true;
        if (isIndependent) {
            await indieCollection.updateMany({ userId: routine.userId }, { $set: { status: 'ARCHIVED' } });
            const result = await indieCollection.insertOne(routine);
            return { status: 201, jsonBody: { ...routine, _id: result.insertedId } };
        }

        // Archivar rutinas previas del usuario (regular)
        await collection.updateMany({ userId: routine.userId }, { $set: { status: 'ARCHIVED' } });
        const result = await collection.insertOne(routine);
        return { status: 201, jsonBody: { ...routine, _id: result.insertedId } };
    }

    // Handle ID-based routes (PATCH/DELETE)
    const id = request.params.id;
    if (id) {
        // Try to find in independent collection first
        if (request.method === 'PATCH') {
            const body: any = await request.json();
            const updates = body.updates || body;
            // attempt indie
            const foundIndie = await indieCollection.findOne({ _id: new ObjectId(id) });
            if (foundIndie) {
                await indieCollection.updateOne({ _id: new ObjectId(id) }, { $set: updates });
                const updated = await indieCollection.findOne({ _id: new ObjectId(id) });
                return { status: 200, jsonBody: updated };
            }
            const found = await collection.findOne({ _id: new ObjectId(id) });
            if (found) {
                await collection.updateOne({ _id: new ObjectId(id) }, { $set: updates });
                const updated = await collection.findOne({ _id: new ObjectId(id) });
                return { status: 200, jsonBody: updated };
            }
            return { status: 404 };
        }

        if (request.method === 'DELETE') {
            const foundIndie = await indieCollection.findOne({ _id: new ObjectId(id) });
            if (foundIndie) {
                await indieCollection.deleteOne({ _id: new ObjectId(id) });
                return { status: 204 };
            }
            const found = await collection.findOne({ _id: new ObjectId(id) });
            if (found) {
                await collection.deleteOne({ _id: new ObjectId(id) });
                return { status: 204 };
            }
            return { status: 404 };
        }
    }

    return { status: 405 };
}

app.http('routines', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: routinesHandler
});

app.http('routinesById', {
    methods: ['PATCH', 'DELETE'],
    route: 'routines/{id}',
    authLevel: 'anonymous',
    handler: routinesHandler
});
