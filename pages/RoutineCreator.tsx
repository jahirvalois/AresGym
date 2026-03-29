import React, { useEffect, useState } from 'react';
import { IndependentRoutine, User } from '../types';
import { apiService } from '../services/apiService';
import ExerciseHistoryTable from '../components/ExerciseHistoryTable';

export const RoutineCreator: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [routines, setRoutines] = useState<IndependentRoutine[]>([]);
  const [name, setName] = useState('Nueva Rutina');

  const [categories, setCategories] = useState<string[]>([]);
  const [bank, setBank] = useState<Record<string, string[]>>({});

  const [muscleTags, setMuscleTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedExerciseName, setSelectedExerciseName] = useState<string>('');
  const [exerciseTags, setExerciseTags] = useState<Array<any>>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const rs = await apiService.getRoutines(currentUser.role, currentUser.id);
      setRoutines(rs as any);
    } catch {
      // ignore
    }
  };

  useEffect(() => { load(); }, []);

  // reset combobox when changing selected muscle/category
  useEffect(() => {
    setSelectedExerciseName('');
    setExerciseSearch('');
    setShowDropdown(false);
  }, [selectedCategory]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cats = await apiService.getExerciseCategories();
        const b = await apiService.getExerciseBank();
        if (!mounted) return;
        setCategories(cats || []);
        setBank(b || {});
        if (cats && cats.length) setSelectedCategory(cats[0]);
      } catch (e) {}
    })();
    return () => { mounted = false; };
  }, []);

  const addMuscleTag = (muscle: string) => {
    const m = (muscle || selectedCategory || '').toString().trim();
    if (!m) return;
    if (!muscleTags.includes(m)) setMuscleTags([...muscleTags, m]);
  };

  const removeMuscleTag = (m: string) => setMuscleTags(muscleTags.filter(x => x !== m));

  const addExerciseTag = (exerciseName?: string, muscleForExercise?: string) => {
    const nameToAdd = (exerciseName || selectedExerciseName || '').toString().trim();
    if (!nameToAdd) return;
    const muscle = muscleForExercise || selectedCategory || (muscleTags[0] || '');
    // prevent duplicates by name + muscle
    if (exerciseTags.find(e => e.name === nameToAdd && e.muscle === muscle)) return;
    const newEx = { id: Math.random().toString(36).substr(2,9), name: nameToAdd, muscle, series: 3, reps: '8-12', targetWeight: 0, rpe: 0, rest: '60s', notes: '' };
    setExerciseTags([...exerciseTags, newEx]);
    // ensure muscle tag exists
    if (!muscleTags.includes(muscle)) setMuscleTags([...muscleTags, muscle]);
    // clear selection/search so user can add another exercise immediately
    setSelectedExerciseName('');
    setExerciseSearch('');
    setShowDropdown(false);
  };

  const removeExerciseTag = (id: string) => setExerciseTags(exerciseTags.filter(e => String(e.id) !== String(id)));

  const handleCreate = async () => {
    const routine: any = {
      id: Math.random().toString(36).substr(2,9),
      userId: currentUser.id,
      name,
      muscles: muscleTags,
      exercises: exerciseTags,
      createdAt: new Date().toISOString(),
      status: 'ACTIVE'
    };
    try {
      if (editingId) {
        // save edits
        await apiService.updateRoutine(currentUser, editingId, { name: (routine as any).name, muscles: (routine as any).muscles, exercises: (routine as any).exercises } as any);
      } else {
        await apiService.createRoutine(currentUser.id, routine);
      }
    } catch {
      // fallback
    }
    setName('Nueva Rutina');
    setMuscleTags([]);
    setExerciseTags([]);
    setSelectedExerciseName('');
    setEditingId(null);
    load();
  };

  const handleUpdate = async (r: any) => {
    // load routine into form for editing
    setEditingId(String(r.id || r._id));
    setName(r.name || '');
    setMuscleTags((r.muscles && Array.isArray(r.muscles)) ? r.muscles : (r.muscles ? [r.muscles] : []));
    setExerciseTags((r.exercises && Array.isArray(r.exercises)) ? r.exercises : []);
    // reset search/selection
    setSelectedExerciseName('');
    setExerciseSearch('');
    setShowDropdown(false);
  };

  const handleDelete = async (r: any) => {
    await apiService.deleteRoutine(currentUser, String(r.id || r._id));
    load();
  };

  const availableExercisesForSelected = () => {
    const list = bank[selectedCategory] || [];
    if (!exerciseSearch) return list;
    return list.filter(x => x.toLowerCase().includes(exerciseSearch.toLowerCase()));
  };

  return (
    <div className="space-y-6">
      <h2 className="font-black text-2xl">Gestión de Rutinas</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-4 shadow">
          <h3 className="font-bold">Crear / Editar Rutina</h3>
          <label className="block mt-3 text-xs font-black uppercase">Nombre</label>
          <input value={name} onChange={e=>setName(e.target.value)} className="w-full p-3 border rounded mt-1" />

          <div className="mt-4">
            <label className="block text-xs font-black uppercase">Filtrar ejercicios por músculo</label>
            <div className="flex gap-2 mt-2">
              <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="flex-1 p-2 border rounded">
                {categories.map(c => (<option key={c} value={c}>{c.replace('RUTINA DE ', '')}</option>))}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {muscleTags.map(m => (
                <div key={m} className="px-3 py-1 bg-slate-100 rounded-full flex items-center gap-2 text-sm">
                  <span className="font-black">{m.replace('RUTINA DE ', '')}</span>
                  <button onClick={() => removeMuscleTag(m)} className="text-red-500 font-black">✕</button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-xs font-black uppercase">Selecciona ejercicio</label>
            <div className="mt-2 relative">
              <input
                placeholder="Buscar ejercicio..."
                value={exerciseSearch}
                onChange={e => { setExerciseSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                className="w-full p-2 border rounded"
              />

              <div className={`absolute left-0 right-0 z-20 bg-white border rounded mt-1 max-h-44 overflow-auto ${showDropdown ? '' : 'hidden'}`}>
                <ul>
                  {availableExercisesForSelected().map(ex => (
                    <li key={ex} className="px-3 py-2 hover:bg-slate-100 cursor-pointer" onClick={() => { setSelectedExerciseName(ex); setShowDropdown(false); setExerciseSearch(ex); }}>
                      {ex}
                    </li>
                  ))}
                  {availableExercisesForSelected().length === 0 && (
                    <li className="px-3 py-2 text-slate-400">No hay ejercicios</li>
                  )}
                </ul>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 text-sm text-slate-700">{selectedExerciseName || (exerciseSearch ? `Agregar: ${exerciseSearch}` : '')}</div>
                <button type="button" onClick={() => addExerciseTag(selectedExerciseName || exerciseSearch, selectedCategory)} className="bg-primary text-black px-4 py-2 rounded font-black">Agregar ejercicio</button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {exerciseTags.map(ex => (
                <div key={ex.id} className="px-3 py-1 bg-slate-50 rounded-full flex items-center gap-2 border">
                  <div className="text-xs font-black">{ex.name} <span className="text-[10px] text-slate-400">({ex.muscle.replace('RUTINA DE ', '')})</span></div>
                  <button onClick={() => removeExerciseTag(ex.id)} className="text-red-500 font-black">✕</button>
                </div>
              ))}
            </div>
          </div>

                <div className="mt-4 flex gap-2">
            <button onClick={handleCreate} className="bg-primary text-black px-4 py-2 rounded font-black">{editingId ? 'Guardar' : 'Crear'}</button>
            {editingId && (<button type="button" onClick={() => { setEditingId(null); setName('Nueva Rutina'); setMuscleTags([]); setExerciseTags([]); }} className="px-4 py-2 border rounded">Cancelar</button>)}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow">
          <h3 className="font-bold">Mis Rutinas</h3>
          <ul className="mt-3 space-y-2">
            {(() => {
              const visible = (routines || []).filter(r => r && (r.name || (r as any).exercises && (r as any).exercises.length) || (r as any).status === 'ACTIVE');
              if (visible.length === 0) return (<li className="text-slate-400">No tienes rutinas aun.</li>);
              return visible.map(r => (
                <li key={String(r.id || (r as any)._id)} className="border p-3 rounded flex justify-between items-center">
                  <div>
                    <div className="font-bold">{(r as any).name}</div>
                    <div className="text-xs text-slate-500">{(r as any).muscles?.join?.(', ') || ''}</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleUpdate(r)} className="px-3 py-1 bg-amber-400 rounded">Editar</button>
                    <button type="button" onClick={() => handleDelete(r)} className="px-3 py-1 bg-red-500 text-white rounded">Eliminar</button>
                  </div>
                </li>
              ));
            })()}
          </ul>
        </div>
      </div>

      {selectedExercise && (
        <ExerciseHistoryTable userId={currentUser.id} exerciseId={selectedExercise} />
      )}
    </div>
  );
};

export default RoutineCreator;
