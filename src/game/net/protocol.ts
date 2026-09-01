// ─────────────────────────────────────────────────────────────
// PAPER STORM · multiplayer protocol
// Shared types between client and server. MUST stay in sync.
// All messages are plain JSON-serializable objects.
// ─────────────────────────────────────────────────────────────

// ── Player identity ──────────────────────────────────────────

export interface PlayerProfile {
  playerId: string;        // opaque session-bound id (server-allocated)
  name: string;            // display name (1–16 chars)
  // reserved for future: avatar, level, mmr, etc.
}

// ── Teams ────────────────────────────────────────────────────
// BLACK vs GRAY — replaces the single-player FRIEND/ENEMY split
// for PvP. (Single-player keeps FRIEND/ENEMY; MP maps FRIEND→BLACK
// and ENEMY→GRAY so the existing art palette still applies.)

export type Team = 'BLACK' | 'GRAY';

export interface TeamConfig {
  // configurable team sizes; sum = maxPlayers
  BLACK: number;
  GRAY: number;
}

// ── Lobby ────────────────────────────────────────────────────

export type GameMode = 'COMBINED_ARMS' | 'ARMORED_ASSAULT' | 'NAVAL_SUPERIORITY';
export type MapId = 'COASTAL_THEATER' | 'INTERIOR_PLAINS' | 'ARCHIPELAGO';

export interface LobbyConfig {
  map: MapId;
  mode: GameMode;
  maxPlayers: number;       // 2 / 4 / 6 / 8
  teams: TeamConfig;        // must sum to maxPlayers
  aiFillEnabled: boolean;   // backfill empty slots with AI on start
  privateLobby: boolean;    // hidden from quick-match queue
  startingInk: number;      // 200 / 400 / 800
  inkIncomeRate: number;    // multiplier 0.5 / 1.0 / 1.5
}

export const DEFAULT_LOBBY_CONFIG: LobbyConfig = {
  map: 'COASTAL_THEATER',
  mode: 'COMBINED_ARMS',
  maxPlayers: 4,
  teams: { BLACK: 2, GRAY: 2 },
  aiFillEnabled: true,
  privateLobby: false,
  startingInk: 400,
  inkIncomeRate: 1.0,
};

export type LobbyPlayerStatus = 'CONNECTING' | 'NOT_READY' | 'READY' | 'AI';

export interface LobbyPlayer {
  playerId: string;
  name: string;
  team: Team;
  status: LobbyPlayerStatus;
  isHost: boolean;
  isAI: boolean;
  // connection bookkeeping (server-only authoritative, but mirrored for UI)
  connected: boolean;
  ping: number;
}

export interface LobbyState {
  lobbyId: string;          // internal id
  joinCode: string;         // 5-char human code, e.g. "K7X4P"
  hostId: string;
  config: LobbyConfig;
  players: LobbyPlayer[];
  status: LobbyStatus;
  createdAt: number;
  // countdown state when STARTING
  countdownEndsAt?: number; // epoch ms
}

export type LobbyStatus =
  | 'OPEN'           // accepting players
  | 'COUNTDOWN'      // host launched, synchronized countdown
  | 'IN_MATCH'       // match running
  | 'CLOSED';        // match ended, lobby dissolved

// ── Match lifecycle ──────────────────────────────────────────

export type MatchPhase =
  | 'SEARCHING'      // matchmaking queue
  | 'LOBBY'          // in lobby, configuring
  | 'READY'          // all required players ready
  | 'STARTING'       // countdown
  | 'LOADING'        // initializing sim
  | 'IN_MATCH'       // playing
  | 'FINISHED'       // results available
  | 'RESULTS';       // viewing results

export type MatchResult = 'BLACK_VICTORY' | 'GRAY_VICTORY' | 'DRAW' | 'ABORTED';

export interface MatchStats {
  playerId: string;
  team: Team;
  unitsLost: number;
  unitsDestroyed: number;
  inkGenerated: number;
  inkSpent: number;
  territoryPercent: number;
  isAI: boolean;
}

export interface MatchResultsPayload {
  result: MatchResult;
  winningTeam: Team | null;
  durationSec: number;
  stats: MatchStats[];
}

// ── Authoritative game state snapshot ────────────────────────
// This is what the server broadcasts every tick (10 Hz).
// Clients interpolate between snapshots.

