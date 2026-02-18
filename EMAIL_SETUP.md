# Email Testing Guide - Ares Gym Pro

## Overview

This guide explains how to set up and test email functionality in Ares Gym Pro using the SMTP configuration provided.

## 📧 Email Configuration

Your SMTP settings are already configured in `.env`:

```
SMTP_HOST=smtp.us.appsuite.cloud
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<your_user>
SMTP_PASSWORD=<your_password>
EMAIL_FROM=<your_user>
```

**Server Details:**
- **IMAP Server:** imap.us.appsuite.cloud (Port 993, SSL/TLS)
- **SMTP Server:** smtp.us.appsuite.cloud (Port 587, STARTTLS)
- **Protocol:** STARTTLS (not direct SSL)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install nodemailer in the main project
npm install

# Install in the API folder
cd api && npm install
```

### 2. Run Email Test

```bash
# From project root
node scripts/testEmail.js

# Send to a specific email
node scripts/testEmail.js user@example.com
```

**Expected Output:**
```
🔍 Verifying SMTP connection...
✅ SMTP connection verified successfully!

📧 Sending test email...
   To: admin@aresgym.com.mx
   From: admin@aresgym.com.mx

✅ Email sent successfully!
   Message ID: <...>
   Response: ...
```

## 📁 Files Created

### 1. **scripts/testEmail.js** - CLI Test Utility
Standalone Node.js script for testing email sending from the command line.

**Usage:**
```bash
node scripts/testEmail.js [optional-email]
```

### 2. **api/src/lib/emailService.ts** - Production Email Service
TypeScript utility with reusable functions for your Azure Functions.

**Available Functions:**

#### `initializeEmailService()`
Initialize the email service (call once on startup).
```typescript
import { initializeEmailService } from './lib/emailService';

// In your startup function
await initializeEmailService();
```

#### `sendEmail(options)`
Send a custom email.
```typescript
import { sendEmail } from './lib/emailService';

await sendEmail({
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>This is an HTML email</p>',
  text: 'This is a plain text email'
});
```

#### `sendPasswordResetEmail(userEmail, resetToken, resetLink)`
Send a formatted password reset email.
```typescript
await sendPasswordResetEmail(
  'user@example.com',
  '123abc456',
  'http://localhost:5173/reset-password'
);
```

#### `sendWelcomeEmail(userEmail, userName)`
Send a welcome email to new users.
```typescript
await sendWelcomeEmail('user@example.com', 'John Doe');
```

## 🔧 Integration with Azure Functions

### Example: Add email to Password Reset Function

Edit `api/src/functions/auth.ts`:

```typescript
import { sendPasswordResetEmail, initializeEmailService } from '../lib/emailService';

// In your password reset handler
async function handlePasswordReset(req) {
  // ... validation code ...
  
  const resetToken = generateToken();
  const resetLink = `${process.env.APP_URL}/reset-password`;
  
  // Send reset email
  await sendPasswordResetEmail(userEmail, resetToken, resetLink);
  
  return { success: true, message: 'Reset email sent' };
}
```

### Example: Add welcome email to User Registration

Edit `api/src/functions/users.ts`:

```typescript
import { sendWelcomeEmail, initializeEmailService } from '../lib/emailService';

async function createUser(newUser) {
  // ... create user in database ...
  
  // Send welcome email
  await sendWelcomeEmail(newUser.email, newUser.name);
  
  return newUser;
}
```

## 🚨 Troubleshooting

### Connection Errors

**Error:** `ECONNREFUSED` or timeout
- Check your internet connection
- Verify SMTP_HOST and SMTP_PORT are correct
- Ensure firewall allows outbound connections on port 587

**Error:** `Invalid login credentials`
- Check SMTP_USER and SMTP_PASSWORD in .env
- Verify credentials with email provider
- Ensure no whitespace in credentials

### Email Not Received

1. **Check spam folder** - Automated emails often go to spam
2. **Verify sender address** - EMAIL_FROM must be a valid address
3. **Review email content** - Some content filters block certain HTML
4. **Check logs** - Review error messages for specific issues

### STARTTLS Issues

The SMTP server uses STARTTLS (not SSL), which means:
- Set `SMTP_SECURE=false` (upgrade connection after initial connection)
- Port 587 is correct (not 465)
- Connection is encrypted after STARTTLS negotiation

## 📊 Test Email Content

The test script sends a professional email with:
- HTML and plain text versions
- Current timestamp
- SMTP configuration details
- Visual confirmation of successful setup

## 🔐 Security Notes

⚠️ **Important:**
- Never commit `.env` with actual credentials to Git
- Use environment variables for production
- Rotate SMTP password regularly
- Use service accounts for server credentials
- Consider IP whitelisting at the email provider

## 📝 Common Use Cases

### Send Custom Email
```typescript
const { sendEmail } = require('./api/src/lib/emailService');

await sendEmail({
  to: 'coach@example.com',
  subject: 'New Client Assignment',
  html: `<p>You have been assigned a new client</p>`,
});
```

### Batch Email Sending
```typescript
const clients = ['user1@example.com', 'user2@example.com'];

for (const email of clients) {
  await sendEmail({
    to: email,
    subject: 'Weekly Workout Plan',
    html: '<p>Here is your workout for this week...</p>'
  });
}
```

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review Nodemailer documentation: https://nodemailer.com/
3. Verify SMTP configuration with email provider

---

**Last Updated:** February 16, 2026
