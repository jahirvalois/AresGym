
import React, { useState, useEffect } from 'react';
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

const App: React.FC = () => {
  const [dbReady, setDbReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authView, setAuthView] = useState<AuthView>('login');
  
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [error, setError] = useState<{ message: string; isBlocking: boolean } | null>(null);
  
  const [tempUser, setTempUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [selectedUserForRoutine, setSelectedUserForRoutine] = useState<string | undefined>(undefined);

  const [settings, setSettings] = useState(brandingService.getSettings());

  useEffect(() => {
    apiService.init().then(() => setDbReady(true));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
      // Redireccionamos a ADMIN y COACH a la lista de usuarios
      if (found.role === UserRole.COACH || found.role === UserRole.ADMIN) setActiveTab('users');
      else setActiveTab('dashboard');
      setError(sub.message ? { message: sub.message, isBlocking: false } : null);
    } else {
      setError({ message: 'Credenciales inválidas', isBlocking: false });
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await apiService.requestPasswordReset(loginEmail);
    if (success) {
      alert('Enlace de recuperación enviado (Simulado)');
      setAuthView('login');
    } else {
      setError({ message: 'Email no registrado', isBlocking: false });
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
  };

  if (!dbReady) return <div className="min-h-screen bg-black flex items-center justify-center font-black text-primary italic text-2xl uppercase tracking-tighter">Iniciando Servidores...</div>;

  const loginButtonClasses = "w-full bg-black text-primary py-5 rounded-[1.5rem] font-black text-lg shadow-xl border-2 border-black hover:bg-[#eab308] hover:text-black hover:border-black transition-all uppercase italic";

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

            {authView === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-6">
                <input type="email" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                <input type="password" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Contraseña" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
                <div className="text-right">
                   <button type="button" onClick={() => setAuthView('forgot-password')} className="text-[10px] font-black uppercase italic text-primary hover:text-black">¿Olvidaste tu contraseña?</button>
                </div>
                <button type="submit" className={loginButtonClasses}>Entrar</button>
              </form>
            ) : authView === 'forgot-password' ? (
              <form onSubmit={handleRequestReset} className="space-y-6">
                <input type="email" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Tu Email Registrado" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                <button type="submit" className={loginButtonClasses}>Enviar Enlace</button>
                <button type="button" onClick={() => setAuthView('login')} className="w-full text-[10px] font-black uppercase text-slate-400">Volver</button>
              </form>
            ) : (
              <form onSubmit={handleSetPassword} className="space-y-4">
                <input type="password" title="Mínimo 6 caracteres" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Nueva Contraseña" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                <input type="password" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50 outline-none font-bold text-sm" placeholder="Confirmar" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                <button type="submit" className={loginButtonClasses}>Forjar Acceso</button>
              </form>
            )}

            <div className="text-center pt-8 border-t border-slate-50">
              <p className="text-[9px] text-slate-300 font-bold uppercase tracking-[0.2em]">{settings.contactInfo}</p>
            </div>
          </div>
        </div>
      </BrandingProvider>
    );
  }

  return (
    <BrandingProvider>
      <Layout user={user} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab}>
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
      </Layout>
    </BrandingProvider>
  );
};

export default App;
