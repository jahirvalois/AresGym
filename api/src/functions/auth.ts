import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase } from "../lib/mongodb";
import { verifyPassword, hashPassword, generateResetToken } from "../lib/passwordUtils";
import { initializeEmailService, sendPasswordResetEmail } from "../lib/emailService";
import crypto from 'crypto';
import { ObjectId } from "mongodb";

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// LOGIN HANDLER
async function loginHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const { db } = await connectToDatabase();
    const usersCollection = db.collection("users");

    if (request.method === 'POST') {
        try {
            const body: any = await request.json();
            const { email, password } = body;

            if (!email || !password) {
                return {
                    status: 400,
                    jsonBody: { error: "Email and password are required" }
                };
            }

            // Find user by email
            const user = await usersCollection.findOne({ email });

            if (!user) {
                return {
                    status: 401,
                    jsonBody: { error: "Invalid email or password" }
                };
            }

            // Verify password
            const isPasswordValid = await verifyPassword(password, user.password);

            if (!isPasswordValid) {
                return {
                    status: 401,
                    jsonBody: { error: "Invalid email or password" }
                };
            }

            // If login is successful, ensure user status is ACTIVE
            if (user.status !== 'ACTIVE') {
                try {
                    await usersCollection.updateOne({ _id: user._id }, { $set: { status: 'ACTIVE' } });
                } catch (e) {
                    context.log && context.log.warn('Failed to update user status to ACTIVE', e);
                }
            }

            // Return user data without password
            const { password: _, ...userWithoutPassword } = user;
            return {
                status: 200,
                jsonBody: {
                    message: "Login successful",
                    user: userWithoutPassword
                }
            };
        } catch (error) {
            return {
                status: 500,
                jsonBody: { error: "Internal server error" }
            };
        }
    }

    return {
        status: 405,
        body: "Method not allowed"
    };
}

// FORGOT PASSWORD HANDLER - Request password reset
async function forgotPasswordHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const { db } = await connectToDatabase();
    const usersCollection = db.collection("users");

    if (request.method === 'POST') {
        try {
            const body: any = await request.json();
            const { email } = body;

            if (!email) {
                return {
                    status: 400,
                    jsonBody: { error: "Email is required" }
                };
            }

            if (!isValidEmail(email)) {
                return {
                    status: 400,
                    jsonBody: { error: "Invalid email format" }
                };
            }

            // Find user by email
            const user = await usersCollection.findOne({ email });

            if (!user) {
                // Don't reveal if user exists for security
                return {
                    status: 200,
                    jsonBody: { message: "If the email exists, a reset link has been sent" }
                };
            }

            // Generate reset token
            const { token, hashedToken, expiresAt } = generateResetToken();

            // Store hashed token in user document
            await usersCollection.updateOne(
                { _id: user._id },
                {
                    $set: {
                        resetToken: hashedToken,
                        resetTokenExpiresAt: expiresAt.toISOString()
                    }
                }
            );

            const appUrl = process.env.APP_URL || 'https://aresgym.com.mx';
            const resetLink = `${appUrl}/reset-password`;

            await initializeEmailService();
            await sendPasswordResetEmail(email, token, resetLink);

            // Return generic response
            return {
                status: 200,
                jsonBody: {
                    message: "If the email exists, a reset link has been sent",
                    expiresIn: "10 minutes"
                }
            };
        } catch (error) {
            return {
                status: 500,
                jsonBody: { error: "Internal server error" }
            };
        }
    }

    return {
        status: 405,
        body: "Method not allowed"
    };
}

