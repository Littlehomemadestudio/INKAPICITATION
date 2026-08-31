// ─────────────────────────────────────────────────────────────
// PAPER STORM · the sea
// A hand-authored southern ocean: coast, beaches, cliffs, a
// working harbour, islands, channels. Water mask + signed shore
// distance + naval A* with draft gating. The coast is drawn, not
// generated — every cove is where it is for a reason.
// ─────────────────────────────────────────────────────────────

import { RNG, clamp, dist, Vec2 } from '../core/math';
import { Noise2D } from '../core/noise';

export type CoastType = 'BEACH' | 'CLIFF' | 'HARBOUR' | 'MARSH';

export interface CoastSeg {
  a: Vec2;
  b: Vec2;
  type: CoastType;
}

export interface Island {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  /** radial profile multipliers, 16 samples */
  profile: number[];
  name?: string;
  height: number;
}

export interface Pier {
  x: number;
  y: number;
  /** heading of the pier running seaward */
  angle: number;
  len: number;
  w: number;
}

export interface Buoy {
  x: number;
  y: number;
  kind: 'RED' | 'GREEN';
}

export interface HarbourInfo {
  name: string;
  pos: Vec2;
  piers: Pier[];
  /** breakwater centreline — stone armour against the swell */
  breakwater: Vec2[];
  buoys: Buoy[];
  warehouses: { x: number; y: number; w: number; h: number; rot: number }[];
  cranes: { x: number; y: number; rot: number }[];
  tanks: { x: number; y: number }[];
}

const MASK = 16; // water mask cell (m)
const NAV = 64; // navigation grid cell (m)

export class Sea {
  readonly W: number;
  readonly H: number;
  seed: number;

  /** authored coastline (NW → E), extended off-map at both ends */
  coast: CoastSeg[] = [];
  /** subdivided wobbled shoreline for rendering & point tests */
  shore: { x: number; y: number; type: CoastType }[] = [];
  /** the closed sea ring: shoreline + the off-map SE corner */
  private seaRing: { x: number; y: number }[] = [];
  islands: Island[] = [];
  harbour: HarbourInfo | null = null;

  // mask + distance fields
  mw = 0;
  mh = 0;
  water!: Uint8Array;
  /** signed distance to shore: + = out in the water, − = inland (m) */
  shoreDist!: Float32Array;
  /** land cells within the beach band */
  beachMask!: Uint8Array;
  /** land cells under cliff faces */
  cliffMask!: Uint8Array;

  // navigation grid
  nw = 0;
  nh = 0;
  /** shallowest shore clearance within the cell (m) */
  navShore!: Float32Array;
  /** static + dynamic blocks (piers, breakwater, wrecks) */
  navBlock!: Uint8Array;

  private coastNoise: Noise2D;

  /** sea's rough world bounds — the renderer culls with this */
  bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(seed: number, W: number, H: number) {
    this.seed = seed >>> 0;
    this.W = W;
    this.H = H;
    this.coastNoise = new Noise2D((this.seed ^ 0x5ea) >>> 0);
    this.authorCoast();
    this.authorIslands();
    this.authorHarbour();
    this.buildMask();
    this.buildNav();
  }

  // ── authoring ──────────────────────────────────────────────

