import React from 'react';
import { Link } from 'react-router-dom';

export const Home: React.FC = () => {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="max-w-3xl w-full">
        <div className="text-center mb-8 space-y-2">
          <h1 className="text-3xl font-bold">Party Games</h1>
          <p className="text-slate-300">Pick a game to start playing</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <Link to="/guess-who" className="card p-4 hover:bg-slate-700/60 transition">
            <div className="flex items-center gap-4">
              <div className="text-3xl" aria-hidden>🕵️‍♂️</div>
              <div>
                <div className="font-semibold">Guess the Imposter</div>
                <div className="text-sm text-slate-400">Social deduction for 4 players</div>
              </div>
            </div>
          </Link>

          <Link to="/mafia" className="card p-4 hover:bg-slate-700/60 transition">
            <div className="flex items-center gap-4">
              <div className="text-3xl" aria-hidden>🧛‍♂️</div>
              <div>
                <div className="font-semibold">Mafia / Werewolf</div>
                <div className="text-sm text-slate-400">Automated narrator with roles & phases</div>
              </div>
            </div>
          </Link>
        </div>

        <div className="text-center text-xs text-slate-400 mt-6">
          Shareable room links per game: <code>/room/ABCDEF</code> (Guess Who), <code>/mafia/room/ABCDEF</code> (Mafia).
        </div>
      </div>
    </div>
  );
};


