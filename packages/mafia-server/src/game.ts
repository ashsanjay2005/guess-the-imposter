import { PrismaClient } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { customAlphabet } from 'nanoid';
import pino from 'pino';
import { resolveDay, resolveNight } from './engine';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const prisma = new PrismaClient();
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

type Pending = {
  actions: Map<string, { type: 'INVESTIGATE' | 'PROTECT' | 'KILL' | 'BLOCK'; targetId?: string }>;
  votes: Map<string, { nomineeId?: string; value: 'LYNCH' | 'NO_LYNCH' }>;
  deadline?: NodeJS.Timeout;
  deadlineAt?: number;
  expectedActors?: Set<string>;
  stage?: 'NIGHT' | 'DAY_DISCUSSION' | 'DAY_DEFENSE' | 'DAY_VOTING';
  accusers?: Map<string, Set<string>>; // nomineeId -> voterIds
  nomineeId?: string;
  nominees?: string[];
  investigations?: { actorId: string; targetId: string; isMafia: boolean }[];
  accuserOf?: Map<string, string>; // accuserId -> targetKey ('playerId' or 'NO_NOMINEE')
};

const roomPending = new Map<string, Pending>(); // key is room code
const roomChats = new Map<string, { id: string; name: string; text: string; ts: number; channel: 'DAY' | 'MAFIA' | 'GHOST' }[]>();
const roomReady = new Map<string, Set<string>>(); // code -> ready playerIds

// Utility to fetch room by code
async function getRoomByCode(code: string) {
  return prisma.room.findUnique({ where: { code } });
}

export async function emitState(io: Server, code: string) {
  const room = await prisma.room.findUnique({ where: { code }, include: { players: true } });
  if (!room) return;
  const pending = roomPending.get(code) || {};
  const settingsState = parseSettings(room.settings);
  const logs = await prisma.eventLog.findMany({
    where: { roomId: room.id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  io.to(code).emit('room:update', {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    dayNumber: room.dayNumber,
    isActive: room.isActive,
    players: room.players.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost, isAlive: p.isAlive, seat: p.seat })),
    chat: [],
    settings: parseSettings(room.settings),
    stage: pending.stage ?? (room.phase === 'NIGHT' ? 'NIGHT' : 'DAY_DISCUSSION'),
    nomineeId: pending.nomineeId,
    nominees: pending.nominees,
    deadlineAt: settingsState.manualMode ? undefined : pending.deadlineAt,
    voteTally: (pending as any).tally ?? {},
    noLynchCount: (pending as any).noLynch ?? 0,
    log: logs.map((l) => ({ id: l.id, ts: l.createdAt.getTime(), phase: l.phase, message: l.message, meta: l.meta ? JSON.parse(l.meta as any) : undefined })),
    votesList: Array.from((pending as any).votes?.entries?.() ?? []).map(([voterId, v]: any) => ({ voterId, nomineeId: v.nomineeId, value: v.value })),
    meIsDead: undefined,
  });
  // Also push current chats so new joiners see history
  await broadcastChats(io, code);
  // Broadcast public snapshot for spectators (no secret info in payload)
  io.to(`public:${code}`).emit('room:updatePublic', {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    dayNumber: room.dayNumber,
    isActive: room.isActive,
    players: room.players.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost, isAlive: p.isAlive, seat: p.seat })),
    chat: [],
    settings: parseSettings(room.settings),
    stage: pending.stage ?? (room.phase === 'NIGHT' ? 'NIGHT' : 'DAY_DISCUSSION'),
    nomineeId: pending.nomineeId,
    nominees: pending.nominees,
    deadlineAt: settingsState.manualMode ? undefined : pending.deadlineAt,
    voteTally: (pending as any).tally ?? {},
    noLynchCount: (pending as any).noLynch ?? 0,
    log: logs.map((l) => ({ id: l.id, ts: l.createdAt.getTime(), phase: l.phase, message: l.message, meta: l.meta ? JSON.parse(l.meta as any) : undefined })),
    votesList: Array.from((pending as any).votes?.entries?.() ?? []).map(([voterId, v]: any) => ({ voterId, nomineeId: v.nomineeId, value: v.value })),
  });
}

function parseSettings(val: unknown): any {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return {}; }
  }
  return val ?? {};
}

