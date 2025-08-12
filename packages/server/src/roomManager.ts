import { customAlphabet } from 'nanoid';
import type { Player, QuestionPair, Room, RoomSettings } from './types';
import { SEED_PAIRS } from './seed';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);

const DEFAULT_SETTINGS: RoomSettings = {
  minPlayers: 4,
  maxPlayers: 4,
  answerSeconds: 45,
  discussSeconds: 60,
  votingSeconds: 30,
  showNamesWithAnswers: true,
  randomizeAnswerOrder: true,
  suspenseMsQuestions: 0,
  suspenseMsWinner: 0,
  suspenseMsImposter: 0,
  manualMode: false,
  lockAfterStart: false,
};

export class RoomManager {
  private rooms = new Map<string, Room>();
  private playerToRoom = new Map<string, string>();
  private roomSessions = new Map<string, Map<string, string>>(); // code -> sessionId -> playerId

  createRoom(hostName: string, playerId: string, sessionId: string): Room {
    const code = this.generateCode();
    const host: Player = { id: playerId, name: hostName, isHost: true, connected: true };
    const room: Room = {
      code,
      hostId: host.id,
      players: [host],
      spectators: [],
      state: 'LOBBY',
      round: 0,
      scores: { majority: 0, imposter: 0 },
      playerScores: { [playerId]: 0 },
      answers: [],
      votes: [],
      readyPlayerIds: [],
      chat: [],
      settings: { ...DEFAULT_SETTINGS },
      questionBank: [...SEED_PAIRS],
    };
    this.rooms.set(code, room);
    this.playerToRoom.set(playerId, code);
    this.roomSessions.set(code, new Map([[sessionId, playerId]]));
    return room;
  }

  generateCode(): string {
    let code = '';
    do {
      code = nanoid();
    } while (this.rooms.has(code));
    return code;
  }

  getRoomByCode(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  getRoomByPlayer(playerId: string): Room | undefined {
    const code = this.playerToRoom.get(playerId);
    if (!code) return undefined;
    return this.rooms.get(code);
  }

  joinRoom(
    code: string,
    name: string,
    playerId: string,
    sessionId: string,
  ): { room?: Room; player?: Player; error?: string } {
    const room = this.rooms.get(code);
    if (!room) return { error: 'Room not found' };
    if (!this.roomSessions.has(code)) this.roomSessions.set(code, new Map());
    const sessions = this.roomSessions.get(code)!;

    // Prefer reconnect by sessionId
    const sessionPlayerId = sessions.get(sessionId);
    if (sessionPlayerId) {
      const existing = room.players.find((p) => p.id === sessionPlayerId);
      if (existing) {
        existing.id = playerId;
        existing.connected = true;
        if (existing.isHost) room.hostId = existing.id;
        this.playerToRoom.set(playerId, code);
        sessions.set(sessionId, playerId);
        return { room, player: existing };
      }
    }

    // Fallback reconnect by name if previously disconnected
    const existing = room.players.find((p) => p.name === name && !p.connected);
    if (existing) {
      existing.id = playerId;
      existing.connected = true;
      if (existing.isHost) room.hostId = existing.id;
      this.playerToRoom.set(playerId, code);
      sessions.set(sessionId, playerId);
      return { room, player: existing };
    }

    if (room.state !== 'LOBBY' && room.settings.lockAfterStart) {
      // After game start, only allow spectators (no new players)
      const spectator: Player = { id: playerId, name, isHost: false, connected: true };
      room.spectators.push(spectator);
      this.playerToRoom.set(playerId, code);
      return { room, player: spectator };
    }

    if (room.players.length >= room.settings.maxPlayers) {
      return { error: 'Room full' };
    }

    const player: Player = {
      id: playerId,
      name,
      isHost: false,
      connected: true,
    };
    room.players.push(player);
    this.playerToRoom.set(playerId, code);
    // initialize score bucket
    if (!room.playerScores[player.id]) room.playerScores[player.id] = 0;
    sessions.set(sessionId, player.id);
    return { room, player };
  }

  leave(playerId: string): { room?: Room; leftPlayer?: Player } {
    const room = this.getRoomByPlayer(playerId);
    if (!room) return {};
    this.playerToRoom.delete(playerId);

    const pIdx = room.players.findIndex((p) => p.id === playerId);
    if (pIdx >= 0) {
      const left = room.players[pIdx];
      left.connected = false;
      // If host left, transfer to oldest next connected player
      if (left.id === room.hostId) {
        const candidate = room.players.find((p) => p.connected && p.id !== left.id);
        if (candidate) {
          candidate.isHost = true;
          room.hostId = candidate.id;
        }
      }
      return { room, leftPlayer: left };
    }

    const sIdx = room.spectators.findIndex((p) => p.id === playerId);
    if (sIdx >= 0) {
      const left = room.spectators[sIdx];
      left.connected = false;
      return { room, leftPlayer: left };
    }
    return { room };
  }

  kickPlayer(playerId: string): { room?: Room; kickedPlayer?: Player } {
    const room = this.getRoomByPlayer(playerId);
    if (!room) return {};
    // Remove mapping
    this.playerToRoom.delete(playerId);
    // Remove from sessions for this room
    const sessions = this.roomSessions.get(room.code);
    if (sessions) {
      for (const [sid, pid] of sessions.entries()) {
        if (pid === playerId) sessions.delete(sid);
      }
    }
    // Remove from players
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx >= 0) {
      const kickedPlayer = room.players[idx];
      // Do not alter host here; caller should prevent kicking host
      room.players.splice(idx, 1);
      return { room, kickedPlayer };
    }
    // Or from spectators
    const sIdx = room.spectators.findIndex((p) => p.id === playerId);
    if (sIdx >= 0) {
      const kickedPlayer = room.spectators[sIdx];
      room.spectators.splice(sIdx, 1);
      return { room, kickedPlayer };
    }
    return { room };
  }

  removeDisconnectedSpectators(room: Room): void {
    room.spectators = room.spectators.filter((s) => s.connected);
  }

  destroyIfEmpty(room: Room): void {
    const allConnected = [...room.players, ...room.spectators].some((p) => p.connected);
    if (!allConnected) {
      this.rooms.delete(room.code);
    }
  }

  pickRandomPair(room: Room): QuestionPair | undefined {
    if (room.questionBank.length === 0) return undefined;
    return room.questionBank[Math.floor(Math.random() * room.questionBank.length)];
  }
}

export const roomManager = new RoomManager();


