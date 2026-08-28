// ─────────────────────────────────────────────────────────────
// PAPER STORM · terrain generation
// A deliberately composed military landscape: ridgelines, river
// valley, railway, fords, towns, farms, industrial works, power
// corridor. Heightmap + contours + passability + A* + LOS grid.
// ─────────────────────────────────────────────────────────────

import { Noise2D } from '../core/noise';
import { RNG, clamp, dist, Vec2 } from '../core/math';
import { Sea } from './sea';

export interface TreePoint {
  x: number;
  y: number;
  r: number;
  seed: number;
  /** 0 standing · 1 felled · 2 splintered stump */
  state?: number;
  /** direction the timber fell */
  fallDir?: number;
}

export type BuildingKind =
  | 'HOUSE'
  | 'BARN'
  | 'SHED'
  | 'SILO'
  | 'CHURCH'
  | 'HQ_CORE'
  | 'HQ_SUPPORT'
  | 'MAST'
  | 'BUNKER'
  | 'FACTORY_HALL'
  | 'FACTORY_HALL2'
  | 'CHIMNEY'
  | 'STORAGE_TANK'
  | 'DEPOT'
  | 'SUBSTATION'
  | 'CHECKPOINT'
  | 'RUIN'
  | 'WAREHOUSE'
  | 'FUEL_TANK'
  | 'BLOCK'
  | 'HANGAR'
  | 'TOWER';

export interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  kind: BuildingKind;
  /** structural integrity */
  hp?: number;
  hpMax?: number;
  /** 0 intact · 1 scarred · 2 wrecked · 3 collapsed */
  stage?: number;
}

export interface Bridge {
  x: number;
  y: number;
  angle: number; // across the river
  len: number;
  w: number;
  rail?: boolean;
}

export interface RoadPath {
  pts: Vec2[];
  major: boolean;
  name?: string;
}

export interface RockPoint {
  x: number;
  y: number;
  r: number;
  seed: number;
}

/** a dug fighting position — zigzag trench with a berm */
export interface Trench {
  pts: Vec2[];
}

/** dry stone field wall — segment by segment, stone by stone */
export interface StoneWall {
  x: number;
  y: number;
  len: number;
  rot: number;
  /** per-segment hit points; 0 = breached */
  segs?: { hp: number }[];
}

/** concrete anti-vehicle obstacle (dragon's tooth) */
export interface Barrier {
  x: number;
  y: number;
  rot: number;
  /** 100 intact → 0 shattered */
  hp?: number;
}

export interface FactorySite {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface ContourTile {
  x0: number;
  y0: number;
  size: number;
  minor: Path2D;
  major: Path2D;
}

const CELL = 64; // pathfinding cell size (m)
const TREE_CELL = 96;
const HG_STEP = 32; // height grid for LOS (m)

export class Terrain {
  readonly W = 8192;
  readonly H = 6144;

  seed: number;
  private baseNoise: Noise2D;
  private detailNoise: Noise2D;
  private forestNoise: Noise2D;

  /** the southern ocean — coast, islands, harbour, naval routes */
  sea!: Sea;

  /** river centreline */
  river: Vec2[] = [];
  /** seasonal tributary — dry streambed (visual + light cover) */
  dryStream: Vec2[] = [];
  /** shallow crossing point on the river */
  ford: Vec2 | null = null;
  roads: RoadPath[] = [];
  bridges: Bridge[] = [];
  railway: Vec2[] = [];
  railBridges: Bridge[] = [];
  buildings: Building[] = [];
  trees: TreePoint[] = [];
  rocks: RockPoint[] = [];
  pylons: Vec2[] = [];
  powerLine: Vec2[] = [];
  trenches: Trench[] = [];
  walls: StoneWall[] = [];
  barriers: Barrier[] = [];
  factories: FactorySite[] = [];
  fields: { x: number; y: number; w: number; h: number; rot: number; tone: number }[] = [];
  labels: { x: number; y: number; text: string; size: number; bold?: boolean }[] = [];
  spotHeights: { x: number; y: number; h: number }[] = [];
  hillPeak: Vec2 | null = null;
  hillHeight = 0;

  // pathfinding
  gw = 0;
  gh = 0;
  cost!: Float32Array;

  // LOS height grid
  private hg!: Float32Array;
  private hgw = 0;
  private hgh = 0;
  // static building occupancy mask (16 m cells) for fast LOS
  private bmask!: Uint8Array;
  private bmw = 0;
  private bmh = 0;
  // big boulders interrupt sightlines the same way
  private rockMask!: Uint8Array;
  private readonly ROCK_LOS_R = 4.0;
  private readonly BM_CELL = 16;

  // tree spatial hash
  private treeGrid: Map<number, TreePoint[]> = new Map();
  // building spatial hash (cover + LOS queries)
  private bldGrid: Map<number, Building[]> = new Map();

  /** contour lines, tiled 1 km — only visible tiles are stroked */
  contourTiles: ContourTile[] = [];
  /** airfield paving — runways, taxiways, aprons */
  runways: { x: number; y: number; angle: number; len: number; w: number; kind: 'RUNWAY' | 'TAXI' | 'APRON' }[] = [];
  /** rail freight spurs drawn like the mainline */
  railSpurs: Vec2[][] = [];
  /** 8 m master height field — drives the wash hillshade + contours */
  height8!: Float32Array;
  h8w = 0;
  h8h = 0;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.baseNoise = new Noise2D(this.seed);
    this.detailNoise = new Noise2D((this.seed ^ 0x9e3779b9) >>> 0);
    this.forestNoise = new Noise2D((this.seed ^ 0x51ed2701) >>> 0);
    this.sea = new Sea(this.seed, this.W, this.H);
    this.generate();
  }

  // ── height ─────────────────────────────────────────────────
  //
  // Hand-composed relief — the map is authored, not noise soup:
  //   · ZAPAD RIDGE  — elongated NE–SW ridgeline in the west
  //   · HILL 214     — dominant high ground, east-centre
  //   · HILL 163     — detached knoll north of the river
  //   · southern rolling rise screening the player's entry
  //   · NE plateau carrying the enemy HQ
  //   · river valley carve + dry tributary
  //
  heightAt(x: number, y: number): number {
    let h = this.baseNoise.fbm(x / 2100, y / 2100, 5) * 30 - 7;
    h += this.detailNoise.fbm(x / 380, y / 380, 3) * 5 - 1.5;

    // NORTH RIDGE — the mountainous spine of the north-west: five
    // overlapping crests running NE along the top of the sheet
    h += this.gaussEl(x, y, 700, 520, 620, 380, 62);
    h += this.gaussEl(x, y, 1150, 760, 660, 400, 88);
    h += this.gaussEl(x, y, 1650, 1050, 620, 420, 74);
    h += this.gaussEl(x, y, 2150, 1350, 560, 380, 48);
    h += this.gaussEl(x, y, 2600, 1650, 460, 320, 26);

    // HILL 204 — the dominant landform of the centre-east
    h += this.gauss(x, y, 4800, 1800, 720, 76);
    h += this.gaussEl(x, y, 5350, 2150, 380, 300, 18); // SE shoulder
    h += this.gaussEl(x, y, 4350, 1500, 340, 260, 16); // NW shoulder

    // HILL 163 — detached knoll north of the river, west side
    h += this.gauss(x, y, 3050, 1300, 380, 30);

    // the central ridge screening the city's northern approach
    h += this.gaussEl(x, y, 4700, 2700, 520, 300, 22);

    // southern rolling rise screening the player's staging belt
    h += this.gauss(x, y, 2200, 4400, 560, 18);
    h += this.gaussEl(x, y, 3400, 4600, 420, 300, 14); // bay-west knoll
    // eastern rolling ground above the headland
    h += this.gaussEl(x, y, 6800, 3500, 700, 460, 14);

    // KRAKEN PLATEAU — the north-east table the enemy HQ stands on
    const nx = clamp(x / this.W, 0, 1);
    const ny = 1 - clamp(y / this.H, 0, 1);
    h += smooth01(nx * 0.62 + ny * 0.62 - 0.18) * 34;

    // river valley carve
    const dRiver = this.distToPolyline(x, y, this.river);
    if (dRiver < 230) {
      const t = 1 - dRiver / 230;
      h -= smooth01(t) * 13;
    }
    // islands rise out of the sea — real ground for LOS and contours
    for (const isl of this.sea.islands) {
      h += this.gaussEl(x, y, isl.x, isl.y, isl.rx * 1.35, isl.ry * 1.35, isl.height);
    }
    // the sea floor is flat: the water surface carries the depth story
    if (this.sea.isSea(x, y)) return 0;
    return Math.max(0, h);
  }

  slopeAt(x: number, y: number): number {
    const d = 24;
    const hx = this.heightAt(x + d, y) - this.heightAt(x - d, y);
    const hy = this.heightAt(x, y + d) - this.heightAt(x, y - d);
    return Math.hypot(hx, hy) / (2 * d);
  }

  private gauss(x: number, y: number, cx: number, cy: number, r: number, amp: number): number {
    const d = dist(x, y, cx, cy);
    if (d > r) return 0;
    const t = 1 - d / r;
    return amp * t * t * (3 - 2 * t);
  }

