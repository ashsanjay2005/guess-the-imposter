export type Player = {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
};

export type QuestionPair = {
  id: string;
  majorityQuestion: string;
  imposterQuestion: string;
  category?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
};

export type RoundState =
  | 'LOBBY'
  | 'DISTRIBUTING'
  | 'ANSWERING'
  | 'REVEAL_ANSWERS'
  | 'REVEAL_QUESTIONS'
  | 'DISCUSS'
  | 'VOTING'
  | 'RESULTS';

export type RoomSettings = {
  minPlayers: number;
  maxPlayers: number;
  answerSeconds: number;
  discussSeconds: number;
  votingSeconds: number;
  showNamesWithAnswers: boolean;
  randomizeAnswerOrder: boolean;
  suspenseMsQuestions: number; // delay before showing questions in results
  suspenseMsWinner: number; // delay after questions before winner
  suspenseMsImposter: number; // delay after winner before imposter id
  manualMode: boolean; // if true, timers disabled, host advances
  lockAfterStart: boolean; // lock seats after game start
};

export type Room = {
  code: string;
  hostId: string;
  players: Player[];
  spectators: Player[];
  state: RoundState;
  round: number;
  scores: { majority: number; imposter: number };
  playerScores: Record<string, number>;
  currentPair?: QuestionPair;
  imposterId?: string;
  answers: { playerId: string; text: string }[];
  votes: { voterId: string; targetId: string }[];
  readyPlayerIds: string[];
  chat: { id: string; name: string; text: string; ts: number; type: 'msg' | 'reaction' }[];
  settings: RoomSettings;
  questionBank: QuestionPair[];
};

export type PublicRoomSnapshot = Pick<
  Room,
  | 'code'
  | 'hostId'
  | 'players'
  | 'spectators'
  | 'state'
  | 'round'
  | 'scores'
  | 'playerScores'
  | 'answers'
  | 'votes'
  | 'readyPlayerIds'
  | 'chat'
  | 'settings'
  | 'questionBank'
> & { answeringPlayerIds?: string[] };


