import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

let transporter: any = null;

/**
 * Initialize the email transporter (call once on app startup)
 */
export async function initializeEmailService() {
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    // Verify connection
    await transporter.verify();
    console.log('✅ Email service initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize email service:', error);
    throw error;
  }
}

/**
 * Send an email
 */
export async function sendEmail(options: EmailOptions) {
  if (!transporter) {
    throw new Error('Email service not initialized. Call initializeEmailService() first.');
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      ...options,
    });

    console.log(`✅ Email sent to ${options.to} - Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Failed to send email to ${options.to}:`, error);
    throw error;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(userEmail: string, resetToken: string, resetLink: string) {
  const resetUrl = `${resetLink}?token=${resetToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>We received a request to reset your password for your Ares Gym account.</p>
      <p>Click the link below to proceed with the password reset. This link will expire in 10 minutes.</p>
      <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">
        Reset Password
      </a>
      <p>If you didn't request this reset, you can safely ignore this email.</p>
      <hr style="margin-top: 40px; border: none; border-top: 1px solid #ddd;">
      <p style="font-size: 12px; color: #666;">Ares Gym Pro © 2026</p>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: 'Password Reset - Ares Gym',
    html,
    text: `Password Reset Request\n\nClick this link to reset your password: ${resetUrl}\n\nThis link will expire in 10 minutes.`,
  });
}

/**
 * Send invite email to new user
 */
export async function sendInviteEmail(userEmail: string, userName: string, inviteToken: string, inviteLink: string) {
  const inviteUrl = `${inviteLink}?token=${inviteToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Bienvenido a Ares Gym, ${userName}!</h2>
      <p>Tu cuenta ha sido creada por un administrador.</p>
      <p>Usa el siguiente enlace para establecer tu contrasena. El enlace expira en 10 minutos.</p>
      <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">
        Establecer contrasena
      </a>
      <p>Si no esperabas este correo, puedes ignorarlo.</p>
      <hr style="margin-top: 40px; border: none; border-top: 1px solid #ddd;">
      <p style="font-size: 12px; color: #666;">Ares Gym Pro © 2026</p>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: 'Invitacion - Ares Gym',
    html,
    text: `Bienvenido a Ares Gym, ${userName}!\n\nEstablece tu contrasena aqui: ${inviteUrl}\n\nEste enlace expira en 10 minutos.`,
  });
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(userEmail: string, userName: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to Ares Gym, ${userName}!</h2>
      <p>Your account has been created successfully.</p>
      <p>You can now log in and start managing your fitness journey with us.</p>
      <a href="${process.env.APP_URL || 'https://aresgym.com.mx'}/login" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">
        Go to Login
      </a>
      <p>If you have any questions, feel free to contact us.</p>
      <hr style="margin-top: 40px; border: none; border-top: 1px solid #ddd;">
      <p style="font-size: 12px; color: #666;">Ares Gym Pro © 2026</p>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: 'Welcome to Ares Gym',
    html,
    text: `Welcome to Ares Gym, ${userName}!\n\nYour account has been created successfully. Visit ${process.env.APP_URL || 'https://aresgym.com.mx'} to log in.`,
  });
}