export async function assignRoles(code: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) throw new Error('room not found');
  const settings: any = parseSettings(room.settings);
  const players = await prisma.player.findMany({ where: { roomId: room.id }, orderBy: { seat: 'asc' } });
  const total = players.length;
  if (total < settings.minPlayers || total > settings.maxPlayers) throw new Error('player count invalid');
  const rolesCfg = settings.roles || { mafia: 2, doctor: 1, detective: 1 };
  const mafiaCount = Math.max(0, Math.floor(rolesCfg.mafia ?? 0));
  const doctorCount = Math.max(0, Math.floor(rolesCfg.doctor ?? 0));
  const detectiveCount = Math.max(0, Math.floor(rolesCfg.detective ?? 0));
  const maxMafiaAllowed = Math.floor((total - 1) / 2); // disallow majority mafia
  if (mafiaCount > maxMafiaAllowed) throw new Error(`Too many mafia for ${total} players (max ${maxMafiaAllowed}).`);
  if (mafiaCount + doctorCount + detectiveCount > total) throw new Error('Role counts exceed number of players.');

  // Clear existing roles
  await prisma.role.deleteMany({ where: { roomId: room.id } });

  const picks: { playerId: string; roleType: string; alignment: string }[] = [];
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  let idx = 0;
  const pushN = (n: number, roleType: string, alignment: string) => {
    for (let i = 0; i < n; i += 1) {
      if (idx >= shuffled.length) return;
      picks.push({ playerId: shuffled[idx++].id, roleType, alignment });
    }
  };

  pushN(mafiaCount, 'MAFIA', 'MAFIA');
  pushN(doctorCount, 'DOCTOR', 'TOWN');
  pushN(detectiveCount, 'DETECTIVE', 'TOWN');
  // Remainder villagers
  while (idx < shuffled.length) picks.push({ playerId: shuffled[idx++].id, roleType: 'VILLAGER', alignment: 'TOWN' });

  await prisma.$transaction([
    ...picks.map((p) => prisma.role.create({ data: { roomId: room.id, playerId: p.playerId, roleType: p.roleType, alignment: p.alignment } })),
  ]);
}

export async function startGame(io: Server, code: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) throw new Error('not found');
  await assignRoles(code);
  await prisma.room.update({ where: { id: room.id }, data: { phase: 'NIGHT', dayNumber: 1 } });
  await prisma.eventLog.create({ data: { roomId: room.id, phase: 'NIGHT', message: 'Night 1 begins' } });

  // Send private role notices
  const roles = await prisma.role.findMany({ where: { roomId: room.id } });
  const mafiaPlayers = roles.filter((r) => r.roleType === 'MAFIA').map((r) => r.playerId!);
  for (const r of roles) {
    io.to(await connectionOf(r.playerId!)).emit('you:role', { roleType: r.roleType, alignment: r.alignment, mafiaIds: r.roleType === 'MAFIA' ? mafiaPlayers : undefined });
  }
  await emitState(io, code);
  await promptNight(io, code);
}

async function connectionOf(playerId: string): Promise<string> {
  const p = await prisma.player.findUnique({ where: { id: playerId } });
  return p?.connectionId ?? '';
}

export async function promptNight(io: Server, code: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return;
  const roles = await prisma.role.findMany({ where: { roomId: room.id }, include: { player: true } });
  const settings: any = parseSettings(room.settings);
  const expected = new Set<string>();
  for (const r of roles) {
    if (!r.player?.isAlive) continue;
    if (r.roleType === 'MAFIA' || r.roleType === 'DOCTOR' || r.roleType === 'DETECTIVE') expected.add(r.playerId!);
  }
  roomPending.set(code, { actions: new Map(), votes: new Map(), expectedActors: expected, stage: 'NIGHT' });

  for (const r of roles) {
    if (!r.player?.isAlive) continue;
    if (r.roleType === 'MAFIA' || r.roleType === 'DOCTOR' || r.roleType === 'DETECTIVE') {
      // Send prompt with valid targets (alive others; doctor may self per toggle)
      const all = await prisma.player.findMany({ where: { roomId: room.id, isAlive: true } });
      const allowSelf = r.roleType === 'DOCTOR' ? settings.selfHealAllowed : false;
      const targets = all.map((p) => p.id).filter((id) => allowSelf || id !== r.playerId);
      io.to(await connectionOf(r.playerId!)).emit('phase:prompt', { phase: 'NIGHT', actions: [{ type: r.roleType === 'MAFIA' ? 'KILL' : r.roleType === 'DOCTOR' ? 'PROTECT' : 'INVESTIGATE', targets }] });
    }
  }

  // Auto-advance timer unless manual mode
  const p = roomPending.get(code)!;
  if (!settings.manualMode) {
    const t = setTimeout(() => finalizeNight(io, code).catch((e) => logger.error(e)), (settings.timers?.nightSeconds ?? 90) * 1000);
    p.deadline = t;
    p.deadlineAt = Date.now() + 1000 * (settings.timers?.nightSeconds ?? 90);
  } else {
    if (p.deadline) clearTimeout(p.deadline);
    p.deadline = undefined;
    p.deadlineAt = undefined;
  }
  await emitState(io, code);
}

