import React, { useEffect, useMemo, useState } from 'react';

export const Timer: React.FC<{ deadlineAt?: number }> = ({ deadlineAt }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(id);
  }, []);
  if (!deadlineAt) return null;
  const msLeft = Math.max(0, deadlineAt - now);
  const secondsLeft = Math.ceil(msLeft / 1000);
  const pct = Math.max(0, Math.min(100, (msLeft / Math.max(1, deadlineAt - (deadlineAt - 1000 * 9999))) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="text-sm text-slate-300">⏱ {secondsLeft}s</div>
      <div className="w-16 h-1 bg-slate-700 rounded overflow-hidden">
        <div className="h-full bg-indigo-400 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};