// RESET PASSWORD HANDLER - Complete password reset
async function resetPasswordHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const { db } = await connectToDatabase();
    const usersCollection = db.collection("users");

    if (request.method === 'POST') {
        try {
            const body: any = await request.json();
            const { token, newPassword, confirmPassword } = body;

            if (!token || !newPassword || !confirmPassword) {
                return {
                    status: 400,
                    jsonBody: { error: "Token and new password are required" }
                };
            }

            if (newPassword !== confirmPassword) {
                return {
                    status: 400,
                    jsonBody: { error: "Passwords do not match" }
                };
            }

            if (newPassword.length < 8) {
                return {
                    status: 400,
                    jsonBody: { error: "Password must be at least 8 characters" }
                };
            }

            // Hash the token to compare
            const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

            // Find user with valid reset token
            const user = await usersCollection.findOne({
                resetToken: hashedToken,
                resetTokenExpiresAt: { $gt: new Date().toISOString() }
            });

            if (!user) {
                return {
                    status: 401,
                    jsonBody: { error: "Invalid or expired reset token" }
                };
            }

            // Hash new password
            const hashedPassword = await hashPassword(newPassword);

            // Update user password and clear reset token
            await usersCollection.updateOne(
                { _id: user._id },
                {
                    $set: {
                        password: hashedPassword,
                        isFirstLogin: false
                    },
                    $unset: {
                        resetToken: 1,
                        resetTokenExpiresAt: 1
                    }
                }
            );

            return {
                status: 200,
                jsonBody: { message: "Password reset successfully" }
            };
        } catch (error) {
            return {
                status: 500,
                jsonBody: { error: "Internal server error" }
            };
        }
    }

    return {
        status: 405,
        body: "Method not allowed"
    };
}

// SOCIAL LOGIN HANDLER - Create or return user from external provider
async function socialLoginHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const { db } = await connectToDatabase();
    const usersCollection = db.collection('users');

    if (request.method === 'POST') {
        try {
            const body: any = await request.json();
            const { provider, providerId, email, name, avatar } = body;

            if (!provider || !providerId || !email) {
                return { status: 400, jsonBody: { error: 'provider, providerId and email are required' } };
            }

            if (!isValidEmail(email)) {
                return { status: 400, jsonBody: { error: 'Invalid email format' } };
            }

            const normalizedEmail = email.trim().toLowerCase();

            // Try to find existing user by email
            let user = await usersCollection.findOne({ email: normalizedEmail });

            if (user) {
                // Ensure provider info is set
                const updates: any = {};
                if (!user.provider) updates.provider = provider;
                if (!user.providerId) updates.providerId = providerId;
                if (avatar && !user.profilePicture) updates.profilePicture = avatar;
                if (Object.keys(updates).length > 0) {
                    try { await usersCollection.updateOne({ _id: user._id }, { $set: updates }); } catch (e) { context.log && context.log.warn('Failed to update provider info', e); }
                }

                const { password, ...userWithoutPassword } = user as any;
                return { status: 200, jsonBody: { user: userWithoutPassword } };
            }

            // Create new user as 'guerrero' (regular USER role)
            const newUser: any = {
                email: normalizedEmail,
                name: name || 'Guerrero',
                role: 'USER',
                status: 'ACTIVE',
                provider,
                providerId,
                profilePicture: avatar,
                createdAt: new Date().toISOString(),
                isFirstLogin: false
            };

            const result = await usersCollection.insertOne(newUser);
            await usersCollection.updateOne({ _id: result.insertedId }, { $unset: { password: 1, resetToken: 1, resetTokenExpiresAt: 1 } });

            const { password: _, ...saved } = newUser as any;
            return { status: 201, jsonBody: { ...saved, _id: result.insertedId } };

        } catch (error) {
            return { status: 500, jsonBody: { error: 'Internal server error' } };
        }
    }

    return { status: 405, body: 'Method not allowed' };
}

// HTTP Triggers
app.http('login', {
    methods: ['POST'],
    route: 'auth/login',
    authLevel: 'anonymous',
    handler: loginHandler
});

app.http('forgotPassword', {
    methods: ['POST'],
    route: 'auth/forgot-password',
    authLevel: 'anonymous',
    handler: forgotPasswordHandler
});

app.http('resetPassword', {
    methods: ['POST'],
    route: 'auth/reset-password',
    authLevel: 'anonymous',
    handler: resetPasswordHandler
});

app.http('socialLogin', {
    methods: ['POST'],
    route: 'auth/social-login',
    authLevel: 'anonymous',
    handler: socialLoginHandler
});
