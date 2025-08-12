import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Player, QuestionPair, Room, RoomSettings, RoundState } from '../lib/types';

type Snapshot = Pick<
  Room,
  | 'code'
  | 'hostId'
  | 'players'
  | 'spectators'
  | 'state'
  | 'round'
  | 'scores'
  | 'answers'
  | 'votes'
  | 'chat'
  | 'settings'
  | 'questionBank'
>;

type Toast = { id: string; type: 'info' | 'error' | 'success'; message: string; key?: string };

type Ctx = {
  socket: Socket | null;
  me: Player | null;
  room: Snapshot | null;
  toasts: Toast[];
  yourQuestion?: string;
  deadlineAt?: number;
  answersRevealed: string[];
  answersMajorityQuestion?: string;
  questionsRevealed?: { majorityQuestion: string; imposterQuestion: string };
  roundResults?: { imposterId: string; votes: { voterId: string; targetId: string }[]; majorityWon: boolean; scores: { majority: number; imposter: number } };
  createRoom: (name: string) => Promise<{ code: string; player: Player }>;
  joinRoom: (code: string, name: string) => Promise<{ roomSnapshot: Snapshot; player: Player }>;
  leaveRoom: () => void;
  startGame: () => void;
  nextRound: () => void;
  sendAnswer: (text: string) => void;
  sendVote: (targetId: string) => void;
  sendChat: (text: string) => void;
  sendReaction: (emoji: string) => void;
  readyToggle: (ready: boolean) => void;
  updateSettings: (partial: Partial<RoomSettings>) => void;
  upsertQuestionPair: (pair: QuestionPair) => Promise<void>;
  deleteQuestionPair: (id: string) => Promise<void>;
  clearTransient: () => void;
  kickPlayer: (playerId: string) => void;
};

const SocketCtx = createContext<Ctx>(null as unknown as Ctx);

