
import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import { User, UserRole, Exercise } from '../types';
import Popup from '../components/Popup';
import SearchableSelect from '../components/SearchableSelect';

const DAYS_OF_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

interface DashboardCoachProps {
  activeTab: string;
  currentUser: User;
  onSelectUserForRoutine?: (userId: string) => void;
  initialSelectedUser?: string;
  setActiveTab?: (tab: string) => void;
}

export const DashboardCoach: React.FC<DashboardCoachProps> = ({ 
  activeTab, 
  currentUser, 
  onSelectUserForRoutine,
  initialSelectedUser,
  setActiveTab
}) => {
  // Initialize states as empty and load data asynchronously in useEffect
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>(initialSelectedUser || '');
  const [searchUserQuery, setSearchUserQuery] = useState('');
  
  const [exerciseBank, setExerciseBank] = useState<Record<string, string[]>>({});
  const [categories, setCategories] = useState<string[]>([]);
  
  const [weeklySplit, setWeeklySplit] = useState<{ [key: string]: Exercise[] }>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDayForExercise, setActiveDayForExercise] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [modalQuery, setModalQuery] = useState('');
  const [modalPage, setModalPage] = useState(1);
  const modalPageSize = 6;
  const [popupMessage, setPopupMessage] = useState<string>('');
  const [showPopup, setShowPopup] = useState<boolean>(false);
  const [popupType, setPopupType] = useState<'success' | 'warning'>('success');

  useEffect(() => {
    if (!showPopup) return;
    const t = setTimeout(() => setShowPopup(false), 5000);
    return () => clearTimeout(t);
  }, [showPopup]);

  // Correctly fetch exercise categories and bank asynchronously
  useEffect(() => {
    const loadInitialData = async () => {
      const [cats, bank, allUsers] = await Promise.all([
        apiService.getExerciseCategories(),
        apiService.getExerciseBank(),
        apiService.getUsers()
      ]);
      setCategories(cats);
      setExerciseBank(bank);
      setUsers(allUsers.filter(u => u.role === UserRole.USER));
      if (cats.length > 0 && !selectedCategory) setSelectedCategory(cats[0]);
    };
    loadInitialData();
  }, [selectedCategory]);

  useEffect(() => {
    setModalPage(1);
  }, [selectedCategory, modalQuery, exerciseBank]);

  // Correctly fetch routines asynchronously when selectedUser or activeTab changes
  useEffect(() => {
    const loadRoutine = async () => {
      if (activeTab === 'routines' && selectedUser) {
        const currentRoutines = await apiService.getRoutines(UserRole.USER, selectedUser);
        if (currentRoutines.length > 0) {
          const latest = currentRoutines[0];
          const newSplit: { [key: string]: Exercise[] } = {};
          latest.weeks[0].days.forEach(day => {
            newSplit[day.dayName] = day.exercises;
          });
          setWeeklySplit(newSplit);
        } else {
          setWeeklySplit(DAYS_OF_WEEK.reduce((acc, d) => ({ ...acc, [d]: [] }), {}));
        }
      }
    };
    loadRoutine();
  }, [selectedUser, activeTab]);

  const handleCreateRoutine = () => {
    if (!selectedUser) {
      setPopupType('warning');
      setPopupMessage('Selecciona un Guerrero');
      setShowPopup(true);
      return;
    }
    const daysData = DAYS_OF_WEEK.map(d => ({ dayName: d, exercises: weeklySplit[d] || [] }));
    const weeks = [1].map(num => ({ weekNumber: num, days: JSON.parse(JSON.stringify(daysData)) }));
    apiService.createRoutine(currentUser.id, { month: new Date().getMonth() + 1, year: new Date().getFullYear(), userId: selectedUser, weeks });
    setPopupType('success');
    setPopupMessage('Plan táctico publicado para el guerrero.');
    setShowPopup(true);
    // keep popup visible even if we switch tabs — delay switching to allow users see it
    setTimeout(() => {
      setSelectedUser('');
      setWeeklySplit({});
      if (setActiveTab) setActiveTab('users');
    }, 2000);
  };

  // addExercise must be async to wait for getExerciseMedia
  const addExercise = async (name: string) => {
    if (!activeDayForExercise) return;
    const autoMediaUrl = await apiService.getExerciseMedia(name);
    const ex: Exercise = {
      id: Math.random().toString(36).substr(2, 9),
      name, series: 4, reps: '12-15', targetWeight: 0, rpe: 8, rest: '60-90s', notes: '',
      mediaUrl: autoMediaUrl || 'https://media.giphy.com/media/l0HlS9j1R2z8G3H5e/giphy.gif' 
    };
    setWeeklySplit(prev => ({ ...prev, [activeDayForExercise]: [...(prev[activeDayForExercise] || []), ex] }));
    setIsModalOpen(false);
  };

  const updateExerciseNote = (day: string, id: string, note: string) => {
    setWeeklySplit(prev => ({
      ...prev,
      [day]: (prev[day] || []).map(ex => ex.id === id ? { ...ex, notes: note } : ex)
    }));
  };

  if (activeTab === 'users') {
    return (
      <div className="space-y-8 animate-in fade-in">
        <header className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-4xl font-black uppercase italic tracking-tighter text-slate-900">Tropas en <span className="text-primary">Combate</span></h2>
          <input type="text" placeholder="Buscar a un guerrero..." className="w-full md:w-80 bg-white border-2 p-3 rounded-2xl outline-none focus:border-primary font-bold text-xs uppercase placeholder-slate-400 placeholder:italic" value={searchUserQuery} onChange={e => setSearchUserQuery(e.target.value)} />
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {users.filter(u => u.name.toLowerCase().includes(searchUserQuery.toLowerCase())).map(u => (
            <div key={u.id} className="bg-white p-10 rounded-[2.5rem] shadow-sm border hover:border-primary transition-all group overflow-hidden">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-slate-100 border-2 border-primary overflow-hidden flex items-center justify-center font-black text-slate-400">
                  {u.profilePicture ? <img src={u.profilePicture} className="w-full h-full object-cover" /> : u.name.charAt(0)}
                </div>
                <div>
                   <p className="font-black text-2xl uppercase italic text-slate-900 leading-none">{u.name}</p>
                   <p className={`text-[9px] font-black uppercase mt-1 ${u.status === 'ACTIVE' ? 'text-green-500' : 'text-red-500'}`}>{u.status}</p>
                </div>
              </div>
              <button onClick={() => onSelectUserForRoutine?.(u.id)} className="w-full bg-black text-primary py-3 rounded-xl text-[10px] font-black uppercase italic hover:bg-primary hover:text-black shadow-lg">Forjar Arsenal</button>
            </div>
          ))}
          {users.length === 0 && <div className="col-span-full py-20 text-center opacity-40 font-black uppercase tracking-widest italic">No hay guerreros reclutados.</div>}
        </div>
      </div>
    );
  }

  if (activeTab === 'routines') {
    return (
      <div className="space-y-8 animate-in fade-in">
        <header className="flex flex-col md:flex-row justify-between items-center gap-6">
          <h2 className="text-4xl font-black uppercase italic tracking-tighter text-slate-900">Forjar <span className="text-primary">Arsenal</span></h2>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
            <div className="w-full md:w-auto">
              <SearchableSelect
                options={users.map(u => ({ value: u.id, label: u.name }))}
                value={selectedUser || null}
                onChange={(v) => setSelectedUser(v || '')}
                placeholder="Busca a un Guerrero"
                className="w-full md:w-80"
              />
            </div>
            <button onClick={handleCreateRoutine} disabled={!selectedUser} className="bg-black text-primary px-6 py-3 rounded-2xl font-black uppercase italic text-sm hover:scale-105 transition-all shadow-xl active:scale-95 disabled:opacity-30">Publicar</button>
          </div>
        </header>
        {selectedUser && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {DAYS_OF_WEEK.map(day => (
              <div key={day} className="bg-white rounded-[3rem] shadow-sm border flex flex-col overflow-hidden">
                <div className="p-5 bg-slate-900 flex justify-between items-center">
                  <h3 className="font-black uppercase italic text-primary text-sm tracking-widest">{day}</h3>
                  <button onClick={() => { setActiveDayForExercise(day); setIsModalOpen(true); }} className="text-[9px] bg-white/10 text-white px-4 py-2 rounded-xl font-black uppercase hover:bg-primary hover:text-black transition-colors">Añadir</button>
                </div>
                <div className="p-6 space-y-4 min-h-[150px] max-h-[500px] overflow-y-auto bg-slate-50/20">
                  {(weeklySplit[day] || []).map(ex => (
                    <div key={ex.id} className="bg-white p-5 rounded-2xl border-2 group shadow-sm hover:border-primary transition-all relative">
                      <div className="flex justify-between mb-4">
                        <p className="font-black text-xs uppercase italic text-slate-800 leading-tight pr-8">{ex.name}</p>
                        <button onClick={() => { const up = (weeklySplit[day] || []).filter(x => x.id !== ex.id); setWeeklySplit({...weeklySplit, [day]: up}); }} className="text-red-500 hover:scale-125 transition-transform font-bold">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                         <div className="space-y-1">
                           <label className="text-[9px] font-black uppercase text-slate-400">Series</label>
                           <input type="number" className="w-full bg-slate-50 p-2 rounded-lg text-[10px] font-black border focus:border-primary outline-none" value={ex.series} onChange={e => { const v = parseInt(e.target.value); setWeeklySplit(p => ({...p, [day]: (p[day] || []).map(x => x.id === ex.id ? {...x, series: v} : x)})); }} />
                         </div>
                         <div className="space-y-1">
                           <label className="text-[9px] font-black uppercase text-slate-400">Reps</label>
                           <input type="text" className="w-full bg-slate-50 p-2 rounded-lg text-[10px] font-black border focus:border-primary outline-none" value={ex.reps} onChange={e => { setWeeklySplit(p => ({...p, [day]: (p[day] || []).map(x => x.id === ex.id ? {...x, reps: e.target.value} : x)})); }} />
                         </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 italic">Órdenes Tácticas / Comentarios</label>
                        <textarea 
                          placeholder="Nota especial para el guerrero (ej: controlar el descenso)..." 
                          className="w-full bg-slate-50 p-3 rounded-xl text-[10px] font-bold uppercase italic outline-none focus:bg-white focus:border-primary border-2 border-transparent transition-all"
                          rows={2}
                          value={ex.notes}
                          onChange={e => updateExerciseNote(day, ex.id, e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                  {(weeklySplit[day] || []).length === 0 && <div className="text-center py-10 opacity-30 font-black uppercase text-[10px] italic">Descanso de Batalla</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[250] animate-in fade-in">
            <div className="bg-white w-full max-w-4xl h-[85vh] rounded-[3.5rem] overflow-hidden flex flex-col shadow-2xl">
              <div className="bg-slate-900 p-8 flex justify-between items-center">
                <h3 className="text-2xl font-black text-primary uppercase italic tracking-tighter">Seleccionar Arsenal</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-white text-xl font-black hover:text-red-500 transition-colors">✕</button>
              </div>
              <div className="flex-1 flex overflow-hidden">
                <div className="w-1/3 bg-slate-50 p-6 overflow-y-auto border-r space-y-2 no-scrollbar">
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setSelectedCategory(cat)} className={`w-full text-left p-4 rounded-2xl text-[10px] font-black uppercase italic transition-all ${selectedCategory === cat ? 'bg-primary text-black shadow-lg scale-105' : 'bg-white text-slate-400 border'}`}>
                      {cat.replace("RUTINA DE ", "")}
                    </button>
                  ))}
                </div>
                <div className="flex-1 p-8 overflow-y-auto content-start no-scrollbar bg-slate-50/10">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <input placeholder="Buscar ejercicio..." value={modalQuery} onChange={e => setModalQuery(e.target.value)} className="flex-1 bg-white p-3 rounded-2xl border-2 outline-none focus:border-primary text-xs font-black uppercase placeholder-slate-400 placeholder:italic" />
                    <div className="text-sm text-slate-600">{modalPageSize} por página</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {(() => {
                      const all = exerciseBank[selectedCategory] || [];
                      const filtered = all.filter(x => x.toLowerCase().includes(modalQuery.toLowerCase()));
                      const total = filtered.length;
                      const totalPages = Math.max(1, Math.ceil(total / modalPageSize));
                      const items = filtered.slice((modalPage - 1) * modalPageSize, modalPage * modalPageSize);

                      return (
                        <>
                          {items.map(ex => (
                            <button key={ex} onClick={() => addExercise(ex)} className="p-3 bg-white border-2 rounded-2xl text-left hover:border-primary font-black text-[10px] uppercase italic transition-all shadow-sm active:scale-95 group">
                              <span className="group-hover:text-primary">{ex}</span>
                            </button>
                          ))}

                          {totalPages > 1 && (
                            <div className="col-span-2 flex items-center justify-between px-4 py-3 bg-gray-50 mt-4">
                              <div className="text-sm text-slate-600">Mostrando {((modalPage - 1) * modalPageSize) + 1} - {Math.min(modalPage * modalPageSize, total)} de {total} ejercicios</div>
                              <div className="flex items-center space-x-2">
                                <button onClick={() => setModalPage(p => Math.max(1, p - 1))} disabled={modalPage === 1} aria-label="Anterior" className="px-3 py-1 bg-white border rounded disabled:opacity-50">
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 18l-6-6 6-6v12z"/></svg>
                                </button>
                                <div className="flex items-center space-x-1">
                                  <span className="px-3 py-1 rounded bg-slate-900 text-white font-bold">{modalPage}/{totalPages}</span>
                                </div>
                                <button onClick={() => setModalPage(p => Math.min(totalPages, p + 1))} disabled={modalPage === totalPages} aria-label="Siguiente" className="px-3 py-1 bg-white border rounded disabled:opacity-50">
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 6l6 6-6 6V6z"/></svg>
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <Popup open={showPopup} type={popupType} message={popupMessage} onClose={() => setShowPopup(false)} autoCloseMs={5000} />
      </div>
    );
  }

  return null;
};
