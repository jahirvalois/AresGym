import { initializeEmailService, sendEmail, sendWelcomeEmail, sendPasswordResetEmail } from './lib/emailService';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function runTests() {
  try {
    console.log('🧪 Ares Gym Email Service - Test Suite\n');

    // Test 1: Initialize service
    console.log('Test 1: Initialize Email Service');
    await initializeEmailService();
    console.log('✅ Passed\n');

    // Test 2: Send basic email
    console.log('Test 2: Send Basic Email');
    const testEmail = process.argv[2] || process.env.SMTP_USER;
    const basicResult = await sendEmail({
      to: testEmail,
      subject: 'Ares Gym - Basic Email Test',
      html: '<h1>Basic Email Test</h1><p>This is a basic email test.</p>',
      text: 'This is a basic email test.',
    });
    console.log('✅ Passed - Message ID:', basicResult.messageId);
    console.log('');

    // Test 3: Send welcome email
    console.log('Test 3: Send Welcome Email');
    const welcomeResult = await sendWelcomeEmail(testEmail, 'Test User');
    console.log('✅ Passed - Message ID:', welcomeResult.messageId);
    console.log('');

    // Test 4: Send password reset email
    console.log('Test 4: Send Password Reset Email');
    const appUrl = process.env.APP_URL || 'https://aresgym.com.mx';
    const resetResult = await sendPasswordResetEmail(
      testEmail,
      'abc123xyz',
      `${appUrl}/reset-password`
    );
    console.log('✅ Passed - Message ID:', resetResult.messageId);
    console.log('');

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if executed directly
if (process.argv[1].includes('testEmail.ts')) {
  runTests();
}

export { runTests };
