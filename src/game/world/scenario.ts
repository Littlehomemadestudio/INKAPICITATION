// ─────────────────────────────────────────────────────────────
// PAPER STORM · scenario
// OPERATION CROSSWIND — a single combined-arms deliberate attack
// ─────────────────────────────────────────────────────────────

import { Unit } from '../entities/units';
import type { UnitType } from '../entities/unitDefs';
import type { ObjectiveState } from '../core/types';
import type { Vec2 } from '../core/math';

export interface ScenarioData {
  units: Unit[];
  objectives: ObjectiveState[];
  anchors: Record<string, Vec2>;
  playerStaging: Vec2;
}

export function buildScenario(seed: number): ScenarioData {
  const units: Unit[] = [];
  const add = (type: UnitType, faction: 'FRIEND' | 'ENEMY', x: number, y: number, callsign: string, angle: number, defend?: Vec2) => {
    const u = new Unit(type, faction, x, y, callsign, seed);
    u.angle = angle;
    u.turretAngle = angle;
    if (defend) u.defendPos = defend;
    units.push(u);
    return u;
  };

  // ── friendly task force (SW staging) ───────────────────────
  add('M1127', 'FRIEND', 830, 2360, 'SCOUT 1', -0.55);
  add('M1127', 'FRIEND', 880, 2440, 'SCOUT 2', -0.55);
  add('M1A2', 'FRIEND', 620, 2430, 'SABRE 1-1', -0.55);
  add('M1A2', 'FRIEND', 545, 2510, 'SABRE 1-2', -0.55);
  add('M1A2', 'FRIEND', 640, 2600, 'SABRE 1-3', -0.55);
  add('M1A2', 'FRIEND', 555, 2685, 'SABRE 1-4', -0.55);
  add('M2A3', 'FRIEND', 420, 2460, 'RAIDER 1', -0.55);
  add('M2A3', 'FRIEND', 360, 2560, 'RAIDER 2', -0.55);
  add('M2A3', 'FRIEND', 430, 2660, 'RAIDER 3', -0.55);
  add('M109A7', 'FRIEND', 250, 2600, 'HAMMER 1', -0.55);
  add('M109A7', 'FRIEND', 300, 2700, 'HAMMER 2', -0.55);
  add('A10C', 'FRIEND', 200, 3200, 'TALON 1', -0.9);
  add('A10C', 'FRIEND', 260, 3260, 'TALON 2', -0.9);

  // ── PL ECHO — crossroads village ───────────────────────────
  const ECHO: Vec2 = { x: 2190, y: 1850 };
  add('T90M', 'ENEMY', 2150, 1755, 'ECHO 1', Math.PI * 0.62, { x: 2150, y: 1755 });
  add('T90M', 'ENEMY', 2270, 1795, 'ECHO 2', Math.PI * 0.55, { x: 2270, y: 1795 });
  add('BMP3', 'ENEMY', 2100, 1910, 'ECHO 3', Math.PI * 0.65, { x: 2100, y: 1910 });
  add('BMP3', 'ENEMY', 2300, 1945, 'ECHO 4', Math.PI * 0.6, { x: 2300, y: 1945 });
  add('BTR82A', 'ENEMY', 2380, 1740, 'ECHO 5', Math.PI * 0.5, { x: 2380, y: 1740 });

  // ── PL FOXTROT — Hill 214 ──────────────────────────────────
  const FOXTROT: Vec2 = { x: 2950, y: 1180 };
  add('T90M', 'ENEMY', 2890, 1110, 'FOXTROT 1', Math.PI * 0.75, { x: 2890, y: 1110 });
  add('T90M', 'ENEMY', 3020, 1195, 'FOXTROT 2', Math.PI * 0.8, { x: 3020, y: 1195 });
  add('BMP3', 'ENEMY', 2850, 1255, 'FOXTROT 3', Math.PI * 0.7, { x: 2850, y: 1255 });
  add('TOR', 'ENEMY', 3090, 1085, 'AD 1', Math.PI * 0.8, { x: 3090, y: 1085 });

  // ── HQ KRAKEN — NE compound ────────────────────────────────
  const HQA: Vec2 = { x: 3440, y: 640 };
  add('HQ', 'ENEMY', HQA.x, HQA.y, 'KRAKEN HQ', 0.18);
  add('PANTSIR', 'ENEMY', 3300, 730, 'AD 2', Math.PI * 0.85, { x: 3300, y: 730 });
  add('PANTSIR', 'ENEMY', 3570, 550, 'AD 3', Math.PI * 0.9, { x: 3570, y: 550 });
  add('2S19', 'ENEMY', 3140, 790, 'GUN 1', Math.PI * 0.75, { x: 3140, y: 790 });
  add('2S19', 'ENEMY', 3260, 875, 'GUN 2', Math.PI * 0.75, { x: 3260, y: 875 });
  // reserve
  add('T90M', 'ENEMY', 3530, 715, 'RES 1', Math.PI * 0.9, { x: 3530, y: 715 });
  add('T90M', 'ENEMY', 3610, 770, 'RES 2', Math.PI * 0.9, { x: 3610, y: 770 });
  add('BMP3', 'ENEMY', 3480, 790, 'RES 3', Math.PI * 0.9, { x: 3480, y: 790 });

  const objectives: ObjectiveState[] = [
    {
      id: 'ECHO',
      name: 'OBJ ECHO',
      desc: 'CROSSROADS — DESTROY FORWARD PLATOON',
      pos: ECHO,
      secured: false,
      primary: false,
    },
    {
      id: 'FOXTROT',
      name: 'OBJ FOXTROT',
      desc: 'HILL 214 — DESTROY HILL PLATOON',
      pos: FOXTROT,
      secured: false,
      primary: false,
    },
    {
      id: 'KRAKEN',
      name: 'OBJ KRAKEN',
      desc: 'ENEMY HQ — DESTROY COMMAND POST',
      pos: HQA,
      secured: false,
      primary: true,
    },
  ];

  return {
    units,
    objectives,
    anchors: { ECHO, FOXTROT, HQ: HQA },
    playerStaging: { x: 620, y: 2520 },
  };
}