export interface UnitSnapshot {
  id: number;
  type: string;             // UnitType key — client looks up def
  owner: string;            // playerId of owner (or 'AI_BLACK' / 'AI_GRAY')
  team: Team;
  callsign: string;
  x: number; y: number;
  angle: number; turretAngle: number;
  hp: number; maxHp: number;
  ammo: number; maxAmmo: number;
  dead: boolean;
  orderType: string;        // OrderType — for UI activity indicator
  // combat / state
  airState?: string;
  sinking?: boolean;
  // intel (what THIS client knows — server filters per-recipient)
  intel: 'DETECTED' | 'GHOST' | 'HIDDEN' | 'OWN';
  knownX?: number; knownY?: number;
  // brief visual state
  suppression?: number;
  damageFlash?: number;
}

export interface ProjectileSnapshot {
  id: number;
  kind: string;
  x: number; y: number;
  vx: number; vy: number;
  team: Team;
  ttl: number;
}

export interface SectorSnapshot {
  id: string;
  name: string;
  x: number; y: number;
  control: 'BLACK' | 'GRAY' | 'NEUTRAL';
  capturing: 'BLACK' | 'GRAY' | null;
  captureProgress: number;  // 0..1
}

export interface ProductionSnapshot {
  id: number;
  owner: string;
  team: Team;
  battalionId: string;
  name: string;
  progress: number;         // 0..1
  remainingSec: number;
  totalSec: number;
}

export interface GameStateSnapshot {
  tick: number;
  time: number;             // sim seconds
  seed: number;
  result: MatchResult | null;
  // per-recipient filtered views (fog of war applied server-side)
  ink: { BLACK: number; GRAY: number };
  income: { BLACK: number; GRAY: number };
  units: UnitSnapshot[];
  projectiles: ProjectileSnapshot[];
  sectors: SectorSnapshot[];
  productions: ProductionSnapshot[];
  // per-recipient only:
  myPlayerId: string;
  myTeam: Team;
  // stats
  alivePerTeam: { BLACK: number; GRAY: number };
}

// ── Client → Server commands ────────────────────────────────
// These are INTENTS. Server validates everything.

export type CommandPayload =
  | { kind: 'MOVE'; unitIds: number[]; x: number; y: number; formation?: 'LINE' | 'COLUMN' | 'WEDGE' }
  | { kind: 'ATTACK'; unitIds: number[]; targetId: number }
  | { kind: 'ATTACK_MOVE'; unitIds: number[]; x: number; y: number }
  | { kind: 'STOP'; unitIds: number[] }
  | { kind: 'HOLD'; unitIds: number[] }
  | { kind: 'FIRE_MISSION'; unitIds: number[]; x: number; y: number }
  | { kind: 'PATROL'; unitIds: number[]; x: number; y: number }
  | { kind: 'LAUNCH_AIR'; unitIds: number[]; x: number; y: number }
  | { kind: 'QUEUE_BATTALION'; battalionId: string }
  | { kind: 'TOGGLE_ARSENAL'; open: boolean };

export interface ClientCommand {
  tick: number;             // client's last-acknowledged tick (for reconciliation)
  payload: CommandPayload;
}

// ── Lobby messages (client → server) ─────────────────────────

export type LobbyClientMessage =
  | { type: 'CREATE_LOBBY'; name: string; config?: Partial<LobbyConfig> }
  | { type: 'JOIN_BY_CODE'; code: string; name: string }
  | { type: 'QUICK_MATCH'; name: string; mode: GameMode; teamSize: 1 | 2 | 3 | 4 }
  | { type: 'LEAVE_LOBBY' }
  | { type: 'SET_TEAM'; team: Team }
  | { type: 'SET_READY'; ready: boolean }
  | { type: 'SET_NAME'; name: string }
  | { type: 'HOST_UPDATE_CONFIG'; config: Partial<LobbyConfig> }
  | { type: 'HOST_KICK'; playerId: string }
  | { type: 'HOST_TRANSFER'; playerId: string }
  | { type: 'HOST_LOCK_TEAMS'; locked: boolean }
  | { type: 'HOST_START_MATCH' }
  | { type: 'HOST_CANCEL_COUNTDOWN' }
  | { type: 'CANCEL_QUICK_MATCH' }
  | { type: 'SEND_COMMAND'; command: ClientCommand }
  | { type: 'REQUEST_STATE' }       // on reconnect
  | { type: 'RETURN_TO_LOBBY' };

// ── Lobby messages (server → client) ─────────────────────────

