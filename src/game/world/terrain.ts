// ─────────────────────────────────────────────────────────────
// PAPER STORM · terrain generation
// A deliberately composed military landscape: ridgelines, river
// valley, railway, fords, towns, farms, industrial works, power
// corridor. Heightmap + contours + passability + A* + LOS grid.
// ─────────────────────────────────────────────────────────────

import { Noise2D } from '../core/noise';
import { RNG, clamp, dist, Vec2 } from '../core/math';

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
  | 'RUIN';

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

export interface ContourSet {
  minor: Path2D;
  major: Path2D;
}

const CELL = 64; // pathfinding cell size (m)
const TREE_CELL = 96;
const HG_STEP = 32; // height grid for LOS (m)

export class Terrain {
  readonly W = 4096;
  readonly H = 3072;

  seed: number;
  private baseNoise: Noise2D;
  private detailNoise: Noise2D;
  private forestNoise: Noise2D;

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

  contours: ContourSet | null = null;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.baseNoise = new Noise2D(this.seed);
    this.detailNoise = new Noise2D((this.seed ^ 0x9e3779b9) >>> 0);
    this.forestNoise = new Noise2D((this.seed ^ 0x51ed2701) >>> 0);
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
    let h = this.baseNoise.fbm(x / 1500, y / 1500, 5) * 26 - 6;
    h += this.detailNoise.fbm(x / 380, y / 380, 3) * 5 - 1.5;

    // ZAPAD RIDGE — four overlapping crests along one spine
    h += this.gaussEl(x, y, 500, 480, 380, 300, 28);
    h += this.gaussEl(x, y, 730, 660, 420, 320, 36);
    h += this.gaussEl(x, y, 950, 840, 400, 300, 30);
    h += this.gaussEl(x, y, 1140, 1010, 360, 280, 22);

    // HILL 214 — the dominant landform
    h += this.gauss(x, y, 2950, 1180, 620, 58);
    // shoulder south-west of the hill (finger toward the village)
    h += this.gaussEl(x, y, 2620, 1420, 360, 260, 14);

    // HILL 163 knoll
    h += this.gauss(x, y, 1550, 680, 360, 26);

    // southern rise near player entry
    h += this.gauss(x, y, 1750, 2750, 520, 16);
    // south-eastern rolling ground
    h += this.gaussEl(x, y, 3350, 2600, 600, 380, 12);

    // north-east plateau toward HQ
    const nx = clamp(x / this.W, 0, 1);
    const ny = 1 - clamp(y / this.H, 0, 1);
    h += smooth01(nx * 0.7 + ny * 0.7) * 22;

