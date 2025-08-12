import React from 'react';
import type { Player } from '../lib/types';

export const PlayerAvatar: React.FC<{ player: Player; highlight?: boolean }> = ({ player, highlight }) => {
  const initials = player.name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${highlight ? 'bg-emerald-600/20' : 'bg-slate-700/50'}`}>
      <div className="w-8 h-8 rounded-full bg-indigo-500 grid place-items-center text-sm font-bold">
        {initials}
      </div>
      <div className="text-sm">
        <div className="font-medium leading-4">{player.name}</div>
        <div className="text-xs text-slate-400">{player.connected ? 'online' : 'offline'}</div>
      </div>
    </div>
  );
};


