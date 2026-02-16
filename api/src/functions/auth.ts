import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase } from "../lib/mongodb";
import { verifyPassword, hashPassword, generateResetToken } from "../lib/passwordUtils";
import crypto from 'crypto';
import { ObjectId } from "mongodb";

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

            // Return token (in real app, send via email)
            return {
                status: 200,
                jsonBody: {
                    message: "Reset token generated",
                    resetToken: token, // Return token for testing (remove in production)
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
