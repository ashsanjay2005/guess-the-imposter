import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useMafiaSocket } from './MafiaSocketProvider';
import { Tooltip } from '../../components/Tooltip';

export const MafiaRoomPage: React.FC = () => {
  const { code } = useParams();
  const { state, me, sendChat, startGame, submitNightAction, finalizeNight, vote, finalizeDay, updateSettings, forceNextPhase, roleInfo, showRoleOverlay, dismissRoleOverlay, availableActions, detectiveResult, lynchResult, deathNotice, dismissDetectiveResult, dismissDeathNotice, accuse, joinRoom } = useMafiaSocket() as any;
  const players = state?.players ?? [];
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const my = React.useMemo(() => {
    if (!me || !state) return me;
    const p = state.players.find((x) => x.id === me.id);
    return p ? { ...me, isAlive: p.isAlive } : me;
  }, [me, state]);
  const isMafia = roleInfo?.alignment === 'MAFIA';
  const isDead = my ? my.isAlive === false : false;

  const phaseBadge = useMemo(() => {
    if (!state) return null;
    const secs = state.deadlineAt ? Math.max(0, Math.ceil((state.deadlineAt - now)/1000)) : undefined;
    const mmss = secs !== undefined ? `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}` : '';
    return (
      <span className="px-2 py-1 rounded bg-slate-700 text-xs">
        {state.phase} {state.phase !== 'LOBBY' ? `· Day ${state.dayNumber}` : ''} {mmss && `· ${mmss}`}
      </span>
    );
  }, [state, now]);

  const [copied, setCopied] = React.useState(false);
  const joined = React.useMemo(() => {
    try {
      const stored = sessionStorage.getItem('mafiaMeId');
      if (!stored) return false;
      return !!players.find((p) => p.id === stored);
    } catch { return false; }
  }, [players]);

  return (
    <div className="min-h-dvh p-4 md:p-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {state?.phase === 'LOBBY' ? (
            <a className="secondary text-xs" href="/mafia">← Back</a>
          ) : null}
          <div className="font-semibold text-lg">Room {code}</div>
          <HowToPlayButton />
          <button
            className="secondary text-xs"
            onClick={async () => {
              const url = `${window.location.origin}/mafia/room/${code}`;
              let ok = false;
              try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); ok = true; } } catch {}
              if (!ok) {
                const ta = document.createElement('textarea');
                ta.value = url; ta.style.position = 'fixed'; ta.style.left = '-9999px'; document.body.appendChild(ta); ta.focus(); ta.select();
                try { ok = document.execCommand('copy'); } catch {}
                document.body.removeChild(ta);
              }
              setCopied(ok);
              setTimeout(() => setCopied(false), 1500);
            }}
          >{copied ? 'Copied!' : 'Copy link'}</button>
          {phaseBadge}
        </div>
        <div className="text-sm text-slate-400 flex items-center gap-2">You are {my?.name || '—'}{my && state && my.id === state.hostId && (
          <span className="ml-2 px-2 py-0.5 rounded bg-indigo-600/60 text-white text-[10px] tracking-wide">HOST</span>
        )}{roleInfo && (
          <span className={`ml-2 px-2 py-1 rounded text-xs ${roleInfo.alignment === 'MAFIA' ? 'bg-red-700/60' : roleInfo.alignment === 'TOWN' ? 'bg-green-700/60' : 'bg-slate-700/60'}`}>{roleInfo.roleType}</span>
        )}
        {state && my && my.id === state.hostId && state.phase !== 'LOBBY' && (state.settings?.enableForce || state.settings?.manualMode) && (
          <button className="primary ml-3" onClick={() => forceNextPhase()}>Next phase</button>
        )}
        </div>
      </div>

      {!joined && (
        <JoinBar code={code} onJoin={(nm: string) => joinRoom(code, nm)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-4 space-y-4">
          <div className="font-semibold mb-2">Players</div>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <div key={p.id} className={`px-3 py-2 rounded ${p.isAlive ? 'bg-slate-700' : 'bg-slate-800 line-through opacity-60'}`}>{p.name}</div>
            ))}
          </div>
          {state?.phase === 'LOBBY' && me?.id === state?.hostId && (
            <div className="flex flex-col gap-3">
              <HostSettings onUpdate={updateSettings} onForce={forceNextPhase} settings={state?.settings} phase={state?.phase} playerCount={players.length} />
              <div className="flex items-center gap-3">
                <button
                  className="primary"
                  disabled={(players.length) < ((state?.settings?.minPlayers ?? 5)) ||
                    // prevent majority mafia and over-assigning roles
                    (() => { const r = state?.settings?.roles || {}; const mafia = Math.max(0, r.mafia ?? 0); const doc = Math.max(0, r.doctor ?? 0); const det = Math.max(0, r.detective ?? 0); const alive = players.length; const maxMafia = Math.floor((alive - 1)/2); return mafia > maxMafia || (mafia + doc + det) > alive; })()}
                  onClick={() => startGame(state.code)}
                >Start Game</button>
                {players.length < (state?.settings?.minPlayers ?? 5) && (
                  <span className="text-xs text-slate-400">Need at least {(state?.settings?.minPlayers ?? 5)} players</span>
                )}
                <RenameControl />
              </div>
            </div>
          )}
          {state?.phase === 'NIGHT' && (
            <NightActions
              roleInfo={roleInfo}
              availableActions={availableActions}
              players={players.filter((p) => p.isAlive)}
              onSubmit={(type, targetId) => submitNightAction(state.code, type, targetId)}
              onFinalize={() => finalizeNight(state.code)}
            />
          )}
          {state?.phase === 'DAY' && (
            <DaySection
              state={state}
              players={players.filter((p) => p.isAlive)}
              onAccuse={accuse}
              onVote={(nomineeId, value) => vote(state.code, nomineeId, value)}
              onFinalize={() => finalizeDay(state.code)}
              isDead={isDead}
            />
          )}
        </div>
        <RightTabs
          entries={state?.log ?? []}
          chatMessages={state?.chat ?? []}
          isMafia={isMafia}
          isDead={isDead}
          onSend={sendChat}
          voters={state?.votesList || []}
          tally={state?.voteTally || {}}
          noLynch={state?.noLynchCount || 0}
          players={players}
          stage={state?.stage}
        />
      </div>
      {state && (
        <div className="card p-4 mt-4">
          <NarratorLog entries={state?.log ?? []} />
        </div>
      )}
      {showRoleOverlay && roleInfo && (
        <RoleOverlay roleType={roleInfo.roleType} alignment={roleInfo.alignment} onClose={dismissRoleOverlay} />
      )}
      {detectiveResult && (
        <DetectiveResultOverlay targetName={detectiveResult.targetName} isMafia={detectiveResult.isMafia} onClose={dismissDetectiveResult} />
      )}
      {deathNotice && (
        <DeathOverlay at={deathNotice.at} dayNumber={deathNotice.dayNumber} onClose={dismissDeathNotice} />
      )}
      {lynchResult && (
        <LynchBanner payload={lynchResult} />
      )}
      <GameSummaryModal />
    </div>
  );
};
const HowToPlayButton: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const steps = [
    {
      title: 'Goal',
      body: 'Town eliminates all Mafia. Mafia wins when they outnumber Town. Stay alive and deduce wisely.',
    },
    {
      title: 'Night',
      body: 'Mafia secretly vote a target. Doctor protects one. Detective investigates one player and learns Mafia/Not Mafia.',
    },
    {
      title: 'Day',
      body: 'Discuss and Accuse. Top nominee(s) go to defense. Then vote Lynch or No Lynch. Ties move multiple nominees to defense or result in No Lynch.',
    },
    {
      title: 'Manual vs Auto',
      body: 'Manual: no timers; host advances phases; ends when all actions/votes are in. Auto: synced timers; phases advance automatically.',
    },
    {
      title: 'Chats',
      body: 'Open chat during Day. Mafia chat at Night (mafia-only). Graveyard chat for dead players. All chats reveal after the game ends.',
    },
  ];
  return (
    <>
      <button className="secondary text-xs" onClick={() => { setStep(0); setOpen(true); }}>How to play</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="relative card p-6 max-w-xl w-full">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-bold">{steps[step].title}</div>
              <button className="secondary text-xs" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="text-sm text-slate-300 mb-4">{steps[step].body}</div>
            <div className="flex items-center justify-between">
              <div className="text-xs opacity-70">{step + 1}/{steps.length}</div>
              <div className="flex gap-2">
                <button className="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>
                <button className="secondary" onClick={() => setOpen(false)}>Skip</button>
                <button className="primary" onClick={() => step + 1 < steps.length ? setStep(step + 1) : setOpen(false)}>{step + 1 < steps.length ? 'Next' : 'Done'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const JoinBar: React.FC<{ code?: string; onJoin: (name: string) => void }> = ({ code, onJoin }) => {
  const [name, setName] = React.useState(localStorage.getItem('name') || '');
  const valid = name.trim().length >= 2 && name.trim().length <= 16;
  return (
    <div className="card p-3 mb-4 flex items-center gap-3">
      <div className="text-sm">Join room {code}</div>
      <input className="text w-40" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" />
      <button className="primary" disabled={!valid} onClick={() => { localStorage.setItem('name', name); onJoin(name.trim()); }}>Join</button>
    </div>
  );
};
const HostSettings: React.FC<{ settings: any; phase?: string; onUpdate: (patch: any) => void; onForce: () => void; playerCount?: number }> = ({ settings, phase, onUpdate, onForce, playerCount = 0 }) => {
  const [night, setNight] = React.useState<number>(settings?.timers?.nightSeconds ?? 90);
  const [defense, setDefense] = React.useState<number>(settings?.timers?.defenseSeconds ?? 20);
  const [vote, setVote] = React.useState<number>(settings?.timers?.voteSeconds ?? 30);
  const [manual, setManual] = React.useState<boolean>(!!settings?.manualMode);
  const [locked, setLocked] = React.useState<boolean>(!!settings?.lockAfterStart);
  const [mafia, setMafia] = React.useState<number>(settings?.roles?.mafia ?? 2);
  const [doctor, setDoctor] = React.useState<number>(settings?.roles?.doctor ?? 1);
  const [detective, setDetective] = React.useState<number>(settings?.roles?.detective ?? 1);
  const [enableForce, setEnableForce] = React.useState<boolean>(!!settings?.enableForce ?? false);
  const [saved, setSaved] = React.useState<'idle' | 'ok' | 'err'>('idle');
  return (
    <div className="border-t border-slate-700 pt-3 space-y-2">
      <div className="font-semibold">Host Settings</div>
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">Mafia <Tooltip text="Number of Mafia players. Mafia must have majority at night to kill." />
          <input className="text mt-1 w-full" type="number" min={1} max={Math.max(1, Math.floor((Math.max(0, playerCount) - 1)/2))} value={mafia} onChange={(e) => setMafia(parseInt(e.target.value||'0'))} />
        </label>
        <label className="text-sm">Doctors <Tooltip text="Doctors can protect one player at night from the mafia kill." />
          <input className="text mt-1 w-full" type="number" min={0} max={Math.max(0, playerCount)} value={doctor} onChange={(e) => setDoctor(parseInt(e.target.value||'0'))} />
        </label>
        <label className="text-sm">Detectives <Tooltip text="Detectives investigate one player each night and learn if they are Mafia." />
          <input className="text mt-1 w-full" type="number" min={0} max={Math.max(0, playerCount)} value={detective} onChange={(e) => setDetective(parseInt(e.target.value||'0'))} />
        </label>
      </div>
      {!manual && (
        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm">Night <Tooltip text="Length of the Night phase in seconds. Actions auto-resolve when timer ends." />
            <input className="text mt-1 w-full" type="number" min={5} max={600} value={night} onChange={(e) => setNight(parseInt(e.target.value||'0'))} />
          </label>
          <label className="text-sm">Trial/Defense <Tooltip text="How long the defense lasts before voting opens (auto mode)." />
            <input className="text mt-1 w-full" type="number" min={5} max={300} value={defense} onChange={(e) => setDefense(parseInt(e.target.value||'0'))} />
          </label>
          <label className="text-sm">Vote <Tooltip text="Voting window length (auto mode). In manual mode, ends when all living players have voted." />
            <input className="text mt-1 w-full" type="number" min={5} max={300} value={vote} onChange={(e) => setVote(parseInt(e.target.value||'0'))} />
          </label>
        </div>
      )}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2"> <input type="checkbox" checked={manual} onChange={(e) => { setManual(e.target.checked); if (e.target.checked) setEnableForce(true); }} /> Manual mode <Tooltip text="Manual mode removes timers. Night advances when all actions are in. Day defense advances when host clicks Next phase. Voting ends when all living players have voted." /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} /> Lock seats after start <Tooltip text="Prevents new players from joining after the game begins." /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={enableForce || manual} onChange={(e) => setEnableForce(e.target.checked)} disabled={manual} /> Enable Force button <Tooltip text="Always enabled in manual mode. Allows the host to manually advance phases." /></label>
        <button
          className={`secondary ${saved==='ok' ? '!bg-emerald-700/60' : saved==='err' ? '!bg-red-700/60' : ''}`}
          onClick={async () => {
            try {
              await onUpdate({ timers: { nightSeconds: night, defenseSeconds: defense, voteSeconds: vote }, manualMode: manual, lockAfterStart: locked, enableForce, roles: { mafia, doctor, detective, villager: 0 } });
              setSaved('ok'); setTimeout(() => setSaved('idle'), 1500);
            } catch { setSaved('err'); setTimeout(() => setSaved('idle'), 1500); }
          }}
        >{saved==='ok' ? 'Saved!' : saved==='err' ? 'Failed' : 'Save'}</button>
        {phase !== 'LOBBY' && (enableForce || manual) && (
          <button className="primary" onClick={onForce}>Force next phase</button>
        )}
      </div>
    </div>
  );
};

const RenameControl: React.FC = () => {
  const { state, socket } = useMafiaSocket() as any;
  const [name, setName] = React.useState(localStorage.getItem('name') || '');
  const [status, setStatus] = React.useState<'idle'|'ok'|'err'>('idle');
  return (
    <div className="flex items-center gap-2 ml-4">
      <input className="text w-32" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} placeholder="New name" />
      <button className={`secondary ${status==='ok'?'!bg-emerald-700/60':status==='err'?'!bg-red-700/60':''}`} onClick={() => {
        if (state?.phase !== 'LOBBY') return;
        socket?.emit('player:updateName', { name }, (resp: any) => {
          if (resp?.error) { setStatus('err'); setTimeout(()=>setStatus('idle'),1500); } else { localStorage.setItem('name', name); setStatus('ok'); setTimeout(()=>setStatus('idle'),1500); }
        });
      }}>{status==='ok'?'Saved!':status==='err'?'Failed':'Rename'}</button>
    </div>
  );
};

const MafiaChat: React.FC<{ onSend: (text: string, channel?: 'DAY'|'MAFIA'|'GHOST') => void; messages: { id: string; name: string; text: string; ts: number; channel: string }[]; isMafia?: boolean; isDead?: boolean }> = ({ onSend, messages, isMafia, isDead }) => {
  const [text, setText] = React.useState('');
  const initialTab: 'DAY'|'MAFIA'|'GHOST' = isDead ? 'GHOST' : 'DAY';
  const [tab, setTab] = React.useState<'DAY' | 'MAFIA' | 'GHOST'>(initialTab);
  const filtered = messages.filter((m) => (tab === 'DAY' ? m.channel === 'DAY' : tab === 'MAFIA' ? m.channel === 'MAFIA' : m.channel === 'GHOST'));
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button className={`secondary ${tab==='DAY' ? '!bg-slate-600' : ''}`} onClick={() => setTab('DAY')}>Open</button>
        {(isMafia || isDead) && (
          <button className={`secondary ${tab==='MAFIA' ? '!bg-red-700/50' : ''}`} onClick={() => setTab('MAFIA')}>Mafia</button>
        )}
        {isDead && (
          <button className={`secondary ${tab==='GHOST' ? '!bg-slate-600' : ''}`} onClick={() => setTab('GHOST')}>Graveyard</button>
        )}
      </div>
      <div className="h-48 overflow-auto bg-slate-800/40 rounded p-2 text-sm">
        {filtered.map((m) => (
          <div key={m.id} className="mb-1"><span className="text-slate-400">[{new Date(m.ts).toLocaleTimeString()}]</span> <strong className={m.channel==='MAFIA' ? 'text-red-300' : ''}>{m.name}</strong>: <span className={m.channel==='MAFIA' ? 'text-red-300' : ''}>{m.text}</span></div>
        ))}
      </div>
      <input className="text w-full" value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something" />
      <button className="primary w-full" disabled={(tab==='MAFIA' && !isMafia) || (tab==='DAY' && isDead)} onClick={() => { if (text.trim()) { onSend(text.trim(), tab==='DAY' ? 'DAY' : tab==='MAFIA' ? 'MAFIA' : 'GHOST'); setText(''); } }}>Send</button>
    </div>
  );
};

