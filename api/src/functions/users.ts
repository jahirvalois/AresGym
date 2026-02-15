
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase } from "../lib/mongodb";
import { ObjectId } from "mongodb";

export async function usersHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const { db } = await connectToDatabase();
    const collection = db.collection("users");

    if (request.method === 'GET') {
        const users = await collection.find({}).toArray();
        return { jsonBody: users };
    }

    if (request.method === 'POST') {
        const body: any = await request.json();
        const newUser = {
            ...body.newUser,
            createdAt: new Date().toISOString(),
            isFirstLogin: true
        };
        const result = await collection.insertOne(newUser);
        return { status: 201, jsonBody: { ...newUser, _id: result.insertedId } };
    }

    // Rutas con ID
    const id = request.params.id;
    if (id) {
        if (request.method === 'PATCH') {
            const body: any = await request.json();
            await collection.updateOne({ _id: new ObjectId(id) }, { $set: body.updates });
            return { status: 200, jsonBody: { success: true } };
        }
        if (request.method === 'DELETE') {
            await collection.deleteOne({ _id: new ObjectId(id) });
            return { status: 204 };
        }
    }

    return { status: 405, body: "Método no permitido" };
}

app.http('users', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: usersHandler
});

app.http('userById', {
    methods: ['PATCH', 'DELETE'],
    route: 'users/{id}',
    authLevel: 'anonymous',
    handler: usersHandler
});
