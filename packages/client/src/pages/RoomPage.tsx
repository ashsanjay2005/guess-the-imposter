import React, { useEffect, useMemo, useState } from 'react';
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

export const RoomPage: React.FC = () => {
  const { code } = useParams();
  const {
    room,
    deadlineAt,
    yourQuestion,
    answersRevealed,
    questionsRevealed,
    joinRoom,
    startGame,
    nextRound,
    sendAnswer,
    sendVote,
    socket,
  } = useSocket() as any;

  const [name, setName] = useState(() => localStorage.getItem('name') || `Player${Math.floor(Math.random()*100)}`);
  const [joined, setJoined] = useState(false);
  const [copyOk, setCopyOk] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);

  useEffect(() => {
    if (room || joined) return; // already in a room
    if (!code) return;
    joinRoom(code, name).then(() => { localStorage.setItem('name', name); setJoined(true); });
  }, [code, room, joinRoom, name, joined]);

  if (!room) return <div className="p-6">Joining room…</div>;

  const isHost = room.hostId && room.players.some((p) => p.id === room.hostId && p.name === name);
  const players = room.players;
  const inviteUrl = `${window.location.origin}/room/${room.code}`;

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
              <div className="text-sm text-slate-400">/ You (click to edit): {editingName ? (
                <form onSubmit={(e) => { e.preventDefault(); setEditingName(false); localStorage.setItem('name', name); (socket as any)?.emit('player:updateName', { name }); }}>
                  <input className="text w-40" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </form>
              ) : (
                <button className="underline hover:no-underline" onClick={() => setEditingName(true)}>{name}</button>
              )}</div>
            </div>
            <div className="flex gap-2 items-center">
              {isHost && room.state === 'LOBBY' && (
                <button className="primary" onClick={startGame} disabled={players.length < 4}>Start Game</button>
              )}
              {isHost && room.state === 'RESULTS' && (
                <button className="primary" onClick={nextRound}>Next Round</button>
              )}
              <button id="copyInviteRoom" className="secondary active:scale-[.98] transition" onClick={async () => { await navigator.clipboard.writeText(inviteUrl); const btn = document.getElementById('copyInviteRoom'); if (btn) { const orig = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = orig || 'Copy Invite Link'; }, 1500);} }}>Copy Invite Link</button>
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
              {players.map((p) => (
                <PlayerAvatar key={p.id} player={p} highlight={p.id === room.hostId} isHost={p.id === room.hostId} isYou={p.name === name} dim={room.state === 'ANSWERING' && !(room.answers || []).some((a: any) => a.playerId === p.id)} />
              ))}
            </div>
            <div className="text-slate-400 text-xs mt-2">Need exactly 4 players to start</div>
          </div>
        )}

        {room.state === 'ANSWERING' && (
          <AnswerPanel question={yourQuestion} onSubmit={sendAnswer} />
        )}

        {room.state === 'REVEAL_ANSWERS' && (
          <AnswersReveal answers={answersRevealed} />
        )}

        {/* We no longer reveal questions mid-round per new flow */}

        {room.state === 'DISCUSS' && (
          <DiscussPanel answersWithNames={(room as any).answers ? (room as any).answersRevealed : undefined} />
        )}

        {room.state === 'VOTING' && (
          <VotingPanel players={players} onVote={sendVote} />
        )}

        {/* Results injected via toast+update; we'll just show when state is RESULTS and votes should be in snapshot */}
        {room.state === 'RESULTS' && (
          <ResultsLive />
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
    </div>
  );
};

const ResultsLive: React.FC = () => {
  const { room, nextRound, roundResults } = useSocket();
  if (!room || !roundResults) return null;
  const { socket } = useSocket() as any;
  const readyIds = (room as any).readyPlayerIds || [];
  const meId = (room as any).players.find((p: any) => p.name === (localStorage.getItem('name') || ''))?.id;
  const isHost = (room as any).hostId === meId;
  return (
    <ResultsCard players={room.players} imposterId={roundResults.imposterId} votes={roundResults.votes} majorityWon={roundResults.majorityWon} playerScores={(room as any).playerScores ?? {}} questions={roundResults.questions} onNextRound={nextRound} readyCount={readyIds} onReadyToggle={(ready) => socket.emit('player:ready', { ready })} isHost={isHost} />
  );
};

// Mount toasts globally
export const RoomPageToasts: React.FC = () => <Toasts />;