const RightTabs: React.FC<{ entries: any[]; chatMessages: any[]; isMafia?: boolean; isDead?: boolean; onSend: (text: string, ch?: any)=>void; voters: any[]; tally: Record<string, number>; noLynch: number; players: { id: string; name: string }[]; stage?: string }> = ({ entries, chatMessages, isMafia, isDead, onSend, voters, tally, noLynch, players, stage }) => {
  const [tab, setTab] = React.useState<'CHAT' | 'LOG' | 'VOTES'>('CHAT');
  React.useEffect(() => { if (stage === 'DAY_VOTING') setTab('VOTES'); }, [stage]);
  return (
    <div className="card p-4">
      <div className="flex gap-2 mb-2">
        <button className={`secondary ${tab==='CHAT' ? '!bg-slate-600' : ''}`} onClick={() => setTab('CHAT')}>Chat</button>
        <button className={`secondary ${tab==='LOG' ? '!bg-slate-600' : ''}`} onClick={() => setTab('LOG')}>Log</button>
        {stage === 'DAY_VOTING' && (
          <button className={`secondary ${tab==='VOTES' ? '!bg-slate-600' : ''}`} onClick={() => setTab('VOTES')}>Votes</button>
        )}
      </div>
      {tab === 'CHAT' && (<MafiaChat onSend={onSend} messages={chatMessages} isMafia={isMafia} isDead={isDead} />)}
      {tab === 'LOG' && (<NarratorLog entries={entries} />)}
      {tab === 'VOTES' && (<VoteTally tally={tally} noLynch={noLynch} voters={voters} players={players} />)}
    </div>
  );
};

