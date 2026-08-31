// ─────────────────────────────────────────────────────────────
// PAPER STORM · scenario
// OPERATION CROSSWIND — the AZURE COAST theatre. A combined-arms
// fight for a port city, the ground that pays, the sky above it,
// the bay below it, and the enemy command post on the plateau.
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

  // ── friendly task force (SW staging belt) ───────────────────
  add('M1127', 'FRIEND', 1790, 4740, 'SCOUT 1', -0.6);
  add('M1127', 'FRIEND', 1870, 4830, 'SCOUT 2', -0.6);
  add('M1A2', 'FRIEND', 1580, 4690, 'SABRE 1-1', -0.6);
  add('M1A2', 'FRIEND', 1490, 4790, 'SABRE 1-2', -0.6);
  add('M1A2', 'FRIEND', 1650, 4890, 'SABRE 1-3', -0.6);
  add('M2A3', 'FRIEND', 1350, 4770, 'RAIDER 1', -0.6);
  add('M2A3', 'FRIEND', 1270, 4870, 'RAIDER 2', -0.6);
  add('M109A7', 'FRIEND', 1160, 4900, 'HAMMER 1', -0.6);
  add('M109A7', 'FRIEND', 1240, 5000, 'HAMMER 2', -0.6);
  add('RIFLE', 'FRIEND', 1720, 4960, 'RIFLE 1', -0.6);
  add('VULCAN', 'FRIEND', 1610, 5020, 'IRON 1', -0.6);
  add('A10C', 'FRIEND', 1400, 5350, 'TALON 1', -0.9);

  // ── PL ECHO — the city bridgehead, dug in north of the CENTRAL BRIDGE ──
  const ECHO: Vec2 = { x: 3990, y: 3350 };
  add('T90M', 'ENEMY', 3940, 3280, 'ECHO 1', Math.PI * 0.55, { x: 3940, y: 3280 });
  add('T90M', 'ENEMY', 4090, 3300, 'ECHO 2', Math.PI * 0.5, { x: 4090, y: 3300 });
  add('BMP3', 'ENEMY', 3830, 3360, 'ECHO 3', Math.PI * 0.6, { x: 3830, y: 3360 });
  add('BMP3', 'ENEMY', 4200, 3440, 'ECHO 4', Math.PI * 0.62, { x: 4200, y: 3440 });
  add('BTR82A', 'ENEMY', 4010, 3410, 'ECHO 5', Math.PI * 0.52, { x: 4010, y: 3410 });
  add('TOR', 'ENEMY', 4330, 3180, 'AD 1', Math.PI * 0.55, { x: 4330, y: 3180 });

  // ── PL FOXTROT — HILL 204, hull-down on the shoulders ──────
  const FOXTROT: Vec2 = { x: 4800, y: 1800 };
  add('T90M', 'ENEMY', 4700, 1720, 'FOXTROT 1', Math.PI * 0.72, { x: 4700, y: 1720 });
  add('T90M', 'ENEMY', 4900, 1900, 'FOXTROT 2', Math.PI * 0.78, { x: 4900, y: 1900 });
  add('BMP3', 'ENEMY', 4960, 1740, 'FOXTROT 3', Math.PI * 0.7, { x: 4960, y: 1740 });
  add('TOR', 'ENEMY', 4650, 1880, 'AD 2', Math.PI * 0.75, { x: 4650, y: 1880 });

  // ── PL GOLF — the EASTERN AIRFIELD garrison ────────────────
  const GOLF: Vec2 = { x: 6620, y: 1330 };
  add('BMP3', 'ENEMY', 6490, 1400, 'GOLF 1', Math.PI * 0.75, { x: 6490, y: 1400 });
  add('BTR82A', 'ENEMY', 6760, 1290, 'GOLF 2', Math.PI * 0.7, { x: 6760, y: 1290 });
  add('PANTSIR', 'ENEMY', 6820, 1450, 'AD 3', Math.PI * 0.7, { x: 6820, y: 1450 });
  add('BUK', 'ENEMY', 6540, 1560, 'DOME 2', Math.PI * 0.72, { x: 6540, y: 1560 });

  // ── WESTWORKS OUTPOST — screening the abandoned works ──────
  const WEST: Vec2 = { x: 2320, y: 3150 };
  add('BMP3', 'ENEMY', 2360, 3130, 'WEST 1', Math.PI * 0.85, { x: 2360, y: 3130 });
  add('BTR82A', 'ENEMY', 2280, 3210, 'WEST 2', Math.PI * 0.8, { x: 2280, y: 3210 });

  // ── MOLot garrison — the northern rail works ───────────────
  add('T90M', 'ENEMY', 2660, 900, 'MOLOT 1', Math.PI * 0.75, { x: 2660, y: 900 });
  add('BMP3', 'ENEMY', 2540, 1010, 'MOLOT 2', Math.PI * 0.72, { x: 2540, y: 1010 });

  // ── EASTWORKS garrison — the eastern combine ───────────────
  add('T90M', 'ENEMY', 5980, 2170, 'ZAVOD E1', Math.PI * 0.6, { x: 5980, y: 2170 });
  add('BMP3', 'ENEMY', 5810, 2040, 'ZAVOD E2', Math.PI * 0.62, { x: 5810, y: 2040 });
  add('TOR', 'ENEMY', 6050, 2260, 'AD 4', Math.PI * 0.58, { x: 6050, y: 2260 });

  // ── HQ KRAKEN — the NE plateau compound ────────────────────
  const HQA: Vec2 = { x: 7150, y: 600 };
  add('HQ', 'ENEMY', HQA.x, HQA.y, 'KRAKEN HQ', 0.18);
  add('PANTSIR', 'ENEMY', 7000, 700, 'AD 5', Math.PI * 0.85, { x: 7000, y: 700 });
  add('PANTSIR', 'ENEMY', 7300, 520, 'AD 6', Math.PI * 0.9, { x: 7300, y: 520 });
  // the medium-range umbrella — the reason aircraft mind the plateau
  add('BUK', 'ENEMY', 6960, 420, 'DOME 1', Math.PI * 0.9, { x: 6960, y: 420 });
  add('2S19', 'ENEMY', 6820, 760, 'GUN 1', Math.PI * 0.75, { x: 6820, y: 760 });
  add('2S19', 'ENEMY', 6950, 850, 'GUN 2', Math.PI * 0.75, { x: 6950, y: 850 });
  // the armoured reserve
  add('T90M', 'ENEMY', 7250, 690, 'RES 1', Math.PI * 0.9, { x: 7250, y: 690 });
  add('T90M', 'ENEMY', 7330, 760, 'RES 2', Math.PI * 0.9, { x: 7330, y: 760 });
  add('BMP3', 'ENEMY', 7140, 800, 'RES 3', Math.PI * 0.9, { x: 7140, y: 800 });

  // ── PORT AZURE — the harbour flotilla and its defenders ────
  const PORT: Vec2 = { x: 4780, y: 4380 };
  add('PATROL', 'ENEMY', 4740, 4420, 'KPT 1', Math.PI * 0.75, { x: 4740, y: 4420 });
  add('PATROL', 'ENEMY', 4830, 4470, 'KPT 2', Math.PI * 0.9, { x: 4830, y: 4470 });
  add('PANTSIR', 'ENEMY', 4660, 4200, 'AD 7', Math.PI * 0.6, { x: 4660, y: 4200 });
  // the shore battery — guns behind the port
  add('2S19', 'ENEMY', 4620, 4080, 'GUN 3', Math.PI * 0.5, { x: 4620, y: 4080 });

  // ── COASTAL SAM SITE — the headland battery ────────────────
  const HEADLAND: Vec2 = { x: 5950, y: 4380 };
  add('PANTSIR', 'ENEMY', 5900, 4350, 'AD 8', Math.PI * 0.55, { x: 5900, y: 4350 });
  add('2S19', 'ENEMY', 6050, 4420, 'GUN 4', Math.PI * 0.5, { x: 6050, y: 4420 });

  // the enemy's close air — held ready on the airfield
  add('SU25K', 'ENEMY', 6480, 1370, 'CLAW 1', Math.PI * 0.62);
  add('SU25K', 'ENEMY', 6620, 1300, 'CLAW 2', Math.PI * 0.62);

  // ── ink works — the economic objectives ────────────────────
  for (const site of terrain.factories) {
    const neutral = site.id === 'ZAVODW';
    const f = new Unit('FACTORY', 'ENEMY', site.x, site.y, site.name, seed);
    f.angle = 0;
    f.factoryId = site.id;
    f.factoryCtl = neutral ? 'NEUTRAL' : 'ENEMY';
    f.intel = 'DETECTED';
    units.push(f);
    if (site.id === 'MOLOT9') {
      add('BTR82A', 'ENEMY', site.x + 90, site.y + 60, 'MOLOT 3', Math.PI * 0.7, { x: site.x + 90, y: site.y + 60 });
    }
    if (site.id === 'ZAVODE') {
      add('BTR82A', 'ENEMY', site.x + 150, site.y - 70, 'ZAVOD E3', Math.PI * 0.55, { x: site.x + 150, y: site.y - 70 });
    }
  }

  // ── the ground itself pays — strategic sectors ─────────────
  const sectors: Sector[] = [
    { id: 'CITY', name: 'NOVY GOROD', pos: { x: 3990, y: 3550 }, radius: 460, income: 2.4, control: 'ENEMY', captureTime: 10, captureT: 0, capturing: null },
    { id: 'CBRIDGE', name: 'CENTRAL BRIDGE', pos: { x: 4055, y: 3535 }, radius: 300, income: 1.8, control: 'ENEMY', captureTime: 8, captureT: 0, capturing: null },
    { id: 'NBRIDGE', name: 'NORTH BRIDGE', pos: { x: 1450, y: 1560 }, radius: 300, income: 1.5, control: 'ENEMY', captureTime: 8, captureT: 0, capturing: null },
    { id: 'WBRIDGE', name: 'WEST BRIDGE', pos: { x: 2500, y: 2190 }, radius: 300, income: 1.4, control: 'ENEMY', captureTime: 8, captureT: 0, capturing: null },
    { id: 'HILL', name: 'HILL 204', pos: { x: 4800, y: 1800 }, radius: 440, income: 2.6, control: 'ENEMY', captureTime: 10, captureT: 0, capturing: null },
    { id: 'PLATEAU', name: 'KRAKEN PLATEAU', pos: { x: 7150, y: 600 }, radius: 460, income: 2.2, control: 'ENEMY', captureTime: 11, captureT: 0, capturing: null },
    { id: 'AIRFIELD', name: 'EASTERN AIRFIELD', pos: { x: 6680, y: 1300 }, radius: 420, income: 2.8, control: 'ENEMY', captureTime: 10, captureT: 0, capturing: null },
    { id: 'WESTG', name: 'WESTWORKS GROUND', pos: { x: 2100, y: 3300 }, radius: 360, income: 1.6, control: 'NEUTRAL', captureTime: 9, captureT: 0, capturing: null },
    { id: 'MOLG', name: 'MOLOT GROUND', pos: { x: 2600, y: 950 }, radius: 340, income: 1.6, control: 'ENEMY', captureTime: 9, captureT: 0, capturing: null },
    { id: 'EASTG', name: 'EASTWORKS GROUND', pos: { x: 5900, y: 2100 }, radius: 400, income: 2.0, control: 'ENEMY', captureTime: 10, captureT: 0, capturing: null },
    { id: 'FARMS', name: 'SOUTH FARMS', pos: { x: 1900, y: 4650 }, radius: 560, income: 1.8, control: 'FRIEND', captureTime: 11, captureT: 0, capturing: null },
    { id: 'RIDGE', name: 'NORTH RIDGE', pos: { x: 1400, y: 900 }, radius: 460, income: 1.6, control: 'NEUTRAL', captureTime: 9, captureT: 0, capturing: null },
    { id: 'PORT', name: 'PORT AZURE', pos: { x: 4780, y: 4380 }, radius: 380, income: 2.0, control: 'ENEMY', captureTime: 10, captureT: 0, capturing: null },
    { id: 'BAY', name: 'AZURE BAY', pos: { x: 4900, y: 4900 }, radius: 620, income: 2.4, control: 'ENEMY', captureTime: 12, captureT: 0, capturing: null },
  ];

  const objectives: ObjectiveState[] = [
    {
      id: 'ECHO',
      name: 'OBJ ECHO',
      desc: 'NOVY GOROD — CLEAR THE CITY GARRISON',
      pos: ECHO,
      secured: false,
      primary: false,
    },
    {
      id: 'FOXTROT',
      name: 'OBJ FOXTROT',
      desc: 'HILL 204 — DESTROY THE HILL PLATOON',
      pos: FOXTROT,
      secured: false,
      primary: false,
    },
    {
      id: 'GOLF',
      name: 'OBJ GOLF',
      desc: 'EASTERN AIRFIELD — SILENCE THE AIRFIELD',
      pos: GOLF,
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
    anchors: {
      ECHO,
      FOXTROT,
      GOLF,
      HQ: HQA,
      WEST,
      NORTH: { x: 2600, y: 950 },
      EAST: { x: 5900, y: 2100 },
      PORT,
      HEADLAND,
      BAY: { x: 4900, y: 4900 },
      STAGING: { x: 1700, y: 4700 },
      NBRIDGE: { x: 1450, y: 1560 },
      WBRIDGE: { x: 2500, y: 2190 },
      CBRIDGE: { x: 4055, y: 3535 },
      FORD: { x: 3350, y: 2790 },
      RALLY_W: { x: 2700, y: 1500 },
      RALLY_E: { x: 6100, y: 1500 },
    },
    playerStaging: { x: 1600, y: 4750 },
    startInk: { FRIEND: 280, ENEMY: 360 },
  };
}

