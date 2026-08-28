// ─────────────────────────────────────────────────────────────
// PAPER STORM · unit definitions
// Believable real-world-inspired equipment, tuned for a stable V1.
// Distances in metres, times in seconds.
// ─────────────────────────────────────────────────────────────

import type { Faction, UnitKind, ProjectileKind } from '../core/types';

export type UnitType =
  | 'M1A2'
  | 'M2A3'
  | 'M109A7'
  | 'M1127'
  | 'RIFLE'
  | 'VULCAN'
  | 'LINEBACKER'
  | 'NASAMS'
  | 'PATRIOT'
  | 'F16C'
  | 'A10C'
  | 'T90M'
  | 'BMP3'
  | 'BTR82A'
  | '2S19'
  | 'TOR'
  | 'PANTSIR'
  | 'BUK'
  | 'SU25K'
  | 'PATROL'
  | 'FRIGATE'
  | 'DESTROYER'
  | 'CRUISER'
  | 'BATTLESHIP'
  | 'HQ'
  | 'FACTORY';

export interface UnitDef {
  type: UnitType;
  kind: UnitKind;
  name: string;
  shortName: string;
  role: string;
  faction: Faction;
  hp: number;
  speed: number;
  turnRate: number;
  turretRate: number;
  vision: number;
  range: number;
  minRange: number;
  damage: number;
  splash: number;
  reload: number;
  burst: number;
  burstInterval: number;
  ammo: number;
  projectile: ProjectileKind;
  accuracy: number;
  canHitAir: boolean;
  isAir: boolean;
  /** ink bounty paid to the killer's side */
  bounty: number;
  /** hull length in metres (draw anchor) */
  length: number;
  width: number;
  /** SEA domain — naval movement, naval pathing, naval death */
  domain?: 'LAND' | 'SEA';
  /** minimum shore clearance for navigation (m) */
  draft?: number;
  /** acceleration (m/s²) — ships are heavy */
  accel?: number;
  /** preferred gunnery band (m): [stand-off, closest approach] */
  standoff?: [number, number];
  /** turret mounts — weapon layout, per class (see shipDraw.ts) */
  mounts?: number;
  /** air-defence system parameters — detection, tracking, engagement */
  aa?: {
    /** acquisition radar radius (m) — detection precedes engagement */
    radar: number;
    /** weapon engagement envelope (m) */
    range: number;
    /** seconds of continuous track before weapons release */
    lock: number;
    /** gun systems engage aircraft on the deck only — high orbits are safe */
    lowOnly?: boolean;
    /** heavy SAMs must be emplaced (near-stationary) to fire */
    emplace?: boolean;
    /** seconds per round for the crew to reload from reserve */
    regen?: number;
  };
}

function def(p: Partial<UnitDef> & { type: UnitType; kind: UnitKind; name: string; shortName: string; role: string; faction: Faction }): UnitDef {
  return {
    hp: 100,
    speed: 10,
    turnRate: 1.1,
    turretRate: 2.2,
    vision: 600,
    range: 500,
    minRange: 0,
    damage: 30,
    splash: 0,
    reload: 5,
    burst: 1,
    burstInterval: 0,
    ammo: 30,
    projectile: 'SHELL',
    accuracy: 0.8,
    canHitAir: false,
    isAir: false,
    bounty: 20,
    length: 7,
    width: 3.5,
    ...p,
  };
}

