import React from 'react';

export const DiscussPanel: React.FC<{ answersWithNames?: string[] }>= ({ answersWithNames }) => {
  if (!answersWithNames || answersWithNames.length === 0) return (
    <div className="card p-4">
      <div className="text-slate-300 text-sm">Discuss with the group who seems sus…</div>
    </div>
  );
  return (
    <div className="card p-4">
      <div className="text-slate-300 text-sm mb-2">Discuss these answers</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {answersWithNames.map((a, i) => {
          const idx = a.indexOf(':');
          const name = idx > 0 ? a.slice(0, idx+1) : '';
          const text = idx > 0 ? a.slice(idx+1).trim() : a;
          return (
            <div key={i} className="p-3 rounded-xl bg-slate-700/60 border border-slate-600">
              {name && <span className="font-semibold mr-1">{name}</span>}<span>{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};