export const BRIEFING = {
  operation: 'OPERATION CROSSWIND',
  sheet: 'SHEET 3368-IV · SERIES Z4E · 1:20 000',
  situation: [
    'The theatre runs from the NORTH RIDGE mountains in the west to the KRAKEN PLATEAU in the north-east, and from the river SEVERNAYA down to the open sea. The river is the front line: KRAKEN GROUP holds the north and east bank. Their forward platoon (PL ECHO) holds NOVY GOROD, the port city at the river mouth, from dug positions north of the CENTRAL BRIDGE. A reinforced platoon (PL FOXTROT) occupies HILL 204, the high ground that watches the whole centre of the sheet.',
    'Their strategic depth is real: the EASTERN AIRFIELD flies close air support, the EASTWORKS combine feeds their war effort, and the KRAKEN PLATEAU — screened by layered air defence, SHORAD around the compound and BUK batteries on the plateau and at the airfield — hides their command post. The plateau sky is contested ground: aircraft that wander into the SAM umbrella will be engaged.',
    'Four ink works feed their operation: MOLot 9 on the northern rail line, ZAVOD EAST on the eastern highway, the AZURE REFINERY in PORT AZURE\'s harbour district, and ZAVOD WEST in the western farm belt — abandoned, unclaimed, close enough to take early. The works are hardened but not invulnerable. They can be captured — or destroyed.',
    'South, the river opens into AZURE BAY. KRAKEN GROUP holds PORT AZURE with its piers and fuel stores; two patrol craft nest there and a coastal SAM site watches the headland. Their Frogfoots will hunt any fleet you float. The bay and the open sea beyond OSTROV VOLNY pay ink — hulls in the water can take it. One war, one economy: every drop of ink buys tanks, aircraft, or ships.',
    'Your authority to sustain this fight is INK. It flows in a thin trickle from corps, faster from every sector you clear, and heavily from any works you hold. Destroyed enemy formations also yield ink. Spend it to raise units at the staging area — or hulls from open water.',
  ],
  mission:
    'TASK FORCE SABRE will cross the SEVERNAYA, take NOVY GOROD and the ground that pays, and neutralise the KRAKEN command post. Every bridge, hill, works and sea lane you hold widens your margin of superiority.',
  execution: [
    'PHASE 1 — Reconnoitre. The theatre is wide: push SCOUT sections up the WEST ROAD to the abandoned works at ZAVOD WEST, or along the MSR toward the city bridges. High ground sees further; ridgelines and buildings mask what lies behind them. The enemy is dug in — trench lines read as broken dark scars with a berm behind.',
    'PHASE 2 — Soften. Artillery fire scatters: observed targets are hit hard, blind area fire wastes shells. Keep eyes on a target and your guns will walk onto it — order artillery onto an enemy unit directly for corrected fire. Stone walls, buildings, ruins and wrecks shelter whoever holds them; suppress defenders with fire before you cross. The battlefield is matter, not a picture: shells fell timber, breach walls, and bring buildings down — a destroyed wall stops sheltering, a collapsed building opens new sightlines and rubble that still hides a hull.',
    'PHASE 3 — The sea. Hulls arrive from the southern APPROACHES and make for the fleet anchorage behind OSTROV VOLNY. Patrol craft close to torpedo range; frigates and destroyers hold off and shoot; the capital ship VELIKIY reaches further than anything on this sheet. Mind the islands — they hide hulls from each other — and mind his Frogfoots: frigates and destroyers carry the answer in their cells. The city, the refinery and the port all stand within reach of naval gunfire.',
    'PHASE 4 — Break. Fix the defenders at the crossings, flank through the ford or the west road, strike their flanks and rear — hits from bad angles hurt far more. Attack aircraft strike in committed passes and egress. Naval gunfire walks the shore: order a hull against a coastal target and watch the water columns rise. Tanks push through tree lines and stone walls by force — light vehicles must steer; crews under fire will dive for the nearest solid cover and resume their mission when it slackens. Trust them to stay alive; order them forward when you must.',
    'END STATE — KRAKEN HQ destroyed. The works and sea lanes you hold decide how expensive the victory was.',
  ],
  forces: [
    ['SABRE 1-1 … 1-3', 'M1A2 SEPv3 — main battle tank'],
    ['RAIDER 1 … 2', 'M2A3 Bradley — infantry fighting vehicle'],
    ['HAMMER 1 … 2', 'M109A7 Paladin — self-propelled 155 mm'],
    ['SCOUT 1 … 2', 'M1127 Stryker — reconnaissance'],
    ['RIFLE 1', 'rifle squad — dismounted infantry'],
    ['IRON 1', 'M163A2 Vulcan — gun air defence'],
    ['TALON 1', 'A-10C Thunderbolt II — attack aircraft'],
    ['ARSENAL [R]', 'the order of battle — infantry through capital ship, priced in ink'],
  ],
  economy: [
    ['BASE INCOME', '+2.2 ink/s — always, even at your lowest'],
    ['SECTORS', 'held ground pays +1.4 to +2.8 ink/s each — the bay included'],
    ['INK WORKS', 'captured works pay +5 ink/s — or burn'],
    ['KILL BOUNTIES', 'destroyed enemy units pay their worth in ink'],
    ['DEPLOYMENT', 'battalions arrive at ASSEMBLY ALPHA · hulls at the FLEET ANCHORAGE'],
  ],
  controls: [
    ['LMB / DRAG', 'select unit · box-select units'],
    ['RMB', 'move · attack target · set patrol'],
    ['A + LMB', 'attack-move (engage on the way)'],
    ['F + LMB', 'artillery fire mission on position'],
    ['S / H', 'stop · hold position'],
    ['R', 'open / close the ARSENAL — order of battle'],
    ['WHEEL / WASD / MMB', 'zoom · pan camera'],
    ['SPACE / 1 2 3', 'pause · simulation speed'],
    ['ESC', 'deselect · cancel order mode'],
  ],
  // rendered beside the controls block in the briefing
  hudNotes: [
    'COMMS — traffic feeds onto the map, top-left; the bottom deck is instruments only',
    'RINGS — selecting a unit draws its sight (faint) and gun range (hard) on the ground; air-defence rings show the radar (dashed) and missile envelope (hard)',
    'COVER — a bracketed arc marks the sheltered side of a covered vehicle',
    'AIR DEFENCE — gun AA reaches only aircraft on the deck; SAMs reach the orbit. Aircraft jinking hard shake missiles',
    'THE SEA — hulls berth at the FLEET ANCHORAGE behind OSTROV VOLNY; unit lists scroll inside their own panels, never the map',
  ],
};
