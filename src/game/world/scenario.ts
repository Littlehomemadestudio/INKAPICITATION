// ─────────────────────────────────────────────────────────────
// PAPER STORM · scenario
// OPERATION CROSSWIND — a combined-arms fight for ground, ink
// works, and the enemy command post. The map itself pays.
// ─────────────────────────────────────────────────────────────

import { Unit } from '../entities/units';
import type { UnitType } from '../entities/unitDefs';
import type { ObjectiveState, Sector } from '../core/types';
import type { Vec2 } from '../core/math';
import type { Terrain } from './terrain';

export interface ScenarioData {
  units: Unit[];
  objectives: ObjectiveState[];
  sectors: Sector[];
  anchors: Record<string, Vec2>;
  playerStaging: Vec2;
  startInk: { FRIEND: number; ENEMY: number };
}

export function buildScenario(seed: number, terrain: Terrain): ScenarioData {
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
  add('M2A3', 'FRIEND', 420, 2460, 'RAIDER 1', -0.55);
  add('M2A3', 'FRIEND', 360, 2560, 'RAIDER 2', -0.55);
  add('M109A7', 'FRIEND', 250, 2600, 'HAMMER 1', -0.55);
  add('M109A7', 'FRIEND', 300, 2700, 'HAMMER 2', -0.55);
  add('A10C', 'FRIEND', 200, 3200, 'TALON 1', -0.9);

  // ── PL ECHO — crossroads village, dug in on the trench line ──
  const ECHO: Vec2 = { x: 2190, y: 1850 };
  add('T90M', 'ENEMY', 2150, 1716, 'ECHO 1', Math.PI * 0.62, { x: 2150, y: 1716 });
  add('T90M', 'ENEMY', 2270, 1795, 'ECHO 2', Math.PI * 0.55, { x: 2270, y: 1795 });
  add('BMP3', 'ENEMY', 2220, 1708, 'ECHO 3', Math.PI * 0.65, { x: 2220, y: 1708 });
  add('BMP3', 'ENEMY', 2300, 1945, 'ECHO 4', Math.PI * 0.6, { x: 2300, y: 1945 });
  add('BTR82A', 'ENEMY', 2305, 1762, 'ECHO 5', Math.PI * 0.5, { x: 2305, y: 1762 });

  // ── PL FOXTROT — Hill 214, hull-down on the shoulders ────
  const FOXTROT: Vec2 = { x: 2950, y: 1180 };
  add('T90M', 'ENEMY', 2905, 1062, 'FOXTROT 1', Math.PI * 0.75, { x: 2905, y: 1062 });
  add('T90M', 'ENEMY', 3020, 1195, 'FOXTROT 2', Math.PI * 0.8, { x: 3020, y: 1195 });
  add('BMP3', 'ENEMY', 3050, 1242, 'FOXTROT 3', Math.PI * 0.7, { x: 3050, y: 1242 });
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
  add('BMP3', 'ENEMY', 3425, 806, 'RES 3', Math.PI * 0.9, { x: 3425, y: 806 });

  // ── ink works — the economic objectives ────────────────────
  for (const site of terrain.factories) {
    const neutral = site.id === 'ZAVOD3';
    const f = new Unit('FACTORY', 'ENEMY', site.x, site.y, site.name, seed);
    f.angle = 0;
    f.factoryId = site.id;
    f.factoryCtl = neutral ? 'NEUTRAL' : 'ENEMY';
    f.intel = 'DETECTED';
    units.push(f);
    if (site.id === 'MOLOT9') {
      add('T90M', 'ENEMY', site.x - 55, site.y + 108, 'MOLOT 1', Math.PI * 0.8, { x: site.x - 55, y: site.y + 108 });
      add('BMP3', 'ENEMY', site.x + 20, site.y + 106, 'MOLOT 2', Math.PI * 0.75, { x: site.x + 20, y: site.y + 106 });
    }
    if (site.id === 'ZAVOD7') {
      add('BMP3', 'ENEMY', site.x - 125, site.y + 12, 'ZAVOD 1', Math.PI * 0.6, { x: site.x - 125, y: site.y + 12 });
      add('BTR82A', 'ENEMY', site.x + 150, site.y - 80, 'ZAVOD 2', Math.PI * 0.55, { x: site.x + 150, y: site.y - 80 });
      add('TOR', 'ENEMY', site.x + 60, site.y + 170, 'AD 4', Math.PI * 0.6, { x: site.x + 60, y: site.y + 170 });
    }
  }

  // ── the ground itself pays — strategic sectors ─────────────
  const sectors: Sector[] = [
    { id: 'TOWN', name: 'NOVY MOST', pos: { x: 2190, y: 1850 }, radius: 380, income: 2.0, control: 'ENEMY', captureTime: 9, captureT: 0, capturing: null },
    { id: 'HILL', name: 'HILL 214', pos: { x: 2950, y: 1180 }, radius: 340, income: 2.6, control: 'ENEMY', captureTime: 9, captureT: 0, capturing: null },
    { id: 'RIDGE', name: 'ZAPAD RIDGE', pos: { x: 820, y: 740 }, radius: 380, income: 1.6, control: 'NEUTRAL', captureTime: 9, captureT: 0, capturing: null },
    { id: 'NBRIDGE', name: 'NORTH BRIDGE', pos: { x: 1240, y: 1400 }, radius: 260, income: 1.4, control: 'ENEMY', captureTime: 8, captureT: 0, capturing: null },
    { id: 'EBRIDGE', name: 'EAST BRIDGE', pos: { x: 2352, y: 1812 }, radius: 280, income: 1.6, control: 'ENEMY', captureTime: 8, captureT: 0, capturing: null },
    { id: 'FARMS', name: 'SOUTH FARMS', pos: { x: 1900, y: 2650 }, radius: 420, income: 1.8, control: 'FRIEND', captureTime: 9, captureT: 0, capturing: null },
    { id: 'PLATEAU', name: 'KRAKEN PLATEAU', pos: { x: 3440, y: 640 }, radius: 420, income: 2.2, control: 'ENEMY', captureTime: 10, captureT: 0, capturing: null },
  ];

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
    sectors,
    anchors: { ECHO, FOXTROT, HQ: HQA },
    playerStaging: { x: 620, y: 2520 },
    startInk: { FRIEND: 260, ENEMY: 340 },
  };
}