// Dev tools were removed from the UI.

const NightActions: React.FC<{
  players: { id: string; name: string }[];
  roleInfo: { roleType: string; alignment: string } | null;
  availableActions: { type: 'KILL' | 'PROTECT' | 'INVESTIGATE'; targets: string[] }[];
  onSubmit: (type: 'KILL' | 'PROTECT' | 'INVESTIGATE', targetId: string) => void;
  onFinalize: () => void;
}> = ({ players, roleInfo, availableActions, onSubmit, onFinalize }) => {
  const [target, setTarget] = React.useState<string>('');
  const [submitted, setSubmitted] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const act = availableActions[0] ?? null;
  const label = act?.type === 'KILL' ? 'Mafia Kill' : act?.type === 'PROTECT' ? 'Doctor Protect' : act?.type === 'INVESTIGATE' ? 'Detective Investigate' : '';

  const targetOptions = React.useMemo(() => {
    if (!act) return [] as { id: string; name: string }[];
    const allowed = new Set(act.targets);
    return players.filter((p) => allowed.has(p.id));
  }, [players, act]);

  return (
    <div className="border-t border-slate-700 pt-3">
      <div className="font-semibold mb-2">Night actions</div>
      {!roleInfo || !act ? (
        <div className="text-sm text-slate-400">You have no action this night.</div>
      ) : (
        <div className="flex gap-2 items-center flex-wrap">
          <select className="text" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose target</option>
            {targetOptions.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
          <button
            className={`secondary ${submitted ? 'opacity-70' : ''}`}
            disabled={!target || submitted}
            onClick={() => { if (!target) return; try { onSubmit(act.type, target); setSubmitted(true); setToast('Submitted'); setTimeout(() => setToast(null), 1500); } catch { setToast('Failed'); setTimeout(() => setToast(null), 1500); } }}
          >{submitted ? 'Submitted' : label}</button>
          <button className="primary" onClick={onFinalize}>Finalize Night</button>
          {toast && <span className="text-xs text-slate-300 ml-2">{toast}</span>}
        </div>
      )}
    </div>
  );
};

const DaySection: React.FC<{
  state: any;
  players: { id: string; name: string }[];
  onAccuse: (targetId: string) => void;
  onVote: (nomineeId: string | undefined, value: 'LYNCH' | 'NO_LYNCH') => void;
  onFinalize: () => void;
  isDead?: boolean;
}> = ({ state, players, onAccuse, onVote, onFinalize, isDead }) => {
  const [target, setTarget] = React.useState<string>('');
  const [voteChoice, setVoteChoice] = React.useState<'LYNCH' | 'NO_LYNCH'>('LYNCH');
  const [nomineeChoice, setNomineeChoice] = React.useState<string>('');
  React.useEffect(() => { setNomineeChoice(''); }, [state.nominees?.join(','), state.stage]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c') {
        (document.querySelector('#chat-panel input[type="text"]') as HTMLInputElement | null)?.focus();
      } else if (e.key.toLowerCase() === 'a' && state.stage === 'DAY_DISCUSSION') {
        (document.getElementById('accuse-select') as HTMLSelectElement | null)?.focus();
      } else if (e.key.toLowerCase() === 'v' && state.stage === 'DAY_VOTING') {
        (document.getElementById('vote-submit') as HTMLButtonElement | null)?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.stage]);
  return (
    <div className="border-t border-slate-700 pt-3 space-y-3">
      <div className="font-semibold">Day</div>
      {state.stage === 'DAY_DISCUSSION' && (
        <div className="flex gap-2 items-center flex-wrap">
          <select id="accuse-select" className="text" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Accuse a player">
            <option value="">No one (skip nomination)</option>
            {players.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
          <button className="secondary" onClick={() => onAccuse(target || undefined)} disabled={state?.meIsDead}>Accuse</button>
          <span className="text-xs text-slate-400">This panel is for accusing a player. Choosing “No one” opens voting with No Lynch as an option.</span>
        </div>
      )}
      {state.stage === 'DAY_DEFENSE' && (
        <div className="text-sm text-slate-300">
          {state.nominees?.length > 1 ? `${state.nominees.map((id:string)=>players.find(p=>p.id===id)?.name).filter(Boolean).join(' vs ')}` : (players.find((p) => p.id === state.nomineeId)?.name ?? 'A player')} is on defense. {state.settings?.manualMode ? 'Voting opens when the host clicks Next phase.' : 'Voting opens after the timer.'}
          {(!state.settings?.manualMode && state.deadlineAt) && (<span className="ml-2 px-2 py-0.5 rounded bg-slate-700 text-xs">{Math.max(0, Math.ceil((state.deadlineAt - Date.now())/1000))}s</span>)}
        </div>
      )}
      {state.stage === 'DAY_VOTING' && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-sm">Nominee:
              {state.nominees?.length > 1 ? (
                <select className="text ml-2" value={nomineeChoice} onChange={(e)=> setNomineeChoice(e.target.value)}>
                  <option value="">Choose…</option>
                  {state.nominees.map((id:string) => (
                    <option key={id} value={id}>{players.find((p)=>p.id===id)?.name ?? 'Unknown'}</option>
                  ))}
                </select>
              ) : (
                <strong> {players.find((p) => p.id === state.nomineeId)?.name ?? 'Unknown'}</strong>
              )}
            </span>
            <select className="text" value={voteChoice} onChange={(e) => setVoteChoice(e.target.value as any)}>
              <option value="LYNCH">Lynch</option>
              <option value="NO_LYNCH">No Lynch</option>
            </select>
            <button id="vote-submit" className="secondary" onClick={() => onVote(state.nominees?.length > 1 ? (nomineeChoice || undefined) : state.nomineeId, voteChoice)} disabled={isDead || (state.nominees?.length > 1 && !nomineeChoice)}>
              Submit Vote
            </button>
            <button className="primary" onClick={onFinalize}>Finalize Day</button>
          </div>
          <VoteTally tally={state.voteTally || {}} noLynch={state.noLynchCount || 0} voters={state.votesList || []} players={players} />
        </div>
      )}
      {state.deadlineAt && (
        <div className="text-xs text-slate-400">Time left: {Math.max(0, Math.ceil((state.deadlineAt - Date.now())/1000))}s</div>
      )}
    </div>
  );
};

