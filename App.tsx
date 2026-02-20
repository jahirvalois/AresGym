
import React, { useState, useEffect } from 'react';
import Popup from './components/Popup';
import { User, UserRole, SubscriptionState } from './types';
import { apiService } from './services/apiService';
import { brandingService } from './services/brandingService';
import { BrandingProvider } from './components/BrandingProvider';
import { Layout } from './components/Layout';
import { DashboardAdmin } from './pages/DashboardAdmin';
import { DashboardCoach } from './pages/DashboardCoach';
import { DashboardUser } from './pages/DashboardUser';
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
      console.log('[Google debug] import.meta.env keys:', Object.keys(metaEnv || {}), 'VITE_GOOGLE_CLIENT_ID(meta)=', clientIdFromMeta, 'window=', clientIdFromWindow);
      if (!clientId) return null;

      const tryInit = () => {
        const haveGoogle = !!(window as any).google;
        console.log('[Google init] haveGoogle:', haveGoogle);
        if (!haveGoogle) return false;
        try {
          console.log('[Google init] initializing with clientId:', clientId);
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
                    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: normalized, expiresAt: Date.now() + 3600 * 1000 }));
                    setUser(normalized);
                  }
                }).catch(() => {});
              } catch (e) {
                console.warn('Failed to handle Google credential', e);
              }
            }
          });
          const container = document.getElementById('googleSignInDiv');
          console.log('[Google init] button container found:', !!container);
          if (container) {
            (window as any).google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', width: 100 });
            console.log('[Google init] renderButton called successfully');
            return true;
          }
          // If container missing, do not consider init complete — allow retries until container appears
          console.log('[Google init] renderButton skipped, container missing — will retry');
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
        if (sub.state === SubscriptionState.EXPIRED) {
          setError({ message: sub.message!, isBlocking: true });
          return;
        }
        setUser(found);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ user: found, expiresAt: Date.now() + SESSION_TTL_MS }));
        if (found.role === UserRole.COACH || found.role === UserRole.ADMIN) setActiveTab('users');
        else setActiveTab('dashboard');
        setError(sub.message ? { message: sub.message, isBlocking: false } : null);
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

  const loginButtonClasses = "w-full bg-black text-primary py-5 rounded-[1.5rem] font-black text-lg shadow-xl border-2 border-black hover:bg-yellow-500 hover:text-black hover:border-black transition-all uppercase italic";

  if (!user) {
    const isBlocking = error?.isBlocking;
    return (
      <BrandingProvider>
        <div 
          className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center"
          style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url(${settings.loginBgUrl})` }}
        >
          <div className="max-w-md w-full bg-white rounded-[3rem] shadow-2xl p-8 sm:p-12 space-y-8 animate-in fade-in zoom-in border border-white/20 backdrop-blur-sm relative">
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
              <form onSubmit={handleLogin} className="space-y-6">
                <input type="email" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                <input type="password" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Contraseña" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
                <div className="text-right">
                   <button type="button" onClick={() => setAuthView('forgot-password')} className="text-[10px] font-black uppercase italic text-primary hover:text-black">¿Olvidaste tu contraseña?</button>
                </div>
                <button type="submit" className={loginButtonClasses}>Entrar</button>
                <div id="googleSignInDiv" className="mt-4"></div>
              </form>
            ) : authView === 'forgot-password' ? (
              <form onSubmit={handleRequestReset} className="space-y-6">
                <input type="email" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Tu Email Registrado" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
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
