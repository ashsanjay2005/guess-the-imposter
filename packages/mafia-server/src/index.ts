import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { customAlphabet } from 'nanoid';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import type { MafiaSettings, RoomState } from './types';
import { addBots, accuse, advanceDayStage, autoDay, autoNight, emitState, endGame, finalizeDay, finalizeNight, markReady, resetToLobby, rescheduleDeadline, sendChat, startDay, startGame, submitDayVote, submitNightAction } from './game';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const prisma = new PrismaClient();
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);

const DEFAULT_SETTINGS: MafiaSettings = {
  minPlayers: 5,
  maxPlayers: 20,
  timers: { nightSeconds: 90, dawnSeconds: 10, daySeconds: 240 },
  selfHealAllowed: true,
  mafiaMajorityRequired: true,
  spectatorsAllowed: true,
  deadChatVisibleToAlive: false,
  tiePolicy: 'NO_LYNCH',
  roles: { mafia: 2, doctor: 1, detective: 1, villager: 0 },
};

function toPublicState(room: any): RoomState {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase as any,
    dayNumber: room.dayNumber,
    isActive: room.isActive,
    players: room.players.map((p: any) => ({ id: p.id, name: p.name, isHost: p.isHost, isAlive: p.isAlive, seat: p.seat })),
    chat: [],
    settings: parseSettings(room.settings),
    deadlineAt: undefined,
  };
}

function parseSettings(val: unknown): any {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return {}; }
  }
  return val ?? {};
}

export async function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

