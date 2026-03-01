import React, { useEffect, useState } from 'react';
import { apiService } from '../services/apiService';
import { MonthlyRoutine, User } from '../types';

const DashboardAlone: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [routines, setRoutines] = useState<MonthlyRoutine[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  // menu / generator state
  const [template, setTemplate] = useState<'full' | 'upperlower' | 'ppl'>('full');
  const [weeksCount, setWeeksCount] = useState<number>(4);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(3);

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

  const generateRoutine = async (e?: React.FormEvent) => {
    if (e && typeof (e as any).preventDefault === 'function') (e as any).preventDefault();
    setLoading(true);
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const weeks: any[] = [];
      for (let w = 1; w <= weeksCount; w++) {
        const days: any[] = [];
        for (let d = 1; d <= daysPerWeek; d++) {
          days.push({ dayName: `Día ${d}`, exercises: [] });
        }
        weeks.push({ weekNumber: w, days });
      }

      const routine: Partial<MonthlyRoutine> = {
        month,
        year,
        userId: currentUser.id,
        coachId: currentUser.id,
        status: 'ACTIVE' as any,
        weeks,
        createdAt: new Date().toISOString(),
      };

      // Add a lightweight title derived from template
      const title = `${template === 'full' ? 'Full Body' : template === 'upperlower' ? 'Upper/Lower' : 'PPL'} - ${weeksCount}w`;
      await apiService.createIndependienteRoutine(currentUser.id, { ...routine, title } as any);
      await load();
    } catch (err) {
      console.error('generateRoutine failed', err);
    } finally {
      setLoading(false);
    }
  };

  const [editingRoutine, setEditingRoutine] = useState<MonthlyRoutine | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDeleteRoutine, setPendingDeleteRoutine] = useState<MonthlyRoutine | null>(null);

  const startEdit = (r: MonthlyRoutine) => {
    setEditingRoutine(r);
    setEditingName((r as any).name || '');
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

        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <h4 className="font-black uppercase text-sm mb-3">Generador de Rutinas</h4>
          <form onSubmit={generateRoutine} className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-xs w-28">Plantilla</label>
              <select value={template} onChange={e => setTemplate(e.target.value as any)} className="flex-1 bg-slate-50 p-2 rounded">
                <option value="full">Full Body</option>
                <option value="upperlower">Upper / Lower</option>
                <option value="ppl">Push / Pull / Legs</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs w-28">Semanas</label>
              <input type="number" min={1} max={12} value={weeksCount} onChange={e => setWeeksCount(Number(e.target.value))} className="w-24 bg-slate-50 p-2 rounded" />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs w-28">Días / semana</label>
              <input type="number" min={1} max={7} value={daysPerWeek} onChange={e => setDaysPerWeek(Number(e.target.value))} className="w-24 bg-slate-50 p-2 rounded" />
            </div>

            <div className="flex justify-end">
              <button className="bg-primary text-black px-4 py-2 rounded-xl font-black">Generar</button>
            </div>
          </form>
        </div>
      </section>
      {editingRoutine && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 space-y-4">
            <h3 className="text-xl font-black uppercase">Editar Rutina</h3>
            <input value={editingName} onChange={e => setEditingName(e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl" />
            <div className="flex gap-3">
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
