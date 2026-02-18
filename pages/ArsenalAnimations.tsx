import React, { useEffect, useState } from 'react';
import { exerciseService } from '../services/exerciseService';

export const ArsenalAnimations: React.FC = () => {
  const [muscle, setMuscle] = useState('pecho');
  const [muscles, setMuscles] = useState<string[]>([]);
  const [exercises, setExercises] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<any>(null);

  useEffect(() => { fetchMuscles(); }, []);

  async function fetchMuscles() {
    try {
      const res = await fetch('/api/cosmos/muscles');
      const data = await res.json();
      const ids = data.map((m:any)=>m.id);
      setMuscles(ids.length?ids:['pecho','pierna','espalda','hombro','biceps','triceps','femorales_y_gluteo']);
      if (ids.length) setMuscle(ids[0]);
    } catch (e) {
      setMuscles(['pecho','pierna','espalda','hombro','biceps','triceps','femorales_y_gluteo']);
    }
  }

  useEffect(()=>{ if (muscle) loadExercises(muscle); }, [muscle]);

  async function loadExercises(m: string) {
    try {
      const res = await fetch(`/api/cosmos/exercises?muscle=${encodeURIComponent(m)}`);
      const data = await res.json();
      setExercises(data);
    } catch (e) {
      setExercises([]);
    }
  }

  async function handleAdd() {
    if (!newName) return alert('Name required');
    await fetch('/api/cosmos/exercises', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: newName, muscle }) });
    setNewName('');
    loadExercises(muscle);
  }

  async function handleDelete(id:string) {
    if (!confirm('Eliminar ejercicio?')) return;
    await fetch(`/api/cosmos/exercises/${encodeURIComponent(id)}`, { method: 'DELETE' });
    loadExercises(muscle);
  }

  async function handleUpload() {
    if (!selectedExercise) return alert('Selecciona un ejercicio');
    if (!file) return alert('Selecciona archivo');
    const blobName = `${selectedExercise.id}-${file.name}`;
    const sas = await exerciseService.requestUploadSas(blobName);
    // upload via PUT to SAS URL
    await fetch(sas.uploadUrl, { method: 'PUT', headers: { 'x-ms-blob-type': 'BlockBlob' }, body: file });
    await exerciseService.registerAnimation(selectedExercise.id, blobName, file.type.startsWith('video') ? 'video' : 'gif');
    alert('Subido y registrado');
    loadExercises(muscle);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Arsenal & Animaciones</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1">
          <label>Músculo</label>
          <select className="w-full p-2 border rounded" value={muscle} onChange={e=>setMuscle(e.target.value)}>
            {muscles.map(m=> <option key={m} value={m}>{m}</option>)}
          </select>

          <div className="mt-4">
            <label className="block mb-1">Añadir ejercicio</label>
            <input value={newName} onChange={e=>setNewName(e.target.value)} className="w-full p-2 border rounded" />
            <button className="mt-2 w-full bg-primary text-white p-2 rounded" onClick={handleAdd}>Agregar</button>
          </div>
        </div>

        <div className="col-span-2">
          <h4 className="font-bold mb-2">Ejercicios</h4>
          <div className="bg-white p-4 rounded shadow max-h-96 overflow-auto">
            {exercises.map(ex=> (
              <div key={ex.id} className="flex items-center justify-between border-b py-2">
                <div>
                  <div className="font-medium">{ex.name}</div>
                  <div className="text-xs text-slate-500">{ex.animation?.storageUrl || ''}</div>
                </div>
                <div className="flex items-center space-x-2">
                  <button className="px-2 py-1 border rounded" onClick={()=>{ setSelectedExercise(ex); }}>Seleccionar</button>
                  <button className="px-2 py-1 border rounded text-red-600" onClick={()=>handleDelete(ex.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 bg-white p-4 rounded">
            <h5 className="font-bold mb-2">Subir animación</h5>
            <div>
              <div className="mb-2">Ejercicio seleccionado: {selectedExercise?.name || 'ninguno'}</div>
              <input type="file" onChange={e=>setFile(e.target.files?.[0]||null)} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="bg-primary text-white p-2 rounded" onClick={handleUpload}>Subir y registrar</button>
                <button className="p-2 border rounded" onClick={()=>{ setFile(null); setSelectedExercise(null); }}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
