
import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/apiService';
import { User, MonthlyRoutine, Exercise, SubscriptionState, UserRole } from '../types';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const DashboardUser: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [routine, setRoutine] = useState<MonthlyRoutine | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null);
  const [exercisePage, setExercisePage] = useState<number>(0);
  const [exercisePageLogs, setExercisePageLogs] = useState<any[]>([]);
  const EXERCISE_PAGE_SIZE = 4;
  const [exerciseTotal, setExerciseTotal] = useState<number>(0);
  const [logReps, setLogReps] = useState<string>('');
  const [logWeight, setLogWeight] = useState<string>('');
  const [logType, setLogType] = useState<'warmup'|'routine'>('routine');
  const [showAddRow, setShowAddRow] = useState<boolean>(false);
  const total = (Number(logReps) || 0) * (Number(logWeight) || 0);
  const [subState, setSubState] = useState<{state: SubscriptionState, message: string | null}>({ state: SubscriptionState.OK, message: null });
  const [isAlertDismissed, setIsAlertDismissed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profilePic, setProfilePic] = useState(currentUser.profilePicture);
  
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState(false);

  const todayIndex = new Date().getDay();
  const adjustedToday = todayIndex === 0 ? 'Domingo' : DAYS[todayIndex - 1];
  const [selectedDay, setSelectedDay] = useState(adjustedToday);

  useEffect(() => {
    const loadUserData = async () => {
      const [myRoutines, userLogs, subscription] = await Promise.all([
        apiService.getRoutines(currentUser.role, currentUser.id),
        apiService.getLogs(currentUser.id),
        apiService.getSubscriptionState(currentUser)
      ]);
      setRoutine(myRoutines[0] || null);
      setLogs(userLogs);
      setSubState(subscription);
      setLoading(false);
    };
    loadUserData();
  }, [currentUser.id, currentUser.role]);

  useEffect(() => {
    if (activeExercise) {
      setMediaLoading(true);
      setMediaError(false);
      // reset log inputs when opening an exercise
      setLogReps('');
      setLogWeight('');
      setLogType('routine');
      setShowAddRow(false);
    }
  }, [activeExercise]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setProfilePic(base64);
        apiService.updateUser(currentUser, currentUser.id, { profilePicture: base64 });
      };
      reader.readAsDataURL(file);
    }
  };

  const isExerciseCompletedThisWeek = (exerciseId: string) => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);

    // Consider an exercise "conquered" only when the user explicitly
    // confirmed the conquest. That is represented by a log with type 'conquest'.
    return logs.some(log => {
      const logDate = new Date(log.date);
      return log.exerciseId === exerciseId && logDate >= startOfWeek && log.type === 'conquest';
    });
  };

  const handleLogWorkout = async () => {
    if (!activeExercise) return;
    // only allow logging if exercise is part of assigned routine
    const assigned = !!currentDayRoutine && (currentDayRoutine.exercises || []).some((ex: any) => String(ex.id || ex) === String(activeExercise.id) || (ex.name && ex.name === activeExercise.name));
    if (!assigned) {
      alert('No puedes registrar este ejercicio: no está asignado en tu rutina.');
      return;
    }

    await apiService.addLog({
      userId: currentUser.id,
      exerciseId: activeExercise.id,
      routineId: routine?.id || 'none',
      weightUsed: Number(logWeight) || 0,
      weightUnit: 'lb',
      total: total,
      repsDone: Number(logReps) || 0,
      rpe: 8,
      notes: 'Registro desde UI',
      type: logType
    });
    const updatedLogs = await apiService.getLogs(currentUser.id);
    setLogs(updatedLogs);
    // refresh current exercise page
    await fetchExercisePage(exercisePage);
    // keep modal open so user can add multiple records; reset inputs for next entry
    setLogReps('');
    setLogWeight('');
    setLogType('routine');
    setShowAddRow(true);
  };

  const handleConfirmConquest = async () => {
    if (!activeExercise) return;
    // Create a special 'conquest' log so completion is explicit and
    // distinct from regular workout logs.
    try {
      await apiService.addLog({
        userId: currentUser.id,
        exerciseId: activeExercise.id,
        routineId: routine?.id || 'none',
        weightUsed: 0,
        weightUnit: 'lb',
        total: 0,
        repsDone: 0,
        rpe: 0,
        notes: 'Conquista confirmada',
        type: 'conquest'
      });
      const updatedLogs = await apiService.getLogs(currentUser.id);
      setLogs(updatedLogs);
      await fetchExercisePage(exercisePage);
    } catch (e) {
      // ignore errors but keep UX consistent
    }
    setActiveExercise(null);
  };

  // Open exercise and always refresh media URL from server
  const openExercise = async (ex: Exercise) => {
    try {
      setMediaLoading(true);
      setMediaError(false);
      const mediaUrl = await apiService.getExerciseMedia(ex.name);
      setActiveExercise({ ...ex, mediaUrl: mediaUrl || ex.mediaUrl });
      // reset paging and load first page for this exercise
      setExercisePage(0);
      fetchExercisePage(0, ex.id).catch(() => {});
    } catch (e) {
      // fallback to existing media on error
      setActiveExercise(ex);
      setExercisePage(0);
      fetchExercisePage(0, ex.id).catch(() => {});
    }
  };

  const fetchExercisePage = async (page: number, exerciseId?: string) => {
    if (!activeExercise && !exerciseId) return;
    const exId = exerciseId || activeExercise!.id;
    const skip = page * EXERCISE_PAGE_SIZE;
    try {
      const res: any = await apiService.getLogs(currentUser.id, { exerciseId: exId, limit: EXERCISE_PAGE_SIZE, skip, includeTotal: true });
      if (res && Array.isArray(res.items)) {
        setExercisePageLogs(res.items || []);
        setExerciseTotal(res.total || 0);
      } else {
        setExercisePageLogs(res || []);
        setExerciseTotal((res && res.length) ? res.length : 0);
      }
      setExercisePage(page);
    } catch (e) {
      setExercisePageLogs([]);
    }
  };

  if (loading) return <div className="p-20 text-center font-black animate-pulse text-slate-400 uppercase tracking-widest italic text-lg">Invocando el Arsenal...</div>;

  const currentDayRoutine = routine?.weeks[0].days.find(d => d.dayName === selectedDay);
  
  const sortedExercises = currentDayRoutine ? [...currentDayRoutine.exercises].sort((a, b) => {
    const compA = isExerciseCompletedThisWeek(a.id);
    const compB = isExerciseCompletedThisWeek(b.id);
    if (compA && !compB) return 1;
    if (!compA && compB) return -1;
    return 0;
  }) : [];

  const exerciseLogs = activeExercise ? exercisePageLogs : [];
  const totalPages = Math.max(1, Math.ceil((exerciseTotal || 0) / EXERCISE_PAGE_SIZE));

  const getExerciseName = (exerciseId: string) => {
    // Try to resolve name from current routine
    try {
      if (routine && routine.weeks) {
        for (const w of routine.weeks) {
          const days = w.days || [];
          for (const d of days) {
            const exercises = d.exercises || [];
            for (const ex of exercises) {
              const id = (ex && (ex.id || ex._id || ex.name)) ? (ex.id || ex._id || ex.name) : ex;
              const name = (ex && (ex.name || ex.title)) ? (ex.name || ex.title) : null;
              if (!id) continue;
              if (String(id) === String(exerciseId)) return name || String(exerciseId);
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
    // fallback to id
    return String(exerciseId);
  };

  // helper to render media for active exercise (image, gif or video)
  const renderActiveMedia = () => {
    const mediaUrl = activeExercise?.mediaUrl || 'https://media.giphy.com/media/l0HlS9j1R2z8G3H5e/giphy.gif';
    const isVideo = /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(mediaUrl) || /video\//i.test(mediaUrl);
    const isUser = currentUser.role === UserRole.USER;

    if (isVideo) {
      return (
        <video
          src={mediaUrl}
          className="w-full h-full object-contain bg-black"
          autoPlay
          muted
          loop
          controls
          playsInline
          draggable={false}
          onContextMenu={e => { if (isUser) e.preventDefault(); }}
          onDragStart={e => { if (isUser) e.preventDefault(); }}
          controlsList={isUser ? 'nodownload nofullscreen noremoteplayback' : undefined}
          onLoadedData={() => setMediaLoading(false)}
          onError={() => {
            setMediaLoading(false);
            setMediaError(true);
          }}
        />
      );
    }

    return (
      <>
        <img
          src={mediaUrl}
          className={`w-full h-full object-contain transition-opacity duration-500 ${mediaLoading ? 'opacity-0' : 'opacity-80 group-hover:opacity-100'}`}
          alt="Guía Visual"
          onLoad={() => setMediaLoading(false)}
          onError={() => {
            setMediaLoading(false);
            setMediaError(true);
          }}
          draggable={false}
          style={{ userSelect: isUser ? 'none' : undefined }}
        />
        {isUser && (
          <div
            className="absolute inset-0"
            onContextMenu={e => e.preventDefault()}
            onMouseDown={e => e.preventDefault()}
            onDragStart={e => e.preventDefault()}
            onCopy={e => e.preventDefault()}
          />
        )}
      </>
    );
  };

  return (
    <div className="space-y-8 pb-20">
      {subState.state === SubscriptionState.WARNING && !isAlertDismissed && (
        <div className="bg-amber-400 border-4 border-black p-6 rounded-[1rem] shadow-xl flex items-center animate-bounce z-50 group/alert">
           <div className="bg-black rounded-full p-3 mr-5 shadow-lg">
              <svg className="w-8 h-8 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
           </div>
           <div className="flex-1">
             <p className="font-black text-[11px] uppercase tracking-[0.3em] text-black/60 leading-none mb-1">AVISO TÁCTICO</p>
             <p className="font-black text-2xl uppercase italic text-black leading-none tracking-tighter">{subState.message}</p>
           </div>
           <button onClick={() => setIsAlertDismissed(true)} className="ml-4 p-2 hover:bg-black/10 rounded-full transition-colors self-start sm:self-center">
             <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
        </div>
      )}

      <header className="space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="flex items-center gap-6">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full bg-slate-200 border-4 border-primary shadow-xl overflow-hidden flex items-center justify-center">
                 {profilePic ? (
                   <img src={profilePic} alt="Perfil" className="w-full h-full object-cover" />
                 ) : (
                   <span className="text-4xl font-black text-slate-400">{currentUser.name.charAt(0)}</span>
                 )}
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-0 right-0 bg-black text-primary p-2 rounded-full shadow-lg border-2 border-white hover:scale-110 transition-transform">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
            </div>
            <div>
              <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">Mi <span className="text-primary">Legión</span></h2>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] mt-4 italic">Bienvenido de nuevo, {currentUser.name}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 bg-white px-6 py-4 rounded-3xl shadow-sm border border-slate-100">
             <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-green-500/50 shadow-md"></div>
             <span className="text-[10px] font-black uppercase italic tracking-tighter">Estado: Guerrero Activo</span>
          </div>
        </div>
        
        <div className="flex overflow-x-auto pb-4 gap-3 no-scrollbar scroll-smooth">
          {DAYS.map(day => (
            <button 
              key={day} 
              onClick={() => setSelectedDay(day)} 
              className={`flex-shrink-0 px-8 py-4 rounded-[1rem] font-black uppercase italic text-[11px] tracking-widest transition-all shadow-sm ${selectedDay === day ? 'bg-black text-primary scale-110 shadow-2xl' : 'bg-white text-slate-400 hover:bg-slate-50 border'}`}
            >
              {day}
            </button>
          ))}
        </div>
      </header>

      {!routine ? (
        <div className="bg-white p-24 rounded-[1rem] text-center border-4 border-dashed border-slate-100 opacity-50 space-y-6">
          <img src="https://game-icons.net/icons/000000/ffffff/1x1/delapouite/spartan-helmet.png" className="w-20 h-20 mx-auto invert opacity-10" />
          <p className="font-black uppercase italic tracking-[0.2em] text-slate-400 text-lg">Arsenal no forjado aún. Contacta a tu Mentor.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
             <h5 className="font-black text-2xl uppercase italic text-slate-900 tracking-tighter">Misión: {selectedDay}</h5>
             <span className="bg-primary/10 text-primary px-5 py-2 rounded-full text-[10px] font-black uppercase italic tracking-widest shadow-sm">Ares Elite</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {sortedExercises.map(ex => {
              const completed = isExerciseCompletedThisWeek(ex.id);
              return (
                <div 
                  key={ex.id} 
                  onClick={() => openExercise(ex)} 
                  className={`p-6 rounded-[1rem] border-2 transition-all cursor-pointer relative overflow-hidden group shadow-md ${completed ? 'bg-green-500/10 border-green-500/20 opacity-60 grayscale-[0.5]' : 'bg-white border-slate-50 hover:border-primary hover:translate-y-[-6px] hover:shadow-2xl'}`}
                >
                  <div className="flex justify-between items-center relative z-10">
                    <div className="flex-1 pr-4">
                      <p className={`font-black uppercase italic tracking-tighter text-2xl leading-tight ${completed ? 'text-green-700 line-through' : 'text-slate-900 group-hover:text-primary'}`}>{ex.name}</p>
                      {ex.notes && !completed && (
                        <div className="mt-3 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl inline-block text-[10px] font-black uppercase italic tracking-tighter border border-amber-200/50 shadow-sm">
                           ⚡ {ex.notes}
                        </div>
                      )}
                      <div className="flex space-x-4 mt-4 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">{ex.series} SERIES x {ex.reps}</div>
                    </div>
                    {completed ? (
                       <div className="bg-green-500 text-white p-4 rounded-3xl shadow-xl animate-in zoom-in">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"/></svg>
                       </div>
                    ) : (
                       <div className="bg-slate-50 text-slate-200 p-4 rounded-3xl group-hover:bg-primary group-hover:text-black transition-all">
                          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                       </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

          

          {activeExercise && (
            <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-start sm:items-center justify-center p-4 z-[250] overflow-auto animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-[1rem] p-8 space-y-8 relative shadow-[0_0_100px_rgba(234,179,8,0.2)] border border-white/20 max-h-[90vh] overflow-y-auto">
            <button onClick={() => setActiveExercise(null)} className="absolute top-8 right-8 w-10 h-10 bg-slate-100 hover:bg-red-500 hover:text-white rounded-2xl font-black transition-all flex items-center justify-center text-lg shadow-lg z-50">✕</button>
            
            <div className="space-y-2">
               <p className="text-primary font-black uppercase text-[10px] tracking-[0.4em] italic leading-none">Análisis de Combate</p>
               <h5 className="text-2xl font-black uppercase italic tracking-tighter leading-tight pr-12 text-slate-900">{activeExercise.name}</h5>
            </div>

            <div className="aspect-video bg-black rounded-[1rem] overflow-hidden shadow-2xl relative group flex items-center justify-center">
              {mediaLoading && !mediaError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-slate-900 z-10">
                   <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                   <p className="text-[10px] font-black uppercase text-primary tracking-widest animate-pulse">Sincronizando Arsenal...</p>
                </div>
              )}

              {mediaError ? (
                <div className="flex flex-col items-center justify-center p-10 text-center space-y-4 bg-slate-900 w-full h-full">
                   <img src="https://game-icons.net/icons/000000/ffffff/1x1/delapouite/spartan-helmet.png" className="w-16 h-16 opacity-20 invert" />
                   <p className="text-white font-black uppercase italic text-sm">Visualización táctica en preparación</p>
                   <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest">El mentor está forjando este video</p>
                </div>
              ) : renderActiveMedia()}
              
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
            </div>

            {activeExercise.notes && (
              <div className="bg-primary/10 border-l-8 border-primary p-6 rounded-3xl shadow-sm">
                 <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Órdenes del Mentor</p>
                 <p className="font-black italic uppercase text-slate-800 tracking-tighter text-2xl">"{activeExercise.notes}"</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 place-items-center">
              <div className="bg-slate-50 p-4 rounded-[1rem] w-[150px] text-center border border-slate-100 shadow-inner">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Series</p>
                <p className="text-2xl font-black italic text-slate-900">{activeExercise.series}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-[1rem] w-[150px] text-center border border-slate-100 shadow-inner">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Misión</p>
                <p className="text-2xl font-black italic text-slate-900">{activeExercise.reps}</p>
              </div>
            </div>

            {isExerciseCompletedThisWeek(activeExercise.id) ? (
              <div className="w-full bg-green-500 text-white py-4 rounded-[1rem] font-black uppercase italic text-center text-2xl shadow-xl animate-pulse">OBJETIVO CONQUISTADO</div>
            ) : (
              <button onClick={handleConfirmConquest} className="w-full bg-black text-primary py-4 rounded-[1rem] font-black uppercase italic tracking-tighter text-2xl active:scale-95 transition-all shadow-[0_15px_40px_rgba(0,0,0,0.3)] hover:bg-primary hover:text-black">Confirmar Conquista</button>
            )}

            <div className="mt-4">
              <div className="flex justify-center mb-3">
                    <button onClick={() => { setLogReps(''); setLogWeight(''); setLogType('routine'); setShowAddRow(true); }} className="bg-primary text-white px-6 py-3 rounded-full font-black uppercase tracking-wider hover:opacity-90">Agregar registro</button>
              </div>
              {showAddRow && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-fixed border-collapse">
                    <thead>
                      <tr className="text-left text-[11px] text-slate-500 border-b">
                        {/*<th className="py-2 w-1/4">Tipo</th>*/}
                        <th className="py-2 w-1/4">Peso (lb)</th>
                        <th className="py-2 w-1/4">Reps</th>
                        {/*<th className="py-2 w-1/4">Total</th>*/}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="align-top">
                        {/*<td className="py-2 pr-2">
                          <select value={logType} onChange={e => setLogType(e.target.value as any)} className="w-full p-2 border rounded" aria-label="Tipo de registro">
                            <option value="routine" title="Routine">🏋️</option>
                            <option value="warmup" title="Warmup">🔥</option>
                          </select>
                        </td>
                        */}
                        <td className="py-2 pr-2">
                          <input type="number" value={logWeight} onChange={e => setLogWeight(e.target.value)} placeholder="0" className="w-full p-2 border rounded" />
                        </td>
                        <td className="py-2 pr-2">
                          <input type="number" value={logReps} onChange={e => setLogReps(e.target.value)} placeholder="0" className="w-full p-2 border rounded" />
                        </td>
                        {/*<td className="py-2 pr-2">
                          <input type="text" value={`${logReps} x ${logWeight} lb`} readOnly className="w-full p-2 border rounded bg-slate-50" />
                        </td>*/}
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex justify-end gap-2 mt-3">
                    <button onClick={() => { setLogReps(''); setLogWeight(''); setLogType('routine'); setShowAddRow(false); }} className="px-4 py-2 rounded border">Cancelar</button>
                    <button
                      onClick={handleLogWorkout}
                      disabled={!(logReps > 0 && logWeight > 0)}
                      className={`px-4 py-2 rounded font-black ${logReps > 0 && logWeight > 0 ? 'bg-black text-primary hover:opacity-90' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
                      Guardar
                    </button>
                  </div>
                </div>
              )}
              {/* Historial de Registros (moved inside modal below add fields) */}
              <div className="mt-6 bg-white p-2 rounded-lg shadow-inner border">
                  <div className="flex items-center justify-center mb-2">
                      <h4 className="font-black uppercase text-sm text-slate-600 text-center w-full">Historial de Registros</h4>
                    </div>
                {exerciseLogs.length === 0 ? (
                  <div className="text-[13px] text-slate-400">Aún no hay registros en esta página para este ejercicio.</div>
                ) : (
                  <div className="w-full overflow-y-auto overflow-x-auto max-h-44">
                    <table className="w-full text-sm">
                      <thead className="text-left text-[12px] text-slate-500 border-b sticky top-0 bg-white z-10">
                        <tr>
                          <th className="py-1 text-center">Serie</th>
                          <th className="py-1 text-center">Peso (lb)</th>
                          <th className="py-1 text-center">Reps</th>
                          {/*<th className="py-1 text-center">Total</th>*/}
                        </tr>
                      </thead>
                      <tbody>
                        {exerciseLogs.map((l: any, idx: number) => {
                          const indexInPage = idx;
                          const skip = (exercisePage || 0) * EXERCISE_PAGE_SIZE;
                          const seq = (typeof exerciseTotal === 'number' && exerciseTotal > 0)
                            ? Math.max(1, exerciseTotal - (skip + indexInPage))
                            : (skip + indexInPage + 1);

                          return (
                            <tr key={l.id || l._id || `${l.exerciseId}-${l.date}`} className="border-b last:border-b-0">
                              <td className="py-1 text-center">{seq}</td>
                              <td className="py-1 text-center">{(l.weightUsed || l.weight || 0)} {l.weightUnit || 'lb'}</td>
                              <td className="py-1 text-center">{l.repsDone ?? l.reps ?? '-'}</td>
                              {/*<td className="py-1 text-center">{(l.repsDone != null && l.weightUsed != null) ? `${l.repsDone} x ${l.weightUsed} ${l.weightUnit || 'lb'}` : (l.total !== undefined ? `${l.total} ${l.weightUnit || 'lb'}` : '-')}</td>*/}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {exerciseTotal > EXERCISE_PAGE_SIZE && (
                  <div className="col-span-2 flex items-center justify-between px-4 py-1 bg-gray-50 mt-4">
                    <div className="text-sm text-slate-600">Mostrando {((exercisePage) * EXERCISE_PAGE_SIZE) + 1} - {Math.min((exercisePage + 1) * EXERCISE_PAGE_SIZE, exerciseTotal)} de {exerciseTotal} registros</div>
                    <div className="flex items-center space-x-2">
                      <button onClick={() => fetchExercisePage(Math.max(0, exercisePage - 1))} disabled={exercisePage === 0} aria-label="Anterior" className="px-3 py-1 bg-white border rounded disabled:opacity-50">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 18l-6-6 6-6v12z"/></svg>
                      </button>
                      <div className="flex items-center space-x-1">
                        <span className="px-3 rounded bg-slate-900 text-white font-bold">{exercisePage + 1}/{totalPages}</span>
                      </div>
                      <button onClick={() => fetchExercisePage(Math.min(totalPages - 1, exercisePage + 1))} disabled={exercisePage + 1 >= totalPages} aria-label="Siguiente" className="px-3 py-1 bg-white border rounded disabled:opacity-50">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 6l6 6-6 6V6z"/></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