export const useSocket = () => useContext(SocketCtx);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<Snapshot | null>(null);
  const [me, setMe] = useState<Player | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [yourQuestion, setYourQuestion] = useState<string | undefined>();
  const [deadlineAt, setDeadlineAt] = useState<number | undefined>();
  const [answersRevealed, setAnswersRevealed] = useState<string[]>([]);
  const [answersMajorityQuestion, setAnswersMajorityQuestion] = useState<string | undefined>();
  const [questionsRevealed, setQuestionsRevealed] = useState<{
    majorityQuestion: string;
    imposterQuestion: string;
  } | undefined>();
  const [roundResults, setRoundResults] = useState<Ctx['roundResults']>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Point to explicit env if provided; otherwise use current host so phones on the LAN work automatically
    const fallbackHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const serverUrl = (import.meta as any).env?.VITE_SERVER_URL ?? `http://${fallbackHost}:4000`;
    // Stable per-tab id
    let sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = Math.random().toString(36).slice(2);
      localStorage.setItem('sessionId', sessionId);
    }
    const s = io(serverUrl, {
      reconnection: true,
      // Prefer websocket to avoid mobile XHR polling issues
      transports: ['websocket'],
      path: '/socket.io',
      auth: { sessionId },
    });
    setSocket(s);
    return () => {
      s.close();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const prevCodeRef = { current: (room as any)?.code ?? null } as { current: string | null };
    const onUpdate = (snapshot: Snapshot) => {
      // If we switched rooms or returned to lobby, clear transient phase state to avoid stale timers/questions
      const switchedRoom = prevCodeRef.current && prevCodeRef.current !== snapshot.code;
      if (switchedRoom || snapshot.state === 'LOBBY') {
        setYourQuestion(undefined);
        setDeadlineAt(undefined);
        setAnswersRevealed([]);
        setAnswersMajorityQuestion(undefined);
        setQuestionsRevealed(undefined);
        setRoundResults(undefined);
      }
      prevCodeRef.current = snapshot.code;
      setRoom(snapshot);
    };
    const onToast = (t: Omit<Toast, 'id'>) => {
      // If a key is provided, replace any existing toast with the same key to prevent stacking
      setToasts((prev) => {
        const filtered = t.key ? prev.filter((p) => p.key !== t.key) : prev;
        return [...filtered, { id: Math.random().toString(36).slice(2), ...t } as Toast];
      });
      // auto-dismiss after 2.5s
      setTimeout(() => {
        setToasts((prev) => {
          if (t.key) {
            // remove by key (latest one) to avoid flicker
            const idx = prev.findIndex((p) => p.key === t.key);
            if (idx >= 0) return prev.filter((_, i) => i !== idx);
          }
          // fallback: remove last
          return prev.slice(0, -1);
        });
      }, 2500);
    };
    const onPhase = (payload: any) => {
      setDeadlineAt(payload.deadlineAt);
      if (payload.state === 'ANSWERING') setYourQuestion(payload.yourQuestion);
    };
    const onAnswers = (payload: { answers: string[]; majorityQuestion?: string }) => {
      setAnswersRevealed(payload.answers);
      setAnswersMajorityQuestion(payload.majorityQuestion);
    };
    const onQuestions = (payload: { majorityQuestion: string; imposterQuestion: string }) =>
      setQuestionsRevealed(payload);
    const onResults = (payload: any) => setRoundResults(payload);
    const onConnectError = (err: any) => setToasts((prev) => [...prev, { id: Math.random().toString(36).slice(2), type: 'error', message: `Socket error: ${err?.message ?? 'connection failed'}` }]);
    const onKicked = () => {
      setToasts((prev) => [...prev, { id: Math.random().toString(36).slice(2), type: 'error', message: 'You were removed by the host' }]);
      sessionStorage.setItem('allowAutoReconnect', '0');
      localStorage.removeItem('lastRoomCode');
      setRoom(null);
      setMe(null);
      // Navigate immediately to landing without full reload so the toast stays visible
      try {
        window.history.pushState({}, '', '/guess-who');
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch {
        const base = window.location.origin;
        window.location.href = base + '/guess-who';
      }
    };
    socket.on('room:update', onUpdate);
    socket.on('toast', onToast as any);
    socket.on('round:phase', onPhase);
    socket.on('round:answersRevealed', onAnswers);
    socket.on('round:questionsRevealed', onQuestions);
    socket.on('round:results', onResults);
    socket.on('connect_error', onConnectError);
    socket.on('kicked', onKicked);
    return () => {
      socket.off('room:update', onUpdate);
      socket.off('toast', onToast);
      socket.off('round:phase', onPhase);
      socket.off('round:answersRevealed', onAnswers);
      socket.off('round:questionsRevealed', onQuestions);
      socket.off('round:results', onResults);
      socket.off('connect_error', onConnectError);
      socket.off('kicked', onKicked);
    };
  }, [socket]);

  // Auto rejoin on reconnect using last known code+name
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      const allow = sessionStorage.getItem('allowAutoReconnect') === '1';
      if (!allow) return;
      const code = localStorage.getItem('lastRoomCode');
      const name = localStorage.getItem('name');
      if (code && name) {
        socket.emit('room:join', { code, name }, (resp: any) => {
          if (resp?.player) setMe(resp.player);
          if (resp?.roomSnapshot) setRoom(resp.roomSnapshot);
        });
      }
    };
    socket.on('connect', handler);
    return () => { socket.off('connect', handler); };
  }, [socket]);

  const api = useMemo<Ctx>(() => ({
    socket,
    me,
    room,
    toasts,
    yourQuestion,
    deadlineAt,
    answersRevealed,
    answersMajorityQuestion,
    questionsRevealed,
    roundResults,
    async createRoom(name: string) {
      const resp = await new Promise<any>((resolve) => socket!.emit('room:create', { name }, resolve));
      setMe(resp.player);
      localStorage.setItem('name', name);
      localStorage.setItem('lastRoomCode', resp.code);
      sessionStorage.setItem('allowAutoReconnect', '1');
      // New room, clear any previous phase state
      setYourQuestion(undefined);
      setDeadlineAt(undefined);
      setAnswersRevealed([]);
      setQuestionsRevealed(undefined);
      setRoundResults(undefined);
      return resp;
    },
    async joinRoom(code: string, name: string) {
      const resp = await new Promise<any>((resolve) => socket!.emit('room:join', { code, name }, resolve));
      if (resp?.error) {
        const toast = { id: Math.random().toString(36).slice(2), type: 'error' as const, message: resp.error };
        setToasts((prev) => [...prev, toast]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 2500);
        throw new Error(resp.error);
      }
      if (resp?.player) setMe(resp.player);
      localStorage.setItem('name', name);
      localStorage.setItem('lastRoomCode', code);
      sessionStorage.setItem('allowAutoReconnect', '1');
      // Switched room or rejoined: clear stale phase state until the server sends fresh events
      setYourQuestion(undefined);
      setDeadlineAt(undefined);
      setAnswersRevealed([]);
      setQuestionsRevealed(undefined);
      setRoundResults(undefined);
      return resp;
    },
    leaveRoom() {
      socket?.emit('room:leave');
    },
    startGame() {
      socket?.emit('host:start');
      setYourQuestion(undefined);
      setAnswersRevealed([]);
      setQuestionsRevealed(undefined);
      setRoundResults(undefined);
    },
    nextRound() {
      socket?.emit('host:nextRound');
      setYourQuestion(undefined);
      setAnswersRevealed([]);
      setQuestionsRevealed(undefined);
      setRoundResults(undefined);
    },
    sendAnswer(text: string) {
      socket?.emit('round:answer', { text });
    },
    sendVote(targetId: string) {
      socket?.emit('round:vote', { targetId });
    },
    updateSettings(partial: Partial<RoomSettings>) {
      socket?.emit('host:updateSettings', partial);
    },
    sendChat(text: string) {
      if (!text.trim()) return;
      socket?.emit('chat:send', { text, type: 'msg' });
    },
    sendReaction(emoji: string) {
      socket?.emit('chat:send', { text: emoji, type: 'reaction' });
    },
    readyToggle(ready: boolean) {
      socket?.emit('player:ready', { ready });
    },
    async upsertQuestionPair(pair: QuestionPair) {
      await new Promise<void>((resolve) => socket?.emit('host:upsertQuestionPair', pair, () => resolve()));
    },
    async deleteQuestionPair(id: string) {
      await new Promise<void>((resolve) => socket?.emit('host:deleteQuestionPair', { id }, () => resolve()));
    },
    clearTransient() {
      setYourQuestion(undefined);
      setAnswersRevealed([]);
      setQuestionsRevealed(undefined);
      setRoundResults(undefined);
    },
    kickPlayer(playerId: string) {
      socket?.emit('host:kick', { playerId });
    },
  }), [socket, me, room, toasts, yourQuestion, deadlineAt, answersRevealed, questionsRevealed]);

  return <SocketCtx.Provider value={api}>{children}</SocketCtx.Provider>;
};


