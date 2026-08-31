// ─────────────────────────────────────────────────────────────
// PAPER STORM · the order of battle
// The player's arsenal: one entry per unit type, priced in ink.
// Extends BattalionDef so the production queue machinery is
// unchanged — a purchase is a muster of one.
// ─────────────────────────────────────────────────────────────

import type { UnitType } from './unitDefs';
import type { BattalionDef } from '../core/types';

export type Branch = 'GROUND' | 'AIR' | 'NAVAL';

export interface RosterEntry extends BattalionDef {
  type: UnitType;
  branch: Branch;
  /** subcategory label inside the branch */
  group: string;
  /** short stamp, e.g. MBT */
  short: string;
  /** class line, e.g. MAIN BATTLE TANK */
  role: string;
  /** armament readout — real terminology */
  armament: string[];
  /** special characteristics chips */
  traits: string[];
  /** 0..5 instrument notches — qualitative, game-true */
  firepower: number;
  armor: number;
  mobility: number;
  airDef: number;
  /** display range in metres (main weapon) */
  rangeM: number;
  /** movement readout */
  movement: string;
  /** where it arrives */
  delivery: string;
}

function r(p: Omit<RosterEntry, 'id' | 'composition' | 'kinds' | 'units' | 'desc'> & { desc: string }): RosterEntry {
  return {
    id: p.type,
    composition: `1× ${p.short}`,
    kinds: [p.short],
    units: [{ type: p.type, n: 1 }],
    ...p,
  };
}