export const BRIEFING = {
  operation: 'OPERATION CROSSWIND',
  sheet: 'SHEET 3368-IV · SERIES Z4E · 1:10 000',
  situation: [
    'KRAKEN GROUP holds prepared defences across the river line. Their forward platoon (PL ECHO) holds the crossroads at NOVY MOST; a reinforced platoon (PL FOXTROT) occupies HILL 214 with short-range air defence. Their command post is dug in on the north-eastern plateau, screened by air defence systems and self-propelled guns.',
    'Three ink works feed their operation: MOLot 9 on the northern rail line, ZAVOD 3 in the southern farm belt (abandoned — unclaimed), and the ZAVOD 7 combine on the eastern highway. The works are hardened but not invulnerable. They can be captured — or destroyed.',
    'Your authority to sustain this fight is INK. It flows in a thin trickle from corps, faster from every sector you clear, and heavily from any works you hold. Destroyed enemy formations also yield ink. Spend it to raise battalions at the staging area.',
  ],
  mission:
    'TASK FORCE SABRE will cross the river, take the ground that pays, and neutralise the KRAKEN command post. Every bridge, hill and works you hold widens your margin of superiority.',
  execution: [
    'PHASE 1 — Reconnoitre. Push SCOUT sections across the northern bridge or along the MSR. High ground sees further; ridgelines and buildings mask what lies behind them. The enemy is dug in — trench lines read as broken dark scars with a berm behind.',
    'PHASE 2 — Soften. Artillery fire scatters: observed targets are hit hard, blind area fire wastes shells. Keep eyes on a target and your guns will walk onto it — order artillery onto an enemy unit directly for corrected fire. Stone walls, buildings, ruins and wrecks shelter whoever holds them; suppress defenders with fire before you cross. The battlefield is matter, not a picture: shells fell timber, breach walls, and bring buildings down — a destroyed wall stops sheltering, a collapsed building opens new sightlines and rubble that still hides a hull.',
    'PHASE 3 — Break. Fix the defenders, flank their cover, strike their flanks and rear — hits from bad angles hurt far more. Attack aircraft strike in committed passes and egress. TALON is available on call — watch for enemy air defence. Tanks push through tree lines and stone walls by force — light vehicles must steer; crews under fire will dive for the nearest solid cover and resume their mission when it slackens. Trust them to stay alive; order them forward when you must.',
    'END STATE — KRAKEN HQ destroyed. The works you hold decide how expensive the victory was.',
  ],
  forces: [
    ['SABRE 1-1 … 1-3', 'M1A2 SEPv3 — main battle tank'],
    ['RAIDER 1 … 2', 'M2A3 Bradley — infantry fighting vehicle'],
    ['HAMMER 1 … 2', 'M109A7 Paladin — self-propelled 155 mm'],
    ['SCOUT 1 … 2', 'M1127 Stryker — reconnaissance'],
    ['TALON 1', 'A-10C Thunderbolt II — attack aircraft'],
    ['DEPLOY PANEL', 'raise further battalions with INK'],
  ],
  economy: [
    ['BASE INCOME', '+2.2 ink/s — always, even at your lowest'],
    ['SECTORS', 'held ground pays +1.4 to +2.6 ink/s each'],
    ['INK WORKS', 'captured works pay +5 ink/s — or burn'],
    ['KILL BOUNTIES', 'destroyed enemy units pay their worth in ink'],
    ['DEPLOYMENT', 'battalions arrive at ASSEMBLY ALPHA, SW corner'],
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
