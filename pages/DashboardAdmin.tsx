
import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import { User, UserRole, UserStatus, AuditLog } from '../types';

type SortKey = 'name' | 'role' | 'status' | 'vencimiento';
type SortDirection = 'asc' | 'desc';

export const DashboardAdmin: React.FC<{ activeTab: string; currentUser: User }> = ({ activeTab, currentUser }) => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  
  const [categories, setCategories] = useState<string[]>([]);
  const [exerciseBank, setExerciseBank] = useState<Record<string, string[]>>({});
  const [selectedArsenalCategory, setSelectedArsenalCategory] = useState<string>('');
  const [mediaMap, setMediaMap] = useState<Record<string, string>>({});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingEx, setEditingEx] = useState<{old: string, new: string} | null>(null);
  const [editingCat, setEditingCat] = useState<{old: string, new: string} | null>(null);
  const [newExName, setNewExName] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);

  const [newUser, setNewUser] = useState({ 
    name: '', 
    email: '', 
    role: UserRole.USER, 
    subEnd: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0] 
  });

  const refreshData = async () => {
    const [u, logs, m, cats, bank, media] = await Promise.all([
      apiService.getUsers(),
      apiService.getAuditLogs(),
      apiService.getLiveMetrics(),
      apiService.getExerciseCategories(),
      apiService.getExerciseBank(),
      apiService.getAllExerciseMedia()
    ]);
    setUsers(u);
    setAuditLogs(logs);
    setMetrics(m);
    setCategories(cats);
    setExerciseBank(bank);
    setMediaMap(media);
    if (!selectedArsenalCategory && cats.length > 0) setSelectedArsenalCategory(cats[0]);
    setLoading(false);
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email) return alert("Nombre y Email obligatorios");
    await apiService.createUser(currentUser, {
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      subscriptionEndDate: newUser.role === UserRole.USER ? new Date(newUser.subEnd).toISOString() : '2050-12-31T23:59:59.000Z'
    });
    setNewUser({ ...newUser, name: '', email: '' });
    refreshData();
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      await apiService.updateUser(currentUser, editingUser.id, editingUser);
      setEditingUser(null);
      refreshData();
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (window.confirm("¿Seguro que deseas desterrar a este guerrero?")) {
      try {
        await apiService.deleteUser(currentUser, id);
        refreshData();
      } catch (err: any) { alert(err.message); }
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await apiService.addCategory(currentUser.id, newCatName.trim());
    setNewCatName('');
    refreshData();
  };

  const handleRenameCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCat && editingCat.new.trim()) {
      await apiService.renameCategory(currentUser.id, editingCat.old, editingCat.new.trim());
      setEditingCat(null);
      refreshData();
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    if (window.confirm(`¿BORRAR categoría "${cat}" y todo su arsenal?`)) {
      await apiService.deleteCategory(currentUser.id, cat);
      refreshData();
    }
  };

  const handleAddExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExName.trim() || !selectedArsenalCategory) return;
    const name = newExName.trim().toUpperCase();
    const current = exerciseBank[selectedArsenalCategory] || [];
    if (current.includes(name)) return alert("Ya existe.");
    await apiService.updateExerciseBank(currentUser.id, selectedArsenalCategory, [...current, name]);
    setNewExName('');
    refreshData();
  };

  const handleDeleteExercise = async (ex: string) => {
    if (window.confirm(`¿Quitar misión "${ex}"?`)) {
      const currentList = exerciseBank[selectedArsenalCategory] || [];
      await apiService.updateExerciseBank(currentUser.id, selectedArsenalCategory, currentList.filter(x => x !== ex));
      refreshData();
    }
  };

  const handleRenameExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingEx && editingEx.new.trim()) {
      await apiService.renameExercise(currentUser.id, selectedArsenalCategory, editingEx.old, editingEx.new.trim().toUpperCase());
      setEditingEx(null);
      refreshData();
    }
  };

  const handleUpdateMedia = async (ex: string, url: string) => {
    await apiService.updateExerciseMedia(currentUser.id, ex, url);
    const media = await apiService.getAllExerciseMedia();
    setMediaMap(media);
  };

  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedUsers = () => {
    const filtered = users.filter(u => 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!sortConfig) return filtered;

    return [...filtered].sort((a, b) => {
      let valA: any;
      let valB: any;

      switch (sortConfig.key) {
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
        case 'role':
          valA = a.role;
          valB = b.role;
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        case 'vencimiento':
          valA = new Date(a.subscriptionEndDate).getTime();
          valB = new Date(b.subscriptionEndDate).getTime();
          break;
        default:
          return 0;
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  if (loading) return <div className="p-20 text-center font-black animate-pulse text-slate-400 uppercase italic">Sincronizando Base de Datos...</div>;

  if (activeTab === 'users') {
    const sortedUsers = getSortedUsers();
    
    return (
      <div className="space-y-8 animate-in fade-in">
        <header className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-4xl font-black uppercase italic tracking-tighter text-slate-900">Legión de <span className="text-primary">Guerreros</span></h2>
          <input type="text" placeholder="Buscar..." className="w-full md:w-80 bg-white border-2 p-4 rounded-2xl outline-none focus:border-primary font-bold text-xs uppercase" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </header>
        <section className="bg-white p-8 rounded-[3rem] shadow-xl border-2">
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <input type="text" placeholder="Nombre" className="bg-slate-50 p-4 rounded-xl font-bold" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} required />
            <input type="email" placeholder="Email" className="bg-slate-50 p-4 rounded-xl font-bold" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} required />
            <select className="bg-slate-50 p-4 rounded-xl font-bold uppercase" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}>
              <option value={UserRole.USER}>Guerrero</option>
              <option value={UserRole.COACH}>Mentor</option>
              <option value={UserRole.ADMIN}>Rey</option>
            </select>
            <input type="date" className="bg-slate-50 p-4 rounded-xl font-bold" value={newUser.subEnd} onChange={e => setNewUser({...newUser, subEnd: e.target.value})} disabled={newUser.role !== UserRole.USER} />
            <button className="bg-primary text-black font-black uppercase italic p-4 rounded-xl shadow-lg hover:bg-black hover:text-primary transition-all">Reclutar</button>
          </form>
        </section>
        <div className="bg-white rounded-[3rem] shadow-xl border overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-white text-[10px] uppercase">
              <tr>
                <th className="p-8 cursor-pointer hover:text-primary transition-colors select-none" onClick={() => handleSort('name')}>
                  <div className="flex items-center space-x-2">
                    <span>Nombre / Acceso</span>
                    {sortConfig?.key === 'name' && (<span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>)}
                  </div>
                </th>
                <th className="p-8 cursor-pointer hover:text-primary transition-colors select-none" onClick={() => handleSort('role')}>
                  <div className="flex items-center space-x-2">
                    <span>Rol</span>
                    {sortConfig?.key === 'role' && (<span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>)}
                  </div>
                </th>
                <th className="p-8 cursor-pointer hover:text-primary transition-colors select-none" onClick={() => handleSort('status')}>
                  <div className="flex items-center space-x-2">
                    <span>Estatus</span>
                    {sortConfig?.key === 'status' && (<span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>)}
                  </div>
                </th>
                <th className="p-8 cursor-pointer hover:text-primary transition-colors select-none" onClick={() => handleSort('vencimiento')}>
                  <div className="flex items-center space-x-2">
                    <span>Vencimiento</span>
                    {sortConfig?.key === 'vencimiento' && (<span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>)}
                  </div>
                </th>
                <th className="p-8 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedUsers.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-8"><p className="font-black uppercase italic text-slate-900">{u.name}</p><p className="text-[10px] text-slate-400">{u.email}</p></td>
                  <td className="p-8 font-black text-xs uppercase text-primary">{u.role}</td>
                  <td className="p-8"><span className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg ${u.status === UserStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.status}</span></td>
                  <td className="p-8 font-black text-xs">{u.role === UserRole.USER ? new Date(u.subscriptionEndDate).toLocaleDateString() : 'INFINITO'}</td>
                  <td className="p-8 text-right space-x-4"><button onClick={() => setEditingUser(u)} className="text-blue-600 font-black uppercase text-[10px] hover:underline">Ajustar</button><button onClick={() => handleDeleteUser(u.id)} className="text-red-500 font-black uppercase text-[10px] hover:underline">Borrar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editingUser && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[250] animate-in zoom-in">
            <div className="bg-white w-full max-w-md rounded-[3rem] p-10 space-y-6">
              <h3 className="text-2xl font-black uppercase italic tracking-tighter">Ajustar Perfil</h3>
              <div className="space-y-4">
                <input type="text" className="w-full bg-slate-50 p-4 rounded-xl font-bold" value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} />
                <input type="email" className="w-full bg-slate-50 p-4 rounded-xl font-bold" value={editingUser.email} onChange={e => setEditingUser({...editingUser, email: e.target.value})} />
                <select className="w-full bg-slate-50 p-4 rounded-xl font-bold uppercase" value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})}>
                  <option value={UserRole.USER}>Guerrero</option>
                  <option value={UserRole.COACH}>Mentor</option>
                  <option value={UserRole.ADMIN}>Rey</option>
                </select>
                {editingUser.role === UserRole.USER && (
                  <input type="date" className="w-full bg-slate-50 p-4 rounded-xl font-bold" value={editingUser.subscriptionEndDate.split('T')[0]} onChange={e => setEditingUser({...editingUser, subscriptionEndDate: new Date(e.target.value).toISOString()})} />
                )}
              </div>
              <div className="flex gap-4">
                <button onClick={() => setEditingUser(null)} className="flex-1 py-4 uppercase text-slate-400 font-black">Cerrar</button>
                <button onClick={handleUpdateUser} className="flex-1 bg-black text-primary py-4 rounded-xl font-black uppercase">Guardar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'animations') {
    return (
      <div className="space-y-8 animate-in fade-in">
        <header className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-4xl font-black uppercase italic tracking-tighter text-slate-900">Arsenal & <span className="text-primary">Animaciones</span></h2>
          <form onSubmit={handleAddCategory} className="flex gap-2 w-full md:w-auto">
             <input type="text" placeholder="Nuevo Músculo..." className="flex-1 md:w-64 bg-white border-2 p-4 rounded-2xl outline-none focus:border-primary font-bold text-xs uppercase" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
             <button type="submit" className="bg-black text-primary px-6 rounded-2xl font-black uppercase italic shadow-lg hover:bg-primary hover:text-black transition-all">Añadir</button>
          </form>
        </header>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="w-full lg:w-80 space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 italic">Arsenal Disponible</h3>
            {categories.map(cat => (
              <div key={cat} className={`flex items-center group rounded-[1.8rem] transition-all overflow-hidden ${selectedArsenalCategory === cat ? 'bg-black shadow-2xl' : 'bg-white border'}`}>
                <button onClick={() => setSelectedArsenalCategory(cat)} className={`flex-1 text-left p-5 text-[11px] font-black uppercase italic tracking-tighter ${selectedArsenalCategory === cat ? 'text-primary' : 'text-slate-400'}`}>
                  {cat.replace("RUTINA DE ", "")}
                </button>
                <div className="flex px-2 space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditingCat({old: cat, new: cat})} className={`p-2 transition-colors ${selectedArsenalCategory === cat ? 'text-blue-300 hover:text-blue-100' : 'text-blue-400 hover:text-blue-600'}`}>✎</button>
                  <button onClick={() => handleDeleteCategory(cat)} className={`p-2 transition-colors ${selectedArsenalCategory === cat ? 'text-red-400 hover:text-red-200' : 'text-red-500 hover:text-red-700'}`}>✕</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1 bg-white p-10 rounded-[3rem] border-2 shadow-sm">
            {selectedArsenalCategory ? (
              <>
                <div className="flex flex-col sm:flex-row justify-between items-center mb-10 border-b border-slate-100 pb-8 gap-4">
                   <div>
                     <p className="text-primary font-black uppercase text-[9px] italic mb-1 tracking-widest">Panel de Arsenal</p>
                     <h3 className="text-3xl font-black uppercase italic text-slate-900 tracking-tighter">{selectedArsenalCategory}</h3>
                   </div>
                   <form onSubmit={handleAddExercise} className="flex gap-3 w-full sm:w-auto">
                     <input type="text" placeholder="Nueva misión..." className="flex-1 sm:w-64 bg-slate-50 p-4 rounded-xl text-xs font-black uppercase italic outline-none border-2 focus:border-primary" value={newExName} onChange={e => setNewExName(e.target.value)} />
                     <button className="bg-primary text-black px-8 py-4 rounded-xl font-black uppercase italic text-xs shadow-lg hover:bg-black hover:text-primary transition-all">Crear</button>
                   </form>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(exerciseBank[selectedArsenalCategory] || []).map(ex => (
                    <div key={ex} className="p-6 bg-slate-50 rounded-[2.5rem] border-2 border-transparent hover:border-primary transition-all shadow-sm space-y-4">
                      <div className="flex justify-between items-center border-b pb-3">
                        <p className="font-black text-[12px] uppercase italic text-slate-900">{ex}</p>
                        <div className="flex gap-4">
                          <button onClick={() => setEditingEx({old: ex, new: ex})} className="text-blue-500 font-black text-[9px] uppercase hover:underline">Renombrar</button>
                          <button onClick={() => handleDeleteExercise(ex)} className="text-red-500 font-black text-[9px] uppercase hover:underline">Borrar</button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                         <input type="text" placeholder="URL GIF/Video..." className="flex-1 bg-white border p-3 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary" value={mediaMap[ex] || ''} onChange={e => handleUpdateMedia(ex, e.target.value)} />
                         <button onClick={() => setPreviewUrl(mediaMap[ex] || 'https://media.giphy.com/media/l0HlS9j1R2z8G3H5e/giphy.gif')} className="bg-black text-primary p-3 rounded-xl shadow-lg"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /></svg></button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-40 text-center opacity-30 font-black uppercase italic">Selecciona una categoría de misiones.</div>
            )}
          </div>
        </div>
        {editingEx && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[250] animate-in zoom-in">
            <div className="bg-white w-full max-w-md rounded-[3rem] p-10 space-y-6">
               <h3 className="text-2xl font-black uppercase italic tracking-tighter">Renombrar Misión</h3>
               <input type="text" className="w-full bg-slate-50 p-5 rounded-xl font-black uppercase italic border-2 border-primary outline-none" value={editingEx.new} onChange={e => setEditingEx({...editingEx, new: e.target.value})} autoFocus />
               <div className="flex gap-4">
                 <button onClick={() => setEditingEx(null)} className="flex-1 py-4 uppercase text-slate-400 font-black">Cancelar</button>
                 <button onClick={handleRenameExercise} className="flex-1 bg-black text-primary py-4 rounded-xl font-black uppercase italic shadow-lg">Guardar</button>
               </div>
            </div>
          </div>
        )}
        {editingCat && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[250] animate-in zoom-in">
            <div className="bg-white w-full max-w-md rounded-[3rem] p-10 space-y-6">
               <h3 className="text-2xl font-black uppercase italic tracking-tighter">Ajustar Músculo</h3>
               <input type="text" className="w-full bg-slate-50 p-5 rounded-xl font-black uppercase italic border-2 border-primary outline-none" value={editingCat.new.replace("RUTINA DE ", "")} onChange={e => setEditingCat({...editingCat, new: e.target.value})} autoFocus />
               <div className="flex gap-4">
                 <button onClick={() => setEditingCat(null)} className="flex-1 py-4 uppercase text-slate-400 font-black">Cancelar</button>
                 <button onClick={handleRenameCategory} className="flex-1 bg-black text-primary py-4 rounded-xl font-black uppercase italic shadow-lg">Guardar</button>
               </div>
            </div>
          </div>
        )}
        {previewUrl && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[250] animate-in zoom-in">
            <div className="bg-white w-full max-w-lg rounded-[4rem] p-12 space-y-6 relative border">
              <button onClick={() => setPreviewUrl(null)} className="absolute top-8 right-8 w-12 h-12 bg-slate-100 hover:bg-red-500 hover:text-white rounded-2xl font-black transition-all flex items-center justify-center text-xl shadow-lg">✕</button>
              <h3 className="text-3xl font-black uppercase italic">Vista Táctica</h3>
              <div className="aspect-video bg-black rounded-[2.5rem] overflow-hidden shadow-2xl"><img src={previewUrl} className="w-full h-full object-cover" alt="Preview" /></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'audit') {
    return (
      <div className="space-y-8 animate-in fade-in">
        <h2 className="text-4xl font-black uppercase italic tracking-tighter text-slate-900">Bitácora del <span className="text-primary">Olimpo</span></h2>
        <div className="bg-white rounded-[3rem] border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-white text-[10px] uppercase">
              <tr><th className="p-8">Instante</th><th className="p-8">Autor</th><th className="p-8">Acción</th><th className="p-8">Detalles</th></tr>
            </thead>
            <tbody className="divide-y">
              {auditLogs.slice(0, 50).map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-8 font-mono text-[11px] text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="p-8 font-black uppercase italic text-xs">{users.find(u => u.id === log.userId)?.name || 'SISTEMA'}</td>
                  <td className="p-8"><span className="text-[9px] font-black uppercase px-2 py-1 bg-slate-100 rounded text-slate-600 border">{log.action}</span></td>
                  <td className="p-8 font-bold text-xs text-slate-600 uppercase italic tracking-tighter">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return null;
};