  /** elongated gaussian — ridge segments */
  private gaussEl(x: number, y: number, cx: number, cy: number, rx: number, ry: number, amp: number): number {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1) return 0;
    const t = 1 - Math.sqrt(d2);
    return amp * t * t * (3 - 2 * t);
  }

  // ── LOS over the height grid ───────────────────────────────

  /** terrain line of sight between two points at given eye heights;
   *  buildings interrupt observation and direct fire */
  losClear(ax: number, ay: number, aEye: number, bx: number, by: number, bEye: number, includeBuildings = true): boolean {
    const d = dist(ax, ay, bx, by);
    const steps = Math.max(2, Math.ceil(d / 56));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const beam = aEye + (bEye - aEye) * t;
      const ground = this.gridHeight(x, y);
      if (ground > beam + 2.0) return false;
    }
    if (includeBuildings) {
      // sample the beam against building footprints (they are tall enough
      // to matter to a ground-level observer; aircraft pass above)
      if (aEye < 30 && bEye < 30) {
        const bsteps = Math.max(2, Math.ceil(d / 16));
        for (let s = 1; s < bsteps; s++) {
          const t = s / bsteps;
          const x = ax + (bx - ax) * t;
          const y = ay + (by - ay) * t;
          const gx = (x / this.BM_CELL) | 0;
          const gy = (y / this.BM_CELL) | 0;
          if (gx < 0 || gy < 0 || gx >= this.bmw || gy >= this.bmh) continue;
          const idx = gy * this.bmw + gx;
          if (this.bmask[idx] || this.rockMask[idx]) return false;
        }
      }
    }
    return true;
  }

  private gridHeight(x: number, y: number): number {
    const gx = clamp(x / HG_STEP, 0, this.hgw - 1.001);
    const gy = clamp(y / HG_STEP, 0, this.hgh - 1.001);
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const h00 = this.hg[iy * this.hgw + ix];
    const h10 = this.hg[iy * this.hgw + ix + 1];
    const h01 = this.hg[(iy + 1) * this.hgw + ix];
    const h11 = this.hg[(iy + 1) * this.hgw + ix + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  }

  // ── water ──────────────────────────────────────────────────

  riverWidth = 30;

  isWater(x: number, y: number): boolean {
    return this.distToPolyline(x, y, this.river) < this.riverWidth * 0.5 || this.sea.isSea(x, y);
  }

  /** signed distance from the shoreline (+ = seaward, metres) */
  shoreDistAt(x: number, y: number): number {
    return this.sea.shoreDistAt(x, y);
  }

  /** sea route for a hull of given draft (min shore clearance, m) */
  findSeaPath(from: Vec2, to: Vec2, draft: number): Vec2[] {
    return this.sea.findSeaPath(from, to, draft);
  }

  /** shallow ford — vehicles may wade across, slowly */
  fordAt(x: number, y: number, r = 46): boolean {
    if (!this.ford) return false;
    return dist(x, y, this.ford.x, this.ford.y) < r;
  }

  /** bridge within radius */
  bridgeAt(x: number, y: number, r = 42): Bridge | null {
    for (const b of this.bridges) {
      if (dist(x, y, b.x, b.y) < r) return b;
    }
    return null;
  }

  // ── roads & forests ────────────────────────────────────────

  roadFactor(x: number, y: number): number {
    // 0 = no road, 1 = on major road centreline (approx)
    let best = 0;
    for (const r of this.roads) {
      const d = this.distToPolyline(x, y, r.pts);
      const w = r.major ? 26 : 20;
      if (d < w) best = Math.max(best, (r.major ? 1 : 0.7) * (1 - d / w * 0.4));
    }
    return best;
  }

  railFactor(x: number, y: number): number {
    const d = this.distToPolyline(x, y, this.railway);
    return d < 14 ? 1 - d / 14 * 0.5 : 0;
  }

  forestDensity(x: number, y: number): number {
    const n = this.forestNoise.fbm(x / 560, y / 560, 4);
    // the NORTH RIDGE carries the mountain forest; the valley slopes
    // grow brush toward the river
    const west = 1 - x / this.W;
    const north = 1 - y / this.H;
    const bias = -0.085 * (west + north) * 0.9 + 0.02 * (y / this.H);
    // woodland pockets on HILL 204's shoulders
    const dHill = Math.hypot((x - 4900) / 950, (y - 1750) / 750);
    const hillBias = clamp(0.5 - dHill, 0, 0.5) * 0.4;
    const v = (n - 0.6 + bias + hillBias) * 4.2;
    return clamp(v, 0, 1) * 1.6;
  }

  // ── generation ─────────────────────────────────────────────

  private generate() {
    const rng = new RNG((this.seed ^ 0xC0FFEE) >>> 0);

    // ── the river SEVERNAYA — the frontline of the theatre ────
    this.river = [
      { x: -60, y: 900 },
      { x: 600, y: 1150 },
      { x: 1400, y: 1550 },
      { x: 2300, y: 2050 },
      { x: 3100, y: 2600 },
      { x: 3700, y: 3050 },
      { x: 4000, y: 3450 },
      { x: 4260, y: 3900 },
      { x: 4380, y: 4210 },
    ];
    for (let i = 1; i < this.river.length - 1; i++) {
      const p = this.river[i];
      const a = rng.range(0, Math.PI * 2);
      p.x += Math.cos(a) * rng.range(24, 70);
      p.y += Math.sin(a) * rng.range(24, 70);
    }

    // ford on the southern reach — the wade crossing
    this.ford = { x: 3350 + rng.range(-30, 30), y: 2790 + rng.range(-30, 30) };

    // dry tributary — the ghost of a stream off the north ridge
    this.dryStream = [
      { x: 900, y: 620 },
      { x: 1250, y: 900 },
      { x: 1600, y: 1250 },
      { x: 1950, y: 1650 },
      { x: 2150, y: 1950 },
    ];

    // ── the road network — every road leads somewhere ────────────
    // MSR VEGA — the N-S spine: staging area -> the city -> the plateau -> HQ
    const msr: Vec2[] = [
      { x: 1300, y: 5620 },
      { x: 1750, y: 5050 },
      { x: 2150, y: 4400 },
      { x: 2900, y: 4100 },
      { x: 3600, y: 3850 },
      { x: 4055, y: 3535 }, // CENTRAL BRIDGE
      { x: 4200, y: 3100 },
      { x: 4350, y: 2500 },
      { x: 4700, y: 2050 },
      { x: 5400, y: 1900 },
      { x: 6100, y: 1700 },
      { x: 6550, y: 1450 }, // airfield gate
      { x: 6950, y: 1050 },
      { x: 7150, y: 600 },
      { x: 7300, y: -40 },
    ];
    // HWY 14 — the northern E-W belt, crossing at the NORTH BRIDGE
    const hwy14: Vec2[] = [
      { x: -40, y: 2600 },
      { x: 700, y: 2350 },
      { x: 1200, y: 1950 },
      { x: 1450, y: 1560 }, // NORTH BRIDGE
      { x: 1900, y: 1300 },
      { x: 2600, y: 1000 }, // MOLot 9
      { x: 3500, y: 950 },
      { x: 4500, y: 1000 },
      { x: 5500, y: 1150 },
      { x: 6300, y: 1250 },
      { x: 7300, y: 1200 },
      { x: 8230, y: 1150 },
    ];
    // WEST ROAD — the second crossing: ZAVOD WEST -> WEST BRIDGE -> the north
    const westRoad: Vec2[] = [
      { x: 1500, y: 3800 },
      { x: 2100, y: 3300 }, // ZAVOD WEST
      { x: 2500, y: 2190 }, // WEST BRIDGE
      { x: 2700, y: 1600 },
      { x: 2750, y: 1080 }, // HWY junction
    ];
    // the city streets — NOVY GOROD on both banks of the mouth
    const citySouth: Vec2[] = [
      { x: 3600, y: 3850 }, // MSR junction
      { x: 3800, y: 3950 },
      { x: 4050, y: 4050 },
      { x: 4300, y: 3980 },
      { x: 4470, y: 4180 }, // the waterfront
    ];
    const cityNorth: Vec2[] = [
      { x: 4055, y: 3535 }, // CENTRAL BRIDGE
      { x: 3900, y: 3250 },
      { x: 3600, y: 3100 }, // the old town
      { x: 3300, y: 2900 },
      { x: 3050, y: 2650 },
    ];
    const cityEast: Vec2[] = [
      { x: 3900, y: 3250 },
      { x: 4200, y: 3250 },
      { x: 4450, y: 3350 }, // east suburb
      { x: 4650, y: 3600 },
    ];
    // LITTORAL ROAD — the whole coast: marsh -> beaches -> bay -> port -> headland
    const littoral: Vec2[] = [
      { x: -40, y: 5250 },
      { x: 600, y: 5100 },
      { x: 1200, y: 4850 }, // the fishing village
      { x: 1800, y: 4600 },
      { x: 2400, y: 4350 },
      { x: 2900, y: 4100 }, // MSR junction
      { x: 3300, y: 4400 },
      { x: 3750, y: 4560 },
      { x: 4100, y: 4320 },
      { x: 4500, y: 4240 }, // PORT AZURE gate
      { x: 4900, y: 4300 },
      { x: 5400, y: 4450 },
      { x: 6000, y: 4380 }, // COASTAL SAM SITE
      { x: 6600, y: 4620 },
      { x: 7400, y: 4800 },
      { x: 8230, y: 4900 },
    ];
    // EASTERN ROAD — EASTWORKS up to the airfield gate
    const eastRoad: Vec2[] = [
      { x: 5900, y: 2050 },
      { x: 6200, y: 1750 },
      { x: 6550, y: 1450 },
    ];
    // the airfield perimeter loop
    const airfieldLoop: Vec2[] = [
      { x: 6550, y: 1450 },
      { x: 6650, y: 1150 },
      { x: 6900, y: 980 },
      { x: 7080, y: 1230 },
      { x: 6950, y: 1520 },
      { x: 6650, y: 1600 },
    ];
    // farm lanes of the south-west belt
    const farmLane1: Vec2[] = [
      { x: 1900, y: 4300 },
      { x: 2500, y: 4550 },
      { x: 3000, y: 4700 },
    ];
    const farmLane2: Vec2[] = [
      { x: 2150, y: 4400 },
      { x: 2000, y: 4800 },
      { x: 1900, y: 5200 },
    ];
    // FORD TRACK — the wade crossing between MSR and the north country
    const fordTrack: Vec2[] = [
      { x: 3600, y: 3850 },
      { x: 3450, y: 3200 },
      { x: 3350, y: 2790 }, // THE FORD
      { x: 3170, y: 2350 },
      { x: 3100, y: 2250 },
    ];
    const allRoads = [msr, hwy14, westRoad, citySouth, cityNorth, cityEast, littoral, eastRoad, airfieldLoop, farmLane1, farmLane2, fordTrack];
    for (const pts of allRoads) {
      for (let i = 1; i < pts.length - 1; i++) {
        pts[i].x += rng.range(-26, 26);
        pts[i].y += rng.range(-22, 22);
      }
    }
    this.roads = [
      { pts: msr, major: true, name: 'MSR VEGA' },
      { pts: hwy14, major: true, name: 'HWY 14' },
      { pts: westRoad, major: false, name: 'WEST ROAD' },
      { pts: citySouth, major: false, name: 'CITY SOUTH' },
      { pts: cityNorth, major: false, name: 'CITY NORTH' },
      { pts: cityEast, major: false, name: 'CITY EAST' },
      { pts: littoral, major: false, name: 'LITTORAL ROAD' },
      { pts: eastRoad, major: false, name: 'EASTERN ROAD' },
      { pts: airfieldLoop, major: false, name: 'AIRFIELD LOOP' },
      { pts: farmLane1, major: false, name: 'FARM LANE' },
      { pts: farmLane2, major: false, name: 'FARM LANE' },
      { pts: fordTrack, major: false, name: 'FORD TRACK' },
    ];

    // ── railway: the northern mainline + the port freight spur ──
    this.railway = [
      { x: -60, y: 1000 },
      { x: 900, y: 950 },
      { x: 1800, y: 1000 },
      { x: 2600, y: 980 }, // MOLot siding
      { x: 3500, y: 1050 },
      { x: 4500, y: 1200 },
      { x: 5300, y: 1500 },
      { x: 5900, y: 2050 }, // EASTWORKS siding
      { x: 6300, y: 2450 },
      { x: 6900, y: 2900 },
      { x: 7600, y: 3300 },
      { x: 8230, y: 3550 },
    ];
    for (let i = 1; i < this.railway.length - 1; i++) {
      this.railway[i].x += rng.range(-22, 22);
      this.railway[i].y += rng.range(-16, 16);
    }
    this.railSpurs = [
      [
        { x: 6300, y: 2450 },
        { x: 5700, y: 3000 },
        { x: 5100, y: 3700 },
        { x: 4950, y: 4250 }, // PORT AZURE freight yard
      ],
    ];

    // ── bridges where the roads cross the river ──────────────
    this.bridges = [];
    const addBridge = (rx: number, ry: number, major = false) => {
      const dir = this.polylineDirAt(rx, ry, this.river);
      this.bridges.push({
        x: rx,
        y: ry,
        angle: dir + Math.PI / 2,
        len: this.riverWidth + 52,
        w: major ? 24 : 19,
      });
    };
    addBridge(1450, 1560, true); // NORTH BRIDGE — HWY 14
    addBridge(2500, 2190); // WEST BRIDGE
    addBridge(4055, 3535, true); // CENTRAL BRIDGE — MSR, the city

    // ── the city, the works, the airfield, the HQ ─────────────
    this.buildCity(rng);
    this.buildAirfield(6680, 1250, rng);

    // ── ink works — serious military-industrial works ────────
    this.factories = [
      { id: 'MOLOT9', name: 'MOLot 9', x: 2600, y: 950 },
      { id: 'ZAVODW', name: 'ZAVOD WEST', x: 2100, y: 3300 },
      { id: 'ZAVODE', name: 'ZAVOD EAST', x: 5900, y: 2100 },
      { id: 'AZURER', name: 'AZURE REFINERY', x: 4950, y: 4080 },
    ];
    this.buildFactory(this.factories[0], rng, 0.9); // north rail works
    this.buildFactory(this.factories[1], rng, 1.0); // the western complex
    this.buildFactory(this.factories[2], rng, 1.3); // the main combine
    this.buildFactory(this.factories[3], rng, 0.85); // the coastal refinery

    // enemy HQ compound — on the KRAKEN plateau
    this.buildHQ(7150, 600, rng);

    // ── PORT AZURE — the harbour is a place, not a decal ─────
    if (this.sea.harbour) {
      const hb = this.sea.harbour;
      for (const wh of hb.warehouses) {
        this.buildings.push({ x: wh.x, y: wh.y, w: wh.w, h: wh.h, rot: wh.rot, kind: 'WAREHOUSE' });
      }
      for (const tk of hb.tanks) {
        this.buildings.push({ x: tk.x, y: tk.y, w: 13, h: 13, rot: 0, kind: 'FUEL_TANK' });
      }
      // harbour master + checkpoint on the gate
      this.buildings.push({ x: 4540, y: 4195, w: 12, h: 9, rot: 0.2, kind: 'SHED' });
      this.buildings.push({ x: 4600, y: 4175, w: 10, h: 6, rot: -0.2, kind: 'CHECKPOINT' });
    }

    // checkpoints at the central bridge approaches
    this.buildings.push({ x: 4010, y: 3470, w: 10, h: 6, rot: 1.2, kind: 'CHECKPOINT' });
    this.buildings.push({ x: 4095, y: 3600, w: 7, h: 5, rot: 0.4, kind: 'BUNKER' });

    // ── villages and farmsteads — lived-in ground ───────────
    this.buildTown(1550, 3850, rng, -0.5); // WESTWOOD
    this.buildTown(1150, 4880, rng, -0.15); // the fishing village
    this.buildTown(3550, 990, rng, 0.1); // SEVERNOYE, on the north road
    this.buildTown(5400, 1280, rng, 0.06); // VOSTOK, on the north highway
    this.buildTown(7450, 4700, rng, -0.1); // the east coast village
    const farms: [number, number][] = [
      [1000, 2900],
      [2900, 4600],
      [1850, 5050],
      [5050, 3600],
      [2600, 4700],
      [900, 4500],
      [3400, 1750],
      [3100, 2250],
    ];
    for (const [fx, fy] of farms) {
      this.buildFarm(fx + rng.range(-30, 30), fy + rng.range(-30, 30), rng);
    }

    // ── power corridor: EASTWORKS substation -> the HQ ────────
    this.powerLine = [
      { x: 5900, y: 2050 },
      { x: 6300, y: 1750 },
      { x: 6600, y: 1450 },
      { x: 6950, y: 1050 },
      { x: 7150, y: 600 },
    ];
    this.pylons = this.powerLine.map((p) => ({ ...p }));

    // ── field fortifications — the defensive landscape ───────
    this.buildFortifications(rng);

    // ── pre-war ruins — the war was here before you ───────────
    const ruins: [number, number, number][] = [
      [3720, 3820, 24], [3800, 3900, 18], [4180, 3870, 20],
      [4300, 3920, 15], [3950, 3760, 16], [2830, 2300, 18],
      [5700, 2050, 22], [2350, 3250, 16],
    ];
    for (const [rx, ry, rw] of ruins) {
      this.buildings.push({ x: rx, y: ry, w: rw, h: rw * 0.7, rot: rng.range(-0.4, 0.4), kind: 'RUIN' });
    }

    // ── rocks — boulder fields on the steep ground ─────────
    this.rocks = [];
    for (let i = 0; i < 5200; i++) {
      const x = rng.range(60, this.W - 60);
      const y = rng.range(60, this.H - 60);
      const s = this.slopeAt(x, y);
      if (s < 0.105 || s > 0.4) continue;
      if (this.isWater(x, y) || this.forestDensity(x, y) > 0.6) continue;
      if (this.roadFactor(x, y) > 0.05 || this.railFactor(x, y) > 0.1) continue;
      if (this.buildingAt(x, y, 30)) continue;
      if (rng.chance(0.3)) {
        // a small boulder cluster, not a lone pebble — stones
        // never interpenetrate; the gaps between them are real
        const rockFits = (rx: number, ry: number, rr: number) => {
          for (const rk of this.rocks) {
            if (dist(rk.x, rk.y, rx, ry) < rk.r + rr + 2.2) return false;
          }
          return true;
        };
        const nRocks = rng.int(1, 3);
        for (let r = 0; r < nRocks; r++) {
          const rx = x + rng.range(-11, 11);
          const ry = y + rng.range(-11, 11);
          const rr = rng.range(1.8, 5.2);
          if (!rockFits(rx, ry, rr)) continue;
          this.rocks.push({ x: rx, y: ry, r: rr, seed: rng.next() });
        }
      }
      if (this.rocks.length > 420) break;
    }

    // ── trees — forest masses + planted treelines ────────────
    this.trees = [];
    const step = 34;
    for (let y = step; y < this.H; y += step) {
      for (let x = step; x < this.W; x += step) {
        const jx = x + rng.range(-13, 13);
        const jy = y + rng.range(-13, 13);
        if (this.forestDensity(jx, jy) < 0.42) continue;
        if (this.isWater(jx, jy) || this.bridgeAt(jx, jy, 70)) continue;
        if (this.distToPolyline(jx, jy, this.river) < this.riverWidth * 0.5 + 34) continue;
        if (this.roadFactor(jx, jy) > 0.08 || this.railFactor(jx, jy) > 0.15) continue;
        if (this.slopeAt(jx, jy) > 0.2) continue;
        if (this.buildingAt(jx, jy, 34)) continue;
        if (this.trenchDist(jx, jy) < 14) continue;
        if (this.wallNear(jx, jy, 8)) continue;
        if (this.onRunway(jx, jy, 26)) continue;
        this.trees.push({ x: jx, y: jy, r: rng.range(6.5, 12.5), seed: rng.next() });
      }
    }

    // ── agricultural parcels — patchwork on the flatter ground ──
    this.fields = [];
    const fieldTones = [0.04, 0.08, 0.115, 0.06];
    let toneI = 0;
    for (let cy = 200; cy < this.H - 150; cy += 205) {
      for (let cx = 180; cx < this.W - 150; cx += 265) {
        const fx = cx + rng.range(-52, 52);
        const fy = cy + rng.range(-46, 46);
        const fw = rng.range(150, 235);
        const fh = rng.range(105, 165);
        if (this.slopeAt(fx, fy) > 0.085) continue;
        if (this.forestDensity(fx, fy) > 0.3) continue;
        if (this.distToPolyline(fx, fy, this.river) < 90) continue;
        if (this.sea.shoreDistAt(fx, fy) > -60) continue; // the sea takes no farmland
        if (this.railFactor(fx, fy) > 0.05) continue;
        if (this.buildingAt(fx, fy, Math.max(fw, fh) * 0.7 + 30)) continue;
        if (this.onRunway(fx, fy, Math.max(fw, fh) * 0.6)) continue;
        let nearRoad = false;
        for (const r of this.roads) {
          if (this.distToPolyline(fx, fy, r.pts) < Math.max(fw, fh) * 0.42) nearRoad = true;
        }
        if (nearRoad) continue;
        this.fields.push({
          x: fx,
          y: fy,
          w: fw,
          h: fh,
          rot: (Math.round(rng.range(-1, 1)) * Math.PI) / 2 + rng.range(-0.06, 0.06),
          tone: fieldTones[toneI++ % fieldTones.length],
        });
      }
    }

    // planted treelines along selected field boundaries — the
    // man-made structure of the farmland reads instantly
    for (const f of this.fields) {
      if (!rng.chance(0.42)) continue;
      const cos = Math.cos(f.rot);
      const sin = Math.sin(f.rot);
      const edge = rng.chance(0.5) ? 1 : -1;
      for (let t = -0.44; t <= 0.44; t += 30 / Math.max(f.w, 120)) {
        const lx = t * f.w;
        const ly = edge * (f.h / 2 + 13);
        const wx = f.x + lx * cos - ly * sin;
        const wy = f.y + lx * sin + ly * cos;
        if (this.isWater(wx, wy) || this.roadFactor(wx, wy) > 0.1) continue;
        if (this.buildingAt(wx, wy, 24)) continue;
        this.trees.push({ x: wx, y: wy, r: rng.range(5, 8), seed: rng.next() });
      }
    }

    // city park trees — a pair of green squares in the grid
    for (const pk of [
      { x: 3850, y: 3980, r: 46 },
      { x: 4300, y: 3180, r: 38 },
    ]) {
      for (let i = 0; i < 14; i++) {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(0, pk.r);
        const tx = pk.x + Math.cos(a) * d;
        const ty = pk.y + Math.sin(a) * d;
        if (this.isWater(tx, ty) || this.buildingAt(tx, ty, 12)) continue;
        this.trees.push({ x: tx, y: ty, r: rng.range(5.5, 9), seed: rng.next() });
      }
    }

    for (const t of this.trees) {
      const key = this.treeKey(t.x, t.y);
      let arr = this.treeGrid.get(key);
      if (!arr) {
        arr = [];
        this.treeGrid.set(key, arr);
      }
      arr.push(t);
    }

    // building spatial hash
    for (const b of this.buildings) {
      const key = Math.floor(b.x / 128) * 100000 + Math.floor(b.y / 128);
      let arr = this.bldGrid.get(key);
      if (!arr) {
        arr = [];
        this.bldGrid.set(key, arr);
      }
      arr.push(b);
    }

    // ── structural integrity — buildings are matter, not decals ──
    for (const b of this.buildings) {
      b.hpMax = buildingHpFor(b.kind);
      b.hp = b.hpMax;
      b.stage = b.kind === 'RUIN' ? 1 : 0;
    }

    // ── labels & spot heights — the named theatre ────────────
    this.labels = [
      { x: 4800, y: 1800, text: 'HILL 204', size: 34, bold: true },
      { x: 3900, y: 3250, text: 'NOVY GOROD', size: 26, bold: true },
      { x: 4230, y: 3900, text: 'CENTRAL BRIDGE', size: 16 },
      { x: 1450, y: 1480, text: 'NORTH BRIDGE', size: 15 },
      { x: 2500, y: 2110, text: 'WEST BRIDGE', size: 15 },
      { x: 7150, y: 900, text: 'OBJ KRAKEN', size: 22, bold: true },
      { x: 3900, y: 3400, text: 'OBJ ECHO', size: 20, bold: true },
      { x: 4800, y: 1950, text: 'OBJ FOXTROT', size: 20, bold: true },
      { x: 6650, y: 1600, text: 'OBJ GOLF', size: 20, bold: true },
      { x: 1350, y: 850, text: 'NORTH RIDGE', size: 24 },
      { x: 3050, y: 1180, text: 'HILL 163', size: 17 },
      { x: 2600, y: 850, text: 'MOLot 9', size: 18, bold: true },
      { x: 2100, y: 3150, text: 'ZAVOD WEST', size: 18, bold: true },
      { x: 5900, y: 1950, text: 'ZAVOD EAST', size: 20, bold: true },
      { x: 4950, y: 3980, text: 'AZURE REFINERY', size: 16, bold: true },
      { x: 4800, y: 4520, text: 'PORT AZURE', size: 22, bold: true },
      { x: 4900, y: 4700, text: 'HARBOR DISTRICT', size: 15 },
      { x: 4800, y: 5050, text: 'AZURE BAY', size: 26, bold: true },
      { x: 6900, y: 5350, text: 'OSTROV VOLNY', size: 16 },
      { x: 5600, y: 5520, text: 'KAMEN', size: 13 },
      { x: 5550, y: 4600, text: 'THE NARROWS', size: 14 },
      { x: 7700, y: 5700, text: 'APPROACHES', size: 15 },
      { x: 5900, y: 4270, text: 'COASTAL SAM SITE', size: 13 },
      { x: 6600, y: 1120, text: 'EASTERN AIRFIELD', size: 17, bold: true },
      { x: 7150, y: 380, text: 'KRAKEN PLATEAU', size: 16 },
      { x: 1550, y: 3760, text: 'WESTWOOD', size: 16 },
      { x: 1150, y: 4790, text: 'RYBAKOVKA', size: 14 },
      { x: 3550, y: 900, text: 'SEVERNOYE', size: 14 },
      { x: 5400, y: 1190, text: 'VOSTOK', size: 14 },
      { x: 7450, y: 4610, text: 'VOSTOCHNY', size: 13 },
      { x: 2200, y: 4400, text: 'SOUTH FARMS', size: 20 },
      { x: 3350, y: 2900, text: 'THE FORD', size: 14 },
      { x: 1650, y: 1600, text: 'SEVERNAYA VALLEY', size: 15 },
      { x: 1000, y: 1600, text: 'NORTH RIDGE FOREST', size: 17 },
      { x: 5200, y: 980, text: 'RAIL LINE', size: 13 },
      { x: 700, y: 5150, text: 'THE MARSHES', size: 15 },
    ];
    this.hillPeak = { x: 4800, y: 1800 };
    this.hillHeight = this.heightAt(4800, 1800);

    this.spotHeights = [
      { x: 4800, y: 1800, h: Math.round(this.heightAt(4800, 1800)) },
      { x: 1150, y: 760, h: Math.round(this.heightAt(1150, 760)) },
      { x: 3050, y: 1300, h: Math.round(this.heightAt(3050, 1300)) },
      { x: 2200, y: 4400, h: Math.round(this.heightAt(2200, 4400)) },
      { x: 7150, y: 600, h: Math.round(this.heightAt(7150, 600)) },
      { x: 4700, y: 2700, h: Math.round(this.heightAt(4700, 2700)) },
      { x: 3400, y: 4600, h: Math.round(this.heightAt(3400, 4600)) },
      { x: 6900, y: 5350, h: Math.round(this.heightAt(6900, 5350)) },
    ];

    // pathfinding grid
    this.buildCostGrid();

    // LOS height grid
    this.buildHeightGrid();

    // master 8 m height field — the wash and contours read from this
    this.buildHeight8();

    // contour extraction, tiled per kilometre
    this.contourTiles = this.extractContours();
  }

  /** the deliberate defensive works — trenches, walls, barriers */
  private buildFortifications(rng: RNG) {
    this.trenches = [];
    this.walls = [];
    this.barriers = [];

    const zigzag = (cx: number, cy: number, len: number, baseAng: number, n: number): Trench => {
      // a dug position: alternating legs of a fire trench
      const pts: Vec2[] = [];
      const legLen = len / n;
      let x = cx - (Math.cos(baseAng) * len) / 2;
      let y = cy - (Math.sin(baseAng) * len) / 2;
      pts.push({ x, y });
      for (let i = 0; i < n; i++) {
        const a = baseAng + (i % 2 === 0 ? 0.55 : -0.55);
        x += Math.cos(a) * legLen;
        y += Math.sin(a) * legLen;
        pts.push({ x: x + rng.range(-3, 3), y: y + rng.range(-3, 3) });
      }
      return { pts };
    };

    // PL ECHO defensive line — the city bridgehead, faces south across the river
    this.trenches.push(zigzag(3990, 3400, 240, Math.PI * 0.04, 7));
    this.trenches.push(zigzag(3760, 3300, 170, Math.PI * 0.3, 5));
    this.trenches.push(zigzag(4280, 3420, 160, Math.PI * 0.85, 5));
    // PL FOXTROT — two positions on the hill shoulders
    this.trenches.push(zigzag(4680, 1700, 190, Math.PI * 0.82, 6));
    this.trenches.push(zigzag(4980, 1980, 140, Math.PI * 0.7, 4));
    // WEST BRIDGE bridgehead — faces the player's side
    this.trenches.push(zigzag(2560, 2080, 150, Math.PI * 0.05, 5));
    // HQ perimeter — south face
    this.trenches.push(zigzag(7120, 820, 260, Math.PI * 0.06, 8));
    // EASTWORKS perimeter — west face
    this.trenches.push(zigzag(5620, 2100, 180, Math.PI * 0.64, 6));
    // airfield perimeter — west face
    this.trenches.push(zigzag(6380, 1420, 200, Math.PI * 0.6, 6));
    // the port's landward face
    this.trenches.push(zigzag(4750, 4150, 170, Math.PI * 0.1, 5));
    // MOLot 9 perimeter — south face
    this.trenches.push(zigzag(2580, 1060, 160, Math.PI * 0.12, 5));

    // stone walls — field boundaries that double as cover
    const wallSpots: [number, number, number, number][] = [
      // south-bank city approaches — the close fight
      [3660, 3720, 150, 0.3],
      [3820, 3660, 120, -0.1],
      [4180, 3700, 140, 0.08],
      [4320, 3800, 110, 0.5],
      // the ford country
      [3220, 2650, 140, 0.25],
      [3480, 2900, 120, -0.2],
      // west road approach
      [2320, 2350, 130, 0.4],
      [2650, 1900, 120, 0.35],
      // hill 204 approaches
      [4300, 1550, 150, 0.55],
      [4500, 1300, 120, 0.6],
      [5250, 1550, 130, 0.75],
      // eastworks approaches
      [5550, 1950, 140, 0.5],
      [5700, 2350, 120, 0.3],
      // south farms belt
      [2050, 4600, 160, 0.02],
      [2350, 4750, 130, -0.15],
      [2750, 4450, 120, 0.3],
      [1950, 4150, 140, 0.2],
      // the west farmland
      [1250, 3200, 150, 0.1],
      [1650, 3000, 120, -0.25],
      // littoral ground near the bay
      [3200, 4250, 130, 0.35],
      [3600, 4450, 120, 0.1],
      // north bridge approach
      [1350, 1400, 130, 0.45],
    ];
    for (const [x, y, len, rot] of wallSpots) {
      const wl = len * rng.range(0.85, 1.1);
      const w: StoneWall = { x: x + rng.range(-8, 8), y: y + rng.range(-8, 8), len: wl, rot: rot + rng.range(-0.06, 0.06) };
      // each wall is a chain of stone segments with its own strength
      const nSeg = Math.max(3, Math.round(wl / 16));
      w.segs = [];
      for (let i = 0; i < nSeg; i++) w.segs.push({ hp: Math.round(rng.range(70, 110)) });
      this.walls.push(w);
    }

    // dragon's teeth — anti-vehicle obstacles at the choke points
    const barrierFields: [number, number, number][] = [
      [4010, 3440, 8],  // central bridge north approach
      [4110, 3640, 6],  // central bridge south approach
      [1490, 1490, 6],  // north bridge
      [2540, 2110, 6],  // west bridge
      [3380, 2720, 6],  // the ford
      [6400, 1480, 7],  // airfield west gate
      [7040, 760, 8],   // HQ south entrance
      [5660, 2070, 6],  // eastworks west gate
      [4620, 4210, 5],  // port gate
    ];
    for (const [bx, by, n] of barrierFields) {
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(0, 26);
        this.barriers.push({ x: bx + Math.cos(a) * d, y: by + Math.sin(a) * d, rot: rng.range(0, Math.PI), hp: 100 });
      }
    }
  }

  // ── settlement builders ────────────────────────────────────

  /** true if a w×h footprint at (x,y,rot) keeps `margin` m clear of every standing building */
  private buildingFits(x: number, y: number, w: number, h: number, rot: number, margin = 4): boolean {
    const reach = Math.hypot(w, h) / 2;
    for (const b of this.buildings) {
      const br = Math.hypot(b.w, b.h) / 2;
      if (Math.abs(b.x - x) > reach + br + margin || Math.abs(b.y - y) > reach + br + margin) continue;
      // rotated-box SAT — minimum separation across the four axes
      const ca1 = Math.cos(rot), sa1 = Math.sin(rot);
      const ca2 = Math.cos(b.rot), sa2 = Math.sin(b.rot);
      const dx = b.x - x, dy = b.y - y;
      const axes: Array<[number, number]> = [[ca1, sa1], [-sa1, ca1], [ca2, sa2], [-sa2, ca2]];
      let minSep = Infinity;
      for (const [ux, uy] of axes) {
        const dist = dx * ux + dy * uy;
        const rA = (w / 2) * Math.abs(ca1 * ux + sa1 * uy) + (h / 2) * Math.abs(-sa1 * ux + ca1 * uy);
        const rB = (b.w / 2) * Math.abs(ca2 * ux + sa2 * uy) + (b.h / 2) * Math.abs(-sa2 * ux + ca2 * uy);
        minSep = Math.min(minSep, rA + rB - Math.abs(dist));
      }
      if (minSep > -margin) return false;
    }
    return true;
  }

  /** a crossroads town — buildings string along two road axes */
  private buildTown(cx: number, cy: number, rng: RNG, axis: number) {
    const along = (
      dx: number,
      dy: number,
      n: number,
      side: number,
      kinds: BuildingKind[]
    ) => {
      const span = 230; // metres of road frontage the lots share
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1);
        const kind = kinds[i % kinds.length];
        const w = kind === 'BARN' ? rng.range(26, 32) : rng.range(15, 22);
        const h = kind === 'BARN' ? rng.range(14, 17) : rng.range(11, 15);
        // try a few setbacks — a lot that doesn't fit is left empty
        let placed = false;
        for (let attempt = 0; attempt < 3 && !placed; attempt++) {
          const set = 52 + attempt * 16 + rng.range(-6, 6);
          const bx = cx + dx * (t - 0.5) * span + -dy * side * set;
          const by = cy + dy * (t - 0.5) * span + dx * side * set;
          if (this.isWater(bx, by) || this.roadFactor(bx, by) > 0.1) continue;
          const rot = Math.atan2(dy, dx) + rng.range(-0.12, 0.12);
          if (!this.buildingFits(bx, by, w, h, rot)) continue;
          this.buildings.push({ x: bx, y: by, w, h, rot, kind });
          placed = true;
        }
      }
    };
    const ca = Math.cos(axis);
    const sa = Math.sin(axis);
    along(ca, sa, 4, 1, ['HOUSE', 'HOUSE', 'BARN', 'HOUSE']);
    along(ca, sa, 3, -1, ['HOUSE', 'SHED', 'HOUSE']);
    along(-sa, ca, 3, 1, ['HOUSE', 'HOUSE', 'SHED']);
    along(-sa, ca, 2, -1, ['SHED', 'BARN']);
  }

  /** NOVY GOROD — the port city at the river mouth. Apartment
   *  blocks on the south bank, old town + church on the north,
   *  depots in the east suburb. A real fight space. */
  private buildCity(rng: RNG) {
    const axis = -0.2; // the grid runs with the river's lower reach
    const cos = Math.cos(axis);
    const sin = Math.sin(axis);
    const place = (bx: number, by: number, w: number, h: number, rot: number, kind: BuildingKind) => {
      if (this.isWater(bx, by)) return;
      if (this.distToPolyline(bx, by, this.river) < 64) return; // keep off the banks
      if (this.roadFactor(bx, by) > 0.12) return;
      if (!this.buildingFits(bx, by, w, h, rot)) return;
      this.buildings.push({ x: bx, y: by, w, h, rot, kind });
    };
    const gridToWorld = (gx: number, gy: number, bx: number, by: number): { x: number; y: number } => ({
      x: bx + gx * cos - gy * sin,
      y: by + gx * sin + gy * cos,
    });

    // ── south bank — the new city: apartment slabs in a loose grid ──
    const southBase = { x: 3980, y: 3870 };
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const gx = (col - 1.5) * 118 + rng.range(-10, 10);
        const gy = row * 92 + rng.range(-8, 8);
        const p = gridToWorld(gx, gy, southBase.x, southBase.y);
        const w = rng.range(30, 40);
        const h = rng.range(15, 19);
        place(p.x, p.y, w, h, axis + Math.PI / 2 + rng.range(-0.08, 0.08), 'BLOCK');
      }
    }
    // shops and sheds along the waterfront road
    for (let i = 0; i < 4; i++) {
      const p = gridToWorld(-230 + i * 120, -70 + rng.range(-10, 10), southBase.x, southBase.y);
      place(p.x, p.y, rng.range(16, 24), rng.range(12, 15), axis + rng.range(-0.1, 0.1), i % 2 ? 'HOUSE' : 'SHED');
    }

    // ── north bank — the old town: dense small houses + the church ──
    const northBase = { x: 3760, y: 3160 };
    const ring: [number, number][] = [
      [-120, -70], [-30, -95], [70, -85], [130, -30], [145, 50],
      [80, 95], [-10, 105], [-105, 80], [-150, 10], [-60, 10], [40, 25], [-15, -45],
    ];
    for (const [gx, gy] of ring) {
      const p = gridToWorld(gx + rng.range(-8, 8), gy + rng.range(-8, 8), northBase.x, northBase.y);
      place(p.x, p.y, rng.range(13, 19), rng.range(11, 15), axis + rng.range(-0.2, 0.2), 'HOUSE');
    }
    // the church — the old town's landmark, on the knoll by the bridge
    const church = gridToWorld(190, -60, northBase.x, northBase.y);
    place(church.x, church.y, 14, 24, axis + 0.25, 'CHURCH');

    // ── east suburb — depots, substation, workshops ──
    const eastBase = { x: 4380, y: 3290 };
    const eastSpots: [number, number, BuildingKind][] = [
      [-60, -40, 'DEPOT'], [40, -60, 'WAREHOUSE'], [110, 10, 'SHED'],
      [-30, 70, 'HOUSE'], [60, 80, 'HOUSE'], [-130, 30, 'SUBSTATION'],
    ];
    for (const [gx, gy, kind] of eastSpots) {
      const p = gridToWorld(gx, gy, eastBase.x, eastBase.y);
      const w = kind === 'WAREHOUSE' ? 34 : kind === 'DEPOT' ? 26 : rng.range(14, 20);
      const h = kind === 'WAREHOUSE' ? 17 : kind === 'DEPOT' ? 14 : rng.range(11, 14);
      place(p.x, p.y, w, h, axis + rng.range(-0.12, 0.12), kind);
    }
  }

  /** the EASTERN AIRFIELD — runway, taxiway, aprons, hangars, tower */
  private buildAirfield(cx: number, cy: number, rng: RNG) {
    const ang = 0.16; // runway heading, roughly E-W
    this.runways = [
      { x: cx, y: cy, angle: ang, len: 560, w: 44, kind: 'RUNWAY' },
      { x: cx - 10, y: cy + 78, angle: ang, len: 470, w: 14, kind: 'TAXI' },
      { x: cx - 180, y: cy + 78, angle: ang, len: 130, w: 56, kind: 'APRON' },
      { x: cx + 130, y: cy + 78, angle: ang, len: 110, w: 56, kind: 'APRON' },
    ];
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const at = (fx: number, fy: number): { x: number; y: number } => ({
      x: cx + fx * cos - fy * sin,
      y: cy + fx * sin + fy * cos,
    });
    // hangars on the north edge of the dispersal
    for (const [fx, fy] of [[-250, 118], [-160, 118], [-70, 118]] as const) {
      const p = at(fx + rng.range(-6, 6), fy);
      this.buildings.push({ x: p.x, y: p.y, w: 38, h: 26, rot: ang + rng.range(-0.05, 0.05), kind: 'HANGAR' });
    }
    // the control tower between the aprons
    const tower = at(30, 108);
    this.buildings.push({ x: tower.x, y: tower.y, w: 13, h: 13, rot: ang, kind: 'TOWER' });
    // fuel farm + depot behind the hangars
    for (const [fx, fy] of [[-230, 165], [-205, 175]] as const) {
      const p = at(fx, fy);
      this.buildings.push({ x: p.x, y: p.y, w: 12, h: 12, rot: 0, kind: 'FUEL_TANK' });
    }
    const depot = at(-110, 170);
    this.buildings.push({ x: depot.x, y: depot.y, w: 24, h: 13, rot: ang, kind: 'DEPOT' });
  }

  /** is (x, y) on airfield paving? (clearance in metres) */
  onRunway(x: number, y: number, r: number): boolean {
    for (const rw of this.runways) {
      const c = Math.cos(-rw.angle);
      const s = Math.sin(-rw.angle);
      const dx = x - rw.x;
      const dy = y - rw.y;
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      if (Math.abs(lx) < rw.len / 2 + r && Math.abs(ly) < rw.w / 2 + r) return true;
    }
    return false;
  }

  private buildFarm(cx: number, cy: number, rng: RNG) {
    const spots: [number, number][] = [
      [-58, -40], [44, -66], [-86, 44], [62, 58], [-8, 96],
    ];
    const kinds: BuildingKind[] = ['HOUSE', 'BARN', 'SHED', 'SILO', 'BARN'];
    for (let i = 0; i < 5; i++) {
      const s = spots[i % spots.length];
      const bx = cx + s[0] + rng.range(-14, 14);
      const by = cy + s[1] + rng.range(-14, 14);
      if (this.isWater(bx, by) || this.roadFactor(bx, by) > 0.1) continue;
      const kind = kinds[i % kinds.length];
      let w: number;
      let h: number;
      if (kind === 'BARN') { w = rng.range(26, 32); h = rng.range(14, 17); }
      else if (kind === 'SILO') { w = rng.range(8, 10); h = rng.range(8, 10); }
      else if (kind === 'SHED') { w = rng.range(12, 16); h = rng.range(9, 12); }
      else { w = rng.range(15, 20); h = rng.range(11, 14); }
      const rot = rng.range(-0.25, 0.25) + (rng.chance(0.5) ? 0 : Math.PI / 2);
      if (!this.buildingFits(bx, by, w, h, rot)) continue;
      this.buildings.push({ x: bx, y: by, w, h, rot, kind });
    }
  }

