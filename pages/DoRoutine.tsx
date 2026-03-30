import React, { useEffect, useState } from 'react';
import { MonthlyRoutine, IndependentRoutine, User, WorkoutLog } from '../types';
import { apiService } from '../services/apiService';

const DoRoutine: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [routines, setRoutines] = useState<Array<MonthlyRoutine | IndependentRoutine>>([]);
  const [selected, setSelected] = useState<MonthlyRoutine | IndependentRoutine | null>(null);
  const [originalExercises, setOriginalExercises] = useState<any[] | null>(null);
  const [exerciseModal, setExerciseModal] = useState<{ exercise: any | null; mediaUrl: string | null; history: WorkoutLog[] | null; loading: boolean }>({ exercise: null, mediaUrl: null, history: null, loading: false });
  const [addingRow, setAddingRow] = useState<boolean>(false);
  const [addingReps, setAddingReps] = useState<string>('');
  const [addingWeight, setAddingWeight] = useState<string>('');
  const [addingType, setAddingType] = useState<'warmup'|'routine'|'fail'|'drop-set'|'-'>('routine');
  const [addingTypeOpen, setAddingTypeOpen] = useState<boolean>(false);
  const addingTypeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [addingDropdownStyle, setAddingDropdownStyle] = useState<{top:number,left:number}|null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const HISTORY_PAGE_SIZE = 4;
  const [historyPage, setHistoryPage] = useState<number>(0);
  const [historyTotal, setHistoryTotal] = useState<number>(0);
  const TYPE_LABELS: Record<string, string> = {
    'warmup': 'Warmup',
    'routine': 'Rutina',
    'fail': 'Fallo',
    'drop-set': 'DropSet',
    '-': 'otro'
  };
  const TYPE_LETTERS: Record<string, string> = {
    'warmup': 'W',
    'routine': 'R',
    'fail': 'F',
    'drop-set': 'D',
    '-': '-'
  };

  const load = async () => {
    try {
      const rs = await apiService.getRoutines(currentUser.role, currentUser.id);
      setRoutines(rs as any);
    } catch {
      setRoutines([]);
    }
  };

  useEffect(() => { load(); }, []);

  const openRoutine = (r: MonthlyRoutine | IndependentRoutine) => {
    setSelected(r);
    setOriginalExercises(((r as any).exercises || []).slice());
  };

  const openExerciseModal = async (ex: any) => {
    setExerciseModal({ exercise: ex, mediaUrl: null, history: null, loading: true });
    try {
      const media = await apiService.getExerciseMedia(ex.name || ex.id || '');
      setExerciseModal(prev => ({ ...prev, exercise: ex, mediaUrl: media || null }));
      // fetch first page for this user + exercise
      await fetchHistoryPage(0, ex.id || ex.name);
      setExerciseModal(prev => ({ ...prev, loading: false }));
    } catch (e) {
      setExerciseModal({ exercise: ex, mediaUrl: null, history: [], loading: false });
    }
  };

  const fetchHistoryPage = async (page: number, exerciseId?: string) => {
    if (!exerciseModal.exercise && !exerciseId) return;
    const exId = exerciseId || (exerciseModal.exercise && (exerciseModal.exercise.id || exerciseModal.exercise.name));
    const skip = page * HISTORY_PAGE_SIZE;
    try {
      const res: any = await apiService.getLogs(currentUser.id, { exerciseId: exId, limit: HISTORY_PAGE_SIZE, skip, includeTotal: true });
      if (res && typeof res === 'object' && Array.isArray(res.items)) {
        setExerciseModal(prev => ({ ...prev, history: res.items || [] }));
        setHistoryTotal(res.total || 0);
      } else {
        setExerciseModal(prev => ({ ...prev, history: res || [] }));
        setHistoryTotal((res && res.length) ? res.length : 0);
      }
      setHistoryPage(page);
    } catch (e) {
      setExerciseModal(prev => ({ ...prev, history: [] }));
      setHistoryTotal(0);
    }
  };

  const computeMenuPosition = (btn: HTMLElement | null, approxHeight = 160) => {
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openAbove = spaceBelow < approxHeight;
    const top = openAbove ? Math.max(8, r.top - approxHeight) : Math.min(window.innerHeight - 8, r.bottom + 4);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - 200);
    return { top, left };
  };

  const toggleAddingType = (btn?: HTMLElement | null) => {
    if (!addingTypeButtonRef.current && btn) addingTypeButtonRef.current = btn as HTMLButtonElement;
    const willOpen = !addingTypeOpen;
    if (willOpen) {
      setAddingDropdownStyle(computeMenuPosition(addingTypeButtonRef.current));
    } else {
      setAddingDropdownStyle(null);
    }
    setAddingTypeOpen(willOpen);
  };

  const startAddRow = () => {
    setAddingWeight('');
    setAddingReps('');
    setAddingType('routine');
    setAddingRow(true);
    setEditingLogId('NEW');
  };

  const startEditRow = (log: WorkoutLog) => {
    setAddingWeight(String(log.weightUsed || ''));
    setAddingReps(String(log.repsDone || ''));
    setAddingType((log.type as any) || 'routine');
    setEditingLogId(String((log.id || (log as any)._id) || ''));
    // inline edit — do not open top "add row" form
    setAddingRow(false);
  };

  const cancelAddRow = () => {
    setAddingRow(false);
    setAddingWeight('');
    setAddingReps('');
    if (editingLogId === 'NEW') setEditingLogId(null);
  };

  const saveNewRow = async () => {
    if (!exerciseModal.exercise) return;
    if (!(Number(addingWeight) > 0 || Number(addingReps) > 0)) return;
    try {
      if (editingLogId && editingLogId !== 'NEW') {
        await apiService.updateLog(editingLogId, {
          userId: currentUser.id,
          exerciseId: exerciseModal.exercise.id || exerciseModal.exercise.name,
          routineId: (selected as any)?.id || 'none',
          weightUsed: Number(addingWeight) || 0,
          weightUnit: 'lb',
          total: (Number(addingWeight) || 0) * (Number(addingReps) || 0),
          repsDone: Number(addingReps) || 0,
          rpe: 8,
          notes: 'Registro editado desde UI',
          type: addingType
        });
        await fetchHistoryPage(historyPage);
      } else {
        await apiService.addLog({
          userId: currentUser.id,
          exerciseId: exerciseModal.exercise.id || exerciseModal.exercise.name,
          routineId: (selected as any)?.id || 'none',
          weightUsed: Number(addingWeight) || 0,
          weightUnit: 'lb',
          total: (Number(addingWeight) || 0) * (Number(addingReps) || 0),
          repsDone: Number(addingReps) || 0,
          rpe: 8,
          notes: 'Registro desde UI',
          type: addingType
        });
        // after adding a new row, go to first page so the newest appears
        await fetchHistoryPage(0);
      }
    } finally {
      setAddingRow(false);
      setAddingWeight('');
      setAddingReps('');
      setEditingLogId(null);
    }
  };

  const deleteRow = async (id?: string) => {
    if (!id) return;
    if (!confirm('¿Borrar este registro?')) return;
    try {
      await apiService.deleteLog(id);
      await fetchHistoryPage(historyPage);
    } catch (e) {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="font-black text-2xl">Hacer Rutina</h2>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-4 shadow md:col-span-1">
          <h3 className="font-bold">Mis Rutinas</h3>
          <ul className="mt-3 space-y-2">
            {(!routines || routines.length === 0) && (<li className="text-slate-400">No tienes rutinas creadas.</li>)}
            {(routines || []).map(r => (
              <li key={String((r as any).id || (r as any)._id)} className={`p-3 rounded border cursor-pointer ${selected && String((selected as any).id || (selected as any)._id) === String((r as any).id || (r as any)._id) ? 'bg-primary/10 border-primary' : 'hover:bg-slate-50'}`} onClick={() => openRoutine(r)}>
                <div className="font-bold">{(r as any).name}</div>
                <div className="text-xs text-slate-500 mt-1">{(r as any).muscles?.join?.(', ') || ''}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-xl p-4 shadow md:col-span-2">
          {!selected ? (
            <div className="text-slate-500">Selecciona una rutina para empezar a trabajar. Las rutinas se muestran sin días; elige y realiza los ejercicios en el orden que prefieras.</div>
          ) : (
            <div>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-xl">{(selected as any).name}</h3>
                  <div className="text-xs text-slate-500">{(selected as any).muscles?.join?.(', ') || ''}</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex gap-2 mb-3">
                  <button type="button" className="px-3 py-1 bg-primary text-black rounded font-black" onClick={() => {
                    const ex = (((selected as any).exercises) || []).slice();
                    for (let i = ex.length - 1; i > 0; i--) {
                      const j = Math.floor(Math.random() * (i + 1));
                      [ex[i], ex[j]] = [ex[j], ex[i]];
                    }
                    setSelected({ ...(selected as any), exercises: ex } as any);
                  }}>Mezclar ejercicios</button>
                  {originalExercises && (
                    <button type="button" className="px-3 py-1 border rounded" onClick={() => {
                      setSelected({ ...(selected as any), exercises: originalExercises } as any);
                    }}>Restaurar orden</button>
                  )}
                </div>
                <h4 className="font-bold text-sm mb-2">Ejercicios</h4>
                <ol className="space-y-3">
                  {(((selected as any).exercises) || []).map((ex: any, idx: number) => (
                    <li key={ex.id || ex.name || idx} className="p-3 border rounded flex justify-between items-center">
                      <div>
                        <div className="font-bold">{ex.name}</div>
                        <div className="text-xs text-slate-500">Series: {ex.series} • Reps: {ex.reps}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-slate-600">{ex.targetWeight ? `${ex.targetWeight} ${ex.weightUnit || 'lb'}` : ''}</div>
                        <button onClick={() => openExerciseModal(ex)} className="px-3 py-1 bg-black text-primary rounded font-black text-xs">Ver</button>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
      {exerciseModal.exercise && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[300]">
          <div className="bg-white w-full max-w-3xl rounded-xl p-6 space-y-4 overflow-auto max-h-[90vh]">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-black text-xl">{exerciseModal.exercise.name}</h3>
                <div className="text-sm text-slate-500">{(exerciseModal.exercise.muscles || []).join?.(', ')}</div>
              </div>
              <button onClick={() => setExerciseModal({ exercise: null, mediaUrl: null, history: null, loading: false })} className="text-sm font-black">✕</button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="w-full">
                {exerciseModal.loading ? (
                  <div className="p-6 text-center">Cargando...</div>
                ) : (
                  <div className="aspect-video bg-black rounded overflow-hidden flex items-center justify-center">
                    {exerciseModal.mediaUrl ? (/(mp4|webm|ogg)$/i.test(exerciseModal.mediaUrl) ? (
                      <video src={exerciseModal.mediaUrl} controls className="w-full h-full object-contain" />
                    ) : (
                      <img src={exerciseModal.mediaUrl} alt={exerciseModal.exercise.name} className="w-full h-full object-contain" />
                    )) : (
                      <div className="text-sm text-slate-400">Sin video disponible</div>
                    )}
                  </div>
                )}
              </div>

              

              <div className="w-full my-3 border-t border-slate-400" />

              <div className="w-full">
                <h4 className="font-bold text-center">Historial de progreso</h4>
                <div className="flex justify-center mb-3 mt-2">
                  <button onClick={() => { startAddRow(); }} className="bg-primary text-white px-6 py-2 rounded-full font-black uppercase tracking-wider hover:opacity-90">Agregar registro</button>
                </div>
                {exerciseModal.loading ? (
                  <div className="p-4">Cargando historial...</div>
                ) : (
                  <div className="mt-3 bg-slate-50 rounded p-2">
                    {/* inline add-row removed: when creating a new record we render an inline row inside the table */}
                    <table className="w-full text-center text-sm mx-auto">
                      <thead>
                        <tr className="text-xs text-slate-500 text-center"><th>#</th><th>Tipo</th><th>Peso (lb)</th><th>Reps</th><th>Acciones</th></tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const list = (exerciseModal.history || []).slice();
                          list.sort((a: WorkoutLog, b: WorkoutLog) => {
                            const da = a?.date ? new Date(a.date).getTime() : 0;
                            const db = b?.date ? new Date(b.date).getTime() : 0;
                            return db - da; // newest first
                          });
                          if ((!list || list.length === 0) && editingLogId !== 'NEW') return (<tr><td className="py-4 text-slate-400" colSpan={9}>No hay registros para este ejercicio.</td></tr>);
                          const rows: any[] = [];
                          // if adding a new inline row, render it at the top of the table
                          if (editingLogId === 'NEW') {
                            const newDisplayIndex = (historyTotal || 0) + 1 - (historyPage * HISTORY_PAGE_SIZE);
                            rows.push(
                              <tr key="NEW" className="border-t bg-white">
                                <td className="py-2 align-top font-mono">{newDisplayIndex}</td>
                                <td className="py-2 align-top">
                                  <select value={addingType} onChange={e => setAddingType(e.target.value as any)} className="px-2 py-1 border rounded text-sm">
                                    {Object.keys(TYPE_LABELS).map(k => (<option key={k} value={k}>{TYPE_LETTERS[k] || '-'} - {TYPE_LABELS[k]}</option>))}
                                  </select>
                                </td>
                                <td className="py-2 align-top">
                                  <input type="number" value={addingWeight} onChange={e => setAddingWeight(e.target.value)} className="w-24 h-8 px-2 border rounded" />
                                </td>
                                <td className="py-2 align-top">
                                  <input type="number" value={addingReps} onChange={e => setAddingReps(e.target.value)} className="w-20 h-8 px-2 border rounded" />
                                </td>
                                <td className="py-2 align-top">
                                  <div className="flex gap-2 items-center justify-center">
                                    <button onClick={saveNewRow} disabled={!(Number(addingWeight) > 0 || Number(addingReps) > 0)} className={`px-3 py-1 text-xs rounded font-black ${Number(addingWeight) > 0 || Number(addingReps) > 0 ? 'bg-black text-primary' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>Guardar</button>
                                    <button onClick={() => { cancelAddRow(); }} className="px-3 py-1 text-xs border rounded">Cancelar</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          // map existing logs
                          if (!list || list.length === 0) return rows.length ? rows : (<tr><td className="py-4 text-slate-400" colSpan={9}>No hay registros para este ejercicio.</td></tr>);
                          list.forEach((h: WorkoutLog, idx: number) => {
                            const rowId = String(h.id || (h as any)._id || idx);
                            const displayIndex = (historyTotal || list.length) - (historyPage * HISTORY_PAGE_SIZE) - idx;
                            if (editingLogId === rowId) {
                              rows.push(
                                <tr key={rowId} className="border-t bg-white">
                                  <td className="py-2 align-top font-mono">{displayIndex}</td>
                                  <td className="py-2 align-top">
                                    <select value={addingType} onChange={e => setAddingType(e.target.value as any)} className="px-2 py-1 border rounded text-sm">
                                      {Object.keys(TYPE_LABELS).map(k => (<option key={k} value={k}>{TYPE_LETTERS[k] || '-'} - {TYPE_LABELS[k]}</option>))}
                                    </select>
                                  </td>
                                  <td className="py-2 align-top">
                                    <input type="number" value={addingWeight} onChange={e => setAddingWeight(e.target.value)} className="w-24 h-8 px-2 border rounded" />
                                  </td>
                                  <td className="py-2 align-top">
                                    <input type="number" value={addingReps} onChange={e => setAddingReps(e.target.value)} className="w-20 h-8 px-2 border rounded" />
                                  </td>
                                  <td className="py-2 align-top">
                                    <div className="flex gap-2">
                                      <button onClick={saveNewRow} disabled={!(Number(addingWeight) > 0 || Number(addingReps) > 0)} className={`px-3 py-1 text-xs rounded font-black ${Number(addingWeight) > 0 || Number(addingReps) > 0 ? 'bg-black text-primary' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>Guardar</button>
                                      <button onClick={() => { setEditingLogId(null); setAddingWeight(''); setAddingReps(''); }} className="px-3 py-1 text-xs border rounded">Cancelar</button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            } else {
                              rows.push(
                                <tr key={rowId} className="border-t">
                                  <td className="py-2 align-top font-mono">{displayIndex}</td>
                                  <td className="py-2 align-top">
                                    {h.type === 'warmup' ? (
                                      <span className="text-xl font-bold text-amber-600">W</span>
                                    ) : h.type === 'routine' ? (
                                      <span className="text-xl font-bold text-blue-600">R</span>
                                    ) : h.type === 'fail' ? (
                                      <span className="text-xl font-bold text-red-600">F</span>
                                    ) : h.type === 'drop-set' ? (
                                      <span className="text-xl font-bold text-green-600">D</span>
                                    ) : (
                                      <span className="text-xl font-bold">-</span>
                                    )}
                                  </td>
                                  <td className="py-2 align-top">{h.weightUsed || '-' } {h.weightUnit || ''}</td>
                                  <td className="py-2 align-top">{h.repsDone || '-'}</td>
                                  <td className="py-2 align-top text-center">
                                    {!addingRow && !editingLogId && (
                                      <div className="inline-flex gap-2 items-center justify-center">
                                        <button onClick={() => startEditRow(h)} className="px-2 py-1 text-xs border rounded">Editar</button>
                                        <button onClick={() => deleteRow(String(h.id || (h as any)._id))} className="px-2 py-1 text-xs bg-red-50 text-red-700 border rounded">Borrar</button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            }
                          });
                          return rows;
                        })()}
                      </tbody>
                    </table>
                    {(() => {
                      const totalPages = Math.max(1, Math.ceil((historyTotal || 0) / HISTORY_PAGE_SIZE));
                      return (historyTotal > HISTORY_PAGE_SIZE) ? (
                        <div className="flex items-center justify-center px-4 py-1 bg-gray-50 mt-4">
                          <div className="flex items-center space-x-2">
                            <button onClick={() => fetchHistoryPage(Math.max(0, historyPage - 1))} disabled={historyPage === 0} aria-label="Anterior" className="px-3 py-1 bg-white border rounded disabled:opacity-50">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 18l-6-6 6-6v12z"/></svg>
                            </button>
                            <div className="flex items-center space-x-1">
                              <span className="px-3 rounded bg-slate-900 text-white font-bold">{historyPage + 1}/{totalPages}</span>
                            </div>
                            <button onClick={() => fetchHistoryPage(Math.min(totalPages - 1, historyPage + 1))} disabled={historyPage + 1 >= totalPages} aria-label="Siguiente" className="px-3 py-1 bg-white border rounded disabled:opacity-50">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 6l6 6-6 6V6z"/></svg>
                            </button>
                          </div>
                        </div>
                      ) : null;
                    })()}
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

export default DoRoutine;
