import React, { useEffect, useState } from 'react';
import { apiService } from '../services/apiService';
import { MonthlyRoutine, User } from '../types';
import { SearchableSelect } from '../components/SearchableSelect';
import LazyImage from '../components/LazyImage';

const DashboardAlone: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [routines, setRoutines] = useState<MonthlyRoutine[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  // menu state

  const load = async () => {
    setLoading(true);
    try {
      const rs = await apiService.getIndependienteRoutines(currentUser.id);
      setRoutines(rs || []);
    } catch (e) {
      console.error('Failed to load routines', e);
      setRoutines([]);
    } finally {
      setLoading(false);
    }
  };

  // load exercise bank for search options (include media and trimmed category)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const bank = await apiService.getExerciseBank();
        const mediaMap = await apiService.getAllExerciseMedia();
        // flatten into options with category and media
        const opts: {value: string; label: string; category?: string; media?: string}[] = [];
        for (const cat of Object.keys(bank || {})) {
          const items = bank[cat] || [];
          const catTrim = String(cat || '').replace(/^RUTINA DE\s+/i, '').trim();
          for (const ex of items) {
            opts.push({ value: ex, label: ex, category: catTrim, media: mediaMap ? (mediaMap[ex] || '') : '' });
          }
        }
        if (mounted) setExerciseOptions(opts as any);
      } catch (e) {
        if (mounted) setExerciseOptions([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => { load(); }, []);

  const handleCreate = async (e?: React.FormEvent) => {
    if (e && typeof (e as any).preventDefault === 'function') (e as any).preventDefault();
    if (!newName.trim()) return;
    const d = new Date();
    const routine: Partial<MonthlyRoutine> = {
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      userId: currentUser.id,
      coachId: currentUser.id,
      weeks: [],
      createdAt: new Date().toISOString(),
      id: undefined as any,
    };
    try {
      await apiService.createIndependienteRoutine(currentUser.id, { ...routine, name: newName.trim() } as any);
      setNewName('');
      await load();
    } catch (err) {
      console.error('createRoutine failed', err);
    }
  };


  const [editingRoutine, setEditingRoutine] = useState<MonthlyRoutine | null>(null);
  const [editingName, setEditingName] = useState('');
  const [exerciseOptions, setExerciseOptions] = useState<{value: string; label: string; category?: string; media?: string}[]>([]);
  const [selectedExerciseValue, setSelectedExerciseValue] = useState<string | null>(null);
  const [pendingDeleteRoutine, setPendingDeleteRoutine] = useState<MonthlyRoutine | null>(null);

  const startEdit = (r: MonthlyRoutine) => {
    // ensure routine has at least one week/day to allow adding exercises
    const safe = JSON.parse(JSON.stringify(r)) as MonthlyRoutine;
    if (!safe.weeks || !Array.isArray(safe.weeks) || safe.weeks.length === 0) {
      safe.weeks = [{ weekNumber: 1, days: [{ dayName: 'Día 1', exercises: [] }] } as any];
    }
    setEditingRoutine(safe);
    setEditingName((safe as any).name || '');
    setSelectedExerciseValue(null);
  };

  const getExerciseCategory = (exerciseName: string) => {
    const opt = exerciseOptions.find(o => o.value === exerciseName || (o.label && o.label === exerciseName));
    if (!opt) return '';
    if (opt.category) return String(opt.category).replace(/^RUTINA DE\s+/i, '').trim();
    const parts = opt.label.split(' · ');
    const raw = parts[parts.length - 1] || '';
    return String(raw).replace(/^RUTINA DE\s+/i, '').trim();
  };

  const getInitials = (label: string) => {
    if (!label) return '';
    const main = String(label).split(' · ')[0];
    const parts = main.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + (parts[1][0] || '')).toUpperCase();
  };

  const confirmEdit = async () => {
    if (!editingRoutine) return;
    try {
      await apiService.updateIndependienteRoutine(editingRoutine.id, { ...(editingRoutine as any), name: editingName });
      setEditingRoutine(null);
      setEditingName('');
      await load();
    } catch (err) {
      console.error('updateRoutine failed', err);
    }
  };

  const requestDelete = (r: MonthlyRoutine) => {
    setPendingDeleteRoutine(r);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteRoutine) return;
    try {
      await apiService.deleteIndependienteRoutine(pendingDeleteRoutine.id);
      setPendingDeleteRoutine(null);
      await load();
    } catch (err) {
      console.error('deleteRoutine failed', err);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase">Panel Independiente</h2>
        <div className="text-sm text-slate-600">Crea y gestiona tus rutinas personales</div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <form onSubmit={handleCreate} className="flex gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre de la rutina" className="flex-1 bg-slate-50 p-3 rounded-xl" />
            <button className="bg-primary text-black px-4 py-2 rounded-xl font-black">Crear</button>
          </form>
        </div>

        {/* generator removed per request */}
      </section>
      {editingRoutine && (
        <div className="fixed inset-0 bg-black/75 flex items-start justify-center p-6 z-50 overflow-auto">
          <div className="bg-white w-full max-w-3xl rounded-2xl p-6 space-y-4 h-full max-h-3xl">
            <h3 className="text-xl font-black uppercase">Editar Rutina</h3>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-xs font-black uppercase">Nombre Rutina</label>
                <input value={editingName} onChange={e => setEditingName(e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl mb-3" />

                <div className="mb-8">
                  <label className="text-xs font-black uppercase">Agregar ejercicio</label>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <SearchableSelect
                        options={exerciseOptions}
                        value={selectedExerciseValue}
                        placeholder="Buscar ejercicio..."
                        onChange={(v) => setSelectedExerciseValue(v)}
                      />
                    </div>
                    <div>
                      <button className="bg-primary text-black px-3 py-2 rounded-xl font-black font-bold" onClick={async () => {
                        if (!selectedExerciseValue) return;
                        const updated = JSON.parse(JSON.stringify(editingRoutine)) as MonthlyRoutine;
                        const exName = selectedExerciseValue;
                        // always add to first week/day
                        if (!updated.weeks || updated.weeks.length === 0) updated.weeks = [{ weekNumber: 1, days: [{ dayName: 'Día 1', exercises: [] }] } as any];
                        if (!updated.weeks[0].days || updated.weeks[0].days.length === 0) updated.weeks[0].days = [{ dayName: 'Día 1', exercises: [] } as any];
                        const day = updated.weeks[0].days[0];
                        if (!day.exercises) day.exercises = [];
                        if (!day.exercises.some((e: any) => String(e.name || e) === String(exName))) {
                          day.exercises.push({ id: exName, name: exName });
                        }
                        setEditingRoutine(updated);
                        try { await apiService.updateIndependienteRoutine(updated.id as any, updated as any); } catch (e) { console.error('failed update', e); }
                        setSelectedExerciseValue(null);
                      }}>Add</button>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-black uppercase text-xs mb-2">Ejercicios en la rutina</h4>
                  <div className="space-y-2 max-h-56 overflow-auto">
                    {/* flatten all exercises across weeks/days into a single list */}
                    {(() => {
                      const list: any[] = [];
                      (editingRoutine.weeks || []).forEach(w => {
                        (w.days || []).forEach(d => {
                          (d.exercises || []).forEach(ex => list.push(ex));
                        });
                      });
                      if (list.length === 0) return <div className="text-xs text-slate-400">(sin ejercicios)</div>;
                      return list.map((ex: any, idx: number) => {
                        const name = ex.name || ex;
                        const category = getExerciseCategory(String(name));
                        const initials = getInitials(String(name));
                        const media = exerciseOptions.find(o => o.value === name)?.media || '';
                        return (
                          <div key={idx} className="bg-slate-50 px-3 py-1 rounded flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              {media ? (
                                <LazyImage src={media} alt={name} className="w-10 h-10" />
                              ) : (
                                <div className="w-10 h-10 flex-shrink-0 rounded bg-slate-100 flex items-center justify-center text-xs font-black uppercase">{initials}</div>
                              )}
                              <div className="text-sm text-left">{name}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-xs text-slate-500 text-right">{category}</div>
                              <button className="text-xs text-red-600 font-black" onClick={async () => {
                                const updated = JSON.parse(JSON.stringify(editingRoutine)) as MonthlyRoutine;
                                // remove from all days
                                updated.weeks.forEach(w => w.days.forEach(d => {
                                  d.exercises = (d.exercises || []).filter((item: any) => String(item.name || item) !== String(name));
                                }));
                                setEditingRoutine(updated);
                                try { await apiService.updateIndependienteRoutine(updated.id as any, updated as any); } catch (e) { console.error('failed update', e); }
                              }}>✕</button>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>

              {/* exercise history removed from edit modal per request */}
            </div>

            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => { setEditingRoutine(null); setEditingName(''); }} className="flex-1 py-3 uppercase text-slate-400 font-black">Cancelar</button>
              <button onClick={confirmEdit} className="flex-1 bg-black text-primary py-3 rounded-xl font-black uppercase">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteRoutine && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 space-y-4">
            <h3 className="text-xl font-black uppercase">Confirmar Borrado</h3>
            <p className="text-slate-600">¿Borrar la rutina <span className="font-black">{(pendingDeleteRoutine as any).name || pendingDeleteRoutine.id}</span>?</p>
            <div className="flex gap-3">
              <button onClick={() => setPendingDeleteRoutine(null)} className="flex-1 py-3 uppercase text-slate-400 font-black">Cancelar</button>
              <button onClick={confirmDelete} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black uppercase">Borrar</button>
            </div>
          </div>
        </div>
      )}

      <section>
        <h3 className="font-black uppercase text-sm mb-3">Tus Rutinas</h3>
        {loading ? (
          <div className="text-slate-500">Cargando...</div>
        ) : (
          <div className="space-y-4">
            {routines.length === 0 && <div className="text-slate-500">No hay rutinas aún.</div>}
            {routines.map(r => (
              <div key={r.id} className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center">
                <div>
                  <div className="font-black uppercase">{(r as any).name || `Rutina ${r.month}/${r.year}`}</div>
                  <div className="text-xs text-slate-500">Creada: {new Date(r.createdAt || '').toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => startEdit(r)} className="text-blue-600 font-black uppercase hover:underline text-sm">Editar</button>
                  <button onClick={() => requestDelete(r)} className="text-red-600 font-black uppercase hover:underline text-sm">Borrar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default DashboardAlone;
