import React from 'react';
import { useSocket } from '../socket/SocketProvider';

export const Toasts: React.FC = () => {
  const { toasts } = useSocket() as any;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      {toasts.slice(-1).map((t: any) => (
        <div key={t.id} className={`px-5 py-3 rounded-2xl border shadow-soft transition-all duration-200 anim-fade-in ${
          t.type === 'error' ? 'bg-red-600/90 border-red-500 text-white' : t.type === 'success' ? 'bg-emerald-600/90 border-emerald-500 text-white' : 'bg-slate-800/90 border-slate-700 text-slate-100'
        }`}>{t.message}</div>
      ))}
    </div>
  );
};


