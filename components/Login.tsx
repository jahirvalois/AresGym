import React, { useState } from 'react';
import { apiService } from '../services/apiService';
import PasswordReset from './PasswordReset';

interface LoginResponse {
  message: string;
  user: any;
}

interface LoginProps {
  onLoginSuccess?: (user: any) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiService.login(email, password) as LoginResponse;

      // Store user data (could be in context, localStorage, etc.)
      localStorage.setItem('user', JSON.stringify(response.user));
      // Mostrar en consola el estado de suscripción (dato tomado desde la DB)
      try {
        apiService.getSubscriptionState(response.user).then(sub => console.info('[Ares] Subscription state after login component:', sub.state, sub.message || '')).catch(() => {});
      } catch (e) {
        // ignore
      }
      
      setEmail('');
      setPassword('');
      onLoginSuccess?.(response.user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (showResetPassword) {
    return (
      <PasswordReset
        onBack={() => setShowResetPassword(false)}
        onReset={() => setShowResetPassword(false)}
      />
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>AresGym Pro</h1>
        <h2>Login</h2>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary btn-block">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="login-footer">
          <button
            type="button"
            onClick={() => setShowResetPassword(true)}
            className="link-button"
          >
            Forgot password?
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
