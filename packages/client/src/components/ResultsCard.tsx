import React from 'react';
import type { Player } from '../lib/types';

export const ResultsCard: React.FC<{
  players: Player[];
  imposterId: string;
  votes: { voterId: string; targetId: string }[];
  majorityWon: boolean;
  playerScores: Record<string, number>;
  questions?: { majorityQuestion: string; imposterQuestion: string };
  onNextRound?: () => void;
  readyCount?: string[];
  onReadyToggle?: (ready: boolean) => void;
  isHost?: boolean;
}> = ({ players, imposterId, votes, majorityWon, playerScores, questions, onNextRound, readyCount, onReadyToggle, isHost }) => {
  const imposter = players.find((p) => p.id === imposterId);
  const voteLines = votes.map((v, i) => {
    const voter = players.find((p) => p.id === v.voterId)?.name ?? 'Unknown';
    const target = players.find((p) => p.id === v.targetId)?.name ?? 'Unknown';
    return (
      <div key={i} className="text-sm">{voter} → {target}</div>
    );
  });
  const sorted = [...players].sort((a, b) => (playerScores[b.id] ?? 0) - (playerScores[a.id] ?? 0));
  return (
    <div className="card p-4 space-y-3">
      <div className="text-xl font-semibold">{majorityWon ? 'Majority wins!' : 'Imposter wins!'}</div>
      <div className="space-y-2">
        <div className="text-slate-300">Imposter was: <span className="font-medium">{imposter?.name}</span></div>
        {questions && (
          <div className="grid md:grid-cols-2 gap-2">
            <div className="text-sm"><span className="text-slate-400">Majority Q:</span> {questions.majorityQuestion}</div>
            <div className="text-sm"><span className="text-slate-400">Imposter Q:</span> {questions.imposterQuestion}</div>
          </div>
        )}
      </div>
      <div className="space-y-1">{voteLines}</div>
      <div className="pt-2">
        <div className="text-slate-300 text-sm mb-1">Leaderboard</div>
        <div className="grid gap-2">
          {sorted.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between bg-slate-700/50 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2"><span className="text-slate-400 w-6 text-right">{i+1}.</span><span className="font-medium">{p.name}</span></div>
              <div className="font-bold">{playerScores[p.id] ?? 0}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="secondary" onClick={() => onReadyToggle?.(true)} title="R">Ready</button>
        <button className="secondary" onClick={() => onReadyToggle?.(false)}>Unready</button>
        {isHost && readyCount && (
          <span className="text-sm text-slate-400">Ready: {readyCount.length}/{players.length}</span>
        )}
        {onNextRound && <button className="primary" onClick={onNextRound} disabled={!!readyCount && readyCount.length !== players.length}>Next Round</button>}
      </div>
    </div>
  );
};


