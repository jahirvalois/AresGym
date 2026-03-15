import React, { useEffect, useState } from 'react';
import { WorkoutLog } from '../types';
import { apiService } from '../services/apiService';

interface Props {
  userId: string;
  exerciseId: string;
}

export const ExerciseHistoryTable: React.FC<Props> = ({ userId, exerciseId }) => {
  const [logs, setLogs] = useState<WorkoutLog[]>([]);

  useEffect(() => {
    let mounted = true;
    apiService.getLogs(userId, { exerciseId }).then((res: any) => {
      const items = Array.isArray(res) ? res : (res.items || []);
      if (mounted) setLogs(items);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [userId, exerciseId]);

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h3 className="font-black uppercase text-sm mb-3">Histórico por ejercicio</h3>
      <div className="overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-slate-500"><th>Fecha</th><th>Peso</th><th>Reps</th><th>RPE</th><th>Notas</th></tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} className="border-t"><td>{new Date(l.date).toLocaleString()}</td><td>{l.weightUsed}</td><td>{l.repsDone}</td><td>{l.rpe}</td><td>{l.notes}</td></tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} className="text-slate-400 py-4">Sin registros</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExerciseHistoryTable;
