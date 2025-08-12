import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../socket/SocketProvider';
import { HowToModal } from '../components/HowToModal';

export const Landing: React.FC = () => {
  const { createRoom, joinRoom } = useSocket();
  const [name, setName] = useState(() => localStorage.getItem('name') || '');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('code') || '');
  const navigate = useNavigate();
  const [showHowTo, setShowHowTo] = useState(false);

  async function handleCreate() {
    const { code: roomCode } = await createRoom(name.trim());
    navigate(`/room/${roomCode}`);
  }

  async function handleJoin() {
    const roomCode = code.trim().toUpperCase();
    await joinRoom(roomCode, name.trim());
    navigate(`/room/${roomCode}`);
  }

  const valid = name.trim().length >= 2 && name.trim().length <= 16;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Guess the Imposter</h1>
          <p className="text-slate-300">A quick social deduction party game</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Your name</label>
            <input className="text mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="2–16 chars" />
          </div>
          <div className="flex gap-3">
            <button className="primary flex-1 active:scale-[.98] transition" disabled={!valid} onClick={handleCreate}>Create Room</button>
            <input className="text w-32" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CODE" />
            <button className="secondary active:scale-[.98] transition" disabled={!valid || code.trim().length !== 6} onClick={handleJoin}>Join</button>
          </div>
          <div>
            <button
              className="secondary mt-2 active:scale-[.98] transition"
              onClick={async () => {
                if (!code.trim()) return;
                const url = `${window.location.origin}/room/${code.trim().toUpperCase()}`;
                await navigator.clipboard.writeText(url);
                const btn = document.getElementById('copyInviteLanding');
                if (btn) { const original = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = original || 'Copy Invite Link'; }, 1500); }
              }}
              id="copyInviteLanding"
            >Copy Invite Link</button>
            <button className="secondary mt-2 ml-2" onClick={() => setShowHowTo(true)}>How to play</button>
          </div>
        </div>
        <p className="text-xs text-slate-400 text-center">Open multiple tabs to simulate 4 players</p>
      </div>
      <HowToModal open={showHowTo} onClose={() => setShowHowTo(false)} />
    </div>
  );
};


