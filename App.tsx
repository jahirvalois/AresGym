
import React, { useState, useEffect, useRef } from 'react';
import googleIcon from './images/google-icon-logo.png';
// import appleIcon from './images/apple-icon-logo-png.png';
import microsoftIcon from './images/microsoft-icon-logo.png';
import Popup from './components/Popup';
import { User, UserRole, SubscriptionState } from './types';
import { apiService } from './services/apiService';
import { brandingService } from './services/brandingService';
import { BrandingProvider } from './components/BrandingProvider';
import { Layout } from './components/Layout';
import { DashboardAdmin } from './pages/DashboardAdmin';
import { DashboardCoach } from './pages/DashboardCoach';
import { DashboardUser } from './pages/DashboardUser';
import DashboardAlone from './pages/DashboardAlone';
import { BrandingManager } from './pages/BrandingManager';

type AuthView = 'login' | 'forgot-password' | 'reset-password' | 'first-login';

const SESSION_KEY = 'ares_session';
const SESSION_TTL_MS = 60 * 60 * 1000;

type StoredSession = {
  user: User;
  expiresAt: number;
};

const App: React.FC = () => {
  const [dbReady, setDbReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authView, setAuthView] = useState<AuthView>('login');
  
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [error, setError] = useState<{ message: string; isBlocking: boolean } | null>(null);
  const [resetSuccess, setResetSuccess] = useState('');
  
  const [tempUser, setTempUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');

  const [selectedUserForRoutine, setSelectedUserForRoutine] = useState<string | undefined>(undefined);

  const [popup, setPopup] = useState<{ open: boolean; type?: 'success' | 'warning'; title?: string; message: string }>({ open: false, message: '' });

  const [settings, setSettings] = useState(brandingService.getSettings());
  const errorTimeoutRef = useRef<number | null>(null);

  const showTempError = (message: string, isBlocking: boolean) => {
    try {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
    } catch (e) {}
    setError({ message, isBlocking });
    // clear after 5s
    errorTimeoutRef.current = window.setTimeout(() => setError(null), 5000);
  };

  useEffect(() => {
    // Inicialización silenciosa para evitar bloqueos
    apiService.init().finally(() => setDbReady(true));
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const stored = JSON.parse(raw) as StoredSession;
        if (stored?.expiresAt && stored.expiresAt > Date.now() && stored.user) {
          setUser(stored.user);
          if (stored.user.role === UserRole.COACH || stored.user.role === UserRole.ADMIN) setActiveTab('users');
          else setActiveTab('dashboard');
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  // Ensure the Google button is rendered when toggling between email/social views
  

  // Optionally hide traditional login and show only social-login by default
  const SOCIAL_ONLY_LOGIN = (() => {
    const meta = (import.meta as any)?.env?.VITE_SOCIAL_ONLY_LOGIN;
    const win = typeof window !== 'undefined' ? (window as any).__VITE_SOCIAL_ONLY_LOGIN : undefined;
    if (win !== undefined && win !== null) return win === true || String(win) === 'true';
    return meta === 'true' || meta === true;
  })();
  const [showEmailForm, setShowEmailForm] = useState(false);

  // Ensure the Google button is rendered when toggling between email/social views
  useEffect(() => {
    if (authView !== 'login') return;
    const clientId = ((import.meta as any)?.env?.VITE_GOOGLE_CLIENT_ID) || (window as any).__VITE_GOOGLE_CLIENT_ID;
    const container = document.getElementById('googleSignInDiv');
    if (!clientId || !container) return;
    const win: any = window as any;
    if (!win.google || !win.google.accounts || !win.google.accounts.id) return;

      try {
      // (re-)initialize (idempotent) to ensure callback is set
      win.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: any) => {
          try {
            const idToken = response.credential;
            apiService.socialLogin('google', idToken).then((res: any) => {
              const u = res.user || res;
              if (u) {
                const normalized = (u.id || u._id) ? ({ ...u, id: String(u.id || u._id) }) : u;
                if (normalized.status && normalized.status !== 'ACTIVE') {
                  setPopup({ open: true, type: 'warning', title: 'Cuenta inactiva', message: 'Tu cuenta está inactiva. Contacta al administrador para activarla antes de usar la aplicación.' });
                  return;
                }
                // Verificar estado de suscripción desde la DB y bloquear si está expirado
                apiService.getSubscriptionState(normalized).then(sub => {
                  if (sub.state === SubscriptionState.EXPIRED) {
                    showTempError(sub.message || 'Tu suscripción ha expirado.', true);
                    return;
                  }
                  if (sub.state === SubscriptionState.WARNING) {
                    showTempError(sub.message || '', false);
                  } else {
                    setError(null);
                  }
                  localStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalized, expiresAt: Date.now() + 3600 * 1000 }));
                  setUser(normalized);
                }).catch(() => {
                  // Si falla la verificación remota, permitir login y limpiar errores
                  setError(null);
                  localStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalized, expiresAt: Date.now() + 3600 * 1000 }));
                  setUser(normalized);
                });
              }
            }).catch(() => {});
          } catch (e) {
            console.warn('Failed to handle Google credential', e);
          }
        }
      });
      win.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', width: 220 });
    } catch (e) {
      // ignore render errors
    }
  }, [showEmailForm, authView]);

  const msClientId = ((import.meta as any)?.env?.VITE_MICROSOFT_CLIENT_ID) || (window as any).__VITE_MICROSOFT_CLIENT_ID;

  const signInMicrosoft = async () => {
    if (!msClientId) return console.warn('Microsoft Client ID not configured');
    const win: any = window as any;
    if (!win.msal || !win.msal.PublicClientApplication) {
      console.warn('MSAL not loaded');
      return;
    }
    // use a dedicated redirect page so that MSAL responses are handled there and posted back
    const redirectUri = window.location.origin + '/msal_redirect.html';
    let removedListener = false;
    const messageHandler = (e: MessageEvent) => {
      try {
        const data = (e as any).data || {};
        console.debug('[App] msal message received', { eventOrigin: e.origin, windowOrigin: window.location.origin, data, source: e.source });
        // In some hosting setups the popup may be considered a different origin (www vs apex or edge rewriting).
        // For debugging, allow handling of our specific msal messages even if origin differs, but log the mismatch.
        const originMismatch = e.origin !== window.location.origin;
        if (originMismatch) console.warn('[App] msal message origin mismatch (possible www/apex/origin rewrite)', e.origin, window.location.origin);
        // Only proceed for known message types
        const dataType = data.type;
        // Respond to redirect handler requests for client id
        if (dataType === 'msal_request_client_id') {
          try {
            const target = (e.source as Window) || window;
            const payload = { type: 'msal_client_id', clientId: msClientId };
            try {
              // prefer targeted origin, but fall back to wildcard for debugging
              target.postMessage(payload, e.origin || window.location.origin);
            } catch (err) {
              try { target.postMessage(payload, '*'); } catch (err2) { window.postMessage(payload, '*'); }
            }
            console.debug('[App] replied msal_client_id', { payload, to: e.origin });
          } catch (err) { console.warn('Failed to respond with msal client id', err); }
          return;
        }
        if (dataType === 'msal_auth' && data.accessToken) {
          // received token from redirect handler
          const accessToken = data.accessToken as string;
          apiService.socialLogin('microsoft', accessToken).then((res: any) => {
            const u = res.user || res;
              if (u) {
              const normalized = (u.id || u._id) ? ({ ...u, id: String(u.id || u._id) }) : u;
              if (normalized.status && normalized.status !== 'ACTIVE') {
                setPopup({ open: true, type: 'warning', title: 'Cuenta inactiva', message: 'Tu cuenta está inactiva. Contacta al administrador para activarla antes de usar la aplicación.' });
                return;
              }
              apiService.getSubscriptionState(normalized).then(sub => {
                if (sub.state === SubscriptionState.EXPIRED) {
                  showTempError(sub.message || 'Tu suscripción ha expirado.', true);
                  return;
                }
                if (sub.state === SubscriptionState.WARNING) {
                  showTempError(sub.message || '', false);
                } else {
                  setError(null);
                }
                localStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalized, expiresAt: Date.now() + 3600 * 1000 }));
                setUser(normalized);
              }).catch(() => {
                setError(null);
                localStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalized, expiresAt: Date.now() + 3600 * 1000 }));
                setUser(normalized);
              });
            }
          }).catch(() => {});
          if (!removedListener) { window.removeEventListener('message', messageHandler); removedListener = true; }
        } else if (dataType === 'msal_error') {
          console.warn('MSAL redirect handler reported error', data.error, { originMismatch });
          if (!removedListener) { window.removeEventListener('message', messageHandler); removedListener = true; }
        }
      } catch (err) {
        console.warn('msal message handler error', err);
      }
    };

    window.addEventListener('message', messageHandler);

    try {
      const pca = new win.msal.PublicClientApplication({ auth: { clientId: msClientId, redirectUri } });
      // Attempt popup flow first; if MSAL ends up redirecting the popup to our redirect page,
      // the `msal_redirect.html` will postMessage back with the token and our listener will handle it.
      try {
        const loginResp = await pca.loginPopup({ scopes: ['openid', 'profile', 'User.Read'] });
        const account = loginResp?.account;
        let tokenResp;
        try {
          tokenResp = await pca.acquireTokenSilent({ scopes: ['User.Read'], account });
        } catch (e) {
          tokenResp = await pca.acquireTokenPopup({ scopes: ['User.Read'] });
        }
        const accessToken = tokenResp && tokenResp.accessToken;
        if (accessToken) {
          // cleanup listener
          if (!removedListener) { window.removeEventListener('message', messageHandler); removedListener = true; }
          apiService.socialLogin('microsoft', accessToken).then((res: any) => {
            const u = res.user || res;
            if (u) {
              const normalized = (u.id || u._id) ? ({ ...u, id: String(u.id || u._id) }) : u;
              if (normalized.status && normalized.status !== 'ACTIVE') {
                setPopup({ open: true, type: 'warning', title: 'Cuenta inactiva', message: 'Tu cuenta está inactiva. Contacta al administrador para activarla antes de usar la aplicación.' });
                return;
              }
              apiService.getSubscriptionState(normalized).then(sub => {
                if (sub.state === SubscriptionState.EXPIRED) {
                  showTempError(sub.message || 'Tu suscripción ha expirado.', true);
                  return;
                }
                if (sub.state === SubscriptionState.WARNING) {
                  showTempError(sub.message || '', false);
                } else {
                  setError(null);
                }
                localStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalized, expiresAt: Date.now() + 3600 * 1000 }));
                setUser(normalized);
              }).catch(() => {
                setError(null);
                localStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalized, expiresAt: Date.now() + 3600 * 1000 }));
                setUser(normalized);
              });
            }
          }).catch(() => {});
          return;
        }
      } catch (e) {
        // loginPopup may fail in some environments; rely on redirect handler message as fallback
        console.warn('MSAL loginPopup failed or redirected; waiting for redirect handler message', e);
      }

      // fallback: open a window that triggers redirect flow which will be handled by msal_redirect.html
      const popup = window.open('/msal_redirect.html', 'msal_popup', 'width=600,height=700');
      // remove listener after 35s if nothing arrives
      setTimeout(() => { if (!removedListener) { window.removeEventListener('message', messageHandler); removedListener = true; } }, 35000);
    } catch (e) {
      console.warn('Microsoft sign-in failed', e);
      if (!removedListener) { window.removeEventListener('message', messageHandler); removedListener = true; }
    }
  };

  const signInGoogle = () => {
    try {
      const container = document.getElementById('googleSignInDiv');
      if (!container) return console.warn('Google container not found');
      const win: any = window as any;
      // If GSI is available, ensure the injected button is rendered. If not, render it and retry clicking a few times.
      if (win.google && win.google.accounts && win.google.accounts.id) {
        const ensureRender = () => {
          try {
            win.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', width: 220 });
          } catch (e) {
            // ignore render errors
          }
        };

        let btn = container.querySelector('[role="button"], button') as HTMLElement | null;
        if (!btn) ensureRender();

        let attempts = 0;
        const maxAttempts = 8;
        const intervalId = window.setInterval(() => {
          attempts += 1;
          btn = container.querySelector('[role="button"], button') as HTMLElement | null;
          if (btn && btn.click) {
            try { btn.click(); } catch (e) { /* ignore click errors */ }
            clearInterval(intervalId);
            return;
          }
          if (attempts >= maxAttempts) {
            clearInterval(intervalId);
            console.warn('Google rendered button not found after retries');
          }
        }, 300);
        return;
      }
      console.warn('Google Identity SDK not available');
    } catch (e) {
      console.warn('signInGoogle failed', e);
    }
  };

  const appleClientId = ((import.meta as any)?.env?.VITE_APPLE_CLIENT_ID) || (window as any).__VITE_APPLE_CLIENT_ID;

  const signInApple = async () => {
    if (!appleClientId) return console.warn('Apple Client ID not configured');
    const win: any = window as any;
    if (!win.AppleID || !win.AppleID.auth) {
      console.warn('AppleID JS SDK not loaded');
      return;
    }
    try {
      win.AppleID.auth.init({ clientId: appleClientId, scope: 'name email', redirectURI: window.location.origin, usePopup: true });
      const resp = await win.AppleID.auth.signIn();
      const idToken = resp && resp.authorization && resp.authorization.id_token;
      if (!idToken) return console.warn('No id_token from Apple sign-in');
      apiService.socialLogin('apple', idToken).then((res: any) => {
        const u = res.user || res;
        if (u) {
          const normalized = (u.id || u._id) ? ({ ...u, id: String(u.id || u._id) }) : u;
          if (normalized.status && normalized.status !== 'ACTIVE') {
            setPopup({ open: true, type: 'warning', title: 'Cuenta inactiva', message: 'Tu cuenta está inactiva. Contacta al administrador para activarla antes de usar la aplicación.' });
            return;
          }
            apiService.getSubscriptionState(normalized).then(sub => {
            if (sub.state === SubscriptionState.EXPIRED) {
              showTempError(sub.message || 'Tu suscripción ha expirado.', true);
              return;
            }
            if (sub.state === SubscriptionState.WARNING) {
              showTempError(sub.message || '', false);
            } else {
              setError(null);
            }
            localStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalized, expiresAt: Date.now() + 3600 * 1000 }));
            setUser(normalized);
          }).catch(() => {
            setError(null);
            localStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalized, expiresAt: Date.now() + 3600 * 1000 }));
            setUser(normalized);
          });
        }
      }).catch(() => {});
    } catch (e) {
      console.warn('Apple sign-in failed', e);
    }
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    if (url.pathname.startsWith('/reset-password') || token) {
      setAuthView('reset-password');
      if (token) setResetToken(token);
    }
    // Initialize Google Identity Services when script becomes available
    const initGoogle = () => {
      const metaEnv = (import.meta as any)?.env || {};
      const clientIdFromMeta = metaEnv?.VITE_GOOGLE_CLIENT_ID;
      const clientIdFromWindow = (window as any).__VITE_GOOGLE_CLIENT_ID;
      const clientId = clientIdFromMeta || clientIdFromWindow;
      if (!clientId) return null;

      const tryInit = () => {
        const haveGoogle = !!(window as any).google;
        if (!haveGoogle) return false;
        try {
          
          (window as any).google.accounts.id.initialize({
            client_id: clientId,
            callback: (response: any) => {
              try {
                const idToken = response.credential;
                apiService.socialLogin('google', idToken).then((res: any) => {
                  const u = res.user || res;
                  if (u) {
                    const normalized = (u.id || u._id) ? ({ ...u, id: String(u.id || u._id) }) : u;
                    // If account is not active, show popup and do not sign in
                    if (normalized.status && normalized.status !== 'ACTIVE') {
                      setPopup({ open: true, type: 'warning', title: 'Cuenta inactiva', message: 'Tu cuenta está inactiva. Contacta al administrador para activarla antes de usar la aplicación.' });
                      return;
                    }
                              apiService.getSubscriptionState(normalized).then(sub => {
                                if (sub.state === SubscriptionState.EXPIRED) {
                                  showTempError(sub.message || 'Tu suscripción ha expirado.', true);
                                  return;
                                }
                                if (sub.state === SubscriptionState.WARNING) {
                                  showTempError(sub.message || '', false);
                                } else {
                                  setError(null);
                                }
                                localStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalized, expiresAt: Date.now() + 3600 * 1000 }));
                                setUser(normalized);
                              }).catch(() => {
                                setError(null);
                                localStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalized, expiresAt: Date.now() + 3600 * 1000 }));
                                setUser(normalized);
                              });
                  }
                }).catch(() => {});
              } catch (e) {
                console.warn('Failed to handle Google credential', e);
              }
            }
          });
          const container = document.getElementById('googleSignInDiv');
          if (container) {
            (window as any).google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', width: 220 });
            return true;
          }
          // If container missing, do not consider init complete — allow retries until container appears
          
          return false;
        } catch (e) {
          console.warn('Google Identity init failed', e);
          return false;
        }
      };

      if (authView !== 'login') return null;
      if (tryInit()) return null;

      // Retry until the google script loads (max attempts handled by cleanup)
      let attempts = 0;
      const id = window.setInterval(() => {
        attempts += 1;
        if (tryInit() || attempts > 20) window.clearInterval(id);
      }, 500);
      return () => window.clearInterval(id);
    };

    const cleanup = initGoogle();
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const users = await apiService.getUsers();
      const found = users.find(u => u.email === loginEmail);
      
      if (found) {
        if (found.isFirstLogin) {
          setTempUser(found);
          setAuthView('first-login');
          setError(null);
          return;
        }
        if (found.password && found.password !== loginPass) {
          setError({ message: 'Contraseña incorrecta', isBlocking: false });
          return;
        }
        const sub = await apiService.getSubscriptionState(found);
        console.info('[Ares] Subscription state after manual login:', sub.state, sub.message || '');
        if (sub.state === SubscriptionState.EXPIRED) {
          showTempError(sub.message!, true);
          return;
        }
        setUser(found);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ user: found, expiresAt: Date.now() + SESSION_TTL_MS }));
        if (found.role === UserRole.COACH || found.role === UserRole.ADMIN) setActiveTab('users');
        else setActiveTab('dashboard');
        if (sub.message) showTempError(sub.message, false); else setError(null);
      } else {
        setError({ message: 'Credenciales inválidas', isBlocking: false });
      }
    } catch (err) {
      setError({ message: 'Error de conexión con el Olimpo', isBlocking: false });
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.forgotPassword(loginEmail);
      alert('Revisa tu correo para el enlace de recuperacion.');
      setAuthView('login');
    } catch (err: any) {
      setError({ message: err.message || 'Email no registrado', isBlocking: false });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccess('');

    if (!resetToken) {
      setError({ message: 'Token invalido o faltante', isBlocking: false });
      return;
    }

    if (newPassword !== confirmPassword) {
      setError({ message: 'Contrasenas no coinciden', isBlocking: false });
      return;
    }

    if (newPassword.length < 8) {
      setError({ message: 'La contrasena debe tener al menos 8 caracteres', isBlocking: false });
      return;
    }

    try {
      await apiService.resetPassword(resetToken, newPassword, confirmPassword);
      setResetSuccess('Contrasena actualizada. Ahora puedes iniciar sesion.');
      setTimeout(() => {
        setAuthView('login');
        setNewPassword('');
        setConfirmPassword('');
        setResetToken('');
        window.history.replaceState({}, '', '/');
      }, 1500);
    } catch (err: any) {
      setError({ message: err.message || 'No se pudo actualizar la contrasena', isBlocking: false });
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError({ message: 'Contraseñas no coinciden', isBlocking: false });
      return;
    }
    if (tempUser) {
      const updated = await apiService.updateUser(tempUser, tempUser.id, { password: newPassword, isFirstLogin: false });
      if (updated) {
        setUser(updated);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ user: updated, expiresAt: Date.now() + SESSION_TTL_MS }));
        setAuthView('login');
        setTempUser(null);
        setError(null);
        if (updated.role === UserRole.COACH || updated.role === UserRole.ADMIN) setActiveTab('users');
      }
    }
  };

  const handleLogout = () => {
    setUser(null);
    setError(null);
    setAuthView('login');
    setTempUser(null);
    setActiveTab('dashboard');
    setSelectedUserForRoutine(undefined);
    localStorage.removeItem(SESSION_KEY);
  };

  // Redirect to home/login after logout to ensure UI resets and no private routes remain visible
  const logoutAndRedirect = () => {
    handleLogout();
    try {
      // Use replace to avoid leaving session data in history
      window.location.replace('/');
    } catch (e) {
      window.location.href = '/';
    }
  };

  if (!dbReady) return <div className="min-h-screen bg-black flex items-center justify-center font-black text-primary italic text-2xl uppercase tracking-tighter">Iniciando Servidores...</div>;

  const loginButtonClasses = "w-full bg-black text-primary py-5 rounded-[1rem] font-black text-lg shadow-xl border-2 border-black hover:bg-yellow-500 hover:text-black hover:border-black transition-all uppercase italic";

  if (!user) {
    const isBlocking = error?.isBlocking;
    return (
      <BrandingProvider>
        <div 
          className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center"
          style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url(${settings.loginBgUrl})` }}
        >
          <div className="max-w-md w-full bg-white rounded-[1rem] shadow-2xl p-8 sm:p-12 space-y-8 animate-in fade-in zoom-in border border-white/20 backdrop-blur-sm relative">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-primary mx-auto rounded-3xl flex items-center justify-center shadow-lg">
                <img src={settings.logo} alt="Logo" className="w-12 h-12" />
              </div>
              <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase italic">{settings.gymName}</h1>
              <p className="text-slate-400 font-black uppercase text-[10px] tracking-[0.3em]">
                {authView === 'forgot-password' ? 'Recuperar Honor' : settings.welcomeText}
              </p>
            </div>

            {error && (
              <div className={`p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-center ${isBlocking ? 'bg-red-600 text-white animate-bounce' : 'bg-amber-400 text-black border-2 border-black'}`}>
                {error.message}
              </div>
            )}

            {resetSuccess && (
              <div className="p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-center bg-emerald-400 text-black border-2 border-black">
                {resetSuccess}
              </div>
            )}

            {authView === 'login' ? (
              ((SOCIAL_ONLY_LOGIN && !showEmailForm) ? (
                <div className="space-y-6">
                  <div className="mt-4 flex flex-col items-center space-y-3">
                    <div id="googleSignInDiv" className="sr-only" aria-hidden></div>
                    <button type="button" onClick={signInGoogle} className="w-[220px] h-10 flex items-center justify-center gap-3 bg-white text-slate-800 border border-slate-200 rounded-md font-bold text-sm shadow-sm hover:shadow-md">
                      <span className="w-5 h-5 inline-block" aria-hidden>
                        <img src={googleIcon} alt="Google" className="w-full h-full object-contain" />
                      </span>
                      <span>Sign in with Google</span>
                    </button>
                    {/*
                      <button type="button" onClick={signInMicrosoft} className="w-[220px] h-10 flex items-center justify-center gap-3 bg-[#2F2F2F] text-white px-4 rounded-md font-bold text-sm shadow-md hover:opacity-90">
                        <span className="w-5 h-5 inline-block" aria-hidden>
                          <img src={microsoftIcon} alt="Microsoft" className="w-full h-full object-contain" />
                        </span>
                        <span>Sign in with Microsoft</span>
                      </button> 
                    
                      <button type="button" onClick={signInApple} className="w-[220px] h-10 flex items-center justify-center gap-3 bg-black text-white px-4 rounded-md font-bold text-sm shadow-md hover:opacity-90">
                        <span className="w-5 h-5 inline-block" aria-hidden>
                          <img src="/images/apple-icon-logo-png.png" alt="Apple" className="w-full h-full object-contain" />
                        </span>
                        <span>Sign in with Apple</span>
                      </button>
                      */}
                  </div>
                  <div className="text-center">
                    <button type="button" onClick={() => setShowEmailForm(true)} className="mt-4 text-[8px] font-black uppercase italic text-primary hover:text-black">Iniciar con email</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleLogin} className="space-y-6">
                  <input type="email" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                  <input type="password" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Password" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
                  <div className="text-right">
                     <button type="button" onClick={() => setAuthView('forgot-password')} className="text-[10px] font-black uppercase italic text-primary hover:text-black">¿Olvidaste tu contraseña?</button>
                  </div>
                  <button type="submit" className={loginButtonClasses}>Entrar</button>
                  {SOCIAL_ONLY_LOGIN && (
                    <div className="text-center">
                      <button type="button" onClick={() => setShowEmailForm(false)} className="mt-2 text-[10px] font-black uppercase italic text-primary hover:text-black">Volver a social login</button>
                    </div>
                  )}
                  {!(SOCIAL_ONLY_LOGIN && showEmailForm) && (
                    <div className="mt-4 flex flex-col items-center space-y-3">
                      <div id="googleSignInDiv" className="sr-only" aria-hidden></div>
                      <button type="button" onClick={signInGoogle} className="w-[220px] h-10 flex items-center justify-center gap-3 bg-white text-slate-800 border border-slate-200 rounded-md font-bold text-sm shadow-sm hover:shadow-md">
                        <span className="w-5 h-5 inline-block" aria-hidden>
                          <img src={googleIcon} alt="Google" className="w-full h-full object-contain" />
                        </span>
                        <span>Sign in with Google</span>
                      </button>
                      {/*
                      <button type="button" onClick={signInMicrosoft} className="w-[220px] h-10 flex items-center justify-center gap-3 bg-[#2F2F2F] text-white px-4 rounded-md font-bold text-sm shadow-md hover:opacity-90">
                        <span className="w-5 h-5 inline-block" aria-hidden>
                          <img src={microsoftIcon} alt="Microsoft" className="w-full h-full object-contain" />
                        </span>
                        <span>Sign in with Microsoft</span>
                      </button>
                      
                      <button type="button" onClick={signInApple} className="w-[220px] h-10 flex items-center justify-center gap-3 bg-black text-white px-4 rounded-md font-bold text-sm shadow-md hover:opacity-90">
                        <span className="w-5 h-5 inline-block" aria-hidden>
                          <img src="/images/apple-icon-logo-png.png" alt="Apple" className="w-full h-full object-contain" />
                        </span>
                        <span>Sign in with Apple</span>
                      </button>
                      */}
                    </div>
                  )}
                </form>
              ))
            ) : authView === 'forgot-password' ? (
              <form onSubmit={handleRequestReset} className="space-y-6">
                <input type="email" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Your Registered Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                <button type="submit" className={loginButtonClasses}>Enviar Enlace</button>
                <button type="button" onClick={() => setAuthView('login')} className="w-full text-[10px] font-black uppercase text-slate-400">Volver</button>
              </form>
            ) : authView === 'reset-password' ? (
              <form onSubmit={handleResetPassword} className="space-y-6">
                {!resetToken && (
                  <div className="p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-center bg-red-600 text-white border-2 border-black">
                    Enlace invalido o expirado.
                  </div>
                )}
                <input type="password" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Nueva Contraseña" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                <input type="password" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Confirmar" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                <button type="submit" className={loginButtonClasses} disabled={!resetToken}>Cambiar Contraseña</button>
                <button type="button" onClick={() => setAuthView('login')} className="w-full text-[10px] font-black uppercase text-slate-400">Volver</button>
              </form>
            ) : (
              <form onSubmit={handleSetPassword} className="space-y-4">
                <input type="password" title="Mínimo 6 caracteres" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Nueva Contraseña" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                <input type="password" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Confirmar" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                <button type="submit" className={loginButtonClasses}>Forjar Acceso</button>
              </form>
            )}
          </div>
        </div>
          <Popup open={popup.open} type={popup.type} title={popup.title} message={popup.message} onClose={() => setPopup({ ...popup, open: false })} />
        </BrandingProvider>
    );
  }

  return (
    <BrandingProvider>
      <Layout user={user} onLogout={logoutAndRedirect} activeTab={activeTab} setActiveTab={setActiveTab}>
        {activeTab === 'dashboard' && user.role === UserRole.USER && <DashboardUser currentUser={user} />}
        {activeTab === 'dashboard' && user.role === UserRole.INDEPENDIENTE && <DashboardAlone currentUser={user} />}

        {activeTab === 'users' && user.role === UserRole.ADMIN && (
          <DashboardAdmin activeTab="users" currentUser={user} />
        )}
        {activeTab === 'users' && user.role === UserRole.COACH && (
          <DashboardCoach 
            activeTab="users" 
            currentUser={user} 
            onSelectUserForRoutine={(id) => { setSelectedUserForRoutine(id); setActiveTab('routines'); }} 
          />
        )}
        
        {activeTab === 'animations' && user.role === UserRole.ADMIN && <DashboardAdmin activeTab="animations" currentUser={user} />}
        {activeTab === 'metrics' && user.role === UserRole.ADMIN && <DashboardAdmin activeTab="metrics" currentUser={user} />}
        {activeTab === 'audit' && user.role === UserRole.ADMIN && <DashboardAdmin activeTab="audit" currentUser={user} />}
        {activeTab === 'branding' && user.role === UserRole.ADMIN && <BrandingManager />}
        
        {activeTab === 'routines' && (user.role === UserRole.COACH || user.role === UserRole.ADMIN) && (
          <DashboardCoach 
            activeTab="routines" 
            currentUser={user} 
            initialSelectedUser={selectedUserForRoutine}
            setActiveTab={setActiveTab}
          />
        )}
        <Popup open={popup.open} type={popup.type} title={popup.title} message={popup.message} onClose={() => setPopup({ ...popup, open: false })} />
      </Layout>
    </BrandingProvider>
  );
};

export default App;