    // river valley carve
    const dRiver = this.distToPolyline(x, y, this.river);
    if (dRiver < 170) {
      const t = 1 - dRiver / 170;
      h -= smooth01(t) * 11;
    }
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
    return this.distToPolyline(x, y, this.river) < this.riverWidth * 0.5;
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
    const n = this.forestNoise.fbm(x / 520, y / 520, 4);
    // NW-biased woodland belt; the valley slopes carry brush
    const west = 1 - x / this.W;
    const bias = -0.075 * west + 0.035 * (y / this.H);
    const v = (n - 0.585 + bias) * 4.2;
    return clamp(v, 0, 1) * 1.6;
  }

  // ── generation ─────────────────────────────────────────────

  private generate() {
    const rng = new RNG((this.seed ^ 0xC0FFEE) >>> 0);

    // river: NW → SE diagonal
    this.river = [
      { x: -40, y: 780 },
      { x: 480, y: 950 },
      { x: 1050, y: 1230 },
      { x: 1600, y: 1440 },
      { x: 2150, y: 1700 },
      { x: 2700, y: 2010 },
      { x: 3250, y: 2330 },
      { x: 3750, y: 2560 },
      { x: 4140, y: 2680 },
    ];
    for (let i = 1; i < this.river.length - 1; i++) {
      const p = this.river[i];
      const a = rng.range(0, Math.PI * 2);
      p.x += Math.cos(a) * rng.range(20, 70);
      p.y += Math.sin(a) * rng.range(20, 70);
    }

    // ford on the southern reach
    this.ford = { x: 2950 + rng.range(-30, 30), y: 2135 + rng.range(-30, 30) };

    // dry tributary from the west ridge down to the river
    this.dryStream = [
      { x: 660, y: 560 },
      { x: 820, y: 760 },
      { x: 990, y: 950 },
      { x: 1130, y: 1120 },
      { x: 1240, y: 1300 },
    ];

    // ── road network — every road leads somewhere ────────────
    const mainRoad: Vec2[] = [
      { x: 1560, y: 3120 },
      { x: 1640, y: 2650 },
      { x: 1900, y: 2230 },
      { x: 2190, y: 1850 }, // town / bridge
      { x: 2480, y: 1360 },
      { x: 2620, y: 860 },
      { x: 2760, y: 360 },
      { x: 2820, y: -40 },
    ];
    const ewRoad: Vec2[] = [
      { x: -40, y: 2160 },
      { x: 700, y: 2060 },
      { x: 1300, y: 1940 },
      { x: 1800, y: 1870 },
      { x: 2190, y: 1850 }, // town crossroads
      { x: 2350, y: 1812 }, // east bridge
      { x: 2800, y: 1730 },
      { x: 3350, y: 1750 }, // ZAVOD 7 industrial
      { x: 4140, y: 1620 },
    ];
    // northern flank track (second axis)
    const northTrack: Vec2[] = [
      { x: 640, y: 2560 },
      { x: 980, y: 2160 },
      { x: 1150, y: 1720 },
      { x: 1240, y: 1400 }, // north bridge
      { x: 1500, y: 1120 },
      { x: 1960, y: 930 },
      { x: 2450, y: 850 },
      { x: 2900, y: 900 },
    ];
    // southern lane serving ZAVOD 3 and the farm belt
    const southLane: Vec2[] = [
      { x: 1640, y: 2650 },
      { x: 1380, y: 2450 },
      { x: 1150, y: 2250 }, // ZAVOD 3
      { x: 700, y: 2280 },
      { x: -40, y: 2350 },
    ];
    // ford track — the southern loop across the wade point
    const fordTrack: Vec2[] = [
      { x: 3350, y: 1750 }, // ZAVOD 7
      { x: 3080, y: 1980 },
      { x: 2950, y: 2135 }, // FORD
      { x: 2620, y: 2330 },
      { x: 2100, y: 2620 },
      { x: 1640, y: 2650 },
    ];
    for (const pts of [mainRoad, ewRoad, northTrack, southLane, fordTrack]) {
      for (let i = 1; i < pts.length - 1; i++) {
        pts[i].x += rng.range(-30, 30);
        pts[i].y += rng.range(-30, 30);
      }
    }
    this.roads = [
      { pts: mainRoad, major: true, name: 'MSR VEGA' },
      { pts: ewRoad, major: true, name: 'HWY 14' },
      { pts: northTrack, major: false, name: 'NORTH TRACK' },
      { pts: southLane, major: false, name: 'SOUTH LANE' },
      { pts: fordTrack, major: false, name: 'FORD TRACK' },
    ];

    // ── railway: west edge → across the river → ZAVOD 7 → east ──
    this.railway = [
      { x: -60, y: 1130 },
      { x: 300, y: 1080 },
      { x: 610, y: 1012 }, // rail bridge
      { x: 1000, y: 1020 },
      { x: 1600, y: 1060 },
      { x: 2200, y: 1150 },
      { x: 2900, y: 1380 },
      { x: 3380, y: 1620 },
      { x: 3800, y: 1660 },
      { x: 4160, y: 1690 },
    ];
    for (let i = 1; i < this.railway.length - 1; i++) {
      this.railway[i].x += rng.range(-22, 22);
      this.railway[i].y += rng.range(-16, 16);
    }

    // ── bridges where roads cross the river ──────────────────
    this.bridges = [];
    const addBridge = (rx: number, ry: number) => {
      const dir = this.polylineDirAt(rx, ry, this.river);
      this.bridges.push({
        x: rx,
        y: ry,
        angle: dir + Math.PI / 2,
        len: this.riverWidth + 46,
        w: 22,
      });
    };
    addBridge(2168, 1760); // MSR bridge at the town
    addBridge(1240, 1400); // northern track bridge
    addBridge(2352, 1812); // east bridge on HWY 14
    // rail bridge — scenery only, not vehicle passable
    const railDir = this.polylineDirAt(610, 1012, this.river);
    this.railBridges.push({
      x: 610,
      y: 1012,
      angle: railDir + Math.PI / 2,
      len: this.riverWidth + 40,
      w: 12,
      rail: true,
    });

    // ── the town at the crossroads ────────────────────────────
    this.buildTown(2190, 1850, rng);

    // ── ink factories — serious military-industrial works ────
    this.factories = [
      { id: 'MOLOT9', name: 'MOLot 9', x: 1520, y: 880 },
      { id: 'ZAVOD3', name: 'ZAVOD 3', x: 1150, y: 2250 },
      { id: 'ZAVOD7', name: 'ZAVOD 7', x: 3350, y: 1750 },
    ];
    this.buildFactory(this.factories[0], rng, 0.86); // small works
    this.buildFactory(this.factories[1], rng, 1.0);
    this.buildFactory(this.factories[2], rng, 1.25); // main combine

    // enemy HQ compound NE
    this.buildHQ(3440, 640, rng);

    // checkpoint at the town bridge approach
    this.buildings.push({ x: 2136, y: 1802, w: 10, h: 6, rot: 0.9, kind: 'CHECKPOINT' });
    this.buildings.push({ x: 2148, y: 1790, w: 7, h: 5, rot: 0.4, kind: 'BUNKER' });

    // scattered farmsteads — each a logical little cluster
    const farms: [number, number][] = [
      [900, 1400],
      [1450, 2450],
      [2750, 1450],
      [3250, 2150],
      [1750, 900],
      [2350, 2760],
    ];
    for (const [fx, fy] of farms) {
      this.buildFarm(fx + rng.range(-30, 30), fy + rng.range(-30, 30), rng);
    }

    // ── power corridor: ZAVOD 7 substation → enemy HQ ─────────
    this.powerLine = [
      { x: 3380, y: 1700 },
      { x: 3420, y: 1360 },
      { x: 3470, y: 1010 },
      { x: 3480, y: 660 },
      { x: 3430, y: 300 },
    ];
    this.pylons = this.powerLine.map((p) => ({ ...p }));

    // ── field fortifications — the defensive landscape ───────
    this.buildFortifications(rng);

    // ── pre-war ruins near the front line ─────────────────────
    this.buildings.push({ x: 2515, y: 1655, w: 22, h: 15, rot: 0.3, kind: 'RUIN' });
    this.buildings.push({ x: 2560, y: 1690, w: 14, h: 11, rot: -0.15, kind: 'RUIN' });
    this.buildings.push({ x: 1405, y: 1560, w: 18, h: 13, rot: 0.5, kind: 'RUIN' });
    this.buildings.push({ x: 2660, y: 1560, w: 16, h: 12, rot: 0.1, kind: 'RUIN' });

    // ── rocks — boulder fields on the steep ground ─────────
    this.rocks = [];
    for (let i = 0; i < 2600; i++) {
      const x = rng.range(60, this.W - 60);
      const y = rng.range(60, this.H - 60);
      const s = this.slopeAt(x, y);
      if (s < 0.105 || s > 0.4) continue;
      if (this.isWater(x, y) || this.forestDensity(x, y) > 0.6) continue;
      if (this.roadFactor(x, y) > 0.05 || this.railFactor(x, y) > 0.1) continue;
      if (this.buildingAt(x, y, 30)) continue;
      if (rng.chance(0.3)) {
        // a small boulder cluster, not a lone pebble
        const nRocks = rng.int(1, 3);
        for (let r = 0; r < nRocks; r++) {
          this.rocks.push({
            x: x + rng.range(-9, 9),
            y: y + rng.range(-9, 9),
            r: rng.range(1.8, 5.2),
            seed: rng.next(),
          });
        }
      }
      if (this.rocks.length > 170) break;
    }

    // ── trees — forest masses + planted treelines ────────────
    this.trees = [];
    const step = 28;
    for (let y = step; y < this.H; y += step) {
      for (let x = step; x < this.W; x += step) {
        const jx = x + rng.range(-12, 12);
        const jy = y + rng.range(-12, 12);
        if (this.forestDensity(jx, jy) < 0.42) continue;
        if (this.isWater(jx, jy) || this.bridgeAt(jx, jy, 70)) continue;
        if (this.distToPolyline(jx, jy, this.river) < this.riverWidth * 0.5 + 34) continue;
        if (this.roadFactor(jx, jy) > 0.08 || this.railFactor(jx, jy) > 0.15) continue;
        if (this.slopeAt(jx, jy) > 0.17) continue;
        if (this.buildingAt(jx, jy, 34)) continue;
        if (this.trenchDist(jx, jy) < 14) continue;
        if (this.wallNear(jx, jy, 8)) continue;
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
        if (this.railFactor(fx, fy) > 0.05) continue;
        if (this.buildingAt(fx, fy, Math.max(fw, fh) * 0.7 + 30)) continue;
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

    // ── labels & spot heights ─────────────────────────────────
    this.labels = [
      { x: 2950, y: 1180, text: 'HILL 214', size: 30, bold: true },
      { x: 2190, y: 1790, text: 'NOVY MOST', size: 24 },
      { x: 3440, y: 940, text: 'OBJ KRAKEN', size: 22, bold: true },
      { x: 2190, y: 1930, text: 'OBJ ECHO', size: 20, bold: true },
      { x: 2950, y: 1300, text: 'OBJ FOXTROT', size: 20, bold: true },
      { x: 830, y: 700, text: 'ZAPAD RIDGE', size: 22 },
      { x: 1550, y: 545, text: 'HILL 163', size: 18 },
      { x: 3350, y: 1700, text: 'ZAVOD 7', size: 20, bold: true },
      { x: 1150, y: 2200, text: 'ZAVOD 3', size: 18, bold: true },
      { x: 1520, y: 830, text: 'MOLot 9', size: 18, bold: true },
      { x: 2380, y: 1880, text: 'EAST BRIDGE', size: 15 },
      { x: 3000, y: 2260, text: 'FORD', size: 15 },
      { x: 1000, y: 800, text: 'ZAPAD FOREST', size: 22 },
      { x: 3400, y: 2400, text: 'VYSOKA POLJANA', size: 20 },
      { x: 1900, y: 2650, text: 'SOUTH FARMS', size: 18 },
      { x: 500, y: 1070, text: 'RAIL LINE', size: 14 },
    ];
    this.hillPeak = { x: 2950, y: 1180 };
    this.hillHeight = this.heightAt(2950, 1180);

    this.spotHeights = [
      { x: 2950, y: 1180, h: Math.round(this.heightAt(2950, 1180)) },
      { x: 1550, y: 680, h: Math.round(this.heightAt(1550, 680)) },
      { x: 730, y: 660, h: Math.round(this.heightAt(730, 660)) },
      { x: 1750, y: 2750, h: Math.round(this.heightAt(1750, 2750)) },
      { x: 3440, y: 640, h: Math.round(this.heightAt(3440, 640)) },
      { x: 2560, y: 1600, h: Math.round(this.heightAt(2560, 1600)) },
    ];

    // pathfinding grid
    this.buildCostGrid();

    // LOS height grid
    this.buildHeightGrid();

    // contour extraction
    this.contours = this.extractContours();
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

    // PL ECHO defensive line north of the town — faces the player's axis
    this.trenches.push(zigzag(2170, 1712, 190, Math.PI * 0.06, 6));
    this.trenches.push(zigzag(2305, 1760, 130, Math.PI * 0.32, 4));
    // PL FOXTROT — two positions on the hill shoulders
    this.trenches.push(zigzag(2885, 1080, 170, Math.PI * 0.78, 5));
    this.trenches.push(zigzag(3045, 1245, 120, Math.PI * 0.72, 4));
    // HQ perimeter — south face
    this.trenches.push(zigzag(3425, 800, 220, Math.PI * 0.08, 7));
    // ZAVOD 7 perimeter — west face
    this.trenches.push(zigzag(3225, 1760, 150, Math.PI * 0.62, 5));
    // MOLot 9 perimeter — south face
    this.trenches.push(zigzag(1500, 985, 140, Math.PI * 0.1, 5));

    // stone walls — field boundaries that double as cover
    // (complement the treelines: the farmland reads as a defensive maze)
    const wallSpots: [number, number, number, number][] = [
      // near NOVY MOST — the close fight
      [2080, 1780, 120, 0.35],
      [2295, 1915, 110, 0.25],
      [2135, 1975, 130, -0.1],
      [2400, 1830, 100, 0.9],
      // west approach along the E–W highway
      [1750, 1905, 150, 0.08],
      [1600, 1985, 120, -0.2],
      [1850, 2010, 110, 0.05],
      // hill 214 approaches
      [2700, 1390, 140, 0.5],
      [2815, 1300, 110, 0.6],
      [3080, 1120, 120, 0.75],
      // south farms belt
      [1980, 2560, 160, 0.02],
      [2140, 2640, 130, -0.15],
      [2320, 2700, 120, 0.3],
      // north track approach
      [1350, 1330, 120, 0.4],
      [1480, 1220, 110, 0.35],
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
      [2125, 1818, 7],   // town bridge approach
      [2390, 1840, 6],   // east bridge approach
      [3320, 660, 8],    // HQ south entrance
      [3295, 1820, 6],   // ZAVOD 7 west gate
      [2975, 2175, 6],   // the ford
      [1225, 1435, 5],   // north bridge
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

  private buildTown(cx: number, cy: number, rng: RNG) {
    // buildings string along both roads — a real crossroads town
    const along = (
      dx: number,
      dy: number,
      n: number,
      side: number,
      kinds: BuildingKind[]
    ) => {
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1);
        const bx = cx + dx * (t - 0.5) * 2 + -dy * side * rng.range(52, 74);
        const by = cy + dy * (t - 0.5) * 2 + dx * side * rng.range(52, 74);
        if (this.isWater(bx, by) || this.roadFactor(bx, by) > 0.1) continue;
        const kind = kinds[i % kinds.length];
        const w = kind === 'BARN' ? rng.range(26, 34) : rng.range(15, 22);
        const h = kind === 'BARN' ? rng.range(14, 18) : rng.range(11, 15);
        this.buildings.push({
          x: bx,
          y: by,
          w,
          h,
          rot: Math.atan2(dy, dx) + rng.range(-0.12, 0.12),
          kind,
        });
      }
    };
    along(1, -0.36, 4, 1, ['HOUSE', 'HOUSE', 'BARN', 'HOUSE']); // along MSR north
    along(1, -0.36, 3, -1, ['HOUSE', 'SHED', 'HOUSE']);
    along(1, 0.12, 3, 1, ['HOUSE', 'HOUSE', 'SHED']); // along HWY west
    along(1, 0.12, 2, -1, ['HOUSE', 'BARN']);
    along(0.94, 0.34, 3, 1, ['HOUSE', 'HOUSE', 'BARN']); // along HWY east
    along(0.94, 0.34, 2, -1, ['SHED', 'HOUSE']);
    // church — the town landmark, near the bridge
    this.buildings.push({ x: 2236, y: 1782, w: 13, h: 22, rot: 0.28, kind: 'CHURCH' });
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
      this.buildings.push({
        x: bx,
        y: by,
        w,
        h,
        rot: rng.range(-0.25, 0.25) + (rng.chance(0.5) ? 0 : Math.PI / 2),
        kind,
      });
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

  // ── contour extraction (marching squares) ──────────────────

  private extractContours(): ContourSet {
    const step = 16; // metres between samples
    const nx = Math.floor(this.W / step) + 1;
    const ny = Math.floor(this.H / step) + 1;
    const heights = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        heights[j * nx + i] = this.heightAt(i * step, j * step);
      }
    }
    const minor = new Path2D();
    const major = new Path2D();
    const interval = 8;
    const majorEvery = 5;

    const lerpPt = (x1: number, y1: number, x2: number, y2: number, h1: number, h2: number, level: number) => {
      const t = (level - h1) / (h2 - h1 || 1e-6);
      return { x: (x1 + (x2 - x1) * t) * step, y: (y1 + (y2 - y1) * t) * step };
    };

    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
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
          const path = isMajor ? major : minor;
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
    return { minor, major };
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
    default: return 120;
  }
}
