import React, { useEffect } from 'react';
import { useSocket } from '../socket/SocketProvider';

export const Toasts: React.FC = () => {
  const { toasts } = useSocket();
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50">
      {toasts.slice(-3).map((t, i) => (
        <div key={i} className={`px-4 py-2 rounded-xl shadow-soft ${t.type === 'error' ? 'bg-red-500' : t.type === 'success' ? 'bg-emerald-600' : 'bg-slate-700'}`}>{t.message}</div>
      ))}
    </div>
  );
};


