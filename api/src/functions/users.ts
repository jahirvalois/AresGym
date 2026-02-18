
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase } from "../lib/mongodb";
import { generateResetToken, hashPassword } from "../lib/passwordUtils";
import { initializeEmailService, sendInviteEmail, sendPasswordResetEmail } from "../lib/emailService";
import { ObjectId } from "mongodb";
import crypto from 'crypto';

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildEmailQuery(email: string) {
    const escaped = escapeRegExp(email);
    return { email: new RegExp(`^${escaped}$`, 'i') };
}

export async function usersHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const { db } = await connectToDatabase();
    const collection = db.collection("users");

    if (request.method === 'GET') {
        const users = await collection.find({}).toArray();
        return { jsonBody: users };
    }

    if (request.method === 'POST') {
        const body: any = await request.json();
        const userData = body.newUser;

        if (!userData?.email || !isValidEmail(userData.email)) {
            return { status: 400, jsonBody: { error: "Invalid email format" } };
        }

        const normalizedEmail = userData.email.trim().toLowerCase();
        const existingUser = await collection.findOne(buildEmailQuery(normalizedEmail));

        if (existingUser) {
            const { token, hashedToken, expiresAt } = generateResetToken();
            await collection.updateOne(
                { _id: existingUser._id },
                {
                    $set: {
                        resetToken: hashedToken,
                        resetTokenExpiresAt: expiresAt.toISOString()
                    }
                }
            );

            const appUrl = process.env.APP_URL || 'http://localhost:5173';
            const resetLink = `${appUrl}/reset-password`;

            await initializeEmailService();
            await sendPasswordResetEmail(normalizedEmail, token, resetLink);

            return {
                status: 409,
                jsonBody: {
                    error: "USER_EXISTS",
                    message: "Usuario existe. Se envio un enlace para cambiar la contrasena (10 min).",
                    resetEmailSent: true
                }
            };
        }

        // Hash password if provided
        if (userData.password) {
            userData.password = await hashPassword(userData.password);
        } else {
            const tempPassword = crypto.randomBytes(16).toString('hex');
            userData.password = await hashPassword(tempPassword);
        }

        const newUser = {
            ...userData,
            email: normalizedEmail,
            createdAt: new Date().toISOString(),
            isFirstLogin: true
        };

        const { token, hashedToken, expiresAt } = generateResetToken();
        newUser.resetToken = hashedToken;
        newUser.resetTokenExpiresAt = expiresAt.toISOString();

        const result = await collection.insertOne(newUser);

        const appUrl = process.env.APP_URL || 'http://localhost:5173';
        const inviteLink = `${appUrl}/reset-password`;
        await initializeEmailService();
        await sendInviteEmail(normalizedEmail, newUser.name || 'Guerrero', token, inviteLink);
        
        // Return user without password
        const { password, resetToken, resetTokenExpiresAt, ...userWithoutPassword } = newUser as any;
        return { status: 201, jsonBody: { ...userWithoutPassword, _id: result.insertedId } };
    }

    // Rutas con ID
    const id = request.params.id;
    if (id) {
        if (request.method === 'PATCH') {
            const body: any = await request.json();
            const updates = body.updates;

            // Hash password if being updated
            if (updates.password) {
                updates.password = await hashPassword(updates.password);
            }

            await collection.updateOne({ _id: new ObjectId(id) }, { $set: updates });
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
