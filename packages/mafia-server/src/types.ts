export type MafiaSettings = {
  minPlayers: number;
  maxPlayers: number;
  timers: {
    nightSeconds: number;
    daySeconds: number;
    dawnSeconds: number;
  };
  selfHealAllowed: boolean;
  mafiaMajorityRequired: boolean;
  spectatorsAllowed: boolean;
  deadChatVisibleToAlive: boolean;
  tiePolicy: 'REVOTE' | 'NO_LYNCH';
  roles: {
    mafia: number;
    doctor: number;
    detective: number;
    villager: number; // computed remainder but allow explicit override
    vigilante?: number;
    jester?: number;
    bodyguard?: number;
    mayor?: number;
    serialKiller?: number;
    cupid?: number;
    witch?: number;
    silencer?: number;
  };
};

export type PlayerPublic = {
  id: string;
  name: string;
  isHost: boolean;
  isAlive: boolean;
  seat: number;
};

export type Phase = 'LOBBY' | 'NIGHT' | 'DAWN' | 'DAY' | 'ENDED';

export type RoomState = {
  code: string;
  hostId: string;
  phase: Phase;
  dayNumber: number;
  isActive: boolean;
  players: PlayerPublic[];
  chat: { id: string; name: string; text: string; ts: number; channel: 'DAY' | 'MAFIA' | 'GHOST' }[];
  settings: MafiaSettings;
  deadlineAt?: number;
};

export type RoleType =
  | 'VILLAGER'
  | 'MAFIA'
  | 'DOCTOR'
  | 'DETECTIVE'
  | 'VIGILANTE'
  | 'JESTER'
  | 'BODYGUARD'
  | 'MAYOR'
  | 'SERIAL_KILLER'
  | 'CUPID'
  | 'LOVER'
  | 'WITCH'
  | 'SILENCER';

export type Alignment = 'TOWN' | 'MAFIA' | 'NEUTRAL';

export type EngineAction =
  | { type: 'INVESTIGATE'; actorId: string; targetId: string }
  | { type: 'PROTECT'; actorId: string; targetId: string }
  | { type: 'KILL'; actorId: string; targetId: string; faction?: 'MAFIA' | 'VIGILANTE' | 'SERIAL_KILLER' }
  | { type: 'BLOCK'; actorId: string; targetId: string }
  | { type: 'VOTE'; voterId: string; nomineeId?: string; value: 'LYNCH' | 'NO_LYNCH' };

export type EngineContext = {
  roles: Record<string, { roleType: RoleType; alignment: Alignment; isAlive: boolean; isRevealed: boolean }>;
  settings: MafiaSettings;
  phase: Phase;
  dayNumber: number;
};

export type EngineResult = {
  nextPhase: Phase;
  deaths: string[];
  protected: string[];
  investigations: { actorId: string; targetId: string; isMafia: boolean }[];
  errors: string[];
  logEntries: { message: string; meta?: any }[];
};


