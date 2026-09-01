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

// ── Battalions available in MP (subset of single-player roster) ──

export interface MPBattalion {
  id: string;
  name: string;
  cost: number;
  buildTime: number;
  units: { type: string; n: number }[];
  branch: 'GROUND' | 'AIR' | 'NAVAL';
}

export const MP_BATTALIONS: MPBattalion[] = [
  { id: 'armor_section', name: 'ARMOR SECTION', cost: 220, buildTime: 18, branch: 'GROUND',
    units: [{ type: 'M1A2', n: 2 }, { type: 'M2A3', n: 1 }] },
  { id: 'mech_platoon', name: 'MECH PLATOON', cost: 180, buildTime: 16, branch: 'GROUND',
    units: [{ type: 'M2A3', n: 2 }, { type: 'RIFLE', n: 2 }] },
  { id: 'recon_team', name: 'RECON TEAM', cost: 120, buildTime: 12, branch: 'GROUND',
    units: [{ type: 'M1127', n: 2 }, { type: 'RIFLE', n: 1 }] },
  { id: 'spg_battery', name: 'SPG BATTERY', cost: 260, buildTime: 20, branch: 'GROUND',
    units: [{ type: 'M109A7', n: 2 }] },
  { id: 'air_patrol', name: 'AIR PATROL', cost: 280, buildTime: 22, branch: 'AIR',
    units: [{ type: 'F16C', n: 1 }] },
  { id: 'cas_flight', name: 'CAS FLIGHT', cost: 240, buildTime: 20, branch: 'AIR',
    units: [{ type: 'A10C', n: 1 }] },
  { id: 'patrol_craft', name: 'PATROL CRAFT', cost: 200, buildTime: 18, branch: 'NAVAL',
    units: [{ type: 'PATROL', n: 2 }] },
  { id: 'frigate_section', name: 'FRIGATE SECTION', cost: 320, buildTime: 26, branch: 'NAVAL',
    units: [{ type: 'FRIGATE', n: 1 }] },
];

// ── MP unit definitions (server-authoritative, simplified) ──
// These mirror the single-player defs but only carry sim-relevant fields.

export interface MPUnitDef {
  type: string;
  name: string;
  shortName: string;
  branch: 'GROUND' | 'AIR' | 'NAVAL';
  hp: number;
  speed: number;          // m/s
  vision: number;         // m
  range: number;          // m
  minRange: number;       // m
  damage: number;
  reload: number;         // sec
  burst: number;
  ammo: number;
  accuracy: number;       // 0..1
  canHitAir: boolean;
  isAir: boolean;
  isShip: boolean;
  bounty: number;         // ink paid to killer
  spawnCost: number;      // ink cost if spawned standalone
  // visual
  length: number;
  width: number;
  kind: string;           // for HUD grouping
}

export const MP_UNIT_DEFS: Record<string, MPUnitDef> = {
  M1A2:    { type: 'M1A2',    name: 'M1A2 ABRAMS',     shortName: 'MBT',  branch: 'GROUND', hp: 680, speed: 14, vision: 800, range: 380, minRange: 0, damage: 180, reload: 4.2, burst: 1, ammo: 30, accuracy: 0.85, canHitAir: false, isAir: false, isShip: false, bounty: 90, spawnCost: 90, length: 9.8, width: 3.6, kind: 'MBT' },
  M2A3:    { type: 'M2A3',    name: 'M2A3 BRADLEY',    shortName: 'IFV',  branch: 'GROUND', hp: 320, speed: 16, vision: 760, range: 280, minRange: 0, damage: 55,  reload: 1.8, burst: 3, ammo: 60, accuracy: 0.65, canHitAir: true,  isAir: false, isShip: false, bounty: 50, spawnCost: 60, length: 6.5, width: 3.2, kind: 'IFV' },
  M109A7:  { type: 'M109A7',  name: 'M109A7 PALADIN',  shortName: 'SPG',  branch: 'GROUND', hp: 240, speed: 12, vision: 600, range: 1400, minRange: 200, damage: 140, reload: 9.0, burst: 1, ammo: 20, accuracy: 0.75, canHitAir: false, isAir: false, isShip: false, bounty: 70, spawnCost: 80, length: 9.3, width: 3.4, kind: 'SPG' },
  M1127:   { type: 'M1127',   name: 'M1127 STRYKER',   shortName: 'REC',  branch: 'GROUND', hp: 220, speed: 22, vision: 920, range: 240, minRange: 0, damage: 35,  reload: 1.5, burst: 3, ammo: 60, accuracy: 0.55, canHitAir: false, isAir: false, isShip: false, bounty: 35, spawnCost: 45, length: 6.9, width: 2.7, kind: 'REC' },
  RIFLE:   { type: 'RIFLE',   name: 'RIFLE SQUAD',     shortName: 'INF',  branch: 'GROUND', hp: 120, speed: 9,  vision: 540, range: 180, minRange: 0, damage: 22,  reload: 1.0, burst: 5, ammo: 999, accuracy: 0.45, canHitAir: false, isAir: false, isShip: false, bounty: 20, spawnCost: 30, length: 4.0, width: 2.0, kind: 'INF' },
  F16C:    { type: 'F16C',    name: 'F-16C FIGHTING FALCON', shortName: 'AIR', branch: 'AIR', hp: 100, speed: 90, vision: 1400, range: 1200, minRange: 0, damage: 220, reload: 6.0, burst: 1, ammo: 4, accuracy: 0.85, canHitAir: true, isAir: true, isShip: false, bounty: 110, spawnCost: 130, length: 15.0, width: 9.0, kind: 'AIR' },
  A10C:    { type: 'A10C',    name: 'A-10C THUNDERBOLT',     shortName: 'CAS', branch: 'AIR', hp: 180, speed: 60, vision: 1100, range: 600,  minRange: 0, damage: 180, reload: 5.0, burst: 2, ammo: 6, accuracy: 0.78, canHitAir: false, isAir: true, isShip: false, bounty: 100, spawnCost: 120, length: 16.3, width: 17.5, kind: 'AIR' },
  PATROL:  { type: 'PATROL',  name: 'PATROL CRAFT',    shortName: 'PAT',  branch: 'NAVAL', hp: 280, speed: 18, vision: 900, range: 320, minRange: 0, damage: 30,  reload: 1.6, burst: 4, ammo: 999, accuracy: 0.55, canHitAir: true,  isAir: false, isShip: true, bounty: 50, spawnCost: 90, length: 30, width: 6, kind: 'NAVAL' },
  FRIGATE: { type: 'FRIGATE', name: 'FRIGATE',         shortName: 'FFG',  branch: 'NAVAL', hp: 1400, speed: 14, vision: 1300, range: 900, minRange: 80, damage: 110, reload: 4.0, burst: 2, ammo: 999, accuracy: 0.7, canHitAir: true,  isAir: false, isShip: true, bounty: 180, spawnCost: 220, length: 110, width: 13, kind: 'NAVAL' },
};

