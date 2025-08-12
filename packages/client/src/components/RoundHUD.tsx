import React from 'react';
import { Timer } from './Timer';

export const RoundHUD: React.FC<{ round: number; scores: { majority: number; imposter: number }; deadlineAt?: number; state: string }>
  = ({ round, scores, deadlineAt, state }) => {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-slate-300">Round {round}</div>
      <div className="text-lg font-semibold">State: {state.replace('_', ' ')}</div>
      <div className="flex items-center gap-4">
        <div className="text-sm">Majority <span className="font-bold">{scores.majority}</span></div>
        <div className="text-sm">Imposter <span className="font-bold">{scores.imposter}</span></div>
        <Timer deadlineAt={deadlineAt} />
      </div>
    </div>
  );
};


