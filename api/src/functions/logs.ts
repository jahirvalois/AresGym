import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase } from "../lib/mongodb";
import { ObjectId } from "mongodb";

export async function logsHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const { db } = await connectToDatabase();
    const collection = db.collection("logs");

    if (request.method === 'GET') {
        const userId = request.query.get('userId');
        if (!userId) return { status: 400, jsonBody: { error: 'MISSING_USERID' } };
        const logs = await collection.find({ userId }).sort({ date: -1 }).toArray();
        return { jsonBody: logs };
    }

    if (request.method === 'POST') {
        const body: any = await request.json();
        const { userId, exerciseId, routineId, weightUsed, weightUnit, repsDone, rpe, notes, type, total } = body;
        if (!userId || !exerciseId) return { status: 400, jsonBody: { error: 'MISSING_FIELDS' } };

        // Validate that the exercise exists in an active routine for this user (if routineId provided, prefer that)
        const routinesColl = db.collection('routines');
        const query = routineId && routineId !== 'none' ? { userId, id: routineId } : { userId, status: { $ne: 'ARCHIVED' } };
        const routine = await routinesColl.findOne(query);
        let allowed = false;
        if (routine) {
            // inspect weeks -> days -> exercises; exercises may be strings or objects
            try {
                const weeks = routine.weeks || [];
                for (const w of weeks) {
                    const days = w.days || [];
                    for (const d of days) {
                        const exercises = d.exercises || [];
                        for (const ex of exercises) {
                            const exId = (ex && (ex.id || ex._id || ex.name)) ? (ex.id || ex._id || ex.name) : ex;
                            if (!exId) continue;
                            if (String(exId) === String(exerciseId) || String(ex) === String(exerciseId)) { allowed = true; break; }
                        }
                        if (allowed) break;
                    }
                    if (allowed) break;
                }
            } catch (e) {
                allowed = false;
            }
        }

        if (!allowed) {
            return { status: 403, jsonBody: { error: 'EXERCISE_NOT_ASSIGNED', message: 'El ejercicio no está asignado en la rutina del usuario.' } };
        }

        const computedTotal = (typeof total === 'number') ? total : ((typeof weightUsed === 'number' && typeof repsDone === 'number') ? (weightUsed * repsDone) : undefined);

        const doc: any = {
            userId,
            exerciseId,
            routineId: routineId || null,
            weightUsed: weightUsed || 0,
            weightUnit: (weightUnit || 'lb'),
            total: computedTotal,
            repsDone: repsDone || 0,
            rpe: rpe || null,
            notes: notes || null,
            type: type || 'routine',
            date: new Date().toISOString()
        };

        const result = await collection.insertOne(doc);
        return { status: 201, jsonBody: { ...doc, _id: result.insertedId } };
    }

    // Rutas con ID (PATCH / DELETE)
    const id = request.params?.id;
    if (id) {
        if (request.method === 'PATCH') {
            const body: any = await request.json();
            const updates = body;
            // normalize numeric fields if present
            if (updates.weightUsed != null) updates.weightUsed = Number(updates.weightUsed);
            if (updates.repsDone != null) updates.repsDone = Number(updates.repsDone);
            if (updates.total != null) updates.total = Number(updates.total);
            await collection.updateOne({ _id: new ObjectId(id) }, { $set: updates });
            const updated = await collection.findOne({ _id: new ObjectId(id) });
            if (updated) return { status: 200, jsonBody: updated };
            return { status: 404, jsonBody: { error: 'NOT_FOUND' } };
        }

        if (request.method === 'DELETE') {
            await collection.deleteOne({ _id: new ObjectId(id) });
            return { status: 204 };
        }
    }

    return { status: 405 };
}

app.http('logs', {
    methods: ['GET', 'POST'],
    route: 'logs',
    authLevel: 'anonymous',
    handler: logsHandler
});

app.http('logsById', {
    methods: ['PATCH', 'DELETE'],
    route: 'logs/{id}',
    authLevel: 'anonymous',
    handler: logsHandler
});