export type LobbyServerMessage =
  | { type: 'IDENTITY'; profile: PlayerProfile }
  | { type: 'LOBBY_STATE'; lobby: LobbyState }
  | { type: 'LOBBY_JOINED'; lobby: LobbyState; yourPlayerId: string }
  | { type: 'LOBBY_ERROR'; code: LobbyErrorCode; message: string }
  | { type: 'LOBBY_LEFT'; reason: string }
  | { type: 'QUICK_MATCH_SEARCHING'; searchId: string; estimatedSec: number }
  | { type: 'QUICK_MATCH_PROGRESS'; playersFound: number; playersNeeded: number; elapsedSec: number }
  | { type: 'QUICK_MATCH_FOUND'; lobby: LobbyState }
  | { type: 'QUICK_MATCH_CANCELLED' }
  | { type: 'COUNTDOWN'; endsAt: number; secondsLeft: number }
  | { type: 'COUNTDOWN_CANCELLED'; reason: string }
  | { type: 'MATCH_STARTING'; matchId: string; seed: number; lobby: LobbyState }
  | { type: 'MATCH_STARTED'; matchId: string; initialState: GameStateSnapshot }
  | { type: 'MATCH_SNAPSHOT'; snapshot: GameStateSnapshot }
  | { type: 'MATCH_RESULT'; results: MatchResultsPayload }
  | { type: 'MATCH_ENDED'; reason: string; results?: MatchResultsPayload }
  | { type: 'PLAYER_JOINED'; player: LobbyPlayer }
  | { type: 'PLAYER_LEFT'; playerId: string; reason: string; replacedByAI?: boolean }
  | { type: 'PLAYER_READY_CHANGED'; playerId: string; ready: boolean }
  | { type: 'PLAYER_TEAM_CHANGED'; playerId: string; team: Team }
  | { type: 'HOST_CHANGED'; newHostId: string }
  | { type: 'CONFIG_UPDATED'; config: LobbyConfig }
  | { type: 'CONNECTION_STATUS'; status: 'GOOD' | 'DEGRADED' | 'DISCONNECTED'; ping: number }
  | { type: 'RECONNECTED'; lobby: LobbyState; snapshot?: GameStateSnapshot }
  | { type: 'INFO'; message: string };

export type LobbyErrorCode =
  | 'INVALID_CODE'
  | 'LOBBY_NOT_FOUND'
  | 'LOBBY_FULL'
  | 'MATCH_ALREADY_STARTED'
  | 'LOBBY_CLOSED'
  | 'NAME_TAKEN'
  | 'KICKED'
  | 'NOT_HOST'
  | 'TEAMS_LOCKED'
  | 'TEAMS_UNBALANCED'
  | 'NOT_READY'
  | 'SERVER_ERROR'
  | 'RATE_LIMITED';

// ── Network configuration ───────────────────────────────────

export const NET = {
  TICK_RATE: 10,                 // server sim ticks per second
  SNAPSHOT_RATE: 10,             // snapshots per second sent to clients
  INTERP_DELAY: 100,             // ms — clients render 100ms in the past
  INTERP_ALPHA_SMOOTH: 0.18,     // for smoothing remote unit motion
  RECONNECT_BACKOFF_MS: [500, 1000, 2000, 4000, 8000],
  MAX_RECONNECT_ATTEMPTS: 5,
  PING_INTERVAL_MS: 2000,
  PING_TIMEOUT_MS: 8000,
  COUNTDOWN_SEC: 5,
  QUICK_MATCH_TIMEOUT_SEC: 90,
  MAX_PLAYERS_PER_LOBBY: 8,
  AI_DECISION_INTERVAL_SEC: 0.5,
} as const;

// ── Map seeds ──
// Maps are NOT duplicated definitions. The real Terrain is seed-based
// and deterministic — different seeds produce different battlefields.
// Each "map" in MP is just a different seed of the real Terrain.
// The real buildScenario generates sectors, objectives, and anchors.
// Black team = FRIEND faction (spawns SW), Gray team = ENEMY faction (spawns NE).

export const MP_MAP_SEEDS: Record<MapId, { name: string; seed: number; description: string }> = {
  COASTAL_THEATER: {
    name: 'AZURE COAST',
    seed: 3368,
    description: 'The original theatre — a port city, the ground that pays, the sky above it, the bay below it.',
  },
  INTERIOR_PLAINS: {
    name: 'STEPPE INTERIOR',
    seed: 7211,
    description: 'A different seed of the same generator — open interior with ridge lines and crossroads.',
  },
  ARCHIPELAGO: {
    name: 'BROKEN COAST',
    seed: 9417,
    description: 'A coastal seed emphasising naval lanes and island approaches.',
  },
};
