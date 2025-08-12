import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../socket/SocketProvider';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { RoundHUD } from '../components/RoundHUD';
import { AnswerPanel } from '../components/AnswerPanel';
import { AnswersReveal } from '../components/AnswersReveal';
import { QuestionsReveal } from '../components/QuestionsReveal';
import { VotingPanel } from '../components/VotingPanel';
import { ResultsCard } from '../components/ResultsCard';
import type { Room } from '../lib/types';
import { Toasts } from '../components/Toasts';
import { HostSidebar } from '../components/HostSidebar';
import { DiscussPanel } from '../components/DiscussPanel';
import { ChatPanel } from '../components/ChatPanel';
import { MobileActions } from '../components/MobileActions';
import { HowToModal } from '../components/HowToModal';

export const RoomPage: React.FC = () => {
  const { code } = useParams();
  const {
    room,
    deadlineAt,
    yourQuestion,
    answersRevealed,
    answersMajorityQuestion,
    questionsRevealed,
    joinRoom,
    startGame,
    nextRound,
    sendAnswer,
    sendVote,
    socket,
    readyToggle,
    kickPlayer,
  } = useSocket() as any;

  const [name, setName] = useState(() => localStorage.getItem('name') || `Player${Math.floor(Math.random()*100)}`);
  const [joined, setJoined] = useState(false);
  const [copyOk, setCopyOk] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [mobileSubmitted, setMobileSubmitted] = useState(false);

  useEffect(() => {
    if (room || joined) return; // already in a room
    if (!code) return;
    joinRoom(code, name).then(() => { localStorage.setItem('name', name); setJoined(true); });
  }, [code, room, joinRoom, name, joined]);

  const isHost = room && room.hostId && room.players.some((p) => p.id === room.hostId && p.name === name);
  const players = room ? room.players : [];
  const inviteUrl = room ? `${window.location.origin}/room/${room.code}` : '';
  const meId = room?.players.find((p: any) => p.name === name)?.id;
  const youAnswered = !!room?.answers?.some((a: any) => a.playerId === meId);
  // Keyboard shortcut: R to ready toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (room?.state !== 'RESULTS') return;
      if (e.key.toLowerCase() === 'r') {
        readyToggle(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [room?.state, readyToggle]);

  if (!room) return <div className="p-6 min-h-dvh grid place-items-center">Joining room…</div>;

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_320px] gap-6 p-6">
      <div className="space-y-4">
        <div className="card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-xs text-slate-400">Room</div>
                <div className="text-xl font-semibold">{room.code}</div>
              </div>
              <div className="text-sm text-slate-400 flex items-center gap-2">/ 
                {editingName ? (
                <form onSubmit={(e) => { e.preventDefault(); setEditingName(false); localStorage.setItem('name', name); (socket as any)?.emit('player:updateName', { name }); }}>
                  <input className="text w-40" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </form>
              ) : (
                <button className="px-2 py-1 rounded-full bg-slate-700 hover:bg-slate-600 border border-slate-600" onClick={() => setEditingName(true)}>
                  <span className="mr-1">✎</span>{name}
                </button>
              )}
                {isHost && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-600 ml-2">Host</span>}
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {isHost && room.state === 'LOBBY' && (
                <button className="primary" onClick={startGame} disabled={players.length < 4}>Start Game</button>
              )}
              {isHost && room.settings?.manualMode && (room.state === 'REVEAL_ANSWERS' || room.state === 'DISCUSS') && (
                <button className="secondary" onClick={() => (socket as any)?.emit('host:advance')}>Next Phase</button>
              )}
              {isHost && room.state === 'RESULTS' && (
                <button className="primary" onClick={nextRound}>Next Round</button>
              )}
              <button className="secondary" onClick={() => setShowHowTo(true)}>How to play</button>
              <button
                id="copyInviteRoom"
                className="secondary active:scale-[.98] transition"
                onClick={async () => {
                  const isMobile = (navigator as any).userAgentData?.mobile === true || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                  let copied = false;
                  try {
                    // Only use native share on mobile; desktop should copy silently
                    if (isMobile && (navigator as any).share) {
                      await (navigator as any).share({ title: 'Guess the Imposter', text: 'Join my room', url: inviteUrl });
                      copied = true;
                    } else if ((navigator as any).clipboard?.writeText) {
                      await (navigator as any).clipboard.writeText(inviteUrl);
                      copied = true;
                    }
                  } catch {}
                  if (!copied) {
                    const ta = document.createElement('textarea');
                    ta.value = inviteUrl;
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    try { copied = document.execCommand('copy'); } catch {}
                    document.body.removeChild(ta);
                  }
                  const btn = document.getElementById('copyInviteRoom');
                  if (btn) {
                    const orig = btn.textContent;
                    btn.textContent = copied ? 'Copied!' : 'Copy failed';
                    setTimeout(() => { btn.textContent = orig || 'Copy Invite Link'; }, 1500);
                  }
                }}
              >Copy Invite Link</button>
            </div>
          </div>
          {copyOk && <div className="mt-2 text-xs text-emerald-400">{copyOk}</div>}
        </div>

        <div className="card p-4">
          <RoundHUD round={room.round} scores={room.scores} deadlineAt={deadlineAt} state={room.state} />
        </div>

        {room.state === 'LOBBY' && (
          <div className="card p-4">
            <div className="text-slate-300 text-sm mb-2">Players</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {players.map((p) => {
                const answered = (room.answers || []).some((a: any) => a.playerId === p.id);
                const canKick = isHost && room.state === 'LOBBY' && p.id !== room.hostId;
                return (
                  <PlayerAvatar
                    key={p.id}
                    player={p}
                    highlight={p.id === room.hostId}
                    isHost={p.id === room.hostId}
                    isYou={p.name === name}
                    dim={room.state === 'ANSWERING' && !answered}
                    answered={room.state === 'ANSWERING' ? answered : undefined}
                    onKick={canKick ? () => kickPlayer(p.id) : undefined}
                  />
                );
              })}
            </div>
            <div className="text-slate-400 text-xs mt-2">Need exactly 4 players to start</div>
          </div>
        )}

        {room.state === 'ANSWERING' && (
          <>
            <AnswerPanel question={yourQuestion} onSubmit={sendAnswer} />
            {!youAnswered && !mobileSubmitted && (
            <MobileActions>
              <div className="w-full px-3">
                <div className="card bg-transparent border-0 p-0">
                  <button
                    className="primary w-full rounded-2xl py-3 text-base shadow-soft"
                    onClick={() => { setMobileSubmitted(true); sendAnswer((document.querySelector('input.text') as HTMLInputElement)?.value || ''); }}
                  >
                    Submit
                  </button>
                </div>
              </div>
            </MobileActions>
            )}
          </>
        )}

        {room.state === 'REVEAL_ANSWERS' && (
          <AnswersReveal answers={answersRevealed} majorityQuestion={answersMajorityQuestion} />
        )}

        {/* We no longer reveal questions mid-round per new flow */}

        {room.state === 'DISCUSS' && (
          <DiscussPanel answersWithNames={(room as any).answers ? (room as any).answersRevealed : undefined} />
        )}

        {room.state === 'VOTING' && (
          <>
            <VotingPanel players={players} onVote={sendVote} />
            <MobileActions>
              <div className="text-center text-slate-300 text-sm">Tap a player to vote</div>
            </MobileActions>
          </>
        )}

        {/* Results injected via toast+update; we'll just show when state is RESULTS and votes should be in snapshot */}
        {room.state === 'RESULTS' && (
          <>
            <ResultsLive />
            <MobileActions>
              <div className="flex gap-2">
                <button className="secondary flex-1" onClick={() => readyToggle(true)}>Ready</button>
                {isHost && <button className="primary flex-1" onClick={nextRound}>Next</button>}
              </div>
            </MobileActions>
          </>
        )}
      </div>

      <div className="space-y-4">
        {isHost && <HostSidebar room={room as Room} />}
        <ChatPanel />
        {!isHost && (
          <div className="card p-4">
            <div className="font-medium">Waiting for host</div>
            <div className="text-sm text-slate-400">The host can adjust timers and questions.</div>
          </div>
        )}
      </div>
      <HowToModal open={showHowTo} onClose={() => setShowHowTo(false)} manualModeNote={room?.settings?.manualMode} />
    </div>
  );
};

const ResultsLive: React.FC = () => {
  const { room, nextRound, roundResults } = useSocket() as any;
  if (!room) return null;
  const r = roundResults ?? { imposterId: room.imposterId ?? '', votes: room.votes ?? [], majorityWon: (room.scores?.majority ?? 0) >= (room.scores?.imposter ?? 0), questions: undefined };
  const { socket } = useSocket() as any;
  const readyIds = (room as any).readyPlayerIds || [];
  const meId = (room as any).players.find((p: any) => p.name === (localStorage.getItem('name') || ''))?.id;
  const isHost = (room as any).hostId === meId;
  return (
    <ResultsCard players={room.players} imposterId={r.imposterId} votes={r.votes} majorityWon={r.majorityWon} playerScores={(room as any).playerScores ?? {}} questions={r.questions} onNextRound={nextRound} readyCount={readyIds} onReadyToggle={(ready) => socket.emit('player:ready', { ready })} isHost={isHost} myId={meId} />
  );
};

// Mount toasts globally
export const RoomPageToasts: React.FC = () => <Toasts />;