const RoleOverlay: React.FC<{ roleType: string; alignment: string; onClose: () => void }> = ({ roleType, alignment, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative card p-8 max-w-md w-full text-center">
        <div className="text-2xl font-bold mb-2">Your Role</div>
        <div className={`text-4xl font-extrabold mb-4 ${alignment === 'MAFIA' ? 'text-red-400' : alignment === 'TOWN' ? 'text-green-400' : 'text-slate-200'}`}>{roleType}</div>
        <button className="primary w-full" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
};

const DetectiveResultOverlay: React.FC<{ targetName: string; isMafia: boolean; onClose: () => void }> = ({ targetName, isMafia, onClose }) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative card p-6 max-w-sm w-full text-center">
        <div className="text-xl font-bold mb-2">Investigation Result</div>
        <div className={`text-2xl font-extrabold ${isMafia ? 'text-red-400' : 'text-green-400'}`}>{targetName} is {isMafia ? 'Mafia' : 'Not Mafia'}</div>
        <button className="primary w-full mt-4" onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

const LynchBanner: React.FC<{ payload: { lynchedId: string | null; lynchedName?: string; roleType?: string; alignment?: string } }> = ({ payload }) => {
  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center p-6 pointer-events-none">
      <div className="mt-10 card px-6 py-4 text-center">
        <div className="text-xl font-bold">{payload.lynchedId ? 'Lynched' : 'No Lynch'}</div>
        {payload.lynchedId && (
          <div className="text-2xl font-extrabold mt-1">{payload.lynchedName} — {payload.roleType} ({payload.alignment})</div>
        )}
      </div>
    </div>
  );
};

