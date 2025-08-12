import type { Server, Socket } from 'socket.io';
import type { Player, Room, RoomSettings } from './types';
import { roomManager } from './roomManager';

type Timers = {
  distributing?: NodeJS.Timeout;
  answering?: NodeJS.Timeout;
  revealAnswers?: NodeJS.Timeout;
  revealQuestions?: NodeJS.Timeout;
  discuss?: NodeJS.Timeout;
  voting?: NodeJS.Timeout;
};

const roomTimers = new Map<string, Timers>();
const phaseDeadlines = new Map<string, number>();

function setDeadline(room: Room, seconds: number) {
  const deadline = Date.now() + seconds * 1000;
  phaseDeadlines.set(room.code, deadline);
  return deadline;
}

export function getDeadline(code: string): number | undefined {
  return phaseDeadlines.get(code);
}

function emitSnapshot(io: Server, room: Room) {
  const snapshot = {
    code: room.code,
    hostId: room.hostId,
    players: room.players,
    spectators: room.spectators,
    state: room.state,
    round: room.round,
    scores: room.scores,
    playerScores: room.playerScores,
    answers: room.answers,
    votes: room.votes,
    settings: room.settings,
    questionBank: room.questionBank,
  };
  io.to(room.code).emit('room:update', snapshot);
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function chooseImposter(room: Room): Player {
  const players = room.players.filter((p) => p.connected);
  return players[Math.floor(Math.random() * players.length)];
}

export function startGame(io: Server, room: Room) {
  if (room.players.length < room.settings.minPlayers) {
    io.to(room.code).emit('toast', { type: 'error', message: 'Need more players to start.' });
    return;
  }
  room.round = 0;
  nextRound(io, room);
}

export function nextRound(io: Server, room: Room) {
  room.round += 1;
  room.answers = [];
  room.votes = [];
  room.state = 'DISTRIBUTING';
  room.currentPair = roomManager.pickRandomPair(room);
  const imposter = chooseImposter(room);
  room.imposterId = imposter.id;
  emitSnapshot(io, room);

  const deadlineAt = setDeadline(room, 2);
  io.to(room.code).emit('round:phase', { state: 'DISTRIBUTING', deadlineAt });

  const timers = roomTimers.get(room.code) || {};
  clearTimeout(timers.distributing);
  timers.distributing = setTimeout(() => beginAnswering(io, room), 2000);
  roomTimers.set(room.code, timers);
}

function beginAnswering(io: Server, room: Room) {
  if (!room.currentPair) return;
  room.state = 'ANSWERING';
  const deadlineAt = setDeadline(room, room.settings.answerSeconds);

  // Send per-player private question
  for (const player of room.players) {
    const isImposter = player.id === room.imposterId;
    const yourQuestion = isImposter
      ? room.currentPair.imposterQuestion
      : room.currentPair.majorityQuestion;
    io.to(player.id).emit('round:phase', { state: 'ANSWERING', deadlineAt, yourQuestion });
  }
  // Spectators get just the phase
  for (const spec of room.spectators) {
    io.to(spec.id).emit('round:phase', { state: 'ANSWERING', deadlineAt });
  }

  emitSnapshot(io, room);

  const timers = roomTimers.get(room.code) || {};
  clearTimeout(timers.answering);
  timers.answering = setTimeout(() => revealAnswers(io, room), room.settings.answerSeconds * 1000);
  roomTimers.set(room.code, timers);
}

export function submitAnswer(io: Server, room: Room, playerId: string, text: string) {
  if (room.state !== 'ANSWERING') return;
  const isPlayer = room.players.some((p) => p.id === playerId);
  if (!isPlayer) return; // spectators cannot submit
  if (room.answers.find((a) => a.playerId === playerId)) return;
  room.answers.push({ playerId, text: text.trim().slice(0, 280) });
  emitSnapshot(io, room);
  // If all active players answered, move on
  const activePlayers = room.players.filter((p) => p.connected);
  if (room.answers.length >= activePlayers.length) {
    // Prevent the scheduled auto-reveal from firing again later
    const timers = roomTimers.get(room.code);
    if (timers?.answering) {
      clearTimeout(timers.answering);
      timers.answering = undefined;
      roomTimers.set(room.code, timers);
    }
    revealAnswers(io, room);
  }
}

function revealAnswers(io: Server, room: Room) {
  if (!room.currentPair) return;
  room.state = 'REVEAL_ANSWERS';
  const deadlineAt = setDeadline(room, 3);

  const answersWithNames = room.answers.map((a) => ({
    text: a.text,
    name: room.players.find((p) => p.id === a.playerId)?.name ?? 'Unknown',
  }));
  const anonymized = room.settings.showNamesWithAnswers
    ? answersWithNames.map((a) => `${a.name}: ${a.text}`)
    : answersWithNames.map((a) => a.text);
  const finalList = room.settings.randomizeAnswerOrder ? shuffle(anonymized) : anonymized;

  io.to(room.code).emit('round:phase', { state: 'REVEAL_ANSWERS', deadlineAt });
  io.to(room.code).emit('round:answersRevealed', { answers: finalList });
  emitSnapshot(io, room);

  const timers = roomTimers.get(room.code) || {};
  clearTimeout(timers.revealAnswers);
  // Keep answers up a bit longer for clarity
  timers.revealAnswers = setTimeout(() => beginDiscuss(io, room), 5000);
  roomTimers.set(room.code, timers);
}

// removed mid-round question reveal

function beginDiscuss(io: Server, room: Room) {
  room.state = 'DISCUSS';
  const deadlineAt = setDeadline(room, room.settings.discussSeconds);
  io.to(room.code).emit('round:phase', { state: 'DISCUSS', deadlineAt });
  emitSnapshot(io, room);

  const timers = roomTimers.get(room.code) || {};
  clearTimeout(timers.discuss);
  timers.discuss = setTimeout(() => beginVoting(io, room), room.settings.discussSeconds * 1000);
  roomTimers.set(room.code, timers);
}

function beginVoting(io: Server, room: Room) {
  room.state = 'VOTING';
  room.votes = [];
  const deadlineAt = setDeadline(room, room.settings.votingSeconds);
  io.to(room.code).emit('round:phase', { state: 'VOTING', deadlineAt });
  emitSnapshot(io, room);

  const timers = roomTimers.get(room.code) || {};
  clearTimeout(timers.voting);
  timers.voting = setTimeout(() => finishVoting(io, room), room.settings.votingSeconds * 1000);
  roomTimers.set(room.code, timers);
}

export function submitVote(io: Server, room: Room, voterId: string, targetId: string) {
  if (room.state !== 'VOTING') return;
  const isPlayer = room.players.some((p) => p.id === voterId);
  if (!isPlayer) return; // spectators cannot vote
  if (room.votes.find((v) => v.voterId === voterId)) return;
  room.votes.push({ voterId, targetId });
  emitSnapshot(io, room);

  const activePlayers = room.players.filter((p) => p.connected);
  if (room.votes.length >= activePlayers.length) finishVoting(io, room);
}

function finishVoting(io: Server, room: Room) {
  room.state = 'RESULTS';
  const tally = new Map<string, number>();
  for (const v of room.votes) {
    tally.set(v.targetId, (tally.get(v.targetId) ?? 0) + 1);
  }
  let topId: string | undefined;
  let topVotes = -1;
  for (const [id, count] of tally.entries()) {
    if (count > topVotes) {
      topVotes = count;
      topId = id;
    }
  }
  // Determine if tie exists for top count
  const numWithTop = [...tally.values()].filter((c) => c === topVotes).length;
  const imposterId = room.imposterId!;
  const majorityWon = topVotes > 0 && numWithTop === 1 && topId === imposterId;
  if (majorityWon) {
    room.scores.majority += 1; // legacy
    for (const p of room.players) {
      if (p.id !== imposterId) room.playerScores[p.id] = (room.playerScores[p.id] ?? 0) + 1;
    }
  } else {
    room.scores.imposter += 1; // legacy
    room.playerScores[imposterId] = (room.playerScores[imposterId] ?? 0) + 3;
  }

  // New order: questions -> winner -> imposter -> scoreboard (results payload)
  io.to(room.code).emit('round:phase', { state: 'RESULTS', deadlineAt: setDeadline(room, 1) });
  setTimeout(() => {
    if (room.currentPair) {
      io.to(room.code).emit('round:questionsRevealed', {
        majorityQuestion: room.currentPair.majorityQuestion,
        imposterQuestion: room.currentPair.imposterQuestion,
      });
    }
    setTimeout(() => {
      io.to(room.code).emit('toast', { type: 'info', message: majorityWon ? 'Majority wins!' : 'Imposter wins!' });
      setTimeout(() => {
        io.to(room.code).emit('toast', { type: 'info', message: 'The imposter was…' });
        setTimeout(() => {
          io.to(room.code).emit('round:results', {
            imposterId,
            votes: room.votes,
            majorityWon,
            scores: room.scores,
            playerScores: room.playerScores,
            questions: room.currentPair
              ? {
                  majorityQuestion: room.currentPair.majorityQuestion,
                  imposterQuestion: room.currentPair.imposterQuestion,
                }
              : undefined,
          });
        }, 900);
      }, 900);
    }, 800);
  }, 600);
  emitSnapshot(io, room);
}

export function updateSettings(room: Room, partial: Partial<RoomSettings>) {
  room.settings = { ...room.settings, ...partial };
}

export function resetRoomState(room: Room) {
  const timers = roomTimers.get(room.code);
  if (timers) {
    Object.values(timers).forEach((t) => t && clearTimeout(t));
    roomTimers.delete(room.code);
  }
  phaseDeadlines.delete(room.code);
}


