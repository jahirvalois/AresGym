import React, { useEffect, useState } from 'react';
import { MonthlyRoutine, IndependentRoutine, User } from '../types';
import { apiService } from '../services/apiService';

const DoRoutine: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [routines, setRoutines] = useState<Array<MonthlyRoutine | IndependentRoutine>>([]);
  const [selected, setSelected] = useState<MonthlyRoutine | IndependentRoutine | null>(null);
  const [originalExercises, setOriginalExercises] = useState<any[] | null>(null);

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
                      <div className="text-sm text-slate-600">{ex.targetWeight ? `${ex.targetWeight} ${ex.weightUnit || 'lb'}` : ''}</div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoRoutine;