/** what the player can raise — the arsenal */
export const FRIEND_ROSTER: RosterEntry[] = [
  // ── GROUND · INFANTRY ────────────────────────────────────────
  r({
    type: 'RIFLE', branch: 'GROUND', group: 'INFANTRY', short: 'INF',
    name: 'RIFLE SQUAD', role: 'DISMOUNTED INFANTRY',
    cost: 55, buildTime: 9,
    desc: 'Ten riflemen with nothing but their boots. Slow, fragile, nearly invisible in tree lines — and the cheapest way to hold ground, works and crossroads once the armour has taken them.',
    armament: ['5.56 mm RIFLES ×10', 'AT4 ×2', '7.62 mm GPMG'],
    traits: ['INFILTRATION', 'HOLDS GROUND', 'COVERS IN TREE LINES'],
    firepower: 1, armor: 1, mobility: 2, airDef: 0, rangeM: 300,
    movement: 'FOOT · 19 KM/H',
    delivery: 'ARRIVES SOUTH — MOVES TO ASSEMBLY ALPHA',
  }),
  r({
    type: 'M1127', branch: 'GROUND', group: 'RECON', short: 'REC',
    name: 'M1127 RECON STRIKER', role: 'RECONNAISSANCE VEHICLE',
    cost: 40, buildTime: 11,
    desc: 'Fast eight-wheel eyes. Sees far, runs fast, folds under any real gun — keep it on ridgelines and tree edges, not in the firefight.',
    armament: ['12.7 mm HMG', '7.62 mm MG', 'SENSOR MAST'],
    traits: ['RECON', 'LONG SIGHT', 'FAST'],
    firepower: 1, armor: 1, mobility: 5, airDef: 0, rangeM: 360,
    movement: 'WHEELED · 59 KM/H',
    delivery: 'ARRIVES SOUTH — MOVES TO ASSEMBLY ALPHA',
  }),
  r({
    type: 'M2A3', branch: 'GROUND', group: 'MECH', short: 'IFV',
    name: 'M2A3 BRADLEY', role: 'INFANTRY FIGHTING VEHICLE',
    cost: 65, buildTime: 13,
    desc: 'The workhorse. A 25 mm autocannon that shreds thin skins and a TOW rack that worries tanks — enough armour to lead, not enough to brawl.',
    armament: ['25 mm AUTOCANNON', 'TOW ×2', '7.62 mm MG'],
    traits: ['BALANCED', 'ANTI-TANK MISSILES'],
    firepower: 2, armor: 2, mobility: 4, airDef: 0, rangeM: 450,
    movement: 'TRACKED · 45 KM/H',
    delivery: 'ARRIVES SOUTH — MOVES TO ASSEMBLY ALPHA',
  }),
  r({
    type: 'M1A2', branch: 'GROUND', group: 'ARMOR', short: 'MBT',
    name: 'M1A2 SEPv3 ABRAMS', role: 'MAIN BATTLE TANK',
    cost: 115, buildTime: 16,
    desc: 'Heavy armoured direct-fire vehicle designed for frontline breakthrough and defensive engagements. The 120 mm gun kills anything it can see; the composite hull shrugs off what answers.',
    armament: ['120 mm MAIN GUN', '12.7 mm HMG', '7.62 mm MG'],
    traits: ['HEAVY ARMOR', 'DIRECT FIRE'],
    firepower: 4, armor: 4, mobility: 3, airDef: 0, rangeM: 640,
    movement: 'TRACKED · 38 KM/H',
    delivery: 'ARRIVES SOUTH — MOVES TO ASSEMBLY ALPHA',
  }),
  r({
    type: 'M109A7', branch: 'GROUND', group: 'ARTILLERY', short: 'SPG',
    name: 'M109A7 PALADIN', role: 'SELF-PROPELLED HOWITZER',
    cost: 75, buildTime: 16,
    desc: '155 mm indirect fire at two kilometres. Fires blind and scatters; fires observed and kills. Keep it behind the line and give it eyes.',
    armament: ['155 mm HOWITZER', '40× HE-FRAG', '7.62 mm MG'],
    traits: ['INDIRECT FIRE', 'LONG-RANGE', 'DISPLACES UNDER THREAT'],
    firepower: 4, armor: 1, mobility: 2, airDef: 0, rangeM: 1950,
    movement: 'TRACKED · 27 KM/H',
    delivery: 'ARRIVES SOUTH — MOVES TO ASSEMBLY ALPHA',
  }),

  // ── GROUND · AIR DEFENSE — four systems, four doctrines ─────
  r({
    type: 'VULCAN', branch: 'GROUND', group: 'AIR DEFENSE', short: 'GUN AA',
    name: 'M163A2 VULCAN', role: 'ANTI-AIRCRAFT GUN',
    cost: 70, buildTime: 12,
    desc: 'A six-barrel 20 mm rotary on tracks. Cheap, fast, and lethal against anything flying low — but the ceiling is low: aircraft orbiting high are outside its reach entirely.',
    armament: ['20 mm ROTARY CANNON', '1400× HEI-T TRACERS'],
    traits: ['ANTI-AIR', 'LOW SKIES ONLY', 'RAPID FIRE', 'MOBILE'],
    firepower: 2, armor: 1, mobility: 4, airDef: 2, rangeM: 900,
    movement: 'TRACKED · 49 KM/H',
    delivery: 'ARRIVES SOUTH — MOVES TO ASSEMBLY ALPHA',
  }),
  r({
    type: 'LINEBACKER', branch: 'GROUND', group: 'AIR DEFENSE', short: 'SHORAD',
    name: 'M6 LINEBACKER', role: 'SHORT-RANGE AIR DEFENCE',
    cost: 130, buildTime: 20,
    desc: 'Stinger missiles on a Bradley hull — the system that rolls with the armour. Instant acquisition, quick lock, hard limit of eight rounds before the crews reload.',
    armament: ['4× FIM-92 STINGER ×2', '25 mm AUTOCANNON'],
    traits: ['ANTI-AIR', 'MISSILES', 'ROLLS WITH ARMOR', 'MOBILE'],
    firepower: 2, armor: 2, mobility: 4, airDef: 3, rangeM: 1250,
    movement: 'TRACKED · 45 KM/H',
    delivery: 'ARRIVES SOUTH — MOVES TO ASSEMBLY ALPHA',
  }),
  r({
    type: 'NASAMS', branch: 'GROUND', group: 'AIR DEFENSE', short: 'SAM',
    name: 'NASAMS II LAUNCHER', role: 'MEDIUM-RANGE AIR DEFENCE',
    cost: 240, buildTime: 34,
    desc: 'AMRAAMs on a wheeled chassis — the frontline umbrella. Must emplace before the radar works, so position it behind the line and it guards everything within two and a half kilometres of sky.',
    armament: ['6× AIM-120 AMRAAM', 'MPQ-64 RADAR'],
    traits: ['ANTI-AIR', 'AREA UMBRELLA', 'MUST EMPLACE'],
    firepower: 3, armor: 1, mobility: 2, airDef: 4, rangeM: 2400,
    movement: 'WHEELED · 31 KM/H',
    delivery: 'ARRIVES SOUTH — MOVES TO ASSEMBLY ALPHA',
  }),
  r({
    type: 'PATRIOT', branch: 'GROUND', group: 'AIR DEFENSE', short: 'LR SAM',
    name: 'MIM-104 PATRIOT PAC-3', role: 'LONG-RANGE AIR DEFENCE',
    cost: 420, buildTime: 55,
    desc: 'The theatre shield. Nearly four kilometres of defended sky from wherever it stands — but it is slow, must emplace, carries only four interceptors, and dies easily if the enemy finds it. Placement is everything.',
    armament: ['4× PAC-3 INTERCEPTORS', 'AN/MPQ-65 RADAR'],
    traits: ['ANTI-AIR', 'THEATRE SHIELD', 'MUST EMPLACE', 'HIGH-VALUE TARGET'],
    firepower: 4, armor: 1, mobility: 1, airDef: 5, rangeM: 3800,
    movement: 'TRACTOR · 20 KM/H',
    delivery: 'ARRIVES SOUTH — MOVES TO ASSEMBLY ALPHA',
  }),

  // ── AIR ──────────────────────────────────────────────────────
  r({
    type: 'F16C', branch: 'AIR', group: 'FIGHTER', short: 'FTR',
    name: 'F-16C VIPER', role: 'AIR SUPERIORITY FIGHTER',
    cost: 160, buildTime: 24,
    desc: 'Fast, high, and armed only for the air-to-air kill — the Viper exists to take enemy aircraft off the board before they reach the ground. No air threat, no reason to launch it.',
    armament: ['AIM-120 AMRAAM ×4', '20 mm CANNON'],
    traits: ['AIR-TO-AIR', 'INTERCEPT', 'HIGH SPEED'],
    firepower: 3, armor: 1, mobility: 5, airDef: 0, rangeM: 950,
    movement: 'JET · 280 KM/H',
    air: true,
    delivery: 'DELIVERS TO FLIGHT LINE — LAUNCH VIA AIR OPERATIONS',
  }),
  r({
    type: 'A10C', branch: 'AIR', group: 'ATTACK', short: 'CAS',
    name: 'A-10C THUNDERBOLT II', role: 'ATTACK AIRCRAFT',
    cost: 130, buildTime: 26,
    desc: 'A gun with an aeroplane built around it. Six guided munitions per sortie against tanks, guns and works — but enemy air defence bites back, so mind the SAM rings before committing it.',
    armament: ['AGM-114 ×6', '30 mm GAU-8 CANNON'],
    traits: ['GROUND ATTACK', 'TOUGH AIRFRAME', 'ORBITS ON STATION'],
    firepower: 4, armor: 2, mobility: 3, airDef: 0, rangeM: 780,
    movement: 'JET · 223 KM/H',
    air: true,
    delivery: 'DELIVERS TO FLIGHT LINE — LAUNCH VIA AIR OPERATIONS',
  }),

  // ── NAVAL ────────────────────────────────────────────────────
  r({
    type: 'PATROL', branch: 'NAVAL', group: 'PATROL', short: 'PT',
    name: 'MORAY FAST ATTACK CRAFT', role: 'TORPEDO / PATROL CRAFT',
    cost: 45, buildTime: 15,
    desc: 'Small, quick, brave and expendable. Guns for boats, torpedoes for hulls too big to duel — the eyes of the fleet at a bargain price.',
    armament: ['25 mm GUN', '2× 533 mm TORPEDO'],
    traits: ['TORPEDOES', 'FAST', 'EXPENDABLE'],
    firepower: 2, armor: 1, mobility: 5, airDef: 1, rangeM: 430,
    movement: 'HULL · 29 KT',
    naval: true,
    delivery: 'ARRIVES FROM OPEN WATER SE — MAKES FOR THE ANCHORAGE',
  }),
  r({
    type: 'FRIGATE', branch: 'NAVAL', group: 'ESCORT', short: 'FF',
    name: 'VALKYRIE FRIGATE', role: 'ESCORT / GENERAL COMBAT',
    cost: 220, buildTime: 45,
    desc: 'The fleet umbrella begins here — a 76 mm gun forward and surface-to-air cells amidships. She screens what matters and holds her own against anything her own size.',
    armament: ['76 mm GUN', '8× SAM CELLS', 'CIWS'],
    traits: ['ESCORT', 'FLEET AIR DEFENSE', 'GENERAL COMBAT'],
    firepower: 2, armor: 2, mobility: 3, airDef: 3, rangeM: 860,
    movement: 'HULL · 20 KT',
    naval: true,
    delivery: 'ARRIVES FROM OPEN WATER SE — MAKES FOR THE ANCHORAGE',
  }),
  r({
    type: 'DESTROYER', branch: 'NAVAL', group: 'MISSILE COMBATANT', short: 'DD',
    name: 'SLEIPNIR DESTROYER', role: 'GUIDED MISSILE DESTROYER',
    cost: 380, buildTime: 60,
    desc: 'A 130 mm main battery, deep SAM magazines and eight ship-killers in the cells — the deliberate answer to almost anything afloat or on the shore.',
    armament: ['130 mm GUN', '8× SSM', '16× SAM VLS'],
    traits: ['MISSILE ARMED', 'AREA AIR DEFENSE', 'SHORE BOMBARDMENT'],
    firepower: 3, armor: 3, mobility: 3, airDef: 4, rangeM: 1160,
    movement: 'HULL · 18 KT',
    naval: true,
    delivery: 'ARRIVES FROM OPEN WATER SE — MAKES FOR THE ANCHORAGE',
  }),
  r({
    type: 'CRUISER', branch: 'NAVAL', group: 'MISSILE COMBATANT', short: 'CG',
    name: 'TRIREME CRUISER', role: 'LARGE SURFACE COMBATANT',
    cost: 650, buildTime: 80,
    desc: 'Twin 152 mm turrets and magazine enough to keep them firing all afternoon. Presence itself — the hull that makes an anchorage an anchorage.',
    armament: ['2×2 152 mm GUNS', '16× SSM', '24× SAM VLS'],
    traits: ['HEAVY GUNFIRE', 'AREA AIR DEFENSE', 'FLAGSHIP'],
    firepower: 4, armor: 4, mobility: 2, airDef: 4, rangeM: 1460,
    movement: 'HULL · 16 KT',
    naval: true,
    delivery: 'ARRIVES FROM OPEN WATER SE — MAKES FOR THE ANCHORAGE',
  }),
  r({
    type: 'BATTLESHIP', branch: 'NAVAL', group: 'CAPITAL', short: 'BB',
    name: 'VELIKIY — CAPITAL SHIP', role: 'THE BIG BOI · BATTLESHIP',
    cost: 1500, buildTime: 120,
    desc: 'Nine 380 mm rifles, sixteen missiles, a hull that anchors a theatre. Everything on this sheet is in her shadow — save the ink, bring the storm.',
    armament: ['3×3 380 mm MAIN BATTERY', '16× SSM', 'CIWS ×4'],
    traits: ['CAPITAL SHIP', 'HEAVY ARMOR', 'SHORE BOMBARDMENT', 'STRATEGIC ASSET'],
    firepower: 5, armor: 5, mobility: 1, airDef: 3, rangeM: 1650,
    movement: 'HULL · 14 KT',
    naval: true,
    delivery: 'ARRIVES FROM OPEN WATER SE — MAKES FOR THE ANCHORAGE',
  }),
];

/** branch display metadata */
export const BRANCH_LABEL: Record<Branch, string> = {
  GROUND: 'GROUND',
  AIR: 'AIR',
  NAVAL: 'NAVAL',
};

/** ordered groups per branch (as displayed) */
export const BRANCH_GROUPS: Record<Branch, string[]> = {
  GROUND: ['INFANTRY', 'RECON', 'MECH', 'ARMOR', 'ARTILLERY', 'AIR DEFENSE'],
  AIR: ['FIGHTER', 'ATTACK'],
  NAVAL: ['PATROL', 'ESCORT', 'MISSILE COMBATANT', 'CAPITAL'],
};