export const UNIT_DEFS: Record<UnitType, UnitDef> = {
  // ── friendly ───────────────────────────────────────────────
  M1A2: def({
    type: 'M1A2', kind: 'MBT', name: 'M1A2 SEPv3 ABRAMS', shortName: 'MBT',
    role: 'MAIN BATTLE TANK', faction: 'FRIEND',
    hp: 100, speed: 10.5, turnRate: 1.15, turretRate: 2.4, vision: 600,
    range: 640, damage: 34, reload: 5.2, ammo: 32, projectile: 'SHELL', accuracy: 0.8,
    bounty: 46, length: 7.9, width: 3.7,
  }),
  M2A3: def({
    type: 'M2A3', kind: 'IFV', name: 'M2A3 BRADLEY', shortName: 'IFV',
    role: 'INFANTRY FIGHTING VEHICLE', faction: 'FRIEND',
    hp: 55, speed: 12.5, turnRate: 1.5, turretRate: 3.2, vision: 620,
    range: 450, damage: 3.4, burst: 5, burstInterval: 0.16, reload: 3.0,
    ammo: 600, projectile: 'AUTO', accuracy: 0.85,
    bounty: 30, length: 6.5, width: 3.2,
  }),
  M109A7: def({
    type: 'M109A7', kind: 'SPG', name: 'M109A7 PALADIN', shortName: 'SPG',
    role: 'SELF-PROPELLED HOWITZER', faction: 'FRIEND',
    hp: 45, speed: 7.5, turnRate: 0.9, turretRate: 1.3, vision: 380,
    range: 1950, minRange: 320, damage: 52, splash: 42, reload: 8.5,
    ammo: 40, projectile: 'ARTY', accuracy: 0.72,
    bounty: 44, length: 9.3, width: 3.4,
  }),
  M1127: def({
    type: 'M1127', kind: 'REC', name: 'M1127 RECON STRIKER', shortName: 'REC',
    role: 'RECONNAISSANCE VEHICLE', faction: 'FRIEND',
    hp: 36, speed: 16.5, turnRate: 1.9, turretRate: 3.8, vision: 1050,
    range: 360, damage: 2.6, burst: 4, burstInterval: 0.14, reload: 2.2,
    ammo: 480, projectile: 'AUTO', accuracy: 0.82,
    bounty: 22, length: 6.9, width: 2.9,
  }),
  RIFLE: def({
    type: 'RIFLE', kind: 'INF', name: 'RIFLE SQUAD', shortName: 'INF',
    role: 'DISMOUNTED INFANTRY', faction: 'FRIEND',
    hp: 30, speed: 5.2, turnRate: 2.6, turretRate: 4, vision: 580,
    range: 300, damage: 1.6, burst: 4, burstInterval: 0.18, reload: 2.0,
    ammo: 420, projectile: 'AUTO', accuracy: 0.7,
    bounty: 12, length: 5.6, width: 3.6,
  }),

  // ── friendly air defence — four systems, four doctrines ──
  // GUN AA: cheap, fast, low skies only. SHORAD: rolls with the armour.
  // NASAMS: the frontline umbrella. PATRIOT: the theatre shield.
  VULCAN: def({
    type: 'VULCAN', kind: 'SPAA', name: 'M163A2 VULCAN', shortName: 'GUN AA',
    role: 'SELF-PROPELLED ANTI-AIRCRAFT GUN', faction: 'FRIEND',
    hp: 50, speed: 13.5, turnRate: 1.7, turretRate: 4.5, vision: 950,
    range: 900, damage: 2.8, burst: 9, burstInterval: 0.055, reload: 1.5,
    ammo: 1400, projectile: 'AUTO', accuracy: 0.72, canHitAir: true,
    bounty: 26, length: 6.4, width: 3.1,
    aa: { radar: 1100, range: 900, lock: 0.5, lowOnly: true },
  }),
  LINEBACKER: def({
    type: 'LINEBACKER', kind: 'SPAA', name: 'M6 LINEBACKER', shortName: 'SHORAD',
    role: 'SHORT-RANGE AIR DEFENCE', faction: 'FRIEND',
    hp: 55, speed: 12.5, turnRate: 1.5, turretRate: 3.6, vision: 1300,
    range: 1250, damage: 34, reload: 3.4, ammo: 8, projectile: 'MISSILE_SPAA',
    accuracy: 0.7, canHitAir: true,
    bounty: 34, length: 6.5, width: 3.2,
    aa: { radar: 1500, range: 1250, lock: 1.4, regen: 26 },
  }),
  NASAMS: def({
    type: 'NASAMS', kind: 'SPAA', name: 'NASAMS II LAUNCHER', shortName: 'SAM',
    role: 'MEDIUM-RANGE AIR DEFENCE', faction: 'FRIEND',
    hp: 60, speed: 8.5, turnRate: 1.1, turretRate: 2.5, vision: 2200,
    range: 2400, damage: 42, reload: 4.6, ammo: 6, projectile: 'MISSILE_SPAA',
    accuracy: 0.75, canHitAir: true,
    bounty: 52, length: 8.6, width: 3.0,
    aa: { radar: 3000, range: 2400, lock: 2.2, emplace: true, regen: 30 },
  }),
  PATRIOT: def({
    type: 'PATRIOT', kind: 'SPAA', name: 'MIM-104 PATRIOT PAC-3', shortName: 'LR SAM',
    role: 'LONG-RANGE AIR DEFENCE', faction: 'FRIEND',
    hp: 65, speed: 5.5, turnRate: 0.7, turretRate: 2, vision: 3200,
    range: 3800, damage: 55, reload: 6.0, ammo: 4, projectile: 'MISSILE_SPAA',
    accuracy: 0.8, canHitAir: true,
    bounty: 74, length: 10.2, width: 3.4,
    aa: { radar: 4200, range: 3800, lock: 3.0, emplace: true, regen: 38 },
  }),
  F16C: def({
    type: 'F16C', kind: 'AIR', name: 'F-16C VIPER', shortName: 'FTR',
    role: 'AIR SUPERIORITY FIGHTER', faction: 'FRIEND',
    hp: 70, speed: 78, turnRate: 1.05, turretRate: 6, vision: 1300,
    range: 950, damage: 38, reload: 1.6, ammo: 4,
    projectile: 'MISSILE_AIR', accuracy: 0.85, canHitAir: true, isAir: true,
    bounty: 62, length: 15.1, width: 9.5,
  }),
  A10C: def({
    type: 'A10C', kind: 'AIR', name: 'A-10C THUNDERBOLT II', shortName: 'CAS',
    role: 'ATTACK AIRCRAFT', faction: 'FRIEND',
    hp: 90, speed: 62, turnRate: 0.85, turretRate: 6, vision: 1250,
    range: 780, damage: 46, splash: 30, reload: 1.1,
    ammo: 6, projectile: 'MISSILE_AIR', accuracy: 0.9, canHitAir: false, isAir: true,
    bounty: 58, length: 17.5, width: 14,
  }),

  // ── enemy ──────────────────────────────────────────────────
  T90M: def({
    type: 'T90M', kind: 'MBT', name: 'T-90M PRORYV', shortName: 'MBT',
    role: 'MAIN BATTLE TANK', faction: 'ENEMY',
    hp: 92, speed: 9.5, turnRate: 1.0, turretRate: 2.1, vision: 560,
    range: 600, damage: 30, reload: 6.2, ammo: 30, projectile: 'SHELL', accuracy: 0.78,
    bounty: 44, length: 6.9, width: 3.5,
  }),
  BMP3: def({
    type: 'BMP3', kind: 'IFV', name: 'BMP-3', shortName: 'IFV',
    role: 'INFANTRY FIGHTING VEHICLE', faction: 'ENEMY',
    hp: 52, speed: 11.5, turnRate: 1.4, turretRate: 3.0, vision: 560,
    range: 420, damage: 3.2, burst: 5, burstInterval: 0.17, reload: 3.2,
    ammo: 500, projectile: 'AUTO', accuracy: 0.83,
    bounty: 28, length: 6.7, width: 3.3,
  }),
  BTR82A: def({
    type: 'BTR82A', kind: 'REC', name: 'BTR-82A', shortName: 'REC',
    role: 'RECONNAISSANCE VEHICLE', faction: 'ENEMY',
    hp: 40, speed: 13.5, turnRate: 1.7, turretRate: 3.4, vision: 800,
    range: 380, damage: 3.0, burst: 4, burstInterval: 0.15, reload: 2.6,
    ammo: 440, projectile: 'AUTO', accuracy: 0.8,
    bounty: 22, length: 7.6, width: 2.9,
  }),
  '2S19': def({
    type: '2S19', kind: 'SPG', name: '2S19 MSTA-S', shortName: 'SPG',
    role: 'SELF-PROPELLED HOWITZER', faction: 'ENEMY',
    hp: 45, speed: 7.5, turnRate: 0.9, turretRate: 1.2, vision: 380,
    range: 2000, minRange: 340, damage: 50, splash: 44, reload: 9.5,
    ammo: 40, projectile: 'ARTY', accuracy: 0.7,
    bounty: 44, length: 9.1, width: 3.4,
  }),
  TOR: def({
    type: 'TOR', kind: 'SPAA', name: 'TOR-M2', shortName: 'SAM',
    role: 'SHORT-RANGE AIR DEFENCE', faction: 'ENEMY',
    hp: 50, speed: 9.5, turnRate: 1.2, turretRate: 4, vision: 950,
    range: 1500, damage: 30, reload: 3.2, ammo: 12, projectile: 'MISSILE_SPAA',
    accuracy: 0.68, canHitAir: true,
    bounty: 36, length: 7.2, width: 3.4,
    aa: { radar: 1200, range: 1500, lock: 1.3, regen: 22 },
  }),
  PANTSIR: def({
    type: 'PANTSIR', kind: 'SPAA', name: 'PANTSIR-S1', shortName: 'SAM',
    role: 'SHORAD SYSTEM', faction: 'ENEMY',
    hp: 42, speed: 12, turnRate: 1.4, turretRate: 4, vision: 1000,
    range: 1650, damage: 30, reload: 3.6, ammo: 12, projectile: 'MISSILE_SPAA',
    accuracy: 0.66, canHitAir: true,
    bounty: 36, length: 7.9, width: 3.1,
    aa: { radar: 1400, range: 1650, lock: 1.2, regen: 24 },
  }),
  BUK: def({
    type: 'BUK', kind: 'SPAA', name: '9K37 BUK TELAR', shortName: 'SAM',
    role: 'MEDIUM-RANGE AIR DEFENCE', faction: 'ENEMY',
    hp: 58, speed: 9, turnRate: 1.1, turretRate: 2.5, vision: 2000,
    range: 2200, damage: 40, reload: 4.4, ammo: 6, projectile: 'MISSILE_SPAA',
    accuracy: 0.72, canHitAir: true,
    bounty: 48, length: 8.8, width: 3.3,
    aa: { radar: 2800, range: 2200, lock: 2.0, emplace: true, regen: 30 },
  }),
  HQ: def({
    type: 'HQ', kind: 'HQ', name: 'KRAKEN GROUP HQ', shortName: 'HQ',
    role: 'ENEMY COMMAND OBJECTIVE', faction: 'ENEMY',
    hp: 540, speed: 0, turnRate: 0, turretRate: 0, vision: 700,
    range: 0, damage: 0, reload: 99, ammo: 0, projectile: 'SHELL', accuracy: 0,
    bounty: 0, length: 34, width: 26,
  }),

  // ── enemy close air support — hunts the fleet, strafes the shore ──
  SU25K: def({
    type: 'SU25K', kind: 'AIR', name: 'SU-25K FROGFOOT', shortName: 'CAS',
    role: 'ATTACK AIRCRAFT', faction: 'ENEMY',
    hp: 80, speed: 54, turnRate: 0.95, turretRate: 6, vision: 1150,
    range: 720, damage: 44, splash: 26, reload: 1.4,
    ammo: 6, projectile: 'MISSILE_AIR', accuracy: 0.85, canHitAir: false, isAir: true,
    bounty: 52, length: 15.3, width: 9.8,
  }),

  // ── naval forces — one fleet, five silhouettes ──
  // Weapon batteries are per-mount (shipDraw.ts SHIP_CONFIGS); the
  // aggregate below drives targeting + HUD.
  PATROL: def({
    type: 'PATROL', kind: 'NAVAL', name: 'MORAY FAST ATTACK CRAFT', shortName: 'PT',
    role: 'TORPEDO / PATROL CRAFT', faction: 'FRIEND',
    hp: 70, speed: 15, turnRate: 0.8, turretRate: 2.8, vision: 780,
    range: 430, damage: 3.4, burst: 6, burstInterval: 0.14, reload: 2.6,
    ammo: 520, projectile: 'AUTO', accuracy: 0.8, canHitAir: true,
    bounty: 42, length: 27, width: 6.6, domain: 'SEA', draft: 34, accel: 3.4,
    standoff: [330, 180], mounts: 3,
  }),
  FRIGATE: def({
    type: 'FRIGATE', kind: 'NAVAL', name: 'VALKYRIE FRIGATE', shortName: 'FF',
    role: 'ESCORT / GENERAL COMBAT', faction: 'FRIEND',
    hp: 175, speed: 10.5, turnRate: 0.3, turretRate: 1.4, vision: 980,
    range: 860, damage: 26, reload: 3.4,
    ammo: 96, projectile: 'NAVAL_SHELL', accuracy: 0.78, canHitAir: true,
    bounty: 88, length: 96, width: 13, domain: 'SEA', draft: 52, accel: 1.5,
    standoff: [700, 420], mounts: 3,
  }),
  DESTROYER: def({
    type: 'DESTROYER', kind: 'NAVAL', name: 'SLEIPNIR DESTROYER', shortName: 'DD',
    role: 'GUIDED MISSILE DESTROYER', faction: 'FRIEND',
    hp: 265, speed: 9.5, turnRate: 0.24, turretRate: 1.0, vision: 1120,
    range: 1160, damage: 44, reload: 4.2,
    ammo: 128, projectile: 'NAVAL_SHELL', accuracy: 0.78, canHitAir: true,
    bounty: 145, length: 134, width: 16.4, domain: 'SEA', draft: 66, accel: 1.1,
    standoff: [980, 620], mounts: 4,
  }),
  CRUISER: def({
    type: 'CRUISER', kind: 'NAVAL', name: 'TRIREME CRUISER', shortName: 'CG',
    role: 'LARGE SURFACE COMBATANT', faction: 'FRIEND',
    hp: 430, speed: 8, turnRate: 0.18, turretRate: 0.8, vision: 1220,
    range: 1460, damage: 54, reload: 5,
    ammo: 180, projectile: 'NAVAL_SHELL', accuracy: 0.78, canHitAir: true,
    bounty: 235, length: 172, width: 19, domain: 'SEA', draft: 80, accel: 0.8,
    standoff: [1250, 820], mounts: 6,
  }),
  BATTLESHIP: def({
    type: 'BATTLESHIP', kind: 'NAVAL', name: 'VELIKIY — CAPITAL SHIP', shortName: 'BB',
    role: 'THE BIG BOI · BATTLESHIP', faction: 'FRIEND',
    hp: 950, speed: 7, turnRate: 0.11, turretRate: 0.4, vision: 1380,
    range: 1650, damage: 100, reload: 6.8,
    ammo: 260, projectile: 'NAVAL_SHELL', accuracy: 0.76, canHitAir: true,
    bounty: 520, length: 238, width: 33, domain: 'SEA', draft: 96, accel: 0.55,
    standoff: [1500, 1050], mounts: 9,
  }),
  FACTORY: def({
    type: 'FACTORY', kind: 'FACTORY', name: 'INK WORKS', shortName: 'IND',
    role: 'STRATEGIC INDUSTRIAL ASSET', faction: 'ENEMY',
    hp: 520, speed: 0, turnRate: 0, turretRate: 0, vision: 420,
    range: 0, damage: 0, reload: 99, ammo: 0, projectile: 'SHELL', accuracy: 0,
    bounty: 0, length: 52, width: 34,
  }),
};

export function kindLabel(kind: UnitKind): string {
  switch (kind) {
    case 'MBT': return 'ARMOR';
    case 'IFV': return 'MECH';
    case 'SPG': return 'ARTY';
    case 'REC': return 'RECCE';
    case 'INF': return 'INF';
    case 'AIR': return 'AIR';
    case 'SPAA': return 'AD';
    case 'HQ': return 'HQ';
    case 'FACTORY': return 'IND';
    case 'NAVAL': return 'SEA';
  }
}

/** true if the type is a naval hull */
export function isNavalType(t: string): boolean {
  return t === 'PATROL' || t === 'FRIGATE' || t === 'DESTROYER' || t === 'CRUISER' || t === 'BATTLESHIP';
}
