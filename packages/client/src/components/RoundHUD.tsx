import React from 'react';
import { Timer } from './Timer';

const stateStyles: Record<string, { label: string; classes: string }> = {
  LOBBY: { label: 'Lobby', classes: 'bg-slate-700 text-slate-200 border border-slate-600' },
  DISTRIBUTING: { label: 'Dealing…', classes: 'bg-slate-700 text-slate-200 border border-slate-600' },
  ANSWERING: { label: 'Answering', classes: 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30' },
  REVEAL_ANSWERS: { label: 'Reveal', classes: 'bg-purple-600/20 text-purple-200 border border-purple-500/30' },
  DISCUSS: { label: 'Discuss', classes: 'bg-teal-600/20 text-teal-200 border border-teal-500/30' },
  VOTING: { label: 'Vote', classes: 'bg-amber-600/20 text-amber-200 border border-amber-500/30' },
  RESULTS: { label: 'Results', classes: 'bg-emerald-600/20 text-emerald-200 border border-emerald-500/30' },
};

export const RoundHUD: React.FC<{ round: number; scores: { majority: number; imposter: number }; deadlineAt?: number; state: string }>
  = ({ round, scores, deadlineAt, state }) => {
  const style = stateStyles[state as keyof typeof stateStyles] ?? { label: state.replace('_', ' '), classes: 'bg-slate-700 text-slate-200 border border-slate-600' };
  return (
    <div className="w-full">
      {/* Mobile, compact */}
      <div className="md:hidden space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-300">Round {round}</div>
          <div className={`px-2 py-1 rounded-full text-[11px] font-medium ${style.classes}`}>{style.label}</div>
          <div className="text-xs text-slate-300">
            <Timer deadlineAt={deadlineAt} />
          </div>
        </div>
        <div className="text-[12px] text-slate-400">Majority <span className="font-semibold">{scores.majority}</span> · Imposter <span className="font-semibold">{scores.imposter}</span></div>
      </div>

      {/* Desktop, full */}
      <div className="hidden md:flex items-center justify-between">
        <div className="text-sm text-slate-300">Round {round}</div>
        <div className="text-lg font-semibold">State: {style.label}</div>
        <div className="flex items-center gap-4">
          <div className="text-sm">Majority <span className="font-bold">{scores.majority}</span></div>
          <div className="text-sm">Imposter <span className="font-bold">{scores.imposter}</span></div>
          <Timer deadlineAt={deadlineAt} />
        </div>
      </div>
    </div>
  );
};


