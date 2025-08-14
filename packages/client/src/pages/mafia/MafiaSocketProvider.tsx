import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type Player = { id: string; name: string; isHost: boolean; isAlive: boolean; seat: number };
type RoomState = {
  code: string;
  hostId: string;
  phase: 'LOBBY' | 'NIGHT' | 'DAWN' | 'DAY' | 'ENDED';
  dayNumber: number;
  isActive: boolean;
  players: Player[];
  chat: { id: string; name: string; text: string; ts: number; channel: 'DAY' | 'MAFIA' | 'GHOST' }[];
  settings: any;
  deadlineAt?: number;
  stage?: 'NIGHT' | 'DAY_DISCUSSION' | 'DAY_DEFENSE' | 'DAY_VOTING';
  nomineeId?: string;
};

type Ctx = {
  socket: Socket | null;
  me: Player | null;
  state: RoomState | null;
  toasts: { id: string; type: 'info' | 'error' | 'success'; message: string }[];
  createRoom: (name: string) => Promise<{ code: string }>;
  joinRoom: (code: string, name: string) => Promise<{ ok: boolean; playerId?: string; error?: string }>;
  sendChat: (text: string, channel?: 'DAY' | 'MAFIA') => void;
  startGame: (code: string) => void;
  submitNightAction: (code: string, type: 'KILL' | 'PROTECT' | 'INVESTIGATE', targetId: string) => void;
  finalizeNight: (code: string) => void;
  vote: (code: string, nomineeId: string | undefined, value: 'LYNCH' | 'NO_LYNCH') => void;
  finalizeDay: (code: string) => void;
  updateSettings: (patch: any) => void;
  forceNextPhase: () => void;
  devAddBots: (code: string, n: number) => void;
  devStart: (code: string) => void;
  devAutoNight: (code: string) => void;
  devAutoDay: (code: string) => void;
  roleInfo: { roleType: string; alignment: string; mafiaIds?: string[] } | null;
  showRoleOverlay: boolean;
  dismissRoleOverlay: () => void;
  availableActions: { type: 'KILL' | 'PROTECT' | 'INVESTIGATE'; targets: string[] }[];
  detectiveResult?: { targetId: string; targetName: string; isMafia: boolean } | null;
  lynchResult?: { lynchedId: string | null; lynchedName?: string; roleType?: string; alignment?: string } | null;
  dismissDetectiveResult?: () => void;
    deathNotice?: { at: 'DAWN'|'DAY'; dayNumber: number } | null;
    dismissDeathNotice?: () => void;
  gameSummary?: { winner: 'TOWN'|'MAFIA'; roles: { playerId: string; name?: string; roleType: string; alignment: string }[] } | null;
  dismissGameSummary?: () => void;
  readyUp: () => void;
  toLobby: () => void;
};

const C = createContext<Ctx>(null as unknown as Ctx);
export const useMafiaSocket = () => useContext(C);

