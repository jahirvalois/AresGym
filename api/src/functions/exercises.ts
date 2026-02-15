
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase } from "../lib/mongodb";

export async function exercisesHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const { db } = await connectToDatabase();
    const path = request.url.split('/').pop();

    if (path === 'bank') {
        if (request.method === 'GET') {
            const data = await db.collection("config").findOne({ id: 'exerciseBank' });
            return { jsonBody: data?.content || {} };
        }
        if (request.method === 'PUT') {
            const body: any = await request.json();
            await db.collection("config").updateOne(
                { id: 'exerciseBank' },
                { $set: { [`content.${body.category}`]: body.exercises } },
                { upsert: true }
            );
            return { status: 200 };
        }
    }

    if (path === 'media') {
        if (request.method === 'GET') {
            const data = await db.collection("config").findOne({ id: 'exerciseMedia' });
            return { jsonBody: data?.content || {} };
        }
        if (request.method === 'PUT') {
            const body: any = await request.json();
            await db.collection("config").updateOne(
                { id: 'exerciseMedia' },
                { $set: { [`content.${body.exerciseName}`]: body.url } },
                { upsert: true }
            );
            return { status: 200 };
        }
    }

    return { status: 404 };
}

app.http('exercisesBank', {
    methods: ['GET', 'PUT'],
    route: 'exercises/bank',
    authLevel: 'anonymous',
    handler: exercisesHandler
});

app.http('exercisesMedia', {
    methods: ['GET', 'PUT'],
    route: 'exercises/media',
    authLevel: 'anonymous',
    handler: exercisesHandler
});