export async function createServer(port = 4100) {
  const app = await createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  });
  const ENABLE_DEV = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_TOOLS !== '0';

  io.on('connection', (socket) => {
    logger.info({ id: socket.id }, 'client connected');

    async function emitRoom(code: string) { await emitState(io, code); }

    // Allow non-joined visitors to see lobby players/log via a public room
    socket.on('public:subscribe', async ({ code }: { code: string }) => {
      try { socket.join(`public:${code}`); await emitRoom(code); } catch (e) { logger.error(e); }
    });

    socket.on('room:create', async ({ name }: { name: string }, cb: Function) => {
      const code = nanoid();
      const room = await prisma.room.create({ data: {
        code,
        hostId: 'placeholder',
        settings: JSON.stringify(DEFAULT_SETTINGS),
        phase: 'LOBBY',
      }});
      const player = await prisma.player.create({ data: {
        roomId: room.id,
        name: name.substring(0, 16),
        isHost: true,
        isAlive: true,
        seat: 1,
        connectionId: socket.id,
      }});
      await prisma.room.update({ where: { id: room.id }, data: { hostId: player.id } });
      socket.join(code);
      cb({ code, playerId: player.id, name: player.name });
      await emitRoom(code);
    });

    socket.on('room:join', async ({ code, name }: { code: string; name: string }, cb: Function) => {
      const room = await prisma.room.findUnique({ where: { code } });
      if (!room) return cb({ error: 'Not found' });
      // Lock seats after start if configured
      try {
        const settings = JSON.parse((room.settings as any) || '{}');
        if (room.phase !== 'LOBBY' && settings.lockAfterStart) {
          return cb({ error: 'Room is locked after start' });
        }
      } catch {}
      const count = await prisma.player.count({ where: { roomId: room.id } });
      const seat = count + 1;
      const player = await prisma.player.create({ data: {
        roomId: room.id, name: name.substring(0, 16), isAlive: true, isHost: false, seat, connectionId: socket.id,
      }});
      socket.join(code);
      cb({ ok: true, playerId: player.id, name: player.name });
      await emitRoom(code);
    });

    socket.on('disconnect', async () => {
      // Mark disconnected player lastSeen and connectionId null
      await prisma.player.updateMany({ where: { connectionId: socket.id }, data: { connectionId: null, lastSeenAt: new Date() } });
    });

    socket.on('host:start', async ({ code }: { code: string }) => {
      try { await startGame(io, code); } catch (e: any) { logger.error(e); io.to(socket.id).emit('toast', { type: 'error', message: e?.message || 'Unable to start game' }); }
    });

    socket.on('night:action', async ({ code, type, targetId }: { code: string; type: 'KILL' | 'PROTECT' | 'INVESTIGATE'; targetId: string }) => {
      try { await submitNightAction(io, code, await playerIdOf(socket.id), type, targetId); } catch (e) { logger.warn(e); }
    });

    socket.on('night:finalize', async ({ code }: { code: string }) => {
      try { await finalizeNight(io, code); } catch (e) { logger.error(e); }
    });

    socket.on('day:vote', async ({ code, nomineeId, value }: { code: string; nomineeId?: string; value: 'LYNCH' | 'NO_LYNCH' }) => {
      try { await submitDayVote(io, code, await playerIdOf(socket.id), nomineeId, value); } catch (e) { logger.warn(e); }
    });

    socket.on('day:finalize', async ({ code }: { code: string }) => {
      try { await advanceDayStage(io, code); } catch (e) { logger.error(e); }
    });

    socket.on('day:accuse', async ({ code, targetId }: { code: string; targetId?: string }) => {
      try { const me = await playerIdOf(socket.id); await accuse(io, code, me, targetId); } catch (e) { logger.error(e); }
    });

    socket.on('chat:send', async ({ code, text, channel }: { code: string; text: string; channel?: 'DAY'|'MAFIA'|'GHOST' }) => {
      try { await sendChat(io, code, socket.id, text, channel); } catch (e) { logger.error(e); io.to(socket.id).emit('toast', { type: 'error', message: 'Chat failed' }); }
    });

    // Lobby-only name change
    socket.on('player:updateName', async ({ name }: { name: string }) => {
      try {
        const player = await prisma.player.findFirst({ where: { connectionId: socket.id } });
        if (!player) return;
        const room = await prisma.room.findUnique({ where: { id: player.roomId } });
        if (!room) return;
        if (room.phase !== 'LOBBY') { io.to(socket.id).emit('toast', { type: 'error', message: 'Names can only be changed in the lobby' }); return; }
        const clean = (name || '').trim().slice(0, 16);
        if (clean.length < 2) { io.to(socket.id).emit('toast', { type: 'error', message: 'Name must be 2–16 chars' }); return; }
        await prisma.player.update({ where: { id: player.id }, data: { name: clean } });
        await emitRoom(room.code);
        io.to(socket.id).emit('toast', { type: 'success', message: 'Name updated' });
      } catch (e) { logger.error(e); }
    });

    // Host controls
    socket.on('host:forcePhase', async ({ code }: { code: string }) => {
      try {
        const room = await prisma.room.findUnique({ where: { code } });
        if (!room) return;
        if (room.phase === 'NIGHT') await finalizeNight(io, code);
        else if (room.phase === 'DAWN') await startDay(io, code);
        else if (room.phase === 'DAY') await advanceDayStage(io, code);
      } catch (e) { logger.error(e); }
    });

    socket.on('host:replaceWithBot', async ({ code }: { code: string }) => {
      try {
        const room = await prisma.room.findUnique({ where: { code } });
        if (!room) return;
        const count = await prisma.player.count({ where: { roomId: room.id } });
        await prisma.player.create({ data: { roomId: room.id, name: `Bot${Math.floor(Math.random()*1000)}`, isAlive: true, isHost: false, seat: count + 1 } });
        await emitRoom(code);
      } catch (e) { logger.error(e); }
    });

    if (ENABLE_DEV) {
      socket.on('dev:addBots', async ({ code, n }: { code: string; n: number }) => {
        try { await addBots(code, Math.max(1, Math.min(19, n || 1))); await emitRoom(code); } catch (e) { logger.error(e); }
      });
      socket.on('dev:start', async ({ code }: { code: string }) => {
        try { await startGame(io, code); } catch (e) { logger.error(e); }
      });
      socket.on('dev:autoNight', async ({ code }: { code: string }) => {
        try { await autoNight(io, code); } catch (e) { logger.error(e); }
      });
      socket.on('dev:autoDay', async ({ code }: { code: string }) => {
        try { await autoDay(io, code); } catch (e) { logger.error(e); }
      });
    }

    // Host settings update
    socket.on('host:updateSettings', async ({ code, patch }: { code: string; patch: any }) => {
      try {
        const room = await prisma.room.findUnique({ where: { code } });
        if (!room) return;
        const current = (() => { try { return JSON.parse((room.settings as any) || '{}'); } catch { return {}; } })();
        const next = { ...current, ...patch };
        await prisma.room.update({ where: { id: room.id }, data: { settings: JSON.stringify(next) } });
        await emitRoom(code);
        await rescheduleDeadline(io, code);
      } catch (e) { logger.error(e); }
    });

    // Game end controls
    socket.on('game:ready', async ({ code }: { code: string }) => {
      try { await markReady(io, code, await playerIdOf(socket.id)); } catch (e) { logger.error(e); }
    });
    socket.on('game:toLobby', async ({ code }: { code: string }) => {
      try { const me = await playerIdOf(socket.id); const room = await prisma.room.findUnique({ where: { code } }); if (!room || room.hostId !== me) return; await resetToLobby(io, code); } catch (e) { logger.error(e); }
    });
  });

  await server.listen(port);
  logger.info({ port }, 'mafia server listening');
  return { app, server, io };
}

async function playerIdOf(connectionId: string): Promise<string> {
  const p = await prisma.player.findFirst({ where: { connectionId } });
  if (!p) throw new Error('not joined');
  return p.id;
}

if (process.env.NODE_ENV !== 'test') {
  createServer().catch((e) => { logger.error(e); process.exit(1); });
}