  private authorCoast() {
    // The southern shore of the theatre. The ocean owns everything south
    // of this line, and AZURE BAY is the great northward dent in its
    // middle — the river SEVERNAYA meets the sea at the bay's head, where
    // NOVY GOROD stands. The west reach is low beach and marsh; the
    // headland east of the port is cliff; the harbour cove between them
    // is worked ground.
    const pts: Vec2[] = [
      { x: -80, y: 5050 },
      { x: 700, y: 5200 },
      { x: 1700, y: 5350 },
      { x: 2600, y: 5450 },
      { x: 3300, y: 5000 }, // bay west shore
      { x: 3750, y: 4480 }, // bay NW shore — beach
      { x: 4150, y: 4180 }, // estuary — the city stands here
      { x: 4650, y: 4220 }, // PORT AZURE cove
      { x: 5250, y: 4480 }, // harbour east
      { x: 5700, y: 4350 }, // headland west face
      { x: 6050, y: 4180 }, // headland tip — the coastal SAM site
      { x: 6350, y: 4480 }, // headland east face
      { x: 7300, y: 4620 },
      { x: this.W + 80, y: 4480 },
    ];
    const types: CoastType[] = [
      'MARSH', // reeds at the west edge
      'BEACH',
      'BEACH',
      'BEACH',
      'BEACH', // bay west shore
      'BEACH',
      'HARBOUR', // the estuary city waterfront
      'HARBOUR', // PORT AZURE itself
      'HARBOUR',
      'CLIFF', // headland rock
      'CLIFF',
      'CLIFF',
      'BEACH',
      'BEACH',
    ];
    this.coast = [];
    for (let i = 0; i < pts.length - 1; i++) {
      this.coast.push({ a: pts[i], b: pts[i + 1], type: types[i] });
    }
    // subdivide with a gentle wobble — the coast breathes
    this.shore = [];
    for (const seg of this.coast) {
      const len = dist(seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      const steps = Math.max(2, Math.ceil(len / 34));
      const dx = (seg.b.x - seg.a.x) / steps;
      const dy = (seg.b.y - seg.a.y) / steps;
      const nx = -dy / (len || 1);
      const ny = dx / (len || 1);
      for (let s = 0; s < steps; s++) {
        const px = seg.a.x + dx * s;
        const py = seg.a.y + dy * s;
        const wob =
          this.coastNoise.fbm(px / 420, py / 420, 3) * 2 - 0.9; // ≈ −0.9..+1.1
        const amp = seg.type === 'CLIFF' ? 13 : 22;
        this.shore.push({
          x: px + nx * wob * amp,
          y: py + ny * wob * amp,
          type: seg.type,
        });
      }
    }
    // close the ring through the southern off-map margin so the whole
    // ocean south of the coast — bay, islands and all — is honest water
    this.seaRing = this.shore.map((p) => ({ x: p.x, y: p.y }));
    const last = this.coast[this.coast.length - 1].b;
    this.seaRing.push({ x: last.x, y: this.H + 120 });
    this.seaRing.push({ x: -80, y: this.H + 120 });
    // renderer cull bounds — the sea's own envelope
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of this.shore) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    this.bounds = { x0, y0, x1, y1: this.H };
  }

  private authorIslands() {
    const mkProfile = (seed: number): number[] => {
      const r = new RNG(seed >>> 0);
      const p: number[] = [];
      for (let i = 0; i < 16; i++) p.push(0.82 + r.next() * 0.36);
      return p;
    };
    // OSTROV VOLNY — the big island of the eastern sea. It splits the
    // approaches: the fleet anchorage shelters behind it, and both
    // channels admit a deep-draft hull.
    this.islands.push({
      x: 6900, y: 5350, rx: 300, ry: 200, rot: 0.35,
      profile: mkProfile(this.seed ^ 0xB01),
      name: 'OSTROV VOLNY',
      height: 16,
    });
    // KAMEN ISLET — guards the bay mouth
    this.islands.push({
      x: 5600, y: 5450, rx: 80, ry: 60, rot: -0.3,
      profile: mkProfile(this.seed ^ 0x151),
      name: 'KAMEN ISLET',
      height: 9,
    });
    // the shoal islet off the west bay mouth
    this.islands.push({
      x: 3300, y: 5800, rx: 55, ry: 40, rot: 0.2,
      profile: mkProfile(this.seed ^ 0x50A1),
      name: '',
      height: 6,
    });
  }

