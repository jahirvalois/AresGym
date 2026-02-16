# Authentication API Documentation

## Overview
This document describes the authentication endpoints for AresGym Pro, including login and password reset functionality.

## Endpoints

### 1. Login
**POST** `/api/auth/login`

Authenticate a user with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "MyPassword123"
}
```

**Response (200 OK):**
```json
{
  "message": "Login successful",
  "user": {
    "_id": "60d5ec49c1234567890abcde",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "USER",
    "status": "ACTIVE",
    "isFirstLogin": false,
    "subscriptionEndDate": "2025-02-16T00:00:00.000Z",
    "createdAt": "2024-02-16T00:00:00.000Z"
  }
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Invalid email or password"
}
```

---

### 2. Forgot Password (Request Reset)
**POST** `/api/auth/forgot-password`

Request a password reset token. In production, a reset link would be sent via email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "message": "If the email exists, a reset link has been sent",
  "resetToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
  "expiresIn": "10 minutes"
}
```

**Notes:**
- The endpoint returns the same success message regardless of whether the email exists (for security)
- In production, the `resetToken` should NOT be returned; instead, send it via email
- Token expires in 10 minutes

---

### 3. Reset Password
**POST** `/api/auth/reset-password`

Complete the password reset with a valid token.

**Request:**
```json
{
  "token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
  "newPassword": "NewPassword123!",
  "confirmPassword": "NewPassword123!"
}
```

**Response (200 OK):**
```json
{
  "message": "Password reset successfully"
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Invalid or expired reset token"
}
```

**Validation Rules:**
- Passwords must match
- Password must be at least 8 characters
- Token must be valid and not expired (10 minutes)

---

## Frontend Usage

### Login Component
```tsx
import Login from './components/Login';

function App() {
  return (
    <Login onLoginSuccess={(user) => {
      console.log('User logged in:', user);
      // Navigate to dashboard
    }} />
  );
}
```

### Password Reset Component
```tsx
import PasswordReset from './components/PasswordReset';

function App() {
  return (
    <PasswordReset 
      onReset={() => {
        // Navigate back to login
      }}
      onBack={() => {
        // Go back to login
      }}
    />
  );
}
```

---

## Workflow: Password Reset

1. **User clicks "Forgot password?"** on login screen
2. **User enters email** → POST `/api/auth/forgot-password`
3. **Backend generates reset token** → Stores hashed token in database (30 min expiry)
4. **In production:** Email sent with reset link containing token
5. **For testing:** Token returned in response
6. **User enters token + new password** → POST `/api/auth/reset-password`
7. **Backend validates token** → Updates password → Clears reset token
8. **User redirected to login** and can use new password

---

## Database Schema

Users collection stores:
```
{
  _id: ObjectId,
  email: string,
  password: string (bcrypt hashed),
  name: string,
  role: "ADMIN" | "COACH" | "USER",
  status: "ACTIVE" | "INACTIVE",
  isFirstLogin: boolean,
  subscriptionEndDate: ISO string,
  createdAt: ISO string,
  resetToken?: string (hashed), // Only present during reset request
  resetTokenExpiresAt?: ISO string // Only present during reset request
}
```

---

## Security Considerations

✅ **Passwords are hashed** using bcryptjs (10 salt rounds)
✅ **Reset tokens are hashed** before storing in database
✅ **Reset tokens expire** after 30 minutes
✅ **Passwords never returned** in API responses
✅ **Email validation** doesn't reveal if user exists

⚠️ **TODO for Production:**
- Add rate limiting to prevent brute force attacks
- Send reset token via email instead of returning it
- Add HTTPS enforcement
- Implement refresh tokens for session management
- Add password complexity validation
- Add account lockout after failed attempts
- Add audit logging for security events