export async function submitNightAction(io: Server, code: string, actorId: string, type: 'KILL' | 'PROTECT' | 'INVESTIGATE', targetId: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) throw new Error('room not found');
  const actor = await prisma.player.findUnique({ where: { id: actorId } });
  if (!actor || actor.roomId !== room.id || !actor.isAlive) throw new Error('invalid actor');
  const role = await prisma.role.findUnique({ where: { playerId: actorId } });
  if (!role) throw new Error('no role');
  if (room.phase !== 'NIGHT') throw new Error('not night');
  // Server-side validation for who can perform which action
  if (type === 'KILL' && role.roleType !== 'MAFIA') throw new Error('illegal');
  if (type === 'PROTECT' && role.roleType !== 'DOCTOR') throw new Error('illegal');
  if (type === 'INVESTIGATE' && role.roleType !== 'DETECTIVE') throw new Error('illegal');
  const pending = roomPending.get(code) || { actions: new Map(), votes: new Map() };
  pending.actions.set(actorId, { type, targetId });
  roomPending.set(code, pending);
  // Ensure expected actors are known; if missing, recompute from current living roles
  if (!pending.expectedActors || pending.expectedActors.size === 0) {
    const roles = await prisma.role.findMany({ where: { roomId: room.id }, include: { player: true } });
    const expected = new Set<string>();
    for (const r of roles) {
      if (!r.player?.isAlive) continue;
      if (r.roleType === 'MAFIA' || r.roleType === 'DOCTOR' || r.roleType === 'DETECTIVE') expected.add(r.playerId!);
    }
    pending.expectedActors = expected;
  }
  // Auto-advance if all expected actors have submitted at least one action
  const exp = pending.expectedActors ?? new Set<string>();
  const done = new Set<string>(Array.from(pending.actions.keys()));
  let allIn = true;
  for (const id of exp) if (!done.has(id)) { allIn = false; break; }
  const settings = parseSettings((await prisma.room.findUnique({ where: { code } }))?.settings);
  if (allIn) {
    // finalize quickly after a short debounce to allow last-second changes
    setTimeout(() => finalizeNight(io, code).catch(() => {}), 250);
  }
}