  private authorHarbour() {
    // PORT AZURE — a working naval harbour in the cove east of the river
    // run seaward (≈SE), warehouses stand on the shore, a stone
    // breakwater shelters the anchorage from the east swell.
    const piers: Pier[] = [
      { x: 4600, y: 4320, angle: 1.95, len: 128, w: 14 },
      { x: 4790, y: 4340, angle: 1.75, len: 152, w: 16 },
      { x: 4980, y: 4370, angle: 1.55, len: 118, w: 14 },
    ];
    const breakwater: Vec2[] = [
      { x: 5150, y: 4740 },
      { x: 5300, y: 4970 },
      { x: 5520, y: 5130 },
    ];
    const buoys: Buoy[] = [
      { x: 5700, y: 4850, kind: 'GREEN' },
      { x: 5850, y: 5150, kind: 'RED' },
      { x: 5350, y: 4550, kind: 'GREEN' },
      { x: 4300, y: 5000, kind: 'RED' }, // west bay mouth marker
    ];
    const warehouses = [
      { x: 4620, y: 4240, w: 34, h: 18, rot: 0.08 },
      { x: 4720, y: 4230, w: 28, h: 16, rot: -0.12 },
      { x: 4840, y: 4250, w: 36, h: 17, rot: 0.04 },
      { x: 4960, y: 4270, w: 30, h: 16, rot: -0.08 },
    ];
    const cranes = [
      { x: 4600, y: 4320 + 84, rot: 1.95 }, // pier head gantries
      { x: 4980, y: 4370 + 76, rot: 1.55 },
    ];
    const tanks = [
      { x: 5080, y: 4320 },
      { x: 5110, y: 4345 },
      { x: 5050, y: 4365 },
    ];
    this.harbour = { name: 'PORT AZURE', pos: { x: 4800, y: 4430 }, piers, breakwater, buoys, warehouses, cranes, tanks };
  }

  // ── geometry queries ───────────────────────────────────────

  /** island radius at world angle θ (local units) */
  private islandR(isl: Island, wx: number, wy: number): number {
    const c = Math.cos(-isl.rot);
    const s = Math.sin(-isl.rot);
    const dx = wx - isl.x;
    const dy = wy - isl.y;
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    const th = Math.atan2(ly, lx);
    const idx = ((Math.round((th / (Math.PI * 2)) * 16) % 16) + 16) % 16;
    const f = isl.profile[idx];
    const rr = (isl.rx * isl.ry) / Math.hypot(isl.ry * Math.cos(th), isl.rx * Math.sin(th));
    return rr * f;
  }

  islandAt(x: number, y: number): Island | null {
    for (const isl of this.islands) {
      const dx = x - isl.x;
      const dy = y - isl.y;
      if (dx * dx + dy * dy > (isl.rx + isl.ry) * (isl.rx + isl.ry)) continue;
      if (Math.hypot(dx, dy) < this.islandR(isl, x, y)) return isl;
    }
    return null;
  }

  /** point inside the authored sea polygon (wobbled coast)? */
  inSeaPolygon(x: number, y: number): boolean {
    // even-odd rule against the closed sea ring
    const ring = this.seaRing;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x;
      const yi = ring[i].y;
      const xj = ring[j].x;
      const yj = ring[j].y;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    if (!inside) return false;
    // carve the islands back out
    return !this.islandAt(x, y);
  }

  /** raw water test at mask resolution */
  isSea(x: number, y: number): boolean {
    const gx = (x / MASK) | 0;
    const gy = (y / MASK) | 0;
    if (gx < 0 || gy < 0 || gx >= this.mw || gy >= this.mh) return false;
    return this.water[gy * this.mw + gx] === 1;
  }

