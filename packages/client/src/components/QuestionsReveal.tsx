import React from 'react';

export const QuestionsReveal: React.FC<{ majority: string; imposter: string }>= ({ majority, imposter }) => {
  return (
    <div className="card p-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="text-slate-300 text-sm">Majority Question</div>
          <div className="text-lg font-semibold">{majority}</div>
        </div>
        <div>
          <div className="text-slate-300 text-sm">Imposter Question</div>
          <div className="text-lg font-semibold">{imposter}</div>
        </div>
      </div>
    </div>
  );
};


