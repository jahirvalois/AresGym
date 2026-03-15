
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase } from "../lib/mongodb";

export async function routinesHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const { db } = await connectToDatabase();
    const requesterId = request.headers['x-user-id'] || null;
    const requesterRole = request.headers['x-user-role'] || null;
    const collectionName = requesterRole === 'INDEPENDENT' ? 'independent_routines' : 'routines';
    const collection = db.collection(collectionName);

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
        // Only allow creating routines for self unless requester is COACH/ADMIN
        if (requesterRole !== 'COACH' && requesterRole !== 'ADMIN') {
            if (requesterId && routine.userId && requesterId !== routine.userId) {
                return { status: 403, jsonBody: { error: 'FORBIDDEN' } };
            }
        }
        // Archivar rutinas previas del usuario (en la colección correspondiente)
        await collection.updateMany({ userId: routine.userId }, { $set: { status: 'ARCHIVED' } });
        const result = await collection.insertOne(routine);
        try {
            await db.collection('audit').insertOne({ timestamp: new Date().toISOString(), userId: requesterId || 'ANON', action: 'CREATE_ROUTINE', details: JSON.stringify({ routineId: result.insertedId, collection: collectionName, userId: routine.userId }) });
        } catch (e) { console.warn('Failed to write routine audit', e); }
        return { status: 201, jsonBody: { ...routine, _id: result.insertedId } };
    }

    // Routes with ID for update/delete
    const id = request.params.id;
    if (id && request.method === 'PATCH') {
        const body: any = await request.json();
        const updates = body.updates || {};
        const existing = await collection.findOne({ _id: { $oid: id } } as any) || await collection.findOne({ _id: id } as any);
        if (!existing) return { status: 404, jsonBody: { error: 'NOT_FOUND' } };
        // Only owner or coach/admin can modify
        if (requesterRole !== 'COACH' && requesterRole !== 'ADMIN') {
            if (!requesterId || String(existing.userId) !== String(requesterId)) {
                return { status: 403, jsonBody: { error: 'FORBIDDEN' } };
            }
        }
        await collection.updateOne({ _id: existing._id }, { $set: updates });
        const updated = await collection.findOne({ _id: existing._id });
        return { status: 200, jsonBody: updated };
    }

    if (id && request.method === 'DELETE') {
        const existing = await collection.findOne({ _id: { $oid: id } } as any) || await collection.findOne({ _id: id } as any);
        if (!existing) return { status: 404, jsonBody: { error: 'NOT_FOUND' } };
        if (requesterRole !== 'COACH' && requesterRole !== 'ADMIN') {
            if (!requesterId || String(existing.userId) !== String(requesterId)) {
                return { status: 403, jsonBody: { error: 'FORBIDDEN' } };
            }
        }
        await collection.deleteOne({ _id: existing._id });
        return { status: 204 };
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
