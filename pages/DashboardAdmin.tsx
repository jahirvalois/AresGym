
import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/apiService';
import { User, UserRole, UserStatus, AuditLog } from '../types';

type SortKey = 'name' | 'role' | 'status' | 'vencimiento' | 'origin';
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
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<string | null>(null);
  const [pendingDeleteExercise, setPendingDeleteExercise] = useState<{category: string, exercise: string} | null>(null);
  const [newExName, setNewExName] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadTargetExercise, setUploadTargetExercise] = useState<string | null>(null);
  const MAX_UPLOAD_BYTES = 5242880; // client-side fallback limit

  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFilter, setAuditFilter] = useState('');

  // Pagination for audit logs
  const [auditPage, setAuditPage] = useState(1);
  const auditPageSize = 6;

  // Pagination for users table (kept at top-level to satisfy Hooks rules)
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    // reset to first page when filters or data change
    setPage(1);
  }, [searchQuery, sortConfig, users.length]);

  const [newUser, setNewUser] = useState({ 
    name: '', 
    email: '', 
    role: UserRole.USER, 
    subEnd: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0] 
  });

  // Arsenal (animations) search + pagination
  const [arsenalQuery, setArsenalQuery] = useState('');
  const [arsenalPage, setArsenalPage] = useState(1);
  const arsenalPageSize = 6;

  useEffect(() => {
    // reset arsenal page when category or query changes
    setArsenalPage(1);
  }, [selectedArsenalCategory, arsenalQuery, exerciseBank]);

  const refreshData = async () => {
    const [u, logs, cats, bank, media] = await Promise.all([
      apiService.getUsers(),
      apiService.getAuditLogs(),
      apiService.getExerciseCategories(),
      apiService.getExerciseBank(),
      apiService.getAllExerciseMedia()
    ]);
    setUsers(u);
    setAuditLogs(logs);
    setMetrics(null); // ocultamos métricas en esta versión
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

  // reset audit page when search/filter or logs change
  useEffect(() => {
    setAuditPage(1);
  }, [auditSearch, auditFilter, auditLogs.length]);

  // Auto-dismiss notifications after 15 seconds maximum
  useEffect(() => {
    if (!notification) return;
    const timeout = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(timeout);
  }, [notification]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email) return alert("Nombre y Email obligatorios");
    try {
      await apiService.createUser(currentUser, {
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        subscriptionEndDate: newUser.role === UserRole.USER ? new Date(newUser.subEnd).toISOString() : '2050-12-31T23:59:59.000Z'
      });
      setNotification({ type: 'success', message: 'Guerrero reclutado e invitacion enviada.' });
      setNewUser({ ...newUser, name: '', email: '' });
      refreshData();
    } catch (err: any) {
      if (err?.code === 'USER_EXISTS') {
        setNotification({ type: 'error', message: err.message || 'Usuario existe' });
        return;
      }
      setNotification({ type: 'error', message: err?.message || 'No se pudo crear el usuario.' });
    }
  };

  const handleUpdateUser = async (e?: React.FormEvent) => {
    if (e && typeof (e as any).preventDefault === 'function') (e as any).preventDefault();
    if (editingUser) {
      // Don't allow email to be changed here — remove it from updates
      const { email, _id, id, ...updates } = editingUser as any;
      // If role was changed to USER and no subscriptionEndDate provided, set a default one month from now
      if (updates.role === UserRole.USER && !updates.subscriptionEndDate) {
        updates.subscriptionEndDate = new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString();
      }
      const userId = id || (typeof _id === 'string' ? _id : (typeof _id === 'object' && _id?._id) ? String(_id) : undefined);
      await apiService.updateUser(currentUser, userId || editingUser.id, updates as any);
      setEditingUser(null);
      refreshData();
    }
  };

  const handleDeleteUser = async (id: string) => {
    console.debug('[DashboardAdmin] handleDeleteUser called with id:', id);
    const target = users.find(u => u.id === id) || null;
    if (!target) console.warn('[DashboardAdmin] No user found for id:', id, 'users count:', users.length);
    setPendingDelete(target);
  };

  const confirmDeleteUser = async () => {
    if (!pendingDelete) return;
    try {
      console.debug('[DashboardAdmin] confirmDeleteUser deleting pendingDelete:', pendingDelete);
      await apiService.deleteUser(currentUser, pendingDelete.id);
      setNotification({ type: 'success', message: 'Guerrero eliminado.' });
      setPendingDelete(null);
      refreshData();
    } catch (err: any) {
      console.error('[DashboardAdmin] confirmDeleteUser error:', err);
      setNotification({ type: 'error', message: err?.message || 'No se pudo borrar el usuario.' });
      setPendingDelete(null);
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
    setPendingDeleteCategory(cat);
  };

  const confirmDeleteCategory = async () => {
    if (!pendingDeleteCategory) return;
    try {
      await apiService.deleteCategory(currentUser.id, pendingDeleteCategory);
      setPendingDeleteCategory(null);
      refreshData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'No se pudo borrar la categoría.' });
      setPendingDeleteCategory(null);
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
    setPendingDeleteExercise({ category: selectedArsenalCategory, exercise: ex });
  };

  const confirmDeleteExercise = async () => {
    if (!pendingDeleteExercise) return;
    const { category, exercise } = pendingDeleteExercise;
    try {
      const currentList = exerciseBank[category] || [];
      await apiService.updateExerciseBank(currentUser.id, category, currentList.filter(x => x !== exercise));
      setPendingDeleteExercise(null);
      refreshData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'No se pudo borrar la misión.' });
      setPendingDeleteExercise(null);
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
        case 'origin':
          valA = (a.origin || a.provider || 'manual').toString().toLowerCase();
          valB = (b.origin || b.provider || 'manual').toString().toLowerCase();
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

  const renderRoleBadge = (role?: string) => {
    const r = (role || 'USER').toString().toUpperCase();
    let classes = 'text-[13px] font-black uppercase px-2 py-1 rounded-lg ';
    let label = r;
    if (r === 'ADMIN') classes += 'bg-slate-800 text-yellow-600';
    else if (r === 'COACH') classes += 'bg-blue-100 text-blue-700';
    else classes += 'bg-gray-300 text-black-100';
    return <span className={classes}>{label}</span>;
  };

  if (loading) return <div className="p-20 text-center font-black animate-pulse text-slate-400 uppercase italic">Sincronizando Base de Datos...</div>;

  if (activeTab === 'users') {
    const sortedUsers = getSortedUsers();
    const totalPages = Math.max(1, Math.ceil(sortedUsers.length / pageSize));
    const paginatedUsers = sortedUsers.slice((page - 1) * pageSize, page * pageSize);
    
    return (
      <div className="space-y-8 animate-in fade-in">
        <input ref={el => fileInputRef.current = el} type="file" accept="image/*,video/*" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f || !uploadTargetExercise) return;
          setUploading(true);
          try {
            // Read file as base64 and POST to server proxy to avoid CORS issues
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const fr = new FileReader();
              fr.onload = () => resolve(String(fr.result));
              fr.onerror = reject;
              fr.readAsDataURL(f);
            });
            const base64 = dataUrl.split(',')[1];
            const resp = await fetch('/api/exercises/upload-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filename: f.name, contentBase64: base64, contentType: f.type, exerciseName: uploadTargetExercise, adminId: currentUser.id })
            });
            if (!resp.ok) throw new Error(await resp.text());
            const json = await resp.json();
            const blobUrl = json.blobUrl;
            // Update mapping locally and in backend for consistency
            try { await apiService.updateExerciseMedia(currentUser.id, uploadTargetExercise, blobUrl); } catch (e) { /* ignore */ }
            setMediaMap(m => ({ ...m, [uploadTargetExercise]: blobUrl }));
            setNotification({ type: 'success', message: 'Archivo subido a través del servidor.' });
          } catch (err:any) {
            console.error('Upload failed', err);
            setNotification({ type: 'error', message: err?.message || 'Error al subir archivo' });
          } finally {
            setUploading(false);
            setUploadTargetExercise(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        }} />
        {notification && (
          <div className={`fixed top-6 right-6 z-[300] px-4 py-3 rounded-2xl shadow-xl border-2 font-black uppercase text-[10px] tracking-widest ${notification.type === 'success' ? 'bg-emerald-400 text-black border-black' : 'bg-red-600 text-white border-black'}`}>
            <div className="flex items-center gap-4">
              <div className="flex-1 text-[11px]">{notification.message}</div>
              <button onClick={() => setNotification(null)} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center font-black">✕</button>
            </div>
          </div>
        )}
        <header className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Legión de <span className="text-primary">Guerreros</span></h2>
          <input type="text" placeholder="Buscar..." className="w-full md:w-80 bg-white border-2 p-3 rounded-2xl outline-none focus:border-primary font-bold text-xs uppercase placeholder-slate-400 placeholder:italic placeholder:text-xs" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </header>
        <section className="bg-white p-8 rounded-[3rem] shadow-xl border-2">
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <input type="text" placeholder="Nombre" className="bg-slate-50 p-3 rounded-xl font-bold placeholder-slate-400 placeholder:italic" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} required />
            <input type="email" placeholder="Email" className="bg-slate-50 p-3 rounded-xl font-bold placeholder-slate-400 placeholder:italic" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} required />
            <select className="bg-slate-50 px-4 py-3 rounded-xl font-bold uppercase" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}>
              <option value={UserRole.USER}>Guerrero</option>
              <option value={UserRole.COACH}>Mentor</option>
              <option value={UserRole.ADMIN}>Rey</option>
            </select>
            <input type="date" className="bg-slate-50 p-3 rounded-xl font-bold" value={newUser.subEnd} onChange={e => setNewUser({...newUser, subEnd: e.target.value})} disabled={newUser.role !== UserRole.USER} />
            <button className="bg-primary text-black border-2 border-primary font-black uppercase italic px-6 py-3 rounded-xl shadow-lg hover:bg-black hover:text-yellow-400 hover:border-yellow-400 transition-all">Reclutar</button>
          </form>
        </section>
        <div className="bg-white rounded-xl shadow-xl border overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full table-fixed text-left min-w-[900px] sm:min-w-full">
            <thead className="bg-slate-900 text-white text-[9px] uppercase">
              <tr>
                <th className="p-1 md:p-2 cursor-pointer hover:text-primary transition-colors select-none w-2/5" onClick={() => handleSort('name')}>
                  <div className="flex items-center space-x-2 text-xs md:text-sm">
                    <span>Nombre / Acceso</span>
                    {sortConfig?.key === 'name' && (<span className="text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>)}
                  </div>
                </th>
                <th className="p-1 md:p-2 cursor-pointer hover:text-primary transition-colors select-none w-20 hidden sm:table-cell" onClick={() => handleSort('role')}>
                  <div className="flex items-center space-x-2 text-xs md:text-sm">
                    <span>Rol</span>
                    {sortConfig?.key === 'role' && (<span className="text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>)}
                  </div>
                </th>
                <th className="p-1 md:p-2 cursor-pointer hover:text-primary transition-colors select-none w-32" onClick={() => handleSort('origin')}>
                  <div className="flex items-center space-x-2 text-xs md:text-sm">
                    <span>Origen</span>
                    {sortConfig?.key === 'origin' && (<span className="text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>)}
                  </div>
                </th>
                <th className="p-1 md:p-2 cursor-pointer hover:text-primary transition-colors select-none w-28" onClick={() => handleSort('status')}>
                  <div className="flex items-center space-x-2 text-xs md:text-sm">
                    <span>Estatus</span>
                    {sortConfig?.key === 'status' && (<span className="text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>)}
                  </div>
                </th>
                <th className="p-1 md:p-2 cursor-pointer hover:text-primary transition-colors select-none w-28" onClick={() => handleSort('vencimiento')}>
                  <div className="flex items-center space-x-2 text-xs md:text-sm">
                    <span>Vencimiento</span>
                    {sortConfig?.key === 'vencimiento' && (<span className="text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>)}
                  </div>
                </th>
                <th className="p-1 md:p-2 text-right w-28">
                  <div className="text-xs md:text-sm"><span>Acciones</span></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedUsers.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-1 md:p-2">
                    <p className="font-black uppercase italic text-slate-900 text-xs md:text-sm">{u.name}</p>
                    <p className="text-[13px] text-slate-400">{u.email}</p>
                    <div className="sm:hidden mt-2">{renderRoleBadge(u.role)}</div>
                  </td>
                  <td className="p-1 md:p-2 hidden sm:table-cell">{renderRoleBadge(u.role)}</td>
                  <td className="p-1 md:p-2 font-black text-[13px] uppercase">{(u.origin || u.provider || 'manual').toString().toUpperCase()}</td>
                  <td className="p-1 md:p-2">
                    {u.isFirstLogin ? (
                      <span className="text-[13px] font-black uppercase px-2 py-1 rounded-lg bg-amber-100 text-amber-700">INV. ENVIADA</span>
                    ) : (
                      <span className={`text-[13px] font-black uppercase px-2 py-1 rounded-lg ${u.status === UserStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.status}</span>
                    )}
                  </td>
                  <td className="p-1 md:p-2 font-black text-[13px]">{u.role === UserRole.USER ? new Date(u.subscriptionEndDate).toLocaleDateString() : 'INFINITO'}</td>
                  <td className="p-1 md:p-2 text-right space-x-2 text-[13px]">
                    <button onClick={() => setEditingUser(u)} className="text-blue-600 font-black uppercase hover:underline">Ajustar</button>
                    {u.status !== UserStatus.ACTIVE && (
                      <button onClick={async () => { try { await apiService.updateUser(currentUser, u.id, { status: UserStatus.ACTIVE, isFirstLogin: false }); setNotification({ type: 'success', message: 'Guerrero activado.' }); refreshData(); } catch (err:any) { setNotification({ type: 'error', message: err?.message || 'No se pudo activar.' }); } }} className="text-green-600 font-black uppercase hover:underline">Activar</button>
                    )}
                    <button onClick={() => handleDeleteUser(u.id)} className="text-red-500 font-black uppercase hover:underline">Borrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
              <div className="text-sm text-slate-600">Mostrando {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, sortedUsers.length)} de {sortedUsers.length} usuarios</div>
              <div className="flex items-center space-x-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} aria-label="Anterior" className="px-3 py-1 bg-white border rounded disabled:opacity-50">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 18l-6-6 6-6v12z"/></svg>
                </button>
                <div className="flex items-center space-x-1">
                  <span className="px-3 py-1 rounded bg-slate-900 text-white font-bold">{page}/{totalPages}</span>
                </div>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} aria-label="Siguiente" className="px-3 py-1 bg-white border rounded disabled:opacity-50">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 6l6 6-6 6V6z"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
        {editingUser && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[250] animate-in zoom-in">
            <div className="bg-white w-full max-w-md rounded-[3rem] p-10 space-y-6">
              <h3 className="text-2xl font-black uppercase italic tracking-tighter">Ajustar Perfil</h3>
              <div className="space-y-4">
                <input type="text" className="w-full bg-slate-50 p-3 rounded-xl font-bold placeholder-slate-400 placeholder:italic" value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} />
                <input type="email" disabled className="w-full bg-slate-100 p-3 rounded-xl font-bold cursor-not-allowed placeholder-slate-400 placeholder:italic" value={editingUser.email} />
                <select className="w-full bg-slate-50 p-3 rounded-xl font-bold uppercase" value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})}>
                  <option value={UserRole.USER}>Guerrero</option>
                  <option value={UserRole.COACH}>Mentor</option>
                  <option value={UserRole.ADMIN}>Rey</option>
                </select>
                <select className="w-full bg-slate-50 p-3 rounded-xl font-bold uppercase" value={editingUser.status} onChange={e => setEditingUser({...editingUser, status: e.target.value as UserStatus})}>
                  <option value={UserStatus.ACTIVE}>ACTIVE</option>
                  <option value={UserStatus.INACTIVE}>INACTIVE</option>
                </select>
                {editingUser.role === UserRole.USER && (
                  <input
                    type="date"
                    className="w-full bg-slate-50 p-3 rounded-xl font-bold"
                    value={editingUser.subscriptionEndDate ? editingUser.subscriptionEndDate.split('T')[0] : ''}
                    onChange={e => setEditingUser({...editingUser, subscriptionEndDate: e.target.value ? new Date(e.target.value).toISOString() : ''})}
                  />
                )}
              </div>
              <div className="flex gap-4">
                <button onClick={() => setEditingUser(null)} className="flex-1 py-3 uppercase text-slate-400 font-black">Cerrar</button>
                <button onClick={handleUpdateUser} className="flex-1 bg-black text-primary py-3 rounded-xl font-black uppercase">Guardar</button>
              </div>
            </div>
          </div>
        )}
        {pendingDelete && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[260] animate-in zoom-in">
            <div className="bg-white w-full max-w-md rounded-[3rem] p-10 space-y-6">
              <h3 className="text-2xl font-black uppercase italic tracking-tighter">Confirmar Destierro</h3>
              <p className="text-slate-600 font-bold text-sm">¿Borrar a <span className="font-black">{pendingDelete.name}</span>?</p>
                <div className="flex gap-4">
                <button onClick={() => setPendingDelete(null)} className="flex-1 py-3 uppercase text-slate-400 font-black">Cancelar</button>
                <button onClick={confirmDeleteUser} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black uppercase">Borrar</button>
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
        <input ref={el => fileInputRef.current = el} type="file" accept="image/*,video/*" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f || !uploadTargetExercise) return;
          setUploading(true);
          try {
            // Read file as base64 and POST to server proxy to avoid CORS issues
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const fr = new FileReader();
              fr.onload = () => resolve(String(fr.result));
              fr.onerror = reject;
              fr.readAsDataURL(f);
            });
            const base64 = dataUrl.split(',')[1];
            const resp = await fetch('/api/exercises/upload-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filename: f.name, contentBase64: base64, contentType: f.type, exerciseName: uploadTargetExercise, adminId: currentUser.id })
            });
            if (!resp.ok) throw new Error(await resp.text());
            const json = await resp.json();
            const blobUrl = json.blobUrl;
            try { await apiService.updateExerciseMedia(currentUser.id, uploadTargetExercise, blobUrl); } catch (e) { /* ignore */ }
            setMediaMap(m => ({ ...m, [uploadTargetExercise]: blobUrl }));
            setNotification({ type: 'success', message: 'Archivo subido a través del servidor.' });
          } catch (err:any) {
            console.error('Upload failed', err);
            setNotification({ type: 'error', message: err?.message || 'Error al subir archivo' });
          } finally {
            setUploading(false);
            setUploadTargetExercise(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        }} />
        <header className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Arsenal & <span className="text-primary">Animaciones</span></h2>
           <form onSubmit={handleAddCategory} className="flex gap-2 w-full md:w-auto">
             <input type="text" placeholder="Nuevo Músculo..." className="flex-1 md:w-64 bg-white border-2 p-3 rounded-2xl outline-none focus:border-primary font-bold text-xs uppercase placeholder-slate-400 placeholder:italic" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
             <button type="submit" className="bg-black text-primary px-6 py-3 rounded-2xl font-black uppercase italic shadow-lg hover:bg-primary hover:text-black transition-all">Añadir</button>
           </form>
        </header>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="w-full lg:w-60 space-y-2">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 italic">Arsenal Disponible</h3>
                {categories.map(cat => (
              <div key={cat} className={`flex items-center group rounded-[1.8rem] transition-all overflow-hidden ${selectedArsenalCategory === cat ? 'bg-black shadow-2xl' : 'bg-white border'}`}>
                <button onClick={() => setSelectedArsenalCategory(cat)} className={`flex-1 min-w-0 text-left px-4 py-3 text-[11px] font-black uppercase italic tracking-tighter ${selectedArsenalCategory === cat ? 'text-primary' : 'text-slate-400'}`}>
                  <span className="truncate">{cat.replace("RUTINA DE ", "")}</span>
                </button>
                <div className="flex px-2 space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditingCat({old: cat, new: cat.replace("RUTINA DE ", "")})} className={`p-2 transition-colors flex-shrink-0 ${selectedArsenalCategory === cat ? 'text-blue-300 hover:text-blue-100' : 'text-blue-400 hover:text-blue-600'}`}>✎</button>
                  <button onClick={() => handleDeleteCategory(cat)} className={`p-2 transition-colors flex-shrink-0 ${selectedArsenalCategory === cat ? 'text-red-400 hover:text-red-200' : 'text-red-500 hover:text-red-700'}`}>✕</button>
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
                     <h3 className="text-2xl font-black uppercase italic text-slate-900 tracking-tighter">{selectedArsenalCategory}</h3>
                   </div>
                   <form onSubmit={handleAddExercise} className="flex gap-3 w-full sm:w-auto">
                     <input type="text" placeholder="Nueva misión..." className="flex-1 sm:w-64 bg-slate-50 p-3 rounded-xl text-xs font-black uppercase italic outline-none border-2 focus:border-primary placeholder-slate-400 placeholder:italic" value={newExName} onChange={e => setNewExName(e.target.value)} />
                     <button className="bg-primary text-black px-6 py-3 rounded-xl font-black uppercase italic text-xs shadow-lg hover:bg-black hover:text-primary transition-all">Crear</button>
                   </form>
                </div>

                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <input
                    placeholder="Buscar misión..."
                    className="flex-1 sm:w-64 bg-slate-50 p-3 rounded-2xl border-2 outline-none focus:border-primary font-bold text-xs uppercase"
                    value={arsenalQuery}
                    onChange={e => setArsenalQuery(e.target.value)}
                  />
                  <div className="text-sm text-slate-600">Mostrando {arsenalPageSize} por página</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(() => {
                    const all = exerciseBank[selectedArsenalCategory] || [];
                    const filtered = all.filter(x => x.toLowerCase().includes(arsenalQuery.toLowerCase()));
                    const total = filtered.length;
                    const totalPages = Math.max(1, Math.ceil(total / arsenalPageSize));
                    const pageItems = filtered.slice((arsenalPage - 1) * arsenalPageSize, arsenalPage * arsenalPageSize);

                    return (
                      <>
                        {pageItems.map(ex => (
                          <div key={ex} className="p-6 bg-slate-50 rounded-[2.5rem] border-2 border-transparent hover:border-primary transition-all shadow-sm space-y-4">
                            <div className="flex justify-between items-center border-b pb-3">
                              <p className="font-black text-[12px] uppercase italic text-slate-900">{ex}</p>
                              <div className="flex gap-4">
                                <button onClick={() => setEditingEx({old: ex, new: ex})} className="text-blue-500 font-black text-[9px] uppercase hover:underline">Renombrar</button>
                                <button onClick={() => handleDeleteExercise(ex)} className="text-red-500 font-black text-[9px] uppercase hover:underline">Borrar</button>
                              </div>
                            </div>
                            <div className="flex gap-2 items-center">
                              <input type="text" placeholder="URL GIF/Video..." className="flex-1 min-w-0 bg-white border p-2 md:p-3 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary placeholder-slate-400 placeholder:italic" value={mediaMap[ex] || ''} onChange={e => handleUpdateMedia(ex, e.target.value)} />
                              <button onClick={() => setPreviewUrl(mediaMap[ex] || 'https://media.giphy.com/media/l0HlS9j1R2z8G3H5e/giphy.gif')} className="bg-black text-primary px-2 py-2 rounded-xl shadow-lg flex-shrink-0"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /></svg></button>
                              <button onClick={() => { setUploadTargetExercise(ex); fileInputRef.current?.click(); }} className="bg-primary text-black px-3 py-2 rounded-xl font-black uppercase text-[9px] flex-shrink-0">Subir</button>
                            </div>
                          </div>
                        ))}

                        {totalPages > 1 && (
                          <div className="col-span-1 md:col-span-2 flex items-center justify-between px-4 py-3 bg-gray-50">
                            <div className="text-sm text-slate-600">Mostrando {((arsenalPage - 1) * arsenalPageSize) + 1} - {Math.min(arsenalPage * arsenalPageSize, total)} de {total} misiones</div>
                            <div className="flex items-center space-x-2">
                              <button onClick={() => setArsenalPage(p => Math.max(1, p - 1))} disabled={arsenalPage === 1} aria-label="Anterior" className="px-3 py-1 bg-white border rounded disabled:opacity-50">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 18l-6-6 6-6v12z"/></svg>
                              </button>
                              <div className="flex items-center space-x-1">
                                <span className="px-3 py-1 rounded bg-slate-900 text-white font-bold">{arsenalPage}/{totalPages}</span>
                              </div>
                              <button onClick={() => setArsenalPage(p => Math.min(totalPages, p + 1))} disabled={arsenalPage === totalPages} aria-label="Siguiente" className="px-3 py-1 bg-white border rounded disabled:opacity-50">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 6l6 6-6 6V6z"/></svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
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
               <input type="text" className="w-full bg-slate-50 p-4 rounded-xl font-black uppercase italic border-2 border-primary outline-none" value={editingEx.new} onChange={e => setEditingEx({...editingEx, new: e.target.value})} autoFocus />
               <div className="flex gap-4">
                 <button onClick={() => setEditingEx(null)} className="flex-1 py-3 uppercase text-slate-400 font-black">Cancelar</button>
                 <button onClick={handleRenameExercise} className="flex-1 bg-black text-primary py-3 rounded-xl font-black uppercase italic shadow-lg">Guardar</button>
               </div>
            </div>
          </div>
        )}
        {pendingDeleteExercise && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[260] animate-in zoom-in">
            <div className="bg-white w-full max-w-md rounded-[3rem] p-10 space-y-6">
              <h3 className="text-2xl font-black uppercase italic tracking-tighter">Confirmar Borrado</h3>
              <p className="text-slate-600 font-bold text-sm">¿Quitar la misión <span className="font-black">{pendingDeleteExercise.exercise}</span> de <span className="font-black">{pendingDeleteExercise.category.replace('RUTINA DE ','')}</span>?</p>
                <div className="flex gap-4">
                <button onClick={() => setPendingDeleteExercise(null)} className="flex-1 py-3 uppercase text-slate-400 font-black">Cancelar</button>
                <button onClick={confirmDeleteExercise} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black uppercase">Borrar</button>
              </div>
            </div>
          </div>
        )}
        {editingCat && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[250] animate-in zoom-in">
            <div className="bg-white w-full max-w-md rounded-[3rem] p-10 space-y-6">
               <h3 className="text-2xl font-black uppercase italic tracking-tighter">Ajustar Músculo</h3>
               <input type="text" className="w-full bg-slate-50 p-4 rounded-xl font-black uppercase italic border-2 border-primary outline-none" value={editingCat.new} onChange={e => setEditingCat({...editingCat, new: e.target.value})} autoFocus />
               <div className="flex gap-4">
                 <button onClick={() => setEditingCat(null)} className="flex-1 py-3 uppercase text-slate-400 font-black">Cancelar</button>
                 <button onClick={handleRenameCategory} className="flex-1 bg-black text-primary py-3 rounded-xl font-black uppercase italic shadow-lg">Guardar</button>
               </div>
            </div>
          </div>
        )}
        {previewUrl && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[250] animate-in zoom-in">
            <div className="bg-white w-full max-w-lg rounded-[4rem] p-12 space-y-6 relative border">
              <button onClick={() => setPreviewUrl(null)} className="absolute top-8 right-8 w-10 h-10 bg-slate-100 hover:bg-red-500 hover:text-white rounded-2xl font-black transition-all flex items-center justify-center text-lg shadow-lg">✕</button>
              <h3 className="text-3xl font-black uppercase italic">Vista Táctica</h3>
              <div className="aspect-video bg-black rounded-[2.5rem] overflow-hidden shadow-2xl"><img src={previewUrl} className="w-full h-full object-cover" alt="Preview" /></div>
            </div>
          </div>
        )}
        {pendingDeleteCategory && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[260] animate-in zoom-in">
            <div className="bg-white w-full max-w-md rounded-[3rem] p-10 space-y-6">
              <h3 className="text-2xl font-black uppercase italic tracking-tighter">Confirmar Borrado</h3>
              <p className="text-slate-600 font-bold text-sm">¿Borrar la categoría <span className="font-black">{pendingDeleteCategory.replace("RUTINA DE ", "")}</span> y todo su arsenal?</p>
                <div className="flex gap-4">
                <button onClick={() => setPendingDeleteCategory(null)} className="flex-1 py-3 uppercase text-slate-400 font-black">Cancelar</button>
                <button onClick={confirmDeleteCategory} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black uppercase">Borrar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'audit') {
    return (
      <div className="space-y-8 animate-in fade-in">
        <h2 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Bitácora del <span className="text-primary">Olimpo</span></h2>
        <div className="flex gap-3 items-center">
          <input placeholder="Buscar bitácora..." className="flex-1 bg-slate-50 p-3 rounded-xl border-2 outline-none" value={auditSearch} onChange={e => setAuditSearch(e.target.value)} />
          <select className="bg-slate-50 p-3 rounded-xl border-2" value={auditFilter} onChange={e => setAuditFilter(e.target.value)}>
            <option value="">Todos</option>
            {[...new Set(auditLogs.map(l => l.action))].map(act => (<option key={act} value={act}>{act}</option>))}
          </select>
        </div>
        <div className="bg-white rounded-[3rem] border shadow-sm overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left table-fixed">
              <colgroup>
                <col style={{ width: '200px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '150px' }} />
                <col />
              </colgroup>
            <thead className="bg-slate-900 text-white text-[10px] uppercase">
              <tr><th className="p-8">Instante</th><th className="p-8">Autor</th><th className="p-8">Acción</th><th className="p-8">Detalles</th></tr>
            </thead>
            <tbody className="divide-y">
              {(() => {
                const filtered = auditLogs.filter(log => {
                  if (auditFilter && log.action !== auditFilter) return false;
                  if (!auditSearch) return true;
                  const s = auditSearch.toLowerCase();
                  return log.action.toLowerCase().includes(s) || (log.details || '').toLowerCase().includes(s) || (users.find(u => u.id === log.userId)?.name || 'sistema').toLowerCase().includes(s);
                });

                // Sort by timestamp desc (most recent first)
                const sorted = [...filtered].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                const total = sorted.length;
                const totalPages = Math.max(1, Math.ceil(total / auditPageSize));
                const pageItems = sorted.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize);

                return (
                  <>
                    {pageItems.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 md:p-8 font-mono text-[11px] text-slate-400 align-top">{new Date(log.timestamp).toLocaleString()}</td>
                        <td className="p-4 md:p-8 font-black uppercase italic text-xs align-top">{users.find(u => u.id === log.userId)?.name || 'SISTEMA'}</td>
                        <td className="p-4 md:p-8 align-top"><span className="text-[9px] font-black uppercase px-2 py-1 bg-slate-100 rounded text-slate-600 border">{log.action}</span></td>
                        <td className="p-4 md:p-8 font-bold text-xs text-slate-600 break-words whitespace-normal align-top">{log.details}</td>
                      </tr>
                    ))}

                    {totalPages > 1 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-3 bg-gray-50">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="text-sm text-slate-600">Mostrando {Math.min((auditPage - 1) * auditPageSize + 1, total)} - {Math.min(auditPage * auditPageSize, total)} de {total} registros</div>
                            <div className="flex items-center space-x-2">
                              <button onClick={() => setAuditPage(p => Math.max(1, p - 1))} disabled={auditPage === 1} aria-label="Anterior" className="px-3 py-1 bg-white border rounded disabled:opacity-50">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 18l-6-6 6-6v12z"/></svg>
                              </button>

                              <div className="flex items-center space-x-1">
                                <span className="px-3 py-1 rounded bg-slate-900 text-white font-bold">{auditPage}/{totalPages}</span>
                              </div>

                              <button onClick={() => setAuditPage(p => Math.min(totalPages, p + 1))} disabled={auditPage === totalPages} aria-label="Siguiente" className="px-3 py-1 bg-white border rounded disabled:opacity-50">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 6l6 6-6 6V6z"/></svg>
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })()}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