const DeathOverlay: React.FC<{ at: 'DAWN'|'DAY'; dayNumber: number; onClose: () => void }> = ({ at, dayNumber, onClose }) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative card p-6 max-w-sm w-full text-center">
        <div className="text-xl font-bold mb-2">You died</div>
        <div className="text-sm text-slate-300">{at === 'DAWN' ? `During the night before Day ${dayNumber}` : `During Day ${dayNumber}`}</div>
        <button className="primary w-full mt-4" onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

const NarratorLog: React.FC<{ entries: { id: string; ts: number; phase: string; message: string; meta?: any }[] }> = ({ entries }) => {
  const [filter, setFilter] = React.useState<'ALL' | 'ACTIONS' | 'DEATHS'>('ALL');
  const filtered = entries.filter((e) => {
    if (filter === 'DEATHS') return /death|lynch/i.test(e.message);
    if (filter === 'ACTIONS') return /kill|investigate|protect|accusation/i.test(e.message);
    return true;
  });
  const copy = () => {
    const txt = entries.map((e) => `[${new Date(e.ts).toLocaleString()}] ${e.message}`).join('\n');
    navigator.clipboard?.writeText(txt).catch(() => {});
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Narrator Log</div>
        <div className="flex gap-2 items-center">
          <select className="text" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
            <option value="ALL">All</option>
            <option value="ACTIONS">Actions</option>
            <option value="DEATHS">Deaths</option>
          </select>
          <button className="secondary" onClick={copy}>Copy summary</button>
        </div>
      </div>
      <div className="h-48 overflow-auto bg-slate-800/40 rounded p-2 text-sm">
        {filtered.map((e) => (
          <div key={e.id} className="mb-1"><span className="text-slate-400">[{new Date(e.ts).toLocaleTimeString()}]</span> {e.message}</div>
        ))}
      </div>
    </div>
  );
};

