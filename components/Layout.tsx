
import React, { useState } from 'react';
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Mobile Header */}
      <header className="md:hidden bg-secondary text-white p-4 flex justify-between items-center shadow-lg sticky top-0 z-[100]">
        <div className="flex items-center space-x-2">
          <img src={settings.logo} alt="Logo" className="w-8 h-8 rounded bg-primary p-0.5" />
          <h1 className="font-black text-lg tracking-tighter uppercase italic">{settings.gymName}</h1>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 bg-slate-800 rounded-lg text-primary"
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
        fixed inset-y-0 left-0 z-[90] w-64 bg-secondary text-white transform transition-transform duration-300 ease-in-out border-r border-slate-800 shadow-2xl
        md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 hidden md:flex items-center space-x-3 border-b border-slate-800">
          <img src={settings.logo} alt="Logo" className="w-8 h-8 rounded bg-primary p-0.5" />
          <h1 className="font-black text-xl tracking-tighter uppercase italic">{settings.gymName}</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto mt-16 md:mt-0">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 uppercase text-[10px] font-black tracking-[0.2em] ${
                activeTab === item.id ? 'sidebar-active shadow-lg transform translate-x-1' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center space-x-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-xs font-black text-secondary overflow-hidden border-2 border-primary/30">
              {user.profilePicture ? (
                <img src={user.profilePicture} alt="Perfil" className="w-full h-full object-cover" />
              ) : (
                user.name.charAt(0)
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate uppercase">{user.name}</p>
              <p className="text-[10px] text-slate-500 truncate uppercase tracking-tighter">{user.role}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full bg-slate-900 hover:bg-red-600 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95"
          >
            Cerrar Sesión
          </button>
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
