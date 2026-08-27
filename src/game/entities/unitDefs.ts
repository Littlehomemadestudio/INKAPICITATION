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
  | 'A10C'
  | 'T90M'
  | 'BMP3'
  | 'BTR82A'
  | '2S19'
  | 'TOR'
  | 'PANTSIR'
  | 'HQ';

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
  /** hull length in metres (draw anchor) */
  length: number;
  width: number;
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
    length: 7.9, width: 3.7,
  }),
  M2A3: def({
    type: 'M2A3', kind: 'IFV', name: 'M2A3 BRADLEY', shortName: 'IFV',
    role: 'INFANTRY FIGHTING VEHICLE', faction: 'FRIEND',
    hp: 55, speed: 12.5, turnRate: 1.5, turretRate: 3.2, vision: 620,
    range: 450, damage: 3.4, burst: 5, burstInterval: 0.16, reload: 3.0,
    ammo: 600, projectile: 'AUTO', accuracy: 0.85,
    length: 6.5, width: 3.2,
  }),
  M109A7: def({
    type: 'M109A7', kind: 'SPG', name: 'M109A7 PALADIN', shortName: 'SPG',
    role: 'SELF-PROPELLED HOWITZER', faction: 'FRIEND',
    hp: 45, speed: 7.5, turnRate: 0.9, turretRate: 1.3, vision: 380,
    range: 1950, minRange: 320, damage: 52, splash: 42, reload: 8.5,
    ammo: 40, projectile: 'ARTY', accuracy: 0.72,
    length: 9.3, width: 3.4,
  }),
  M1127: def({
    type: 'M1127', kind: 'REC', name: 'M1127 RECON STRIKER', shortName: 'REC',
    role: 'RECONNAISSANCE VEHICLE', faction: 'FRIEND',
    hp: 36, speed: 16.5, turnRate: 1.9, turretRate: 3.8, vision: 1050,
    range: 360, damage: 2.6, burst: 4, burstInterval: 0.14, reload: 2.2,
    ammo: 480, projectile: 'AUTO', accuracy: 0.82,
    length: 6.9, width: 2.9,
  }),
  A10C: def({
    type: 'A10C', kind: 'AIR', name: 'A-10C THUNDERBOLT II', shortName: 'CAS',
    role: 'ATTACK AIRCRAFT', faction: 'FRIEND',
    hp: 90, speed: 62, turnRate: 0.85, turretRate: 6, vision: 1250,
    range: 780, damage: 46, splash: 30, reload: 1.1,
    ammo: 6, projectile: 'MISSILE_AIR', accuracy: 0.9, canHitAir: false, isAir: true,
    length: 17.5, width: 14,
  }),

  // ── enemy ──────────────────────────────────────────────────
  T90M: def({
    type: 'T90M', kind: 'MBT', name: 'T-90M PRORYV', shortName: 'MBT',
    role: 'MAIN BATTLE TANK', faction: 'ENEMY',
    hp: 92, speed: 9.5, turnRate: 1.0, turretRate: 2.1, vision: 560,
    range: 600, damage: 30, reload: 6.2, ammo: 30, projectile: 'SHELL', accuracy: 0.78,
    length: 6.9, width: 3.5,
  }),
  BMP3: def({
    type: 'BMP3', kind: 'IFV', name: 'BMP-3', shortName: 'IFV',
    role: 'INFANTRY FIGHTING VEHICLE', faction: 'ENEMY',
    hp: 52, speed: 11.5, turnRate: 1.4, turretRate: 3.0, vision: 560,
    range: 420, damage: 3.2, burst: 5, burstInterval: 0.17, reload: 3.2,
    ammo: 500, projectile: 'AUTO', accuracy: 0.83,
    length: 6.7, width: 3.3,
  }),
  BTR82A: def({
    type: 'BTR82A', kind: 'REC', name: 'BTR-82A', shortName: 'REC',
    role: 'RECONNAISSANCE VEHICLE', faction: 'ENEMY',
    hp: 40, speed: 13.5, turnRate: 1.7, turretRate: 3.4, vision: 800,
    range: 380, damage: 3.0, burst: 4, burstInterval: 0.15, reload: 2.6,
    ammo: 440, projectile: 'AUTO', accuracy: 0.8,
    length: 7.6, width: 2.9,
  }),
  '2S19': def({
    type: '2S19', kind: 'SPG', name: '2S19 MSTA-S', shortName: 'SPG',
    role: 'SELF-PROPELLED HOWITZER', faction: 'ENEMY',
    hp: 45, speed: 7.5, turnRate: 0.9, turretRate: 1.2, vision: 380,
    range: 2000, minRange: 340, damage: 50, splash: 44, reload: 9.5,
    ammo: 40, projectile: 'ARTY', accuracy: 0.7,
    length: 9.1, width: 3.4,
  }),
  TOR: def({
    type: 'TOR', kind: 'SPAA', name: 'TOR-M2', shortName: 'SAM',
    role: 'SHORT-RANGE AIR DEFENCE', faction: 'ENEMY',
    hp: 50, speed: 9.5, turnRate: 1.2, turretRate: 4, vision: 950,
    range: 1500, damage: 30, reload: 3.2, ammo: 12, projectile: 'MISSILE_SPAA',
    accuracy: 0.68, canHitAir: true,
    length: 7.2, width: 3.4,
  }),
  PANTSIR: def({
    type: 'PANTSIR', kind: 'SPAA', name: 'PANTSIR-S1', shortName: 'SAM',
    role: 'SHORAD SYSTEM', faction: 'ENEMY',
    hp: 42, speed: 12, turnRate: 1.4, turretRate: 4, vision: 1000,
    range: 1650, damage: 30, reload: 3.6, ammo: 12, projectile: 'MISSILE_SPAA',
    accuracy: 0.66, canHitAir: true,
    length: 7.9, width: 3.1,
  }),
  HQ: def({
    type: 'HQ', kind: 'HQ', name: 'KRAKEN GROUP HQ', shortName: 'HQ',
    role: 'ENEMY COMMAND OBJECTIVE', faction: 'ENEMY',
    hp: 380, speed: 0, turnRate: 0, turretRate: 0, vision: 700,
    range: 0, damage: 0, reload: 99, ammo: 0, projectile: 'SHELL', accuracy: 0,
    length: 34, width: 26,
  }),
};

export function kindLabel(kind: UnitKind): string {
  switch (kind) {
    case 'MBT': return 'ARMOR';
    case 'IFV': return 'MECH';
    case 'SPG': return 'ARTY';
    case 'REC': return 'RECCE';
    case 'AIR': return 'AIR';
    case 'SPAA': return 'AD';
    case 'HQ': return 'HQ';
  }
}