export async function finalizeNight(io: Server, code: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return;
  const settings: any = room.settings as any;
  const parsedSettings = parseSettings(settings);
  const roles = await prisma.role.findMany({ where: { roomId: room.id }, include: { player: true } });
  const pending = roomPending.get(code) || { actions: new Map(), votes: new Map() };

  const context = {
    roles: Object.fromEntries(roles.map((r) => [r.playerId!, { roleType: r.roleType, alignment: r.alignment, isAlive: r.player!.isAlive, isRevealed: r.isRevealed }])),
    settings: parsedSettings,
    phase: 'NIGHT' as const,
    dayNumber: room.dayNumber,
  };
  const actions = Array.from(pending.actions.entries()).map(([actorId, a]) => ({ type: a.type, actorId, targetId: a.targetId! } as any));
  const result = resolveNight(context as any, actions);
  const investigations = result.investigations;
  // persist engine logs
  if (result.logEntries.length) {
    for (const entry of result.logEntries) {
      await prisma.eventLog.create({ data: { roomId: room.id, phase: 'NIGHT', message: entry.message, meta: JSON.stringify(entry.meta ?? {}) } });
    }
  }

  // Apply deaths
  await prisma.$transaction(async (tx) => {
    for (const d of result.deaths) {
      await tx.player.update({ where: { id: d }, data: { isAlive: false } });
    }
    await tx.eventLog.create({ data: { roomId: room.id, phase: 'DAWN', message: result.deaths.length ? `Dawn: ${result.deaths.length} death(s)` : 'Dawn: No one died', meta: JSON.stringify({ deaths: result.deaths }) } });
    await tx.room.update({ where: { id: room.id }, data: { phase: 'DAWN' } });
  });

  // Send private "you died" notices
  for (const d of result.deaths) {
    try {
      io.to(await connectionOf(d)).emit('you:died', { at: 'DAWN', dayNumber: room.dayNumber });
    } catch {}
  }

  // Preserve investigations for delivery at start of Day
  const nextPending: Pending = { actions: new Map(), votes: new Map(), stage: 'DAY_DISCUSSION', investigations };
  roomPending.set(code, nextPending);

  // Check win after night resolution (e.g., mafia majority or all mafia dead)
  const winner = await checkWin(code);
  if (winner) { await endGame(io, code, winner); return; }

  await emitState(io, code);

  // Dawn window: allow chat before day starts
  if (parsedSettings.manualMode) {
    return; // host will advance via force button
  }
  setTimeout(async () => {
    await startDay(io, code);
  }, Math.max(2, (parsedSettings.timers?.dawnSeconds ?? 10)) * 1000);
}

// Advance from DAWN -> DAY and deliver detective results
export async function startDay(io: Server, code: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return;
  if (room.phase !== 'DAWN') return; // only valid from DAWN
  await prisma.room.update({ where: { id: room.id }, data: { phase: 'DAY' } });
  await prisma.eventLog.create({ data: { roomId: room.id, phase: 'DAY', message: `Day ${room.dayNumber} begins` } });
  const p = roomPending.get(code) || { actions: new Map(), votes: new Map() };
  const investigations = p.investigations || [];
  for (const inv of investigations) {
    try {
      const target = await prisma.player.findUnique({ where: { id: inv.targetId } });
      if (target) io.to(await connectionOf(inv.actorId)).emit('investigation:result', { targetId: inv.targetId, targetName: target.name, isMafia: inv.isMafia });
    } catch { /* ignore send errors */ }
  }
  roomPending.set(code, { actions: new Map(), votes: new Map(), stage: 'DAY_DISCUSSION' });
  await emitState(io, code);
}

export async function submitDayVote(io: Server, code: string, voterId: string, nomineeId: string | undefined, value: 'LYNCH' | 'NO_LYNCH') {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) throw new Error('room not found');
  const voter = await prisma.player.findUnique({ where: { id: voterId } });
  if (!voter || voter.roomId !== room.id || !voter.isAlive) throw new Error('invalid voter');
  const pending = roomPending.get(code) || { actions: new Map(), votes: new Map() };
  pending.votes.set(voterId, { nomineeId, value });
  roomPending.set(code, pending);
  // recompute live tally
  const tally = new Map<string, number>();
  let noLynch = 0;
  for (const [, v] of pending.votes) {
    if (v.value === 'NO_LYNCH') noLynch += 1; else if (v.nomineeId) tally.set(v.nomineeId, (tally.get(v.nomineeId) || 0) + 1);
  }
  (pending as any).tally = Object.fromEntries(tally);
  (pending as any).noLynch = noLynch;
  await emitState(io, code);
  // In manual mode, end voting as soon as all living have voted
  const settings = parseSettings(room.settings);
  const alive = await prisma.player.count({ where: { roomId: room.id, isAlive: true } });
  if (settings.manualMode) {
    if (pending.votes.size >= alive) {
      setTimeout(() => finalizeDay(io, code).catch(() => {}), 250);
    }
  } else {
    // Auto mode: if all votes are in early, skip the timer and finalize immediately
    if (pending.votes.size >= alive) {
      if (pending.deadline) clearTimeout(pending.deadline);
      setTimeout(() => finalizeDay(io, code).catch(() => {}), 250);
    }
  }
}

