import React, { useState } from 'react';
import { apiService } from '../services/apiService';

interface ForgotPasswordResponse {
  message: string;
  resetToken: string;
  expiresIn: string;
}

interface PasswordResetProps {
  onReset?: () => void;
  onBack?: () => void;
}

export const PasswordReset: React.FC<PasswordResetProps> = ({ onReset, onBack }) => {
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Step 1: Request password reset
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await apiService.forgotPassword(email) as ForgotPasswordResponse;
      setSuccess('Reset link sent to your email. Check your inbox for the reset token.');
      setToken(response.resetToken); // For demo purposes
      setStep('reset');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Reset password with token
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      await apiService.resetPassword(token, newPassword, confirmPassword);
      setSuccess('Password reset successfully! Redirecting to login...');
      setTimeout(() => {
        onReset?.();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="password-reset-container">
      <h2>Reset Password</h2>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {step === 'request' ? (
        <form onSubmit={handleForgotPassword} className="reset-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              disabled={loading}
            />
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="btn btn-secondary"
              disabled={loading}
            >
              Back to Login
            </button>
          )}
        </form>
      ) : (
        <form onSubmit={handleResetPassword} className="reset-form">
          <div className="form-group">
            <label htmlFor="token">Reset Token</label>
            <input
              id="token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your reset token"
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
              disabled={loading}
            />
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
          <button
            type="button"
            onClick={() => setStep('request')}
            className="btn btn-secondary"
            disabled={loading}
          >
            Use Different Email
          </button>
        </form>
      )}
    </div>
  );
};

export default PasswordReset;
