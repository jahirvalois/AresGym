
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase } from "../lib/mongodb";
import { generateResetToken, hashPassword } from "../lib/passwordUtils";
import { initializeEmailService, sendInviteEmail, sendPasswordResetEmail } from "../lib/emailService";
import { ObjectId } from "mongodb";
import crypto from 'crypto';

async function writeAudit(db: any, userId: string | null, action: string, details: any) {
    try {
        const entry = {
            timestamp: new Date().toISOString(),
            userId: userId || 'FUNCTION',
            action,
            details: typeof details === 'string' ? details : JSON.stringify(details || {})
        };
        await db.collection('audit').insertOne(entry);
    } catch (err) {
        console.warn('usersHandler audit write failed', err);
    }
}

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
            await writeAudit(db, request.headers['x-user-id'] || null, 'CREATE_USER_EXISTS', { email: normalizedEmail });
            // Do not auto-send reset email when an admin attempts to create an existing user.
            // Password reset emails should only be sent from the explicit 'forgot password' flow.
            return {
                status: 409,
                jsonBody: {
                    error: "USER_EXISTS",
                    message: "Usuario existe",
                    resetEmailSent: false
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

        const appUrl = process.env.APP_URL || 'https://aresgym.com.mx';
        const inviteLink = `${appUrl}/reset-password`;
        await initializeEmailService();
        await sendInviteEmail(normalizedEmail, newUser.name || 'Guerrero', token, inviteLink);
        await writeAudit(db, request.headers['x-user-id'] || null, 'CREATE_USER', { userId: result.insertedId.toString(), email: normalizedEmail, name: newUser.name });
        
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
            const updated = await collection.findOne({ _id: new ObjectId(id) });
            await writeAudit(db, request.headers['x-user-id'] || null, 'UPDATE_USER', { userId: id, updates });
            if (updated) {
                delete updated.password;
                delete updated.resetToken;
                delete updated.resetTokenExpiresAt;
                return { status: 200, jsonBody: updated };
            }
            return { status: 404, jsonBody: { error: 'NOT_FOUND' } };
        }
        if (request.method === 'DELETE') {
            await collection.deleteOne({ _id: new ObjectId(id) });
            await writeAudit(db, request.headers['x-user-id'] || null, 'DELETE_USER', { userId: id });
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
