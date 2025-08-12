import React from 'react';

export const AnswersReveal: React.FC<{ answers: string[]; majorityQuestion?: string }>= ({ answers, majorityQuestion }) => {
  return (
    <div className="card p-4">
      {majorityQuestion ? (
        <div className="mb-4 p-3 rounded-xl bg-indigo-900/40 border border-indigo-600">
          <div className="text-[11px] uppercase tracking-wide text-indigo-300 mb-1">Majority Question</div>
          <div className="text-lg font-semibold text-indigo-100">{majorityQuestion}</div>
        </div>
      ) : (
        <div className="text-slate-300 text-sm mb-2">Answers</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {answers.map((a, i) => {
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


