import React, { useEffect } from 'react';
import type { Player } from '../lib/types';

export const VotingPanel: React.FC<{ players: Player[]; onVote: (id: string) => void }>= ({ players, onVote }) => {
  const [votedId, setVotedId] = React.useState<string | null>(null);
  // Number keys 1-8 to vote
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (votedId) return;
      const n = Number(e.key);
      if (n >= 1 && n <= players.length) {
        const target = players[n - 1];
        onVote(target.id);
        setVotedId(target.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [players, votedId, onVote]);
  return (
    <div className="card p-4 space-y-3 anim-fade-in">
      <div className="text-slate-300 text-sm">Vote for the Imposter</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {players.map((p) => (
          <button key={p.id} className={`secondary text-left py-4 text-lg transition-transform active:scale-[.98] ${votedId === p.id ? 'ring-2 ring-emerald-400' : ''}`} onClick={() => { if (!votedId) { onVote(p.id); setVotedId(p.id); } }} disabled={!!votedId}>
            {p.name} {votedId === p.id && '✓'}
          </button>
        ))}
      </div>
      {votedId && <div className="text-sm text-emerald-400">Vote locked</div>}
    </div>
  );
};


