import React from 'react';
import { useSocket } from '../socket/SocketProvider';

export const Toasts: React.FC = () => {
  const { toasts } = useSocket() as any;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50">
      {toasts.slice(-4).map((t: any) => (
        <div key={t.id} className={`px-4 py-2 rounded-xl shadow-soft transition-opacity duration-200 ${t.type === 'error' ? 'bg-red-500' : t.type === 'success' ? 'bg-emerald-600' : 'bg-slate-700'}`}>{t.message}</div>
      ))}
    </div>
  );
};