export const BRIEFING = {
  operation: 'OPERATION CROSSWIND',
  sheet: 'SHEET 3368-IV · SERIES Z4E · 1:10 000',
  situation: [
    'KRAKEN GROUP holds prepared defences across the river line. Their forward platoon (PL ECHO) holds the crossroads at NOVY MOST; a reinforced platoon (PL FOXTROT) occupies HILL 214 with short-range air defence. Their command post is dug in at the north-eastern compound, screened by two air defence systems and a pair of self-propelled guns.',
    'The enemy is expected to hold in depth and to commit his armour reserve once the forward positions break. His artillery will engage any force it can observe — move dispersed, use the tree lines, and keep your reconnaissance forward.',
  ],
  mission:
    'TASK FORCE SABRE will breach the river line, destroy the enemy defences in sector, and neutralise the KRAKEN command post. You command all friendly forces on the sheet.',
  execution: [
    'PHASE 1 — Reconnoitre. Push SCOUT sections across the northern ford or along the MSR. Locate the enemy without committing the armour.',
    'PHASE 2 — Soften. Task HAMMER (self-propelled artillery) against identified positions. Enemy guns reveal themselves when they fire — counter-battery them.',
    'PHASE 3 — Break. Cross at the bridge or the ford, fix the defenders, and destroy them with armour and mechanised infantry. TALON (attack aircraft) is available on call — watch for enemy air defence.',
  ],
  forces: [
    ['SABRE 1-1 … 1-4', 'M1A2 SEPv3 — main battle tank'],
    ['RAIDER 1 … 3', 'M2A3 Bradley — infantry fighting vehicle'],
    ['HAMMER 1 … 2', 'M109A7 Paladin — self-propelled 155 mm'],
    ['SCOUT 1 … 2', 'M1127 Stryker — reconnaissance'],
    ['TALON 1 … 2', 'A-10C Thunderbolt II — attack aircraft'],
  ],
  controls: [
    ['LMB / DRAG', 'select unit · box-select units'],
    ['RMB', 'move · attack target · set patrol'],
    ['A + LMB', 'attack-move (engage on the way)'],
    ['F + LMB', 'artillery fire mission on position'],
    ['S / H', 'stop · hold position'],
    ['WHEEL / WASD / MMB', 'zoom · pan camera'],
    ['SPACE / 1 2 3', 'pause · simulation speed'],
    ['ESC', 'deselect · cancel order mode'],
  ],
};
