import React, { useEffect, useState } from 'react';

export const Timer: React.FC<{ deadlineAt?: number }> = ({ deadlineAt }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  if (!deadlineAt) return null;
  const msLeft = Math.max(0, deadlineAt - now);
  const s = Math.ceil(msLeft / 1000);
  return <div className="text-sm text-slate-300">⏱ {s}s</div>;
};


