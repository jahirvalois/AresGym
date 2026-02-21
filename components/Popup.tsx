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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-3 z-[9999]">
      <div className={`bg-white rounded-2xl p-4 w-full max-w-md shadow-xl text-center border-2 ${type === 'success' ? 'border-emerald-200' : 'border-amber-200'}`}>
        <div className={`${type === 'success' ? 'text-emerald-700' : 'text-amber-800'} font-black uppercase mb-1 text-sm`}>{title || (type === 'success' ? 'Éxito' : 'Advertencia')}</div>
        <p className="font-black uppercase italic text-slate-900 mb-3 text-sm">{message}</p>
        <div className="flex justify-center">
          <button onClick={onClose} className={`w-full sm:w-auto px-5 py-3 ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-amber-400 text-black'} font-black rounded-xl`}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
