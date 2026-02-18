import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testSendEmail() {
  try {
    console.log('📋 SMTP Configuration:');
    console.log(`   Host: ${process.env.SMTP_HOST}`);
    console.log(`   Port: ${process.env.SMTP_PORT}`);
    console.log(`   User: ${process.env.SMTP_USER}`);
    console.log(`   Secure: ${process.env.SMTP_SECURE}`);
    console.log('');

    // Create transporter using SMTP configuration from .env
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // false for STARTTLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      }
    });

    // Verify connection
    console.log('🔍 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!');

    // Test email
    const testEmail = {
      from: process.env.EMAIL_FROM,
      to: process.argv[2] || process.env.SMTP_USER, // Use provided email or default to admin
      subject: '🧪 Ares Gym - Test Email',
      html: `
        <h1>Ares Gym - Test Email</h1>
        <p>This is a test email from Ares Gym Pro.</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p>If you received this email, your SMTP configuration is working correctly! ✅</p>
        <hr>
        <p>Configuration Details:</p>
        <ul>
          <li><strong>SMTP Host:</strong> ${process.env.SMTP_HOST}</li>
          <li><strong>SMTP Port:</strong> ${process.env.SMTP_PORT}</li>
          <li><strong>From:</strong> ${process.env.EMAIL_FROM}</li>
        </ul>
      `,
      text: `
        Ares Gym - Test Email
        
        This is a test email from Ares Gym Pro.
        Timestamp: ${new Date().toISOString()}
        
        If you received this email, your SMTP configuration is working correctly!
      `,
    };

    console.log('\n📧 Sending test email...');
    console.log(`   To: ${testEmail.to}`);
    console.log(`   From: ${testEmail.from}`);

    const info = await transporter.sendMail(testEmail);

    console.log('\n✅ Email sent successfully!');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response}`);

  } catch (error) {
    console.error('\n❌ Error sending email:');
    console.error(error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    process.exit(1);
  }
}

// Run the test
testSendEmail();
