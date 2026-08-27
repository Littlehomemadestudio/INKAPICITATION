// ─────────────────────────────────────────────────────────────
// PAPER STORM · terrain generation
// Heightmap, river, roads, bridges, forests, villages, contours,
// passability grid + A* pathfinding.
// ─────────────────────────────────────────────────────────────

import { Noise2D } from '../core/noise';
import { RNG, clamp, dist, Vec2 } from '../core/math';

export interface TreePoint {
  x: number;
  y: number;
  r: number;
  seed: number;
}

export type BuildingKind = 'HOUSE' | 'BARN' | 'SHED' | 'HQ_CORE' | 'HQ_SUPPORT' | 'MAST' | 'BUNKER';

export interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  kind: BuildingKind;
}

export interface Bridge {
  x: number;
  y: number;
  angle: number; // across the river
  len: number;
  w: number;
}

export interface RoadPath {
  pts: Vec2[];
  major: boolean;
}

export interface ContourSet {
  minor: Path2D;
  major: Path2D;
}

const CELL = 64; // pathfinding cell size (m)
const TREE_CELL = 96;

export class Terrain {
  readonly W = 4096;
  readonly H = 3072;

  seed: number;
  private baseNoise: Noise2D;
  private detailNoise: Noise2D;
  private forestNoise: Noise2D;

  /** river centreline */
  river: Vec2[] = [];
  roads: RoadPath[] = [];
  bridges: Bridge[] = [];
  buildings: Building[] = [];
  trees: TreePoint[] = [];
  fields: { x: number; y: number; w: number; h: number; rot: number; tone: number }[] = [];
  labels: { x: number; y: number; text: string; size: number; bold?: boolean }[] = [];
  hillPeak: Vec2 | null = null;
  hillHeight = 0;

  // pathfinding
  gw = 0;
  gh = 0;
  cost!: Float32Array;

  // tree spatial hash
  private treeGrid: Map<number, TreePoint[]> = new Map();