  /** signed shore distance in metres (+ water, − land), bilinear */
  shoreDistAt(x: number, y: number): number {
    const gx = clamp(x / MASK - 0.5, 0, this.mw - 1.001);
    const gy = clamp(y / MASK - 0.5, 0, this.mh - 1.001);
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const s = this.mw;
    const h00 = this.shoreDist[iy * s + ix];
    const h10 = this.shoreDist[iy * s + ix + 1];
    const h01 = this.shoreDist[(iy + 1) * s + ix];
    const h11 = this.shoreDist[(iy + 1) * s + ix + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  }

  /** nearest land point of an island or coast — used by ships hugging cover */
  nearestLand(x: number, y: number): Vec2 | null {
    let best: Vec2 | null = null;
    let bd = Infinity;
    for (const isl of this.islands) {
      const d = dist(x, y, isl.x, isl.y) - (isl.rx + isl.ry) * 0.5;
      if (d < bd) {
        bd = d;
        // project outward from island centre to the shoreline
        const a = Math.atan2(y - isl.y, x - isl.x);
        const r = this.islandR(isl, x, y);
        best = {
          x: isl.x + Math.cos(a) * r * (isl.rot ? 1 : 1),
          y: isl.y + Math.sin(a) * r,
        };
      }
    }
    for (const p of this.shore) {
      const d = dist(x, y, p.x, p.y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  // ── mask + distance field ──────────────────────────────────

  private buildMask() {
    this.mw = Math.ceil(this.W / MASK) + 1;
    this.mh = Math.ceil(this.H / MASK) + 1;
    const n = this.mw * this.mh;
    this.water = new Uint8Array(n);
    for (let gy = 0; gy < this.mh; gy++) {
      for (let gx = 0; gx < this.mw; gx++) {
        const x = gx * MASK;
        const y = gy * MASK;
        this.water[gy * this.mw + gx] = this.inSeaPolygon(x, y) ? 1 : 0;
      }
    }
    // signed shore distance via two chamfer passes (≈3-4% error, plenty)
    const INF = 1e9;
    this.shoreDist = new Float32Array(n).fill(INF);
    // distToLand: evaluated at water cells — seeds sit on LAND
    const distToLand = new Float32Array(n).fill(INF);
    const distToWater = new Float32Array(n).fill(INF);
    for (let i = 0; i < n; i++) {
      if (!this.water[i]) distToLand[i] = 0;
      else distToWater[i] = 0;
    }
    const chamfer = (field: Float32Array) => {
      const D1 = MASK;
      const D2 = MASK * 1.4142;
      for (let gy = 0; gy < this.mh; gy++) {
        for (let gx = 0; gx < this.mw; gx++) {
          const i = gy * this.mw + gx;
          let v = field[i];
          if (gx > 0) v = Math.min(v, field[i - 1] + D1);
          if (gy > 0) v = Math.min(v, field[i - this.mw] + D1);
          if (gx > 0 && gy > 0) v = Math.min(v, field[i - this.mw - 1] + D2);
          if (gx < this.mw - 1 && gy > 0) v = Math.min(v, field[i - this.mw + 1] + D2);
          field[i] = v;
        }
      }
      for (let gy = this.mh - 1; gy >= 0; gy--) {
        for (let gx = this.mw - 1; gx >= 0; gx--) {
          const i = gy * this.mw + gx;
          let v = field[i];
          if (gx < this.mw - 1) v = Math.min(v, field[i + 1] + D1);
          if (gy < this.mh - 1) v = Math.min(v, field[i + this.mw] + D1);
          if (gx < this.mw - 1 && gy < this.mh - 1) v = Math.min(v, field[i + this.mw + 1] + D2);
          if (gx > 0 && gy < this.mh - 1) v = Math.min(v, field[i + this.mw - 1] + D2);
          field[i] = v;
        }
      }
    };
    chamfer(distToLand);
    chamfer(distToWater);
    for (let i = 0; i < n; i++) {
      this.shoreDist[i] = this.water[i] ? distToLand[i] : -distToWater[i];
    }

    // classify the land band: sand or rock — the coast's own texture
    this.beachMask = new Uint8Array(n);
    this.cliffMask = new Uint8Array(n);
    for (let gy = 0; gy < this.mh; gy++) {
      for (let gx = 0; gx < this.mw; gx++) {
        const i = gy * this.mw + gx;
        if (this.water[i]) continue;
        const sd = this.shoreDist[i];
        if (sd < -40) continue; // too far inland to be coast
        const x = gx * MASK;
        const y = gy * MASK;
        // nearest shoreline point decides the character
        let best = Infinity;
        let type: CoastType = 'BEACH';
        for (const p of this.shore) {
          const d = dist(x, y, p.x, p.y);
          if (d < best) {
            best = d;
            type = p.type;
          }
        }
        if (best > 52) continue;
        if (type === 'BEACH' || type === 'MARSH') this.beachMask[i] = 1;
        else if (type === 'CLIFF') this.cliffMask[i] = 1;
        // harbour ground is worked — neither beach nor cliff
      }
    }
  }

  private buildNav() {
    this.nw = Math.ceil(this.W / NAV);
    this.nh = Math.ceil(this.H / NAV);
    const n = this.nw * this.nh;
    this.navShore = new Float32Array(n);
    this.navBlock = new Uint8Array(n);
    for (let gy = 0; gy < this.nh; gy++) {
      for (let gx = 0; gx < this.nw; gx++) {
        // shallowest clearance among the four quadrant samples — a
        // cell is only as deep as its worst corner
        let mn = Infinity;
        for (const [ox, oy] of [[16, 16], [48, 16], [16, 48], [48, 48]] as const) {
          const d = this.shoreDistAt(gx * NAV + ox, gy * NAV + oy);
          if (d < mn) mn = d;
        }
        this.navShore[gy * this.nw + gx] = mn;
      }
    }
    // the harbour is worked water — piers and the breakwater stand
    // in it and no hull passes through stone
    if (this.harbour) {
      for (const p of this.harbour.piers) {
        this.stampNavBlockLine(
          p.x,
          p.y,
          p.x + Math.cos(p.angle) * p.len,
          p.y + Math.sin(p.angle) * p.len,
          p.w * 0.7 + 10
        );
      }
      const bw = this.harbour.breakwater;
      for (let i = 0; i < bw.length - 1; i++) {
        this.stampNavBlockLine(bw[i].x, bw[i].y, bw[i + 1].x, bw[i + 1].y, 26);
      }
    }
  }

  /** block navigation cells along a line (piers, breakwaters, wrecks) */
  stampNavBlockLine(x0: number, y0: number, x1: number, y1: number, r: number) {
    const steps = Math.ceil(dist(x0, y0, x1, y1) / (NAV * 0.5)) + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const c0x = Math.max(0, ((x - r) / NAV) | 0);
      const c1x = Math.min(this.nw - 1, ((x + r) / NAV) | 0);
      const c0y = Math.max(0, ((y - r) / NAV) | 0);
      const c1y = Math.min(this.nh - 1, ((y + r) / NAV) | 0);
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          const px = cx * NAV + NAV / 2;
          const py = cy * NAV + NAV / 2;
          if (dist(px, py, x, y) < r + NAV * 0.3) {
            this.navBlock[cy * this.nw + cx] = 1;
          }
        }
      }
    }
  }

  /** a sunk hull becomes a hazard to navigation — but a shallow
   *  wreck is a buoyed danger, not a wall: small craft keep clear,
   *  and the block stays tight so channels do not seal shut */
  addNavalWreck(x: number, y: number, r: number) {
    this.stampNavBlockLine(x, y, x, y, Math.max(8, r * 0.55));
  }

  // ── naval pathfinding ──────────────────────────────────────

  private navPassable(i: number, draft: number): boolean {
    if (this.navBlock[i]) return false;
    return this.navShore[i] >= draft;
  }

  nearestNavalPassable(gx: number, gy: number, draft: number): [number, number] | null {
    for (let r = 0; r < 14; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= this.nw || ny >= this.nh) continue;
          if (this.navPassable(ny * this.nw + nx, draft)) return [nx, ny];
        }
      }
    }
    return null;
  }

  /** sea route honouring the hull's draft — A* on the nav grid */
  findSeaPath(from: Vec2, to: Vec2, draft: number): Vec2[] {
    const sgx = clamp(Math.floor(from.x / NAV), 0, this.nw - 1);
    const sgy = clamp(Math.floor(from.y / NAV), 0, this.nh - 1);
    let tgx = clamp(Math.floor(to.x / NAV), 0, this.nw - 1);
    let tgy = clamp(Math.floor(to.y / NAV), 0, this.nh - 1);
    if (!this.navPassable(tgy * this.nw + tgx, draft)) {
      const alt = this.nearestNavalPassable(tgx, tgy, draft);
      if (!alt) return [];
      tgx = alt[0];
      tgy = alt[1];
    }
    if (sgx === tgx && sgy === tgy) {
      return [{ x: tgx * NAV + NAV / 2, y: tgy * NAV + NAV / 2 }];
    }

    const n = this.nw * this.nh;
    const gScore = new Float32Array(n).fill(Infinity);
    const cameFrom = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open: number[] = [];
    const fScore = new Float32Array(n).fill(Infinity);
    const h = (x: number, y: number) => (Math.abs(x - tgx) + Math.abs(y - tgy)) * 0.9;
    const start = sgy * this.nw + sgx;
    gScore[start] = 0;
    fScore[start] = h(sgx, sgy);
    open.push(start);
    let guard = 0;
    while (open.length && guard++ < 6000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore[open[i]] < fScore[open[bi]]) bi = i;
      }
      const cur = open.splice(bi, 1)[0];
      if (cur === tgy * this.nw + tgx) break;
      closed[cur] = 1;
      const cx = cur % this.nw;
      const cy = (cur / this.nw) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.nw || ny >= this.nh) continue;
          const ni = ny * this.nw + nx;
          if (closed[ni] || !this.navPassable(ni, draft)) continue;
          // shallow water is legal but unwelcome — keels prefer depth
          let step = (dx && dy ? 1.414 : 1);
          if (this.navShore[ni] < draft + 26) step *= 1.6;
          if (this.navShore[ni] < draft + 10) step *= 1.9;
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

    const end = tgy * this.nw + tgx;
    if (cameFrom[end] === -1 && end !== start) return [];
    const cells: number[] = [];
    let c = end;
    while (c !== -1 && c !== start) {
      cells.push(c);
      c = cameFrom[c];
    }
    cells.push(start);
    cells.reverse();
    let pts: Vec2[] = cells.map((ci) => ({
      x: (ci % this.nw) * NAV + NAV / 2,
      y: ((ci / this.nw) | 0) * NAV + NAV / 2,
    }));
    pts = this.pullSeaPath(pts, draft);
    return pts;
  }

  /** string-pull the cell route into a sailing line */
  private pullSeaPath(pts: Vec2[], draft: number): Vec2[] {
    if (pts.length < 3) return pts;
    const out: Vec2[] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) {
        if (this.seaClear(pts[i], pts[j], draft)) break;
      }
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  /** is the straight water line navigable for this draft? */
  seaClear(a: Vec2, b: Vec2, draft: number): boolean {
    const d = dist(a.x, a.y, b.x, b.y);
    const steps = Math.max(2, Math.ceil(d / (NAV * 0.7)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const gx = clamp((x / NAV) | 0, 0, this.nw - 1);
      const gy = clamp((y / NAV) | 0, 0, this.nh - 1);
      if (!this.navPassable(gy * this.nw + gx, draft)) return false;
    }
    return true;
  }

  /** where the fleet reinforcement stream arrives from open water */
  entry = { x: 8000, y: 5900 };
  /** friendly fleet anchorage in the eastern bay */
  anchorage = { x: 7050, y: 5650 };
}
