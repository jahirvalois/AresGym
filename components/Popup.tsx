import React, { useEffect } from 'react';

export default function Popup({
  open,
  type = 'success',
  title,
  message,
  autoCloseMs = 5000,
  onClose,
}: {
  open: boolean;
  type?: 'success' | 'warning';
  title?: string;
  message: string;
  autoCloseMs?: number;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onClose(), autoCloseMs);
    return () => clearTimeout(t);
  }, [open, autoCloseMs, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[9999]">
      <div className={`bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl text-center border-2 ${type === 'success' ? 'border-emerald-200' : 'border-amber-200'}`}>
        <div className={`${type === 'success' ? 'text-emerald-700' : 'text-amber-800'} font-black uppercase mb-2`}>{title || (type === 'success' ? 'Éxito' : 'Advertencia')}</div>
        <p className="font-black uppercase italic text-slate-900 mb-4">{message}</p>
        <div className="flex justify-center">
          <button onClick={onClose} className={`px-6 py-2 ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-amber-400 text-black'} font-black rounded-xl`}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
