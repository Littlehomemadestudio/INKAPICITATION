// ─────────────────────────────────────────────────────────────
// PAPER STORM · physical obstacles
// The battlefield is matter, not a picture. Trees have trunks,
// walls have stones, buildings have structure — vehicles push
// against them, weapons break them, and broken things change
// how the next fight is fought.
// ─────────────────────────────────────────────────────────────

import type { SimContext } from '../entities/units';
import type { Terrain, TreePoint, StoneWall, Building, Barrier } from '../world/terrain';
import { clamp, dist, angleOf } from '../core/math';

const CELL = 64; // spatial hash cell (m)

export type ObstacleKind = 'TREE' | 'ROCK' | 'WALL' | 'BUILDING' | 'BARRIER' | 'WRECK';

interface Obstacle {
  kind: ObstacleKind;
  x: number;
  y: number;
  /** collision radius for circles; for rects the enclosing circle */
  r: number;
  /** rotated-rect half extents (walls, buildings); 0 for circles */
  hw: number;
  hh: number;
  rot: number;
  hp: number;
  hpMax: number;
  alive: boolean;
  /** heavy tracked vehicles can force their way through */
  crushable: boolean;
  /** back-references into terrain data */
  tree?: TreePoint;
  wall?: StoneWall;
  segIndex?: number;
  building?: Building;
  barrier?: Barrier;
  /** cosmetic only — drawn as the fall direction */
  seed: number;
}

export interface CollisionResult {
  /** 0..1 speed multiplier applied on hard contact this step */
  slow: number;
  crushed: boolean;
}