  contours: ContourSet | null = null;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.baseNoise = new Noise2D(this.seed);
    this.detailNoise = new Noise2D((this.seed ^ 0x9e3779b9) >>> 0);
    this.forestNoise = new Noise2D((this.seed ^ 0x51ed2701) >>> 0);
    this.generate();
  }

  // ── height ─────────────────────────────────────────────────

  heightAt(x: number, y: number): number {
    let h = this.baseNoise.fbm(x / 1500, y / 1500, 5) * 26 - 6;
    h += this.detailNoise.fbm(x / 380, y / 380, 3) * 5 - 1.5;

    // hand-composed relief: Hill 214 (east-centre)
    h += this.gauss(x, y, 2950, 1180, 620, 58);
    // west ridge
    h += this.gauss(x, y, 620, 900, 700, 30);
    // southern rise near player entry
    h += this.gauss(x, y, 1750, 2750, 520, 16);
    // north-east plateau toward HQ
    const nx = clamp(x / this.W, 0, 1);
    const ny = 1 - clamp(y / this.H, 0, 1);
    h += smooth01(nx * 0.7 + ny * 0.7) * 22;

    // river valley carve
    const dRiver = this.distToPolyline(x, y, this.river);
    if (dRiver < 130) {
      const t = 1 - dRiver / 130;
      h -= smooth01(t) * 9;
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

  // ── water ──────────────────────────────────────────────────

  riverWidth = 30;

  isWater(x: number, y: number): boolean {
    return this.distToPolyline(x, y, this.river) < this.riverWidth * 0.5;
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

  forestDensity(x: number, y: number): number {
    const n = this.forestNoise.fbm(x / 520, y / 520, 4);
    // bias: more forest in NW quadrant and along river valley slopes
    const bias = 0.52 - 0.08 * (x / this.W) + 0.06 * (y / this.H);
    return clamp(n - bias, 0, 1) * 1.6;
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
    // organic wobble
    for (let i = 1; i < this.river.length - 1; i++) {
      const p = this.river[i];
      const a = rng.range(0, Math.PI * 2);
      p.x += Math.cos(a) * rng.range(20, 70);
      p.y += Math.sin(a) * rng.range(20, 70);
    }

    // roads
    const mainRoad: Vec2[] = [
      { x: 1560, y: 3120 },
      { x: 1640, y: 2650 },
      { x: 1900, y: 2230 },
      { x: 2190, y: 1850 }, // village / bridge
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
      { x: 2190, y: 1850 }, // village crossroads
      { x: 2800, y: 1720 },
      { x: 3380, y: 1520 },
      { x: 4140, y: 1410 },
    ];
    // northern flank track (second axis)
    const northTrack: Vec2[] = [
      { x: 640, y: 2560 },
      { x: 980, y: 2160 },
      { x: 1150, y: 1720 },
      { x: 1240, y: 1400 }, // north bridge
      { x: 1500, y: 1120 },
      { x: 1950, y: 930 },
      { x: 2450, y: 850 },
      { x: 2900, y: 900 },
    ];
    for (const pts of [mainRoad, ewRoad, northTrack]) {
      for (let i = 1; i < pts.length - 1; i++) {
        pts[i].x += rng.range(-36, 36);
        pts[i].y += rng.range(-36, 36);
      }
    }
    this.roads = [
      { pts: mainRoad, major: true },
      { pts: ewRoad, major: true },
      { pts: northTrack, major: false },
    ];

    // bridges where roads cross the river
    this.bridges = [];
    const addBridge = (rx: number, ry: number) => {
      // angle perpendicular to river direction at that point
      const dir = this.polylineDirAt(rx, ry, this.river);
      this.bridges.push({
        x: rx,
        y: ry,
        angle: dir + Math.PI / 2,
        len: this.riverWidth + 46,
        w: 22,
      });
    };
    addBridge(2168, 1760); // main road bridge at village
    addBridge(1240, 1400); // northern track bridge

    // village at crossroads
    this.buildVillage(2190, 1850, rng);

    // enemy HQ compound NE
    this.buildHQ(3440, 640, rng);

    // scattered farm buildings
    const farms = [
      [900, 1400],
      [1450, 2450],
      [2750, 1450],
      [3200, 1950],
      [1750, 900],
    ];
    for (const [fx, fy] of farms) {
      this.buildVillage(fx + rng.range(-30, 30), fy + rng.range(-30, 30), rng, 2);
    }

    // trees
    this.trees = [];
    const step = 30;
    for (let y = step; y < this.H; y += step) {
      for (let x = step; x < this.W; x += step) {
        const jx = x + rng.range(-12, 12);
        const jy = y + rng.range(-12, 12);
        if (this.forestDensity(jx, jy) < 0.42) continue;
        if (this.isWater(jx, jy) || this.bridgeAt(jx, jy, 70)) continue;
        if (this.distToPolyline(jx, jy, this.river) < this.riverWidth * 0.5 + 34) continue;
        if (this.roadFactor(jx, jy) > 0.08) continue;
        if (this.slopeAt(jx, jy) > 0.16) continue;
        if (this.buildingAt(jx, jy, 34)) continue;
        this.trees.push({ x: jx, y: jy, r: rng.range(6.5, 12.5), seed: rng.next() });
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

    // agricultural parcels — patchwork of fields on the flatter ground
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

    // labels
    this.labels = [
      { x: 2950, y: 1180, text: 'HILL 214', size: 30, bold: true },
      { x: 2190, y: 1790, text: 'NOVY MOST', size: 24 },
      { x: 3440, y: 940, text: 'OBJ KRAKEN', size: 22, bold: true },
      { x: 2190, y: 1930, text: 'OBJ ECHO', size: 20, bold: true },
      { x: 2950, y: 1300, text: 'OBJ FOXTROT', size: 20, bold: true },
      { x: 1000, y: 800, text: 'ZAPAD FOREST', size: 22 },
      { x: 3400, y: 2400, text: 'VYSOKA POLJANA', size: 20 },
    ];
    this.hillPeak = { x: 2950, y: 1180 };
    this.hillHeight = this.heightAt(2950, 1180);

    // pathfinding grid
    this.buildCostGrid();

    // contour extraction
    this.contours = this.extractContours();
  }

  private buildVillage(cx: number, cy: number, rng: RNG, count = 7) {
    const spots: [number, number][] = [
      [-120, -110], [95, -130], [-160, 60], [140, 85], [-40, 170], [40, -190], [-210, -30], [180, -20],
    ];
    const kinds: BuildingKind[] = ['HOUSE', 'BARN', 'HOUSE', 'SHED', 'HOUSE', 'BARN', 'HOUSE', 'SHED'];
    for (let i = 0; i < count; i++) {
      const s = spots[i % spots.length];
      const bx = cx + s[0] + rng.range(-18, 18);
      const by = cy + s[1] + rng.range(-18, 18);
      if (this.isWater(bx, by) || this.roadFactor(bx, by) > 0.1) continue;
      const kind = kinds[i % kinds.length];
      const w = kind === 'BARN' ? rng.range(26, 34) : rng.range(15, 22);
      const h = kind === 'BARN' ? rng.range(14, 18) : rng.range(11, 15);
      this.buildings.push({ x: bx, y: by, w, h, rot: rng.range(-0.25, 0.25) + (rng.chance(0.5) ? 0 : Math.PI / 2), kind });
    }
  }

  private buildHQ(cx: number, cy: number, rng: RNG) {
    // compound: core bunker + support structures + mast, arranged deliberately
    this.buildings.push({ x: cx, y: cy, w: 34, h: 26, rot: 0.18, kind: 'HQ_CORE' });
    this.buildings.push({ x: cx - 66, y: cy + 42, w: 20, h: 14, rot: -0.1, kind: 'HQ_SUPPORT' });
    this.buildings.push({ x: cx + 62, y: cy - 48, w: 18, h: 13, rot: 0.3, kind: 'HQ_SUPPORT' });
    this.buildings.push({ x: cx + 74, y: cy + 40, w: 15, h: 11, rot: -0.25, kind: 'SHED' });
    this.buildings.push({ x: cx - 48, y: cy - 62, w: 7, h: 7, rot: 0, kind: 'MAST' });
    // small perimeter bunkers
    this.buildings.push({ x: cx - 120, y: cy + 110, w: 12, h: 9, rot: 0.6, kind: 'BUNKER' });
    this.buildings.push({ x: cx + 130, y: cy + 96, w: 12, h: 9, rot: -0.5, kind: 'BUNKER' });
    this.buildings.push({ x: cx + 8, y: cy + 150, w: 12, h: 9, rot: 0.05, kind: 'BUNKER' });
  }

  buildingAt(x: number, y: number, pad = 0): Building | null {
    for (const b of this.buildings) {
      if (dist(x, y, b.x, b.y) < Math.max(b.w, b.h) * 0.75 + pad) return b;
    }
    return null;
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
        if (this.isWater(cx, cy) && !this.bridgeAt(cx, cy, CELL * 0.9)) {
          c = -1; // impassable
        } else {
          c = 1;
          c += this.slopeAt(cx, cy) * 14;
          const f = this.forestDensity(cx, cy);
          if (f > 0.42) c += 2.4;
          const r = this.roadFactor(cx, cy);
          if (r > 0.05) c = Math.min(c, r > 0.5 ? 0.34 : 0.6);
          if (this.buildingAt(cx, cy, 10)) c += 5;
          if (this.bridgeAt(cx, cy, CELL * 0.9)) c = 0.5;
        }
        this.cost[gy * this.gw + gx] = c;
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
      if (this.isWater(x, y) && !this.bridgeAt(x, y, 30)) return false;
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