export async function finalizeDay(io: Server, code: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return;
  const roles = await prisma.role.findMany({ where: { roomId: room.id }, include: { player: true } });
  const settings: any = parseSettings(room.settings);
  const pending = roomPending.get(code) || { actions: new Map(), votes: new Map() };
  const context = {
    roles: Object.fromEntries(roles.map((r) => [r.playerId!, { roleType: r.roleType, alignment: r.alignment, isAlive: r.player!.isAlive, isRevealed: r.isRevealed }])),
    settings,
    phase: 'DAY' as const,
    dayNumber: room.dayNumber,
  };
  const votes = Array.from(pending.votes.entries()).map(([voterId, v]) => ({ voterId, nomineeId: v.nomineeId, value: v.value }));
  const result = resolveDay(context as any, votes as any);

  await prisma.$transaction(async (tx) => {
    for (const d of result.deaths) {
      await tx.player.update({ where: { id: d }, data: { isAlive: false } });
    }
    if (result.deaths.length) {
      const lynchedId = result.deaths[0];
      const role = await tx.role.findFirst({ where: { roomId: room.id, playerId: lynchedId } });
      const player = await tx.player.findUnique({ where: { id: lynchedId } });
      await tx.eventLog.create({ data: { roomId: room.id, phase: 'DAY', message: `Lynched ${player?.name ?? 'a player'} (${role?.roleType ?? 'UNKNOWN'}, ${role?.alignment ?? ''})`, meta: JSON.stringify({ lynched: lynchedId, roleType: role?.roleType, alignment: role?.alignment }) } });
    } else {
      await tx.eventLog.create({ data: { roomId: room.id, phase: 'DAY', message: 'No lynch', meta: JSON.stringify({ lynched: [] }) } });
    }
    // advance day/night
    await tx.room.update({ where: { id: room.id }, data: { phase: 'NIGHT', dayNumber: room.dayNumber + 1 } });
  });

  // Send private "you died" notices for any day deaths
  for (const d of result.deaths) {
    try {
      io.to(await connectionOf(d)).emit('you:died', { at: 'DAY', dayNumber: room.dayNumber });
    } catch {}
  }

  // Emit big lynch banner
  const lynchedId = result.deaths[0];
  if (lynchedId) {
    const role = await prisma.role.findFirst({ where: { roomId: room.id, playerId: lynchedId } });
    const player = await prisma.player.findUnique({ where: { id: lynchedId } });
    io.to(code).emit('day:lynchResult', { lynchedId, lynchedName: player?.name, roleType: role?.roleType, alignment: role?.alignment });
  } else {
    io.to(code).emit('day:lynchResult', { lynchedId: null });
  }

  await emitState(io, code);
  // Check win after lynch
  const winner = await checkWin(code);
  if (winner) { await endGame(io, code, winner); return; }
  await promptNight(io, code);
}

export async function checkWin(code: string): Promise<'TOWN' | 'MAFIA' | null> {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return null;
  const roles = await prisma.role.findMany({ where: { roomId: room.id }, include: { player: true } });
  const alive = roles.filter((r) => r.player?.isAlive);
  const mafiaAlive = alive.filter((r) => r.alignment === 'MAFIA').length;
  const townAlive = alive.filter((r) => r.alignment === 'TOWN').length;
  if (mafiaAlive === 0) return 'TOWN';
  // Mafia must have a strict majority to win; ties continue
  if (mafiaAlive > townAlive) return 'MAFIA';
  return null;
}