export class ObstacleSystem {
  private grid = new Map<number, Obstacle[]>();
  private terrain: Terrain;
  /** trees felled since load — capped bookkeeping for audio sanity */
  crushCount = 0;

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    this.build();
  }

  private key(cx: number, cy: number): number {
    return cx * 100000 + cy;
  }

  private insert(o: Obstacle) {
    const reach = o.hw > 0 ? Math.hypot(o.hw, o.hh) : o.r;
    const c0x = Math.floor((o.x - reach) / CELL);
    const c1x = Math.floor((o.x + reach) / CELL);
    const c0y = Math.floor((o.y - reach) / CELL);
    const c1y = Math.floor((o.y + reach) / CELL);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const k = this.key(cx, cy);
        let arr = this.grid.get(k);
        if (!arr) {
          arr = [];
          this.grid.set(k, arr);
        }
        arr.push(o);
      }
    }
  }

  private build() {
    const t = this.terrain;
    // trees — trunks are narrow but real
    for (const tr of t.trees) {
      this.insert({
        kind: 'TREE', x: tr.x, y: tr.y, r: 2.1, hw: 0, hh: 0, rot: 0,
        hp: 30, hpMax: 30, alive: true, crushable: true, tree: tr, seed: tr.seed,
      });
    }
    // rocks — the honest geometry of the ground
    for (const rk of t.rocks) {
      this.insert({
        kind: 'ROCK', x: rk.x, y: rk.y, r: rk.r * 0.92, hw: 0, hh: 0, rot: 0,
        hp: -1, hpMax: -1, alive: true, crushable: false, seed: rk.seed,
      });
    }
    // stone walls — segment by segment, stone by stone
    for (const w of t.walls) {
      const n = Math.max(3, Math.round(w.len / 16));
      const segLen = w.len / n;
      for (let i = 0; i < n; i++) {
        if (!w.segs || !w.segs[i]) continue;
        const lx = -w.len / 2 + segLen * (i + 0.5);
        this.insert({
          kind: 'WALL',
          x: w.x + Math.cos(w.rot) * lx,
          y: w.y + Math.sin(w.rot) * lx,
          r: Math.hypot(segLen / 2, 1.7),
          hw: segLen / 2, hh: 1.7, rot: w.rot,
          hp: w.segs[i].hp, hpMax: w.segs[i].hp,
          alive: w.segs[i].hp > 0, crushable: true,
          wall: w, segIndex: i, seed: (w.x * 7 + i) % 1,
        });
      }
    }
    // dragon's teeth — concrete, immovable, but breakable by fire
    for (const b of t.barriers) {
      const bhp = b.hp ?? 100;
      this.insert({
        kind: 'BARRIER', x: b.x, y: b.y, r: 3.0, hw: 0, hh: 0, rot: b.rot,
        hp: bhp, hpMax: bhp, alive: bhp > 0, crushable: false, barrier: b, seed: b.rot,
      });
    }
    // buildings — mass that shelters and dies
    for (const b of t.buildings) {
      const bhp = b.hp ?? 150;
      this.insert({
        kind: 'BUILDING', x: b.x, y: b.y, r: Math.hypot(b.w, b.h) * 0.5,
        hw: b.w / 2, hh: b.h / 2, rot: b.rot,
        hp: bhp, hpMax: b.hpMax ?? bhp, alive: bhp > 0, crushable: false, building: b, seed: b.rot,
      });
    }
  }

  // ── queries ────────────────────────────────────────────────

  private near(x: number, y: number, r: number): Obstacle[] {
    const out: Obstacle[] = [];
    const c0x = Math.floor((x - r) / CELL);
    const c1x = Math.floor((x + r) / CELL);
    const c0y = Math.floor((y - r) / CELL);
    const c1y = Math.floor((y + r) / CELL);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const arr = this.grid.get(this.key(cx, cy));
        if (arr) {
          for (const o of arr) if (!out.includes(o)) out.push(o);
        }
      }
    }
    return out;
  }

  /** distance from point to obstacle surface (negative = inside) */
  private obstacleDist(o: Obstacle, x: number, y: number): { d: number; nx: number; ny: number } {
    if (o.hw > 0) {
      // rotated rect
      const dx = x - o.x;
      const dy = y - o.y;
      const c = Math.cos(-o.rot);
      const s = Math.sin(-o.rot);
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      const qx = clamp(lx, -o.hw, o.hw);
      const qy = clamp(ly, -o.hh, o.hh);
      const nlx = lx - qx;
      const nly = ly - qy;
      const len = Math.hypot(nlx, nly);
      const wc = Math.cos(o.rot);
      const ws = Math.sin(o.rot);
      if (len > 1e-4) {
        return { d: len, nx: (nlx / len) * wc - (nly / len) * ws, ny: (nlx / len) * ws + (nly / len) * wc };
      }
      // point is inside the rect — escape along the shallowest face
      const px = o.hw - Math.abs(lx);
      const py = o.hh - Math.abs(ly);
      let elx: number;
      let ely: number;
      let depth: number;
      if (px < py) {
        elx = Math.sign(lx) || 1;
        ely = 0;
        depth = px;
      } else {
        elx = 0;
        ely = Math.sign(ly) || 1;
        depth = py;
      }
      return { d: -depth, nx: elx * wc - ely * ws, ny: elx * ws + ely * wc };
    }
    const dx = x - o.x;
    const dy = y - o.y;
    const d = Math.hypot(dx, dy) || 1e-4;
    return { d: d - o.r, nx: dx / d, ny: dy / d };
  }

  // ── movement collision ─────────────────────────────────────

  /**
   * Resolve a vehicle against the physical world. Heavy tracked
   * vehicles push through trees and dry-stone walls — visibly,
   * destructively. Everything else is solid.
   */
  resolve(u: { x: number; y: number; angle: number; speedNow: number; def: { kind: string; length: number; width: number } }, dt: number, ctx: SimContext): CollisionResult {
    const res: CollisionResult = { slow: 1, crushed: false };
    const hullR = Math.max(u.def.width * 0.5, u.def.length * 0.34);
    const heavy = u.def.kind === 'MBT' || u.def.kind === 'IFV' || u.def.kind === 'SPG' || u.def.kind === 'SPAA';
    const obs = this.near(u.x, u.y, hullR + 26);
    for (const o of obs) {
      if (!o.alive) continue;
      const { d, nx, ny } = this.obstacleDist(o, u.x, u.y);
      const gap = hullR;
      if (d >= gap) continue;

      // tracked armour meets woodland — the tree loses
      if (o.kind === 'TREE' && heavy && u.speedNow > 2.2) {
        this.fellTree(o, u.angle, ctx, 'crush');
        res.crushed = true;
        res.slow = Math.min(res.slow, 0.86);
        continue;
      }
      // a tank can bull through a dry-stone wall — stone by stone
      if (o.kind === 'WALL' && heavy && u.speedNow > 3.5) {
        this.damageObstacle(o, 90 * Math.min(1, dt * 6), 'SHELL', ctx);
        res.slow = Math.min(res.slow, 0.8);
        continue;
      }
      // solid contact — push out along the surface normal
      const depth = gap - d;
      const push = Math.min(depth, 3.5) + 0.4;
      u.x += nx * push;
      u.y += ny * push;
      res.slow = Math.min(res.slow, 0.55);
      // bleed momentum against walls
      u.speedNow *= 0.9;
    }
    return res;
  }

  /** lookahead avoidance — steer around what cannot be driven through */
  avoidSteer(u: { x: number; y: number; angle: number; speedNow: number; def: { kind: string; length: number } }): number {
    if (u.speedNow < 1.5) return 0;
    const heavy = u.def.kind === 'MBT' || u.def.kind === 'IFV' || u.def.kind === 'SPG' || u.def.kind === 'SPAA';
    const look = 14 + u.speedNow * 1.6;
    const px = u.x + Math.cos(u.angle) * look;
    const py = u.y + Math.sin(u.angle) * look;
    const obs = this.near(px, py, 12);
    let steer = 0;
    for (const o of obs) {
      if (!o.alive) continue;
      if (o.kind === 'TREE') continue; // trunks are negotiated, not feared
      if (o.kind === 'WALL' && heavy) continue; // armour goes through
      const { d } = this.obstacleDist(o, px, py);
      if (d > 11) continue;
      // side of the obstacle relative to heading
      const cross = Math.sin(Math.atan2(o.y - u.y, o.x - u.x) - u.angle);
      steer -= Math.sign(cross) * (1 - clamp(d / 11, 0, 1));
    }
    return clamp(steer, -1, 1);
  }

  /** dynamic wreck — dead vehicles remain part of the terrain */
  addWreck(x: number, y: number, length: number) {
    this.insert({
      kind: 'WRECK', x, y, r: Math.max(3.4, length * 0.42), hw: 0, hh: 0, rot: 0,
      hp: -1, hpMax: -1, alive: true, crushable: false, seed: x % 1,
    });
  }

  // ── weapons vs the world ───────────────────────────────────

  /**
   * An explosion (or impact) tears at everything physical nearby.
   * radius/dmg are already scaled per projectile kind by the caller.
   */
  damageAt(ctx: SimContext, x: number, y: number, radius: number, dmg: number, kind: string) {
    if (dmg <= 0 || radius <= 0) return;
    const obs = this.near(x, y, radius + 30);
    for (const o of obs) {
      if (!o.alive) continue;
      const { d } = this.obstacleDist(o, x, y);
      if (d > radius) continue;
      const k = d <= 0 ? 1 : clamp(1 - d / radius, 0.12, 1);
      let scaled = dmg * k;
      if (o.kind === 'BARRIER') {
        // concrete shrugs off fragments — needs real explosive mass
        scaled *= kind === 'ARTY' || kind === 'MISSILE_AIR' ? 0.5 : 0.12;
      }
      if (o.kind === 'BUILDING') {
        // shells crack, HE demolishes
        scaled *= kind === 'ARTY' ? 1.0 : kind === 'MISSILE_AIR' ? 0.85 : kind === 'SHELL' ? 0.55 : 0.06;
      }
      if (o.kind === 'ROCK' || o.kind === 'WRECK') continue;
      this.damageObstacle(o, scaled, kind, ctx, x, y);
    }
  }

  private damageObstacle(o: Obstacle, dmg: number, kind: string, ctx: SimContext, ox = o.x, oy = o.y) {
    if (o.hp < 0 || !o.alive || dmg <= 0) return;
    o.hp -= dmg;
    switch (o.kind) {
      case 'TREE': {
        if (o.hp <= 0) {
          // timber falls away from the blast
          this.fellTree(o, angleOf(o.x - ox, o.y - oy), ctx, kind === 'AUTO' ? 'fell' : 'splinter');
        }
        break;
      }
      case 'WALL': {
        if (o.wall && o.segIndex !== undefined && o.wall.segs) o.wall.segs[o.segIndex].hp = Math.max(0, o.hp);
        if (o.hp <= 0) {
          o.alive = false;
          // stones scatter — a breach you can see and drive through
          ctx.effects.spawnExplosion(o.x, o.y, {
            dir: o.rot + Math.PI / 2, dirStrength: 0.9, scale: 0.5,
            debris: 4, stains: 6, sound: 'small', shake: 0.8,
          });
        }
        break;
      }
      case 'BARRIER': {
        if (o.barrier) o.barrier.hp = Math.max(0, o.hp);
        if (o.hp <= 0) {
          o.alive = false;
          ctx.effects.spawnExplosion(o.x, o.y, {
            dir: o.rot, dirStrength: 0.7, scale: 0.6,
            debris: 5, stains: 8, sound: 'small', shake: 1.2,
          });
        }
        break;
      }
      case 'BUILDING': {
        if (!o.building) break;
        o.building.hp = Math.max(0, o.hp);
        const frac = o.hp / o.hpMax;
        const newStage = o.hp <= 0 ? 3 : frac < 0.34 ? 2 : frac < 0.67 ? 1 : 0;
        if (newStage > (o.building.stage ?? 0)) {
          o.building.stage = newStage;
          if (newStage === 1) {
            // first scars — dust slides off the roof
            ctx.effects.spawnSmoke(o.x, o.y, { r: 3, r1: 16, life: 2.4, alpha: 0.28 });
          } else if (newStage === 2) {
            ctx.effects.spawnExplosion(o.x, o.y, {
              dir: o.rot, dirStrength: 0.5, scale: 1.4,
              smoke: 6, debris: 8, stains: 20, sound: 'shell', shake: 2.4,
            });
          } else if (newStage === 3) {
            this.collapseBuilding(o, ctx);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  /** a tree comes down — direction is the story */
  private fellTree(o: Obstacle, dir: number, ctx: SimContext, mode: 'crush' | 'fell' | 'splinter') {
    if (!o.tree || (o.tree.state ?? 0) !== 0) {
      o.alive = false;
      return;
    }
    o.tree.state = mode === 'splinter' ? 2 : 1;
    o.tree.fallDir = dir;
    o.alive = false;
    this.crushCount++;
    // the crack and whump of falling timber
    ctx.effects.spawnDust(o.x + Math.cos(dir) * o.tree.r * 0.6, o.y + Math.sin(dir) * o.tree.r * 0.6, Math.cos(dir) * 3, Math.sin(dir) * 3);
    if (mode !== 'crush') {
      ctx.effects.spawnExplosion(o.x, o.y, {
        dir, dirStrength: 0.85, scale: 0.3,
        debris: mode === 'splinter' ? 3 : 2, stains: 3, sound: 'small', shake: 0,
      });
    } else if (this.crushCount % 3 === 1) {
      ctx.audio.autocannon(o.x, o.y);
    }
  }

  /** structural collapse — the footprint becomes rubble and change */
  private collapseBuilding(o: Obstacle, ctx: SimContext) {
    o.alive = false;
    const b = o.building!;
    const fx = ctx.effects;
    const scale = clamp(Math.max(b.w, b.h) / 22, 0.8, 2.6);
    // the roof comes in
    fx.spawnExplosion(b.x, b.y, {
      dir: b.rot, dirStrength: 0.4, scale,
      crater: Math.max(4, scale * 4), smoke: 10, debris: 14,
      stains: 34, ring: true, sound: 'kill', shake: 3.6 + scale,
    });
    // rolling secondary collapses
    fx.scheduleBlasts(b.x, b.y, {
      count: Math.round(2 + scale * 2), duration: 2.8,
      spread: Math.max(b.w, b.h) * 0.5, scaleMin: 0.6, scaleMax: scale * 1.2, delay: 0.45,
    });
    fx.addRubble({
      x: b.x, y: b.y, w: b.w * 1.06, h: b.h * 1.06, rot: b.rot,
      seed: b.rot % 1, born: ctx.time, smokeUntil: ctx.time + 90,
    });
    // a solvent tank goes up — the works burn
    if (b.kind === 'STORAGE_TANK') {
      fx.scheduleBlasts(b.x, b.y, {
        count: 4, duration: 3.4, spread: 34, scaleMin: 1.2, scaleMax: 2.4, delay: 0.3,
      });
      fx.spawnSmoke(b.x, b.y, { r: 4, r1: 26, life: 7, alpha: 0.42, dark: 1.4, vy: -7 });
    }
    // the world changes: LOS opens, routes open, cover remains as rubble
    this.terrain.onBuildingDestroyed(b);
    ctx.log(`STRUCTURE DESTROYED · GRID ${Math.floor(clamp(b.x, 0, 9999) / 10)}-${Math.floor(clamp(b.y, 0, 9999) / 10)}`, 'alert');
  }

  /** world-edit helpers used by tests and future tooling */
  destroyWallSegment(w: StoneWall, i: number, ctx: SimContext) {
    const obs = this.findWallSegment(w, i);
    if (obs) this.damageObstacle(obs, 1e6, 'ARTY', ctx);
  }

  /** damage a building directly (tests, scripted events) */
  damageBuilding(b: Building, dmg: number, ctx: SimContext) {
    const obs = this.near(b.x, b.y, Math.max(b.w, b.h));
    for (const o of obs) {
      if (o.kind === 'BUILDING' && o.building === b) {
        this.damageObstacle(o, dmg, 'SHELL', ctx);
        return;
      }
    }
  }

  /** fell a tree directly (tests) */
  fellTreeAt(tr: TreePoint, dir: number, ctx: SimContext) {
    const obs = this.near(tr.x, tr.y, 8);
    for (const o of obs) {
      if (o.kind === 'TREE' && o.tree === tr) {
        this.damageObstacle(o, 1e6, 'SHELL', ctx);
        return;
      }
    }
    void dir;
  }

  private findWallSegment(w: StoneWall, i: number): Obstacle | null {
    const obs = this.near(w.x, w.y, w.len);
    for (const o of obs) {
      if (o.kind === 'WALL' && o.wall === w && o.segIndex === i) return o;
    }
    return null;
  }

  /** how solid is the ground clutter at a point? (0 = open, 1 = choked) */
  clutterAt(x: number, y: number, r: number): number {
    const obs = this.near(x, y, r);
    let n = 0;
    for (const o of obs) {
      if (!o.alive || o.kind === 'TREE') continue;
      if (dist(o.x, o.y, x, y) < r) n += o.kind === 'BUILDING' ? 3 : o.kind === 'WRECK' ? 2 : 1;
    }
    return clamp(n / 6, 0, 1);
  }
}
