import bcryptjs from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 10;

/**
 * Hash a plain text password
 * @param password - Plain text password to hash
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plain text password with a hashed password
 * @param password - Plain text password to verify
 * @param hashedPassword - Hashed password from database
 * @returns True if password matches, false otherwise
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcryptjs.compare(password, hashedPassword);
}

/**
 * Generate a reset token
 * @returns Object with token and hashed token
 */
export function generateResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  return {
    token,
    hashedToken,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  };
}
