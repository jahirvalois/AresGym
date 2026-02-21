
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { brandingService } from '../services/brandingService';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ user, onLogout, children, activeTab, setActiveTab }) => {
  const settings = brandingService.getSettings();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return;
    const mq = window.matchMedia('(orientation: landscape)');
    const onChange = () => setIsLandscape(!!mq.matches);
    onChange();
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange as any);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange as any);
    };
  }, []);

  // Filtramos los items del menú según el rol. El ADMIN ya no ve 'dashboard'.
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', roles: [UserRole.USER] },
    { id: 'users', label: 'Guerreros', roles: [UserRole.ADMIN, UserRole.COACH] },
    { id: 'routines', label: 'Arsenal (Rutinas)', roles: [UserRole.COACH, UserRole.ADMIN] },
    { id: 'animations', label: 'Arsenal & Animaciones', roles: [UserRole.ADMIN] },
    { id: 'branding', label: 'Personalización', roles: [UserRole.ADMIN] },
    { id: 'audit', label: 'Bitácora', roles: [UserRole.ADMIN] },
  ].filter(item => item.roles.includes(user.role));

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    setIsMobileMenuOpen(false);
  };

  const renderIcon = (id: string) => {
    switch (id) {
      case 'users':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a4 4 0 00-4-4h-1"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20H4v-2a4 4 0 014-4h1"/><circle cx="9" cy="7" r="4"/><circle cx="17" cy="7" r="4"/></svg>
        );
      case 'routines':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7H3v12a2 2 0 002 2z"/></svg>
        );
      case 'animations':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10l4 2-4 2V10z"/><rect x="3" y="6" width="8" height="12" rx="2"/></svg>
        );
      case 'branding':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v18"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12h18"/></svg>
        );
      case 'audit':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
        );
      default:
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/></svg>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Mobile Header */}
      <header className="md:hidden bg-secondary text-white p-3 flex justify-between items-center shadow-lg sticky top-0 z-[100]">
        <div className="flex items-center space-x-2">
          <img src={settings.logo} alt="Logo" className="w-7 h-7 rounded bg-primary p-0.5" />
          <h1 className="font-black text-base tracking-tighter uppercase italic">{settings.gymName}</h1>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-3 bg-slate-800 rounded-lg text-primary touch-manipulation"
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
          )}
        </button>
      </header>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-[90] flex flex-col ${isDesktopCollapsed ? 'md:w-20 w-64' : 'w-64'} bg-secondary text-white transform transition-transform duration-300 ease-in-out border-r border-slate-800 shadow-2xl
        md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 hidden md:flex items-center space-x-3 border-b border-slate-800">
          <img src={settings.logo} alt="Logo" className="w-8 h-8 rounded bg-primary p-0.5" />
          <h1 className={`font-black text-xl tracking-tighter uppercase italic ${isDesktopCollapsed ? 'hidden' : ''}`}>{settings.gymName}</h1>
          {isLandscape && (
            <button
              onClick={() => setIsDesktopCollapsed(s => !s)}
              aria-label={isDesktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="ml-auto p-2 bg-slate-800/50 hover:bg-slate-700 rounded-lg text-primary"
            >
              {isDesktopCollapsed ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg>
              )}
            </button>
          )}
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto mt-16 md:mt-0">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              title={item.label}
              aria-label={item.label}
              className={`transition-all duration-200 uppercase text-[10px] font-black tracking-[0.2em] rounded-lg ${
                isDesktopCollapsed ? 'flex items-center justify-center py-4 w-full' : 'w-full text-left px-4 py-4 md:py-3'
              } ${activeTab === item.id ? 'sidebar-active shadow-lg transform translate-x-1' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              {isDesktopCollapsed ? renderIcon(item.id) : <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="mt-auto sticky bottom-0 p-4 border-t border-slate-800 bg-secondary/0">
          <div className={`flex items-center ${isDesktopCollapsed ? 'justify-center mb-5' : 'space-x-3 mb-5 px-2'}`}>
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-xs font-black text-secondary overflow-hidden border-2 border-primary/30">
              {user.profilePicture ? (
                <img src={user.profilePicture} alt="Perfil" className="w-full h-full object-cover" />
              ) : (
                user.name.charAt(0)
              )}
            </div>
            {!isDesktopCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate uppercase">{user.name}</p>
                <p className="text-[10px] text-slate-500 truncate uppercase tracking-tighter">{user.role}</p>
              </div>
            )}
          </div>
          {isDesktopCollapsed ? (
            <button onClick={onLogout} title="Cerrar Sesión" aria-label="Cerrar Sesión" className="w-full flex items-center justify-center p-2 bg-slate-900 hover:bg-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8v8"/></svg>
            </button>
            ) : (
            <button onClick={onLogout} className="w-full bg-slate-900 hover:bg-red-600 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95">
              Cerrar Sesión
            </button>
          )}
        </div>
      </aside>

      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <main className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};
