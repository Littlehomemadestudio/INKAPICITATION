// ─────────────────────────────────────────────────────────────
// PAPER STORM · shared types
// ─────────────────────────────────────────────────────────────

export type Faction = 'FRIEND' | 'ENEMY';

export type UnitKind = 'MBT' | 'IFV' | 'SPG' | 'REC' | 'AIR' | 'SPAA' | 'HQ';

export type ProjectileKind = 'SHELL' | 'AUTO' | 'ARTY' | 'MISSILE_AIR' | 'MISSILE_GROUND' | 'MISSILE_SPAA';

export type IntelState = 'HIDDEN' | 'GHOST' | 'DETECTED';

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
  | 'DESTROYED';

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

export interface LogEntry {
  id: number;
  time: number;
  text: string;
  level: 'info' | 'contact' | 'alert' | 'objective';
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
}

export interface AfterActionReport {
  result: 'VICTORY' | 'DEFEAT';
  time: number;
  killsByType: { label: string; n: number }[];
  lossesByType: { label: string; n: number }[];
  roundsFired: number;
  objectivesSecured: number;
  objectivesTotal: number;
}
