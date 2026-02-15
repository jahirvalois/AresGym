
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase } from "../lib/mongodb";

export async function routinesHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const { db } = await connectToDatabase();
    const collection = db.collection("routines");

    if (request.method === 'GET') {
        const userId = request.query.get('userId');
        const filter = userId ? { userId } : {};
        const routines = await collection.find(filter).sort({ createdAt: -1 }).toArray();
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
        // Archivar rutinas previas del usuario
        await collection.updateMany({ userId: routine.userId }, { $set: { status: 'ARCHIVED' } });
        const result = await collection.insertOne(routine);
        return { status: 201, jsonBody: { ...routine, _id: result.insertedId } };
    }

    return { status: 405 };
}

app.http('routines', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: routinesHandler
});