// ── Maps ──
// Each map defines spawn anchors for each team and the sector layout.

export interface MPMapDef {
  id: MapId;
  name: string;
  worldW: number;
  worldH: number;
  blackSpawn: { x: number; y: number };
  graySpawn:  { x: number; y: number };
  sectors: { id: string; name: string; x: number; y: number; income: number; radius: number }[];
  description: string;
}

export const MP_MAPS: Record<MapId, MPMapDef> = {
  COASTAL_THEATER: {
    id: 'COASTAL_THEATER', name: 'COASTAL THEATER',
    worldW: 8000, worldH: 6000,
    blackSpawn: { x: 1300, y: 1300 }, graySpawn: { x: 6700, y: 4700 },
    sectors: [
      { id: 'NORTH_PASS', name: 'NORTH PASS', x: 4000, y: 1500, income: 1.2, radius: 280 },
      { id: 'PORT_ALPHA', name: 'PORT ALPHA', x: 2200, y: 4200, income: 1.5, radius: 320 },
      { id: 'AIRSTRIP',   name: 'AIRSTRIP',   x: 5800, y: 1800, income: 1.5, radius: 320 },
      { id: 'CROSSROADS', name: 'CROSSROADS', x: 4000, y: 3000, income: 1.0, radius: 260 },
      { id: 'SOUTH_BAY',  name: 'SOUTH BAY',  x: 5500, y: 4800, income: 1.2, radius: 280 },
    ],
    description: 'A 8×6 km coastal strip with two anchor ports and a central crossroads. Balanced for combined arms.',
  },
  INTERIOR_PLAINS: {
    id: 'INTERIOR_PLAINS', name: 'INTERIOR PLAINS',
    worldW: 8000, worldH: 6000,
    blackSpawn: { x: 1300, y: 3000 }, graySpawn: { x: 6700, y: 3000 },
    sectors: [
      { id: 'WEST_RIDGE', name: 'WEST RIDGE', x: 2400, y: 2200, income: 1.4, radius: 320 },
      { id: 'WEST_TOWN',  name: 'WEST TOWN',  x: 2400, y: 3800, income: 1.0, radius: 260 },
      { id: 'CENTER',     name: 'CENTER',     x: 4000, y: 3000, income: 1.6, radius: 360 },
      { id: 'EAST_TOWN',  name: 'EAST TOWN',  x: 5600, y: 2200, income: 1.0, radius: 260 },
      { id: 'EAST_RIDGE', name: 'EAST RIDGE', x: 5600, y: 3800, income: 1.4, radius: 320 },
    ],
    description: 'Open plains favoring armor and maneuver warfare. West and east ridge lines dominate the center.',
  },
  ARCHIPELAGO: {
    id: 'ARCHIPELAGO', name: 'ARCHIPELAGO',
    worldW: 8000, worldH: 6000,
    blackSpawn: { x: 1300, y: 4700 }, graySpawn: { x: 6700, y: 1300 },
    sectors: [
      { id: 'NORTH_HARBOR', name: 'NORTH HARBOR', x: 4000, y: 1200, income: 1.8, radius: 340 },
      { id: 'ISL_CENTER',   name: 'CENTER ISLAND', x: 4000, y: 3000, income: 1.4, radius: 300 },
      { id: 'SOUTH_HARBOR', name: 'SOUTH HARBOR', x: 4000, y: 4800, income: 1.8, radius: 340 },
      { id: 'WEST_ATOLL',   name: 'WEST ATOLL',   x: 2200, y: 3000, income: 1.0, radius: 240 },
      { id: 'EAST_ATOLL',   name: 'EAST ATOLL',   x: 5800, y: 3000, income: 1.0, radius: 240 },
    ],
    description: 'Naval-dominant island chains. Surface combatants rule; ground forces hold the islands.',
  },
};
