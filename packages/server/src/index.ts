import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { z } from 'zod';
import { roomManager } from './roomManager';
import type { Room } from './types';
import {
  nextRound,
  resetRoomState,
  startGame,
  submitAnswer,
  submitVote,
  updateSettings,
} from './stateMachine';

export function createApp() {
  const app = express();
  app.use(cors());
  app.get('/', (_req, res) => {
    res.json({ ok: true, service: 'Guess the Imposter server' });
  });
  return app;
}

export function createServer(port = 4000) {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
    },
  });

  io.on('connection', (socket) => {
    // Helper to emit snapshot
    const emitSnapshot = (room: Room) => io.to(room.code).emit('room:update', {
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
    });

    socket.on('disconnect', () => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;
      roomManager.leave(socket.id);
      emitSnapshot(room);
      // Cleanup if empty
      roomManager.removeDisconnectedSpectators(room);
      roomManager.destroyIfEmpty(room);
    });

    socket.on('room:create', (payload: { name: string }, cb: Function) => {
      const schema = z.object({ name: z.string().min(2).max(16) });
      const { name } = schema.parse(payload);
      const sessionId = (socket.handshake.headers['x-session-id'] as string) || socket.id;
      const room = roomManager.createRoom(name, socket.id, sessionId);
      socket.join(room.code);
      cb({ code: room.code, player: room.players[0] });
      emitSnapshot(room);
    });

    socket.on('room:join', (payload: { code: string; name: string }, cb: Function) => {
      const schema = z.object({ code: z.string().length(6), name: z.string().min(2).max(16) });
      const { code, name } = schema.parse(payload);
      const sessionId = (socket.handshake.headers['x-session-id'] as string) || socket.id;
      const { room, player, error } = roomManager.joinRoom(
        code.toUpperCase(),
        name,
        socket.id,
        sessionId,
      );
      if (error || !room || !player) {
        cb({ error: error ?? 'Unable to join' });
        return;
      }
      socket.join(room.code);
      cb({ roomSnapshot: {
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
      }, player });
      emitSnapshot(room);
    });

    socket.on('room:leave', () => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;
      roomManager.leave(socket.id);
      socket.leave(room.code);
      emitSnapshot(room);
    });

    socket.on('host:start', () => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;
      if (room.hostId !== socket.id) {
        socket.emit('toast', { type: 'error', message: 'Only host can start the game.' });
        return;
      }
      resetRoomState(room);
      startGame(io, room);
    });

    socket.on('host:nextRound', () => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;
      if (room.hostId !== socket.id) {
        socket.emit('toast', { type: 'error', message: 'Only host can start next round.' });
        return;
      }
      nextRound(io, room);
    });

    socket.on('host:updateSettings', (partial: Partial<Room['settings']>) => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;
      if (room.hostId !== socket.id) return;
      updateSettings(room, partial);
      io.to(room.code).emit('toast', { type: 'success', message: 'Settings updated' });
      io.to(room.code).emit('room:update', {
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
      });
    });

    socket.on('host:upsertQuestionPair', (pair, cb: Function) => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;
      if (room.hostId !== socket.id) return;
      const idx = room.questionBank.findIndex((p) => p.id === pair.id);
      if (idx >= 0) room.questionBank[idx] = pair;
      else room.questionBank.push(pair);
      io.to(room.code).emit('room:update', {
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
      });
      cb?.({ ok: true });
    });

    socket.on('host:deleteQuestionPair', ({ id }: { id: string }, cb: Function) => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;
      if (room.hostId !== socket.id) return;
      room.questionBank = room.questionBank.filter((p) => p.id !== id);
      io.to(room.code).emit('room:update', {
        code: room.code,
        hostId: room.hostId,
        players: room.players,
        spectators: room.spectators,
        state: room.state,
        round: room.round,
        scores: room.scores,
        answers: room.answers,
        votes: room.votes,
        settings: room.settings,
        questionBank: room.questionBank,
      });
      cb?.({ ok: true });
    });

    socket.on('round:answer', ({ text }: { text: string }) => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;
      submitAnswer(io, room, socket.id, text);
      io.to(socket.id).emit('toast', { type: 'success', message: 'Answer submitted' });
    });

    socket.on('round:vote', ({ targetId }: { targetId: string }) => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;
      submitVote(io, room, socket.id, targetId);
      io.to(socket.id).emit('toast', { type: 'success', message: 'Vote received' });
    });

    socket.on('player:updateName', ({ name }: { name: string }) => {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room) return;
      const parsed = z.string().min(2).max(16).safeParse(name);
      if (!parsed.success) {
        io.to(socket.id).emit('toast', { type: 'error', message: 'Name must be 2–16 chars' });
        return;
      }
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;
      player.name = parsed.data;
      io.to(room.code).emit('room:update', {
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
      });
      io.to(socket.id).emit('toast', { type: 'success', message: 'Name updated' });
    });
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on http://localhost:${port}`);
  });

  return { app, server, io };
}

if (process.env.NODE_ENV !== 'test') {
  createServer(4000);
}