// ========== DAY: Nomination & Voting ===========
export async function accuse(io: Server, code: string, accuserId: string, targetId?: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return;
  const accuser = await prisma.player.findUnique({ where: { id: accuserId } });
  if (!accuser || accuser.roomId !== room.id || !accuser.isAlive) return; // dead or invalid cannot accuse
  const players = await prisma.player.findMany({ where: { roomId: room.id, isAlive: true } });
  const majority = Math.floor(players.length / 2) + 1;
  const pending = roomPending.get(code) || { actions: new Map(), votes: new Map() };
  if (pending.stage && pending.stage !== 'DAY_DISCUSSION') return; // only during discussion
  pending.stage = 'DAY_DISCUSSION';
  if (!pending.accusers) pending.accusers = new Map();
  if (!pending.accuserOf) pending.accuserOf = new Map();
  const key = targetId || 'NO_NOMINEE';
  const settings = parseSettings(room.settings);
  const previousKey = pending.accuserOf.get(accuserId);
  if (previousKey) {
    if (settings.manualMode) {
      // In manual mode, only one accusation allowed
      const conn = await connectionOf(accuserId);
      try { io.to(conn).emit('toast', { type: 'error', message: 'You can only accuse once in manual mode' }); } catch {}
      roomPending.set(code, pending); await emitState(io, code); return;
    }
    // Auto mode: allow changing accusation; remove from previous set
    const prevSet = pending.accusers.get(previousKey);
    if (prevSet) prevSet.delete(accuserId);
    // Do not spam logs on changes
  } else {
    // First accusation → create one concise log
    await prisma.eventLog.create({ data: { roomId: room.id, phase: 'DAY', message: targetId ? `Accusation on player` : `Motion: No nominee`, meta: JSON.stringify({ targetId }) } });
  }
  // Add to new target set
  const set = pending.accusers.get(key) ?? new Set<string>();
  set.add(accuserId);
  pending.accusers.set(key, set);
  pending.accuserOf.set(accuserId, key);
  const totalLiving = players.length;
  const uniqueAccusers = new Set<string>(pending.accuserOf.keys());
  // Non-manual: start a discussion window allowing changes, then compute nominees
  if (!settings.manualMode) {
    if (!pending.deadline) {
      const ms = 1000 * (settings.timers?.defenseSeconds ?? 20);
      pending.deadlineAt = Date.now() + ms;
      pending.deadline = setTimeout(async () => {
        const p2 = roomPending.get(code) || pending;
        // compute nominees at timeout
        const counts: [string, number][] = [];
        for (const [k, voters] of (p2.accusers ?? new Map()).entries()) { if (k === 'NO_NOMINEE') continue; counts.push([k, voters.size]); }
        counts.sort((a, b) => b[1] - a[1]);
        const top = counts[0]?.[1] ?? 0;
        const nominees = counts.filter((c) => c[1] === top).map((c) => c[0]);
        p2.nomineeId = nominees.length === 1 ? nominees[0] : undefined;
        p2.nominees = nominees;
        p2.stage = 'DAY_DEFENSE';
        p2.deadline = undefined;
        p2.deadlineAt = undefined;
        roomPending.set(code, p2);
        await emitState(io, code);
        // start voting or wait for host in manual? here auto → schedule startVoting after defense timer
        const ms2 = 1000 * (settings.timers?.defenseSeconds ?? 20);
        p2.deadlineAt = Date.now() + ms2;
        p2.deadline = setTimeout(async () => { await startVoting(io, code); }, ms2);
      }, ms);
    }
  }
  // Manual: wait for everyone to accuse or abstain
  if (settings.manualMode && uniqueAccusers.size >= totalLiving) {
    // Compute top accused counts excluding NO_NOMINEE
    const counts: [string, number][] = [];
    for (const [k, voters] of pending.accusers.entries()) {
      if (k === 'NO_NOMINEE') continue;
      counts.push([k, voters.size]);
    }
    counts.sort((a, b) => b[1] - a[1]);
    const top = counts[0]?.[1] ?? 0;
    const nominees = counts.filter((c) => c[1] === top).map((c) => c[0]);
    if (nominees.length === 0) {
      // no clear nominees → finalize day as no lynch
      pending.nomineeId = undefined;
      pending.nominees = [];
      roomPending.set(code, pending);
      await emitState(io, code);
      await finalizeDay(io, code);
      return;
    }
    // Move to defense with one or multiple nominees; voting will pick one or no-lynch
    pending.nomineeId = nominees.length === 1 ? nominees[0] : undefined;
    pending.nominees = nominees;
    pending.stage = 'DAY_DEFENSE';
    const settings = parseSettings(room.settings);
    if (pending.deadline) clearTimeout(pending.deadline);
    if (!settings.manualMode) {
      const ms = 1000 * (settings.timers?.defenseSeconds ?? 20);
      pending.deadlineAt = Date.now() + ms;
      pending.deadline = setTimeout(async () => { await startVoting(io, code); }, ms);
    } else {
      pending.deadline = undefined;
      pending.deadlineAt = undefined;
    }
  }
  roomPending.set(code, pending);
  await emitState(io, code);
}