const VoteTally: React.FC<{ tally: Record<string, number>; noLynch: number; voters: { voterId: string; nomineeId?: string; value: 'LYNCH' | 'NO_LYNCH' }[]; players: { id: string; name: string }[] }> = ({ tally, noLynch, voters, players }) => {
  const max = Math.max(1, ...Object.values(tally), noLynch);
  const nameOf = (id?: string) => players.find((p) => p.id === id)?.name || 'Unknown';
  return (
    <div className="space-y-2">
      <div className="font-semibold">Vote tally</div>
      {Object.entries(tally).map(([id, count]) => (
        <div key={id} className="flex items-center gap-2 text-sm">
          <div className="w-24 truncate">{nameOf(id)}</div>
          <div className="flex-1 h-3 bg-slate-700 rounded"><div className="h-3 bg-emerald-600 rounded" style={{ width: `${(count / max) * 100}%` }} /></div>
          <div className="w-6 text-right">{count}</div>
        </div>
      ))}
      <div className="flex items-center gap-2 text-sm">
        <div className="w-24">No Lynch</div>
        <div className="flex-1 h-3 bg-slate-700 rounded"><div className="h-3 bg-slate-400 rounded" style={{ width: `${(noLynch / max) * 100}%` }} /></div>
        <div className="w-6 text-right">{noLynch}</div>
      </div>
      <div className="text-xs text-slate-400 mt-2">Voters:</div>
      <div className="text-xs bg-slate-800/40 rounded p-2">
        {voters.map((v) => (<div key={v.voterId}>{nameOf(v.voterId)} → {v.value === 'NO_LYNCH' ? 'No Lynch' : nameOf(v.nomineeId)}</div>))}
      </div>
    </div>
  );
};

const GameSummaryModal: React.FC = () => {
  const { gameSummary, dismissGameSummary, readyUp, toLobby, state, me } = useMafiaSocket() as any;
  if (!gameSummary) return null;
  const isHost = state && me && me.id === state.hostId;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative card p-6 max-w-lg w-full">
        <div className="text-2xl font-bold mb-2">{gameSummary.winner === 'TOWN' ? 'Town Wins' : 'Mafia Wins'}</div>
        <div className="text-sm text-slate-300 mb-4">All chats are now visible to everyone.</div>
        <div className="max-h-64 overflow-auto rounded bg-slate-800/40 p-3 text-sm mb-4">
          {gameSummary.roles.map((r: any) => (
            <div key={r.playerId} className="flex justify-between">
              <span>{r.name}</span>
              <span className="opacity-80">{r.roleType} ({r.alignment})</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="primary flex-1" onClick={() => { readyUp(); dismissGameSummary(); }}>Ready for next</button>
          {isHost && (<button className="secondary" onClick={() => { toLobby(); dismissGameSummary(); }}>Return to lobby</button>)}
        </div>
      </div>
    </div>
  );
};


