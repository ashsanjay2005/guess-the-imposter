import React, { useState } from 'react';
import { useMafiaSocket } from './MafiaSocketProvider';
import { useNavigate } from 'react-router-dom';

export const MafiaLanding: React.FC = () => {
  const { createRoom, joinRoom } = useMafiaSocket();
  const [name, setName] = useState(() => localStorage.getItem('name') || '');
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  const valid = name.trim().length >= 2 && name.trim().length <= 16;
  const [lock, setLock] = useState(true);

  async function handleCreate() {
    const { code } = await createRoom(name.trim());
    // update initial settings via host:updateSettings
    const patch: any = { lockAfterStart: lock };
    // fire-and-forget
    setTimeout(() => (window as any).socket?.emit?.('host:updateSettings', { code, patch }), 100);
    localStorage.setItem('lastMafiaRoom', code);
    navigate(`/mafia/room/${code}`);
  }

  async function handleJoin() {
    const roomCode = code.trim().toUpperCase();
    await joinRoom(roomCode, name.trim());
    localStorage.setItem('lastMafiaRoom', roomCode);
    navigate(`/mafia/room/${roomCode}`);
  }

  const [howTo, setHowTo] = useState(false);
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Mafia / Werewolf</h1>
          <p className="text-slate-300">Automated narrator with roles & phases</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Your name</label>
            <input className={`text mt-1 ${!valid ? 'ring-1 ring-red-500/50 focus:ring-red-500/70' : ''}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="2–16 chars" />
          </div>
          {/* Role counts are set in the lobby Host Settings now */}
          <div className="flex gap-3 items-center">
            <label className="flex items-center gap-2"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> Lock seats after start</label>
          </div>
          {/* Removed deal seed; deterministic dealing not required */}
          <div className="flex gap-3">
            <button className="primary flex-1" disabled={!valid} onClick={handleCreate}>Create Room</button>
            <input className="text w-32" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CODE" />
            <button className="secondary" disabled={!valid || code.trim().length !== 6} onClick={handleJoin}>Join</button>
          </div>
          <div className="text-center">
            <button className="secondary text-xs" onClick={()=>setHowTo(true)}>How to play</button>
            <a className="secondary text-xs ml-2" href="/">Back to games</a>
          </div>
        </div>
        <p className="text-xs text-slate-400 text-center">Requires 5–20 players</p>
      </div>
      {howTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/70" onClick={()=>setHowTo(false)} />
          <div className="relative card p-6 max-w-xl w-full">
            <LandingHowTo onClose={()=>setHowTo(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

const LandingHowTo: React.FC<{ onClose: ()=>void }> = ({ onClose }) => {
  const [step, setStep] = useState(0);
  const steps = [
    { title: 'Goal', body: 'Town eliminates all Mafia. Mafia wins when they outnumber Town.' },
    { title: 'Night', body: 'Mafia vote to kill. Doctor protects. Detective investigates.' },
    { title: 'Day', body: 'Discuss → Accuse → Defense → Vote Lynch/No Lynch.' },
    { title: 'Manual mode', body: 'No timers; host advances; ends when everyone acts/votes.' },
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-bold">{steps[step].title}</div>
        <button className="secondary text-xs" onClick={onClose}>Close</button>
      </div>
      <div className="text-sm text-slate-300 mb-4">{steps[step].body}</div>
      <div className="flex items-center justify-between">
        <div className="text-xs opacity-70">{step+1}/{steps.length}</div>
        <div className="flex gap-2">
          <button className="secondary" onClick={()=>setStep(s=>Math.max(0,s-1))} disabled={step===0}>Back</button>
          <button className="primary" onClick={()=> step+1<steps.length ? setStep(step+1) : onClose()}>{step+1<steps.length ? 'Next' : 'Done'}</button>
        </div>
      </div>
    </div>
  );
};