async function startVoting(io: Server, code: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return;
  const pending = roomPending.get(code) || { actions: new Map(), votes: new Map() };
  pending.stage = 'DAY_VOTING';
  pending.votes = new Map();
  // When multiple nominees, votes decide between them; no change needed here because UI
  const settings = parseSettings(room.settings);
  if (!settings.manualMode) {
    const ms = 1000 * (settings.timers?.voteSeconds ?? 30);
    if (pending.deadline) clearTimeout(pending.deadline);
    pending.deadlineAt = Date.now() + ms;
    pending.deadline = setTimeout(async () => {
      await finalizeDay(io, code);
    }, ms);
  } else {
    if (pending.deadline) clearTimeout(pending.deadline);
    pending.deadline = undefined;
    pending.deadlineAt = undefined;
  }
  roomPending.set(code, pending);
  await emitState(io, code);
}

// Advance DAY sub-stages for manual mode or host-forced progression
export async function advanceDayStage(io: Server, code: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return;
  if (room.phase !== 'DAY') return;
  const pending = roomPending.get(code) || { actions: new Map(), votes: new Map(), stage: 'DAY_DISCUSSION' } as Pending;
  if (pending.stage === 'DAY_DEFENSE') {
    await startVoting(io, code);
  } else if (pending.stage === 'DAY_VOTING') {
    await finalizeDay(io, code);
  }
}

// ========== Chat ==========
export async function sendChat(io: Server, code: string, senderConnectionId: string, text: string, channelOpt?: 'DAY' | 'MAFIA' | 'GHOST') {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room || !text.trim()) return;
  const player = await prisma.player.findFirst({ where: { roomId: room.id, connectionId: senderConnectionId } });
  if (!player) return;
  const roles = await prisma.role.findMany({ where: { roomId: room.id } });
  const myRole = roles.find((r) => r.playerId === player.id);
  const isMafia = myRole?.roleType === 'MAFIA' && myRole?.alignment === 'MAFIA';
  let channel: 'DAY' | 'MAFIA' | 'GHOST' = 'DAY';
  if (!player.isAlive) channel = 'GHOST';
  else if (channelOpt === 'MAFIA') channel = isMafia ? 'MAFIA' : 'DAY';
  else channel = 'DAY';
  if (!player.isAlive && channel !== 'GHOST') channel = 'GHOST';
  const list = roomChats.get(code) ?? [];
  const msg = { id: nanoid(), name: player.name, text: text.slice(0, 300), ts: Date.now(), channel } as const;
  list.push(msg);
  roomChats.set(code, list);
  await broadcastChats(io, code);
}

// Reschedule current phase deadline when timers change
export async function rescheduleDeadline(io: Server, code: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return;
  const p = roomPending.get(code);
  const settings: any = parseSettings(room.settings);
  if (!p) return;
  if (p.deadline) clearTimeout(p.deadline);
  if (settings.manualMode) { p.deadline = undefined; p.deadlineAt = undefined; await emitState(io, code); return; }
  let seconds = 0;
  if (room.phase === 'NIGHT') seconds = settings.timers?.nightSeconds ?? 90;
  else if (p.stage === 'DAY_DEFENSE') seconds = settings.timers?.defenseSeconds ?? 20;
  else if (p.stage === 'DAY_VOTING') seconds = settings.timers?.voteSeconds ?? 30;
  if (seconds > 0) {
    p.deadlineAt = Date.now() + seconds * 1000;
    p.deadline = setTimeout(async () => {
      if (room.phase === 'NIGHT') await finalizeNight(io, code);
      else if (p.stage === 'DAY_DEFENSE') await startVoting(io, code);
      else if (p.stage === 'DAY_VOTING') await finalizeDay(io, code);
    }, seconds * 1000);
  }
  roomPending.set(code, p);
  await emitState(io, code);
}

async function broadcastChats(io: Server, code: string) {
  const list = roomChats.get(code) ?? [];
  const sockets = io.sockets.adapter.rooms.get(code);
  if (!sockets) return;
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return;
  for (const socketId of sockets) {
    const player = await prisma.player.findFirst({ where: { roomId: room.id, connectionId: socketId } });
    if (!player) continue;
    const role = await prisma.role.findFirst({ where: { roomId: room.id, playerId: player.id } });
    const isMafia = role?.roleType === 'MAFIA' && role?.alignment === 'MAFIA';
    const visible = room.phase === 'ENDED'
      ? list // reveal all chats after game ends
      : list.filter((m) => {
          if (m.channel === 'DAY') return true;
          if (m.channel === 'MAFIA') return isMafia;
          if (m.channel === 'GHOST') return !player.isAlive;
          return false;
        });
    io.to(socketId).emit('chat:messages', visible);
  }
}