export const MafiaSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [me, setMe] = useState<Player | null>(null);
  const [roleInfo, setRoleInfo] = useState<Ctx['roleInfo']>(null);
  const [showRoleOverlay, setShowRoleOverlay] = useState(false);
  const [availableActions, setAvailableActions] = useState<Ctx['availableActions']>([]);
  const [detectiveResult, setDetectiveResult] = useState<Ctx['detectiveResult']>(null);
  const [lynchResult, setLynchResult] = useState<Ctx['lynchResult']>(null);
  const [deathNotice, setDeathNotice] = useState<{ at: 'DAWN'|'DAY'; dayNumber: number } | null>(null);
  const [toasts, setToasts] = useState<Ctx['toasts']>([]);
  const [gameSummary, setGameSummary] = useState<Ctx['gameSummary']>(null);

  useEffect(() => {
    const fallbackHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const url = (import.meta as any).env?.VITE_MAFIA_SERVER_URL ?? `http://${fallbackHost}:4100`;
    // Allow both websocket and polling for networks that block WS
    const s = io(url, { transports: ['websocket', 'polling'], path: '/socket.io', reconnection: true });
    setSocket(s);
    (window as any).socket = s;
    return () => s.close();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = (snapshot: RoomState) => {
      setState(snapshot);
      try { document.documentElement.setAttribute('data-phase', snapshot.phase); } catch {}
      try {
        const myId = sessionStorage.getItem('mafiaMeId');
        if (myId) {
          const p = snapshot.players.find((x) => x.id === myId);
          if (p) setMe(p);
        }
      } catch {}
    };
    const onRole = (payload: { roleType: string; alignment: string; mafiaIds?: string[] }) => {
      setRoleInfo(payload);
      setShowRoleOverlay(true);
    };
    const onPrompt = (payload: { phase: 'NIGHT' | 'DAY'; actions?: { type: 'KILL' | 'PROTECT' | 'INVESTIGATE'; targets: string[] }[] }) => {
      if (payload.phase === 'NIGHT') setAvailableActions(payload.actions ?? []);
      else setAvailableActions([]);
    };
    socket.on('room:update', onUpdate);
    socket.on('room:updatePublic', onUpdate);
    socket.on('you:role', onRole as any);
    socket.on('phase:prompt', onPrompt as any);
    const onInv = (payload: { targetId: string; targetName: string; isMafia: boolean }) => setDetectiveResult(payload);
    socket.on('investigation:result', onInv as any);
    const onLynch = (payload: any) => {
      setLynchResult(payload);
      // auto-dismiss after a short delay
      setTimeout(() => setLynchResult(null), 3000);
    };
    socket.on('day:lynchResult', onLynch as any);
    const onDied = (p: { at: 'DAWN'|'DAY'; dayNumber: number }) => setDeathNotice(p);
    socket.on('you:died', onDied as any);
    const onChat = (msgs: any[]) => setState((prev) => prev ? { ...prev, chat: msgs as any } : prev);
    socket.on('chat:messages', onChat as any);
    const onToast = (t: { type: 'info'|'error'|'success'; message: string }) => {
      const entry = { id: Math.random().toString(36).slice(2), ...t } as const;
      setToasts((prev) => [...prev, entry]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== entry.id)), 2500);
    };
    socket.on('toast', onToast as any);
    const onEnded = (payload: any) => setGameSummary(payload);
    socket.on('game:ended', onEnded as any);
    return () => {
      socket.off('room:update', onUpdate);
      socket.off('you:role', onRole as any);
      socket.off('phase:prompt', onPrompt as any);
      socket.off('room:updatePublic', onUpdate);
      socket.off('investigation:result', onInv as any);
      socket.off('day:lynchResult', onLynch as any);
      socket.off('you:died', onDied as any);
      socket.off('chat:messages', onChat as any);
      socket.off('toast', onToast as any);
      socket.off('game:ended', onEnded as any);
    };
  }, [socket]);

  // Auto-join when landing on /mafia/room/:code using stored or generated name
  useEffect(() => {
    if (!socket) return;
    // Always subscribe to public updates when landing on a room URL so lobby shows before joining
    try {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const m = path.match(/\/mafia\/room\/([A-Z0-9]{6})/i);
      if (m) socket.emit('public:subscribe', { code: m[1].toUpperCase() });
    } catch {}
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const m = path.match(/\/mafia\/room\/([A-Z0-9]{6})/i);
    const alreadyJoined = !!state?.code;
    const attempted = sessionStorage.getItem('mafiaAutoJoin') === '1';
    if (m && !alreadyJoined && !attempted) {
      sessionStorage.setItem('mafiaAutoJoin', '1');
      const code = m[1].toUpperCase();
      let name = localStorage.getItem('name') || '';
      if (!name || name.trim().length < 2) {
        name = `Player${Math.floor(Math.random()*1000)}`;
        localStorage.setItem('name', name);
      }
      joinRoom(code, name).catch(() => {
        // allow retry on refresh
        sessionStorage.removeItem('mafiaAutoJoin');
      });
    }
  }, [socket, state?.code]);

  function ensureConnected(s: Socket): Promise<void> {
    if (s.connected) return Promise.resolve();
    return new Promise((resolve) => {
      const on = () => { s.off('connect', on); resolve(); };
      s.on('connect', on);
    });
  }

  const api = useMemo<Ctx>(() => ({
    socket,
    me,
    state,
    toasts,
    async createRoom(name: string) {
      localStorage.setItem('name', name);
      const s = socket!;
      await ensureConnected(s);
      const resp = await new Promise<any>((resolve) => s.emit('room:create', { name }, resolve));
      if (resp?.playerId) {
        sessionStorage.setItem('mafiaMeId', resp.playerId);
        setMe({ id: resp.playerId, name: resp.name || name, isHost: true, isAlive: true, seat: 1 });
      }
      return resp;
    },
    async joinRoom(code: string, name: string) {
      localStorage.setItem('name', name);
      const s = socket!;
      await ensureConnected(s);
      const resp = await new Promise<any>((resolve) => s.emit('room:join', { code, name }, resolve));
      if ((resp as any)?.playerId) {
        sessionStorage.setItem('mafiaMeId', (resp as any).playerId);
      }
      return resp as any;
    },
    sendChat(text: string, channel?: 'DAY' | 'MAFIA') {
      if (!state) return;
      socket?.emit('chat:send', { code: state.code, text, channel });
    },
    accuse(targetId: string) {
      if (!state) return;
      socket?.emit('day:accuse', { code: state.code, targetId });
    },
    startGame(code: string) {
      socket?.emit('host:start', { code });
    },
    submitNightAction(code: string, type, targetId: string) {
      socket?.emit('night:action', { code, type, targetId });
    },
    finalizeNight(code: string) {
      socket?.emit('night:finalize', { code });
    },
    vote(code: string, nomineeId: string | undefined, value: 'LYNCH' | 'NO_LYNCH') {
      socket?.emit('day:vote', { code, nomineeId, value });
    },
    finalizeDay(code: string) {
      socket?.emit('day:finalize', { code });
    },
    updateSettings(patch: any) {
      if (!state) return;
      socket?.emit('host:updateSettings', { code: state.code, patch });
    },
    forceNextPhase() {
      if (!state) return;
      socket?.emit('host:forcePhase', { code: state.code });
    },
    devAddBots(code: string, n: number) {
      socket?.emit('dev:addBots', { code, n });
    },
    devStart(code: string) {
      socket?.emit('dev:start', { code });
    },
    devAutoNight(code: string) {
      socket?.emit('dev:autoNight', { code });
    },
    devAutoDay(code: string) {
      socket?.emit('dev:autoDay', { code });
    },
    roleInfo,
    showRoleOverlay,
    availableActions,
    detectiveResult,
    lynchResult,
    deathNotice,
    gameSummary,
    dismissDetectiveResult() { setDetectiveResult(null); },
    dismissDeathNotice() { setDeathNotice(null); },
    dismissRoleOverlay() { setShowRoleOverlay(false); },
    dismissGameSummary() { setGameSummary(null); },
    readyUp() { if (state) socket?.emit('game:ready', { code: state.code }); },
    toLobby() { if (state) socket?.emit('game:toLobby', { code: state.code }); },
  }), [socket, me, state, roleInfo, showRoleOverlay, availableActions, detectiveResult, lynchResult, deathNotice, gameSummary, toasts]);

  return <C.Provider value={api}>{children}</C.Provider>;
};