/** an ink works: halls, chimney, tank farm, depot — scaled by significance */
  private buildFactory(site: FactorySite, rng: RNG, scale: number) {
    const { x, y } = site;
    // main production hall
    this.buildings.push({ x, y, w: 42 * scale, h: 24 * scale, rot: 0.08, kind: 'FACTORY_HALL' });
    // second hall at an angle — the plant grew in stages
    this.buildings.push({
      x: x - 44 * scale,
      y: y + 30 * scale,
      w: 26 * scale,
      h: 16 * scale,
      rot: 0.42,
      kind: 'FACTORY_HALL2',
    });
    // chimney — the signature
    this.buildings.push({ x: x + 26 * scale, y: y - 18 * scale, w: 7, h: 7, rot: 0, kind: 'CHIMNEY' });
    // fuel / solvent tank farm
    const tanks = Math.round(2 + scale);
    for (let i = 0; i < tanks; i++) {
      this.buildings.push({
        x: x + (30 + i * 17) * scale,
        y: y + 26 * scale,
        w: 12,
        h: 12,
        rot: 0,
        kind: 'STORAGE_TANK',
      });
    }
    // stores depot
    this.buildings.push({
      x: x - 20 * scale,
      y: y - 34 * scale,
      w: 16 * scale,
      h: 10 * scale,
      rot: -0.2,
      kind: 'DEPOT',
    });
    // electrical substation feeding the works
    this.buildings.push({ x: x - 46 * scale, y: y - 24 * scale, w: 11, h: 8, rot: 0.1, kind: 'SUBSTATION' });
  }

  private buildHQ(cx: number, cy: number, rng: RNG) {
    void rng;
    // compound: core bunker + support structures + masts, arranged deliberately
    this.buildings.push({ x: cx, y: cy, w: 34, h: 26, rot: 0.18, kind: 'HQ_CORE' });
    this.buildings.push({ x: cx - 66, y: cy + 42, w: 20, h: 14, rot: -0.1, kind: 'HQ_SUPPORT' });
    this.buildings.push({ x: cx + 62, y: cy - 48, w: 18, h: 13, rot: 0.3, kind: 'HQ_SUPPORT' });
    this.buildings.push({ x: cx + 74, y: cy + 40, w: 15, h: 11, rot: -0.25, kind: 'SHED' });
    this.buildings.push({ x: cx - 48, y: cy - 62, w: 7, h: 7, rot: 0, kind: 'MAST' });
    this.buildings.push({ x: cx - 92, y: cy - 30, w: 6, h: 6, rot: 0, kind: 'MAST' });
    this.buildings.push({ x: cx + 40, y: cy - 88, w: 6, h: 6, rot: 0, kind: 'MAST' });
    // small perimeter bunkers
    this.buildings.push({ x: cx - 120, y: cy + 110, w: 12, h: 9, rot: 0.6, kind: 'BUNKER' });
    this.buildings.push({ x: cx + 130, y: cy + 96, w: 12, h: 9, rot: -0.5, kind: 'BUNKER' });
    this.buildings.push({ x: cx + 8, y: cy + 150, w: 12, h: 9, rot: 0.05, kind: 'BUNKER' });
    // substation at the power line terminus
    this.buildings.push({ x: cx - 10, y: cy - 118, w: 12, h: 9, rot: 0.1, kind: 'SUBSTATION' });
  }

  buildingAt(x: number, y: number, pad = 0): Building | null {
    for (const b of this.buildings) {
      if (dist(x, y, b.x, b.y) < Math.max(b.w, b.h) * 0.75 + pad) return b;
    }
    return null;
  }

  /** exact rotated-rect footprint test — used for LOS and cover */
  buildingFootprintAt(x: number, y: number): Building | null {
    const near = this.buildingsNear(x, y, 4);
    for (const b of near) {
      const dx = x - b.x;
      const dy = y - b.y;
      const c = Math.cos(-b.rot);
      const s = Math.sin(-b.rot);
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return b;
    }
    return null;
  }

  /** buildings whose centre is within r of the point */
  buildingsNear(x: number, y: number, r: number): Building[] {
    const out: Building[] = [];
    const CELL = 128;
    const c0x = Math.floor((x - r) / CELL);
    const c1x = Math.floor((x + r) / CELL);
    const c0y = Math.floor((y - r) / CELL);
    const c1y = Math.floor((y + r) / CELL);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const arr = this.bldGrid.get(cx * 100000 + cy);
        if (arr) out.push(...arr);
      }
    }
    return out;
  }

  /** distance to the nearest trench line */
  trenchDist(x: number, y: number): number {
    let best = Infinity;
    for (const t of this.trenches) {
      const d = this.distToPolyline(x, y, t.pts);
      if (d < best) best = d;
    }
    return best;
  }

  /** a collapsed building opens sightlines and routes; rubble remains */
  onBuildingDestroyed(b: Building) {
    // clear LOS occupancy over the footprint (intersect-based, matching
    // the rasterisation so no stale cells survive)
    const reach = Math.max(b.w, b.h) * 0.5;
    const gx0 = Math.max(0, ((b.x - reach) / this.BM_CELL) | 0);
    const gx1 = Math.min(this.bmw - 1, ((b.x + reach) / this.BM_CELL) | 0);
    const gy0 = Math.max(0, ((b.y - reach) / this.BM_CELL) | 0);
    const gy1 = Math.min(this.bmh - 1, ((b.y + reach) / this.BM_CELL) | 0);
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = clamp(b.x, gx * this.BM_CELL, (gx + 1) * this.BM_CELL);
        const py = clamp(b.y, gy * this.BM_CELL, (gy + 1) * this.BM_CELL);
        const dx = px - b.x;
        const dy = py - b.y;
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) {
          this.bmask[gy * this.bmw + gx] = 0;
        }
      }
    }
    // rubble is passable — route cost eases where the structure stood
    const c0x = Math.max(0, ((b.x - reach) / CELL) | 0);
    const c1x = Math.min(this.gw - 1, ((b.x + reach) / CELL) | 0);
    const c0y = Math.max(0, ((b.y - reach) / CELL) | 0);
    const c1y = Math.min(this.gh - 1, ((b.y + reach) / CELL) | 0);
    for (let gy = c0y; gy <= c1y; gy++) {
      for (let gx = c0x; gx <= c1x; gx++) {
        const i = gy * this.gw + gx;
        if (this.cost[i] > 0) this.cost[i] = Math.max(0.9, this.cost[i] - 5);
      }
    }
  }

  /** is the wall still standing where it meets (x, y)? */
  wallSegmentAlive(w: StoneWall, x: number, y: number): boolean {
    if (!w.segs || !w.segs.length) return true;
    const c = Math.cos(w.rot);
    const s = Math.sin(w.rot);
    const dx = x - w.x;
    const dy = y - w.y;
    const lx = dx * c + dy * s;
    const ly = -dx * s + dy * c;
    if (Math.abs(lx) > w.len / 2 + 4 || Math.abs(ly) > 12) return false;
    const segLen = w.len / w.segs.length;
    const idx = clamp(Math.floor((lx + w.len / 2) / segLen), 0, w.segs.length - 1);
    return w.segs[idx].hp > 0;
  }

  /** fraction of a wall still standing (0..1) */
  wallIntegrity(w: StoneWall): number {
    if (!w.segs || !w.segs.length) return 1;
    let up = 0;
    for (const s of w.segs) if (s.hp > 0) up++;
    return up / w.segs.length;
  }

  /** nearest stone wall within r — distance measured to the wall
   *  LINE, so a long wall shelters along its whole length */
  wallNear(x: number, y: number, r: number): StoneWall | null {
    let best: StoneWall | null = null;
    let bd = r;
    for (const w of this.walls) {
      const c = Math.cos(w.rot);
      const s = Math.sin(w.rot);
      const dx = x - w.x;
      const dy = y - w.y;
      const lx = dx * c + dy * s;
      const ly = -dx * s + dy * c;
      if (Math.abs(lx) > w.len / 2 + 4) continue;
      const d = Math.abs(ly);
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    return best;
  }

  /** the closest point on a wall's centreline to (x, y) */
  wallPointAt(w: StoneWall, x: number, y: number): { x: number; y: number } {
    const c = Math.cos(w.rot);
    const s = Math.sin(w.rot);
    const dx = x - w.x;
    const dy = y - w.y;
    const lx = clamp(dx * c + dy * s, -w.len / 2, w.len / 2);
    return { x: w.x + c * lx, y: w.y + s * lx };
  }

  private extractContours(): ContourTile[] {
    const step = 16; // metres between samples
    const TILE = 1024; // tile size in metres — only visible tiles stroke
    const nx = Math.floor(this.W / step) + 1;
    const ny = Math.floor(this.H / step) + 1;
    // sample the 8 m master grid (fast bilinear — no noise per sample)
    const heights = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        heights[j * nx + i] = this.heightAt8(i * step, j * step);
      }
    }
    const interval = 8;
    const majorEvery = 5;
    const tiles: ContourTile[] = [];
    const cols = Math.ceil(this.W / TILE);
    const rows = Math.ceil(this.H / TILE);

    const lerpPt = (x1: number, y1: number, x2: number, y2: number, h1: number, h2: number, level: number) => {
      const t = (level - h1) / (h2 - h1 || 1e-6);
      return { x: (x1 + (x2 - x1) * t) * step, y: (y1 + (y2 - y1) * t) * step };
    };

    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const tile: ContourTile = {
          x0: tx * TILE,
          y0: ty * TILE,
          size: TILE,
          minor: new Path2D(),
          major: new Path2D(),
        };
        const i0 = Math.max(0, Math.floor((tx * TILE) / step) - 1);
        const i1 = Math.min(nx - 1, Math.ceil(((tx + 1) * TILE) / step) + 1);
        const j0 = Math.max(0, Math.floor((ty * TILE) / step) - 1);
        const j1 = Math.min(ny - 1, Math.ceil(((ty + 1) * TILE) / step) + 1);
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) {
            const x = i * step;
            const y = j * step;
            const h00 = heights[j * nx + i];
            const h10 = heights[j * nx + i + 1];
            const h01 = heights[(j + 1) * nx + i];
            const h11 = heights[(j + 1) * nx + i + 1];
            const hMin = Math.min(h00, h10, h01, h11);
            const hMax = Math.max(h00, h10, h01, h11);
            const firstLevel = Math.ceil(hMin / interval) * interval;
            for (let level = firstLevel; level <= hMax; level += interval) {
              if (level <= 0) continue;
              const isMajor = Math.round(level / interval) % majorEvery === 0;
              const path = isMajor ? tile.major : tile.minor;
              // marching squares on cell corners
              let idx = 0;
              if (h00 >= level) idx |= 1;
              if (h10 >= level) idx |= 2;
              if (h11 >= level) idx |= 4;
              if (h01 >= level) idx |= 8;
              if (idx === 0 || idx === 15) continue;
              const top = () => lerpPt(i, j, i + 1, j, h00, h10, level);
              const right = () => lerpPt(i + 1, j, i + 1, j + 1, h10, h11, level);
              const bottom = () => lerpPt(i, j + 1, i + 1, j + 1, h01, h11, level);
              const left = () => lerpPt(i, j, i, j + 1, h00, h01, level);
              const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
                path.moveTo(a.x, a.y);
                path.lineTo(b.x, b.y);
              };
              switch (idx) {
                case 1:
                case 14:
                  seg(left(), top());
                  break;
                case 2:
                case 13:
                  seg(top(), right());
                  break;
                case 3:
                case 12:
                  seg(left(), right());
                  break;
                case 4:
                case 11:
                  seg(right(), bottom());
                  break;
                case 6:
                case 9:
                  seg(top(), bottom());
                  break;
                case 7:
                case 8:
                  seg(left(), bottom());
                  break;
                case 5:
                  seg(left(), top());
                  seg(right(), bottom());
                  break;
                case 10:
                  seg(top(), right());
                  seg(left(), bottom());
                  break;
                default:
                  break;
              }
            }
          }
        }
        tiles.push(tile);
      }
    }
    return tiles;
  }

  /** the 8 m master height field — one pass of heightAt, reused by the
   *  wash hillshade and the contour extractor */
  private buildHeight8() {
    const S = 8;
    this.h8w = Math.ceil(this.W / S) + 1;
    this.h8h = Math.ceil(this.H / S) + 1;
    this.height8 = new Float32Array(this.h8w * this.h8h);
    for (let j = 0; j < this.h8h; j++) {
      for (let i = 0; i < this.h8w; i++) {
        this.height8[j * this.h8w + i] = this.heightAt(i * S, j * S);
      }
    }
  }

  /** bilinear sample of the 8 m master height field */
  heightAt8(x: number, y: number): number {
    const gx = clamp(x / 8, 0, this.h8w - 1.001);
    const gy = clamp(y / 8, 0, this.h8h - 1.001);
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const h00 = this.height8[iy * this.h8w + ix];
    const h10 = this.height8[iy * this.h8w + ix + 1];
    const h01 = this.height8[(iy + 1) * this.h8w + ix];
    const h11 = this.height8[(iy + 1) * this.h8w + ix + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  }

  // ── passability + A* ───────────────────────────────────────

  private buildCostGrid() {
    this.gw = Math.ceil(this.W / CELL);
    this.gh = Math.ceil(this.H / CELL);
    const n = this.gw * this.gh;
    this.cost = new Float32Array(n);
    for (let gy = 0; gy < this.gh; gy++) {
      for (let gx = 0; gx < this.gw; gx++) {
        const cx = gx * CELL + CELL / 2;
        const cy = gy * CELL + CELL / 2;
        let c: number;
        if (this.isWater(cx, cy) && !this.bridgeAt(cx, cy, CELL * 0.9) && !this.fordAt(cx, cy, CELL)) {
          c = -1; // impassable water
        } else if (this.fordAt(cx, cy, CELL)) {
          c = 3.6; // wading — slow but possible
        } else {
          c = 1;
          c += this.slopeAt(cx, cy) * 14;
          const f = this.forestDensity(cx, cy);
          if (f > 0.42) c += 2.4;
          const r = this.roadFactor(cx, cy);
          if (r > 0.05) c = Math.min(c, r > 0.5 ? 0.34 : 0.6);
          if (this.railFactor(cx, cy) > 0.4) c += 1.2;
          if (this.buildingAt(cx, cy, 10)) c += 5;
          if (this.trenchDist(cx, cy) < 8) c += 1.4; // crossing a dug position
          // boulder fields and concrete are avoided by preference
          for (const rk of this.rocks) {
            if (rk.r < 2.6) continue;
            if (dist(cx, cy, rk.x, rk.y) < rk.r + 18) {
              c += 2.2;
              break;
            }
          }
          for (const b of this.barriers) {
            if ((b.hp ?? 100) <= 0) continue;
            if (dist(cx, cy, b.x, b.y) < 26) {
              c += 3.2;
              break;
            }
          }
          if (this.bridgeAt(cx, cy, CELL * 0.9)) c = 0.5;
        }
        this.cost[gy * this.gw + gx] = c;
      }
    }
  }

  private buildHeightGrid() {
    this.hgw = Math.ceil(this.W / HG_STEP) + 1;
    this.hgh = Math.ceil(this.H / HG_STEP) + 1;
    this.hg = new Float32Array(this.hgw * this.hgh);
    for (let j = 0; j < this.hgh; j++) {
      for (let i = 0; i < this.hgw; i++) {
        this.hg[j * this.hgw + i] = this.heightAt(i * HG_STEP, j * HG_STEP);
      }
    }
    // building occupancy mask — rasterize every footprint once
    this.bmw = Math.ceil(this.W / this.BM_CELL) + 1;
    this.bmh = Math.ceil(this.H / this.BM_CELL) + 1;
    this.bmask = new Uint8Array(this.bmw * this.bmh);
    // big boulders interrupt ground-level sightlines too
    this.rockMask = new Uint8Array(this.bmw * this.bmh);
    for (const rk of this.rocks) {
      if (rk.r < this.ROCK_LOS_R) continue;
      const g0x = Math.max(0, ((rk.x - rk.r) / this.BM_CELL) | 0);
      const g1x = Math.min(this.bmw - 1, ((rk.x + rk.r) / this.BM_CELL) | 0);
      const g0y = Math.max(0, ((rk.y - rk.r) / this.BM_CELL) | 0);
      const g1y = Math.min(this.bmh - 1, ((rk.y + rk.r) / this.BM_CELL) | 0);
      for (let gy = g0y; gy <= g1y; gy++) {
        for (let gx = g0x; gx <= g1x; gx++) {
          const px = gx * this.BM_CELL + this.BM_CELL / 2;
          const py = gy * this.BM_CELL + this.BM_CELL / 2;
          if (dist(px, py, rk.x, rk.y) < rk.r * 0.9) this.rockMask[gy * this.bmw + gx] = 1;
        }
      }
    }
    for (const b of this.buildings) {
      if (b.kind === 'MAST' || b.kind === 'CHECKPOINT') continue; // see-through
      const c = Math.cos(b.rot);
      const s = Math.sin(b.rot);
      // intersect-based rasterisation: any cell the footprint touches is
      // masked, so even a small house reliably interrupts a ground beam
      const reach = Math.max(b.w, b.h) * 0.5;
      const gx0 = Math.max(0, ((b.x - reach) / this.BM_CELL) | 0);
      const gx1 = Math.min(this.bmw - 1, ((b.x + reach) / this.BM_CELL) | 0);
      const gy0 = Math.max(0, ((b.y - reach) / this.BM_CELL) | 0);
      const gy1 = Math.min(this.bmh - 1, ((b.y + reach) / this.BM_CELL) | 0);
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          // closest point of the cell rect to the building centre, in
          // building-local space — if inside the half-extents, mask
          const px = clamp(b.x, gx * this.BM_CELL, (gx + 1) * this.BM_CELL);
          const py = clamp(b.y, gy * this.BM_CELL, (gy + 1) * this.BM_CELL);
          const dx = px - b.x;
          const dy = py - b.y;
          const lx = dx * c + dy * s;
          const ly = -dx * s + dy * c;
          if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) {
            this.bmask[gy * this.bmw + gx] = 1;
          }
        }
      }
    }
  }

  findPath(from: Vec2, to: Vec2): Vec2[] {
    const sgx = clamp(Math.floor(from.x / CELL), 0, this.gw - 1);
    const sgy = clamp(Math.floor(from.y / CELL), 0, this.gh - 1);
    let tgx = clamp(Math.floor(to.x / CELL), 0, this.gw - 1);
    let tgy = clamp(Math.floor(to.y / CELL), 0, this.gh - 1);
    if (this.cost[tgy * this.gw + tgx] < 0) {
      // nudge target to nearest passable cell
      const alt = this.nearestPassable(tgx, tgy);
      if (!alt) return [{ ...to }];
      tgx = alt[0];
      tgy = alt[1];
    }
    if (sgx === tgx && sgy === tgy) return [{ ...to }];

    const n = this.gw * this.gh;
    const gScore = new Float32Array(n).fill(Infinity);
    const cameFrom = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open: number[] = [];
    const fScore = new Float32Array(n).fill(Infinity);
    const h = (x: number, y: number) => (Math.abs(x - tgx) + Math.abs(y - tgy)) * 0.6;
    const start = sgy * this.gw + sgx;
    gScore[start] = 0;
    fScore[start] = h(sgx, sgy);
    open.push(start);
    let guard = 0;
    while (open.length && guard++ < 12000) {
      // find best in open
      let bi = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore[open[i]] < fScore[open[bi]]) bi = i;
      }
      const cur = open.splice(bi, 1)[0];
      if (cur === tgy * this.gw + tgx) break;
      closed[cur] = 1;
      const cx = cur % this.gw;
      const cy = (cur / this.gw) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.gw || ny >= this.gh) continue;
          const ni = ny * this.gw + nx;
          if (closed[ni] || this.cost[ni] < 0) continue;
          const step = (dx && dy ? 1.414 : 1) * (this.cost[ni] + this.cost[cur]) * 0.5;
          const tentative = gScore[cur] + step;
          if (tentative < gScore[ni]) {
            gScore[ni] = tentative;
            cameFrom[ni] = cur;
            fScore[ni] = tentative + h(nx, ny);
            if (!open.includes(ni)) open.push(ni);
          }
        }
      }
    }

    const end = tgy * this.gw + tgx;
    if (cameFrom[end] === -1 && end !== start) return [{ ...to }];
    // reconstruct
    const cells: number[] = [];
    let c = end;
    while (c !== -1 && c !== start) {
      cells.push(c);
      c = cameFrom[c];
    }
    cells.push(start);
    cells.reverse();
    // waypoints at cell centres, then string-pull
    let pts: Vec2[] = cells.map((ci) => ({
      x: (ci % this.gw) * CELL + CELL / 2,
      y: ((ci / this.gw) | 0) * CELL + CELL / 2,
    }));
    pts.push({ ...to });
    pts = this.smoothPath(pts);
    return pts.length ? pts : [{ ...to }];
  }

  private nearestPassable(gx: number, gy: number): [number, number] | null {
    for (let r = 1; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= this.gw || ny >= this.gh) continue;
          if (this.cost[ny * this.gw + nx] >= 0) return [nx, ny];
        }
      }
    }
    return null;
  }

  private smoothPath(pts: Vec2[]): Vec2[] {
    if (pts.length < 3) return pts;
    const out: Vec2[] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) {
        if (this.los(pts[i], pts[j])) break;
      }
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  los(a: Vec2, b: Vec2): boolean {
    const d = dist(a.x, a.y, b.x, b.y);
    const steps = Math.max(2, Math.ceil(d / (CELL * 0.6)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (this.isWater(x, y) && !this.bridgeAt(x, y, 30) && !this.fordAt(x, y, 40)) return false;
      if (this.slopeAt(x, y) > 0.75) return false;
    }
    return true;
  }

  treesNear(x: number, y: number, r: number): TreePoint[] {
    const out: TreePoint[] = [];
    const c0x = Math.floor((x - r) / TREE_CELL);
    const c1x = Math.floor((x + r) / TREE_CELL);
    const c0y = Math.floor((y - r) / TREE_CELL);
    const c1y = Math.floor((y + r) / TREE_CELL);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const arr = this.treeGrid.get(cx * 100000 + cy);
        if (arr) out.push(...arr);
      }
    }
    return out;
  }

  private treeKey(x: number, y: number): number {
    return Math.floor(x / TREE_CELL) * 100000 + Math.floor(y / TREE_CELL);
  }

  // ── polyline helpers ───────────────────────────────────────

  distToPolyline(x: number, y: number, pts: Vec2[]): number {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const wx = x - a.x;
      const wy = y - a.y;
      const len2 = vx * vx + vy * vy || 1e-6;
      let t = (wx * vx + wy * vy) / len2;
      t = clamp(t, 0, 1);
      const dx = x - (a.x + vx * t);
      const dy = y - (a.y + vy * t);
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  polylineDirAt(x: number, y: number, pts: Vec2[]): number {
    let best = Infinity;
    let bestI = 0;
    let bestT = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const wx = x - a.x;
      const wy = y - a.y;
      const len2 = vx * vx + vy * vy || 1e-6;
      let t = (wx * vx + wy * vy) / len2;
      t = clamp(t, 0, 1);
      const dx = x - (a.x + vx * t);
      const dy = y - (a.y + vy * t);
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        bestI = i;
        bestT = t;
      }
    }
    const a = pts[bestI];
    const b = pts[bestI + 1];
    void bestT;
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
}

function smooth01(t: number): number {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

/** structural strength by building kind — a church outlives a shed */
export function buildingHpFor(kind: BuildingKind): number {
  switch (kind) {
    case 'HOUSE': return 150;
    case 'BARN': return 185;
    case 'SHED': return 90;
    case 'SILO': return 120;
    case 'CHURCH': return 250;
    case 'HQ_CORE': return 420;
    case 'HQ_SUPPORT': return 140;
    case 'MAST': return 25;
    case 'BUNKER': return 300;
    case 'FACTORY_HALL': return 430;
    case 'FACTORY_HALL2': return 320;
    case 'CHIMNEY': return 210;
    case 'STORAGE_TANK': return 90;
    case 'DEPOT': return 140;
    case 'SUBSTATION': return 80;
    case 'CHECKPOINT': return 50;
    case 'RUIN': return 60;
    case 'WAREHOUSE': return 200;
    case 'FUEL_TANK': return 85;
    case 'BLOCK': return 340;
    case 'HANGAR': return 260;
    case 'TOWER': return 160;
    default: return 120;
  }
}