// ====== Game End / Summary ======
export async function endGame(io: Server, code: string, winner: 'TOWN' | 'MAFIA') {
  const room = await prisma.room.findUnique({ where: { code }, include: { players: true } });
  if (!room) return;
  await prisma.room.update({ where: { id: room.id }, data: { phase: 'ENDED' } });
  await prisma.eventLog.create({ data: { roomId: room.id, phase: 'DAY', message: `${winner === 'TOWN' ? 'Town' : 'Mafia'} win!` } });
  const roles = await prisma.role.findMany({ where: { roomId: room.id } });
  const summary = roles.map((r) => ({ playerId: r.playerId!, roleType: r.roleType, alignment: r.alignment, name: room.players.find((p) => p.id === r.playerId)?.name }));
  await emitState(io, code);
  await broadcastChats(io, code); // reveal all chats
  io.to(code).emit('game:ended', { winner, roles: summary });
}

export async function resetToLobby(io: Server, code: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return;
  // Clear per-room state
  roomPending.delete(code);
  roomChats.set(code, []);
  roomReady.delete(code);
  await prisma.$transaction([
    prisma.role.deleteMany({ where: { roomId: room.id } }),
    prisma.eventLog.deleteMany({ where: { roomId: room.id } }),
    prisma.player.updateMany({ where: { roomId: room.id }, data: { isAlive: true } }),
    prisma.room.update({ where: { id: room.id }, data: { phase: 'LOBBY', dayNumber: 0 } }),
  ]);
  await emitState(io, code);
}

export async function markReady(io: Server, code: string, playerId: string) {
  const set = roomReady.get(code) ?? new Set<string>();
  set.add(playerId);
  roomReady.set(code, set);
  const room = await getRoomByCode(code);
  if (!room) return;
  const aliveCount = await prisma.player.count({ where: { roomId: room.id } });
  if (set.size >= aliveCount) {
    // everyone ready, host can click return to lobby or we auto-return
    io.to(code).emit('toast', { type: 'info', message: 'Everyone is ready. Host may return to lobby.' });
  }
}

// ===== DEV HELPERS (guarded by server flag) =====
export async function addBots(code: string, n: number) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) throw new Error('room not found');
  const count = await prisma.player.count({ where: { roomId: room.id } });
  const creates = Array.from({ length: n }).map((_, i) => prisma.player.create({ data: {
    roomId: room.id,
    name: `Bot${Math.floor(Math.random() * 1000)}`,
    isHost: false,
    isAlive: true,
    seat: count + i + 1,
  } }));
  await prisma.$transaction(creates);
}

export async function autoNight(io: Server, code: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return;
  const roles = await prisma.role.findMany({ where: { roomId: room.id }, include: { player: true } });
  const living = roles.filter((r) => r.player?.isAlive);
  const mafia = living.filter((r) => r.roleType === 'MAFIA');
  const nonMafia = living.filter((r) => r.roleType !== 'MAFIA');
  if (mafia.length && nonMafia.length) {
    const target = nonMafia[0].playerId!;
    for (const m of mafia) {
      await submitNightAction(code, m.playerId!, 'KILL', target);
    }
  }
  const doc = living.find((r) => r.roleType === 'DOCTOR');
  if (doc) {
    const someone = living.find((r) => r.playerId !== doc.playerId);
    if (someone) await submitNightAction(code, doc.playerId!, 'PROTECT', someone.playerId!);
  }
  const det = living.find((r) => r.roleType === 'DETECTIVE');
  if (det) {
    const someone = living.find((r) => r.playerId !== det.playerId);
    if (someone) await submitNightAction(code, det.playerId!, 'INVESTIGATE', someone.playerId!);
  }
  await finalizeNight(io, code);
}

export async function autoDay(io: Server, code: string) {
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return;
  const players = await prisma.player.findMany({ where: { roomId: room.id, isAlive: true } });
  const target = players[0]?.id;
  for (const p of players) {
    await submitDayVote(code, p.id, target, 'LYNCH');
  }
  await finalizeDay(io, code);
}


