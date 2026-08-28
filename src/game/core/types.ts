// ─────────────────────────────────────────────────────────────
// PAPER STORM · shared types
// ─────────────────────────────────────────────────────────────

export type Faction = 'FRIEND' | 'ENEMY';

export type UnitKind = 'MBT' | 'IFV' | 'SPG' | 'REC' | 'AIR' | 'SPAA' | 'HQ' | 'FACTORY';

export type ProjectileKind = 'SHELL' | 'AUTO' | 'ARTY' | 'MISSILE_AIR' | 'MISSILE_GROUND' | 'MISSILE_SPAA';

export type IntelState = 'HIDDEN' | 'GHOST' | 'DETECTED';

/** who currently holds a strategic asset */
export type Controller = 'NEUTRAL' | 'FRIEND' | 'ENEMY';

export type UnitActivity =
  | 'HOLDING'
  | 'MOVING'
  | 'ENGAGING'
  | 'RELOADING'
  | 'FIRE MISSION'
  | 'PATROLLING'
  | 'ATTACK RUN'
  | 'RTB'
  | 'REARMING'
  | 'DESTROYED'
  | 'INBOUND'
  | 'SUPPRESSED'
  | 'PINNED';

export type OrderType = 'MOVE' | 'ATTACK' | 'ATTACK_MOVE' | 'STOP' | 'HOLD' | 'FIRE_MISSION' | 'PATROL';

export interface Order {
  type: OrderType;
  /** world-space destination */
  pos?: { x: number; y: number };
  /** target unit id (enemy) */
  targetId?: number;
  /** area fire target */
  area?: { x: number; y: number };
}

export interface ObjectiveState {
  id: string;
  name: string;
  desc: string;
  pos: { x: number; y: number };
  secured: boolean;
  primary: boolean;
}

/** a named piece of ground that generates ink while held */
export interface Sector {
  id: string;
  name: string;
  pos: { x: number; y: number };
  radius: number;
  /** ink per second while controlled */
  income: number;
  control: Controller;
  /** seconds of uncontested presence needed to flip control */
  captureTime: number;
  /** internal capture progress timer (signed by capturing side) */
  captureT: number;
  capturing: Controller | null;
  /** true if the sector grants nothing while an enemy factory stands in it */
  hasFactory?: boolean;
}

export interface LogEntry {
  id: number;
  time: number;
  text: string;
  level: 'info' | 'contact' | 'alert' | 'objective' | 'economy';
}

export interface HudObjective {
  id: string;
  name: string;
  status: 'HOSTILE' | 'SECURED';
  primary: boolean;
}

export interface HudUnitLine {
  callsign: string;
  typeName: string;
  kind: UnitKind;
  activity: UnitActivity;
  hp: number;
  hpMax: number;
  ammo: number;
  ammoMax: number;
  selected: boolean;
  suppression: number;
}

/** one purchasable formation in the deployment roster */
export interface BattalionDef {
  id: string;
  name: string;
  /** e.g. "3× MBT + 1× REC" */
  composition: string;
  /** short glyph row for the button */
  kinds: string[];
  cost: number;
  buildTime: number;
  desc: string;
  air?: boolean;
  /** the actual force package (engine-side) */
  units: { type: string; n: number }[];
}

export interface HudProductionLine {
  id: number;
  battalionId: string;
  name: string;
  progress: number; // 0..1
  remaining: number; // seconds
}

export interface HudSnapshot {
  running: boolean;
  paused: boolean;
  speed: number;
  missionTime: number;
  objectives: HudObjective[];
  selectionCount: number;
  selectionLines: HudUnitLine[];
  detailUnit: HudUnitLine | null;
  detailExtra: {
    weapon: string;
    range: number;
    speedKph: number;
    vision: number;
    armor: string;
    suppression: number;
  } | null;
  log: LogEntry[];
  air: { callsign: string; state: string; missiles: number; hp: number }[];
  cursorMode: 'NORMAL' | 'ATTACK_MOVE' | 'FIRE_MISSION';
  result: null | 'VICTORY' | 'DEFEAT';
  stats: {
    enemyDestroyed: number;
    friendLost: number;
    roundsFired: number;
    missionTime: number;
  };
  // ── ink economy ──────────────────────────────────────────
  ink: number;
  income: number;
  incomeBase: number;
  incomeSectors: number;
  incomeFactories: number;
  sectorsHeld: number;
  sectorsTotal: number;
  battalions: (BattalionDef & { available: boolean })[];
  production: HudProductionLine[];
  factories: {
    id: string;
    name: string;
    control: Controller;
    hp: number;
    hpMax: number;
    alive: boolean;
    capturing: Controller | null;
    captureProgress: number;
  }[];
  enemyStrength: number;
}

export interface AfterActionReport {
  result: 'VICTORY' | 'DEFEAT';
  time: number;
  killsByType: { label: string; n: number }[];
  lossesByType: { label: string; n: number }[];
  roundsFired: number;
  objectivesSecured: number;
  objectivesTotal: number;
  inkEarned: number;
  inkSpent: number;
  battalionsDeployed: number;
  factoriesHeld: number;
  factoriesTotal: number;
}
