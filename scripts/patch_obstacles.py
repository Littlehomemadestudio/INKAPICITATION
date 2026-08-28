#!/usr/bin/env python3
"""Replace the movement-collision section of obstacles.ts with exact OBB physics."""
import io

PATH = '/home/z/my-project/src/game/systems/obstacles.ts'
with io.open(PATH, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# lines[197] == '  // ── movement collision ...' (line 198, 1-indexed)
assert 'movement collision' in lines[197], lines[197]
# lines[260] == '  }' closing avoidSteer (line 261, 1-indexed)
assert lines[260].strip() == '}', lines[260]
assert 'dynamic wreck' in lines[262], lines[262]

NEW = '''  // ── exact geometry ─────────────────────────────────────

  /**
   * Exact MTV of an oriented box (the vehicle hull) against a
   * circle obstacle. Returns the world-space normal pointing
   * OUT of the box, and the penetration depth. null = clear.
   */
  private obbCircleMTV(
    hx: number, hy: number, ca: number, sa: number, hl: number, hw: number,
    cx: number, cy: number, cr: number,
  ): { nx: number; ny: number; depth: number } | null {
    const dx = cx - hx;
    const dy = cy - hy;
    const lx = dx * ca + dy * sa;
    const ly = -dx * sa + dy * ca;
    const qx = clamp(lx, -hl, hl);
    const qy = clamp(ly, -hw, hw);
    let nlx = lx - qx;
    let nly = ly - qy;
    const len = Math.hypot(nlx, nly);
    if (len > cr) return null;
    if (len > 1e-6) {
      nlx /= len;
      nly /= len;
      return { nx: nlx * ca - nly * sa, ny: nlx * sa + nly * ca, depth: cr - len };
    }
    // circle centre inside the box — escape through the shallowest face
    const px = hl - Math.abs(lx);
    const py = hw - Math.abs(ly);
    if (px < py) {
      const s = Math.sign(lx) || 1;
      return { nx: s * ca, ny: s * sa, depth: px + cr };
    }
    const s = Math.sign(ly) || 1;
    return { nx: -s * sa, ny: s * ca, depth: py + cr };
  }

  /**
   * Exact SAT test of two oriented boxes (vehicle hull vs wall /
   * building). Minimum translation vector pushes the FIRST box
   * out of the second. null = clear.
   */
  private obbObbMTV(
    ax: number, ay: number, aA: number, ahl: number, ahw: number,
    bx: number, by: number, bA: number, bhl: number, bhw: number,
  ): { nx: number; ny: number; depth: number } | null {
    const ca1 = Math.cos(aA);
    const sa1 = Math.sin(aA);
    const ca2 = Math.cos(bA);
    const sa2 = Math.sin(bA);
    const dx = bx - ax;
    const dy = by - ay;
    const axx = [ca1, -sa1, ca2, -sa2];
    const axy = [sa1, ca1, sa2, ca2];
    let best = Infinity;
    let bnx = 0;
    let bny = 0;
    for (let i = 0; i < 4; i++) {
      const ux = axx[i];
      const uy = axy[i];
      const dist = dx * ux + dy * uy;
      const rA = ahl * Math.abs(ca1 * ux + sa1 * uy) + ahw * Math.abs(-sa1 * ux + ca1 * uy);
      const rB = bhl * Math.abs(ca2 * ux + sa2 * uy) + bhw * Math.abs(-sa2 * ux + ca2 * uy);
      const overlap = rA + rB - Math.abs(dist);
      if (overlap <= 0) return null;
      if (overlap < best) {
        best = overlap;
        const s = dist >= 0 ? -1 : 1;
        bnx = ux * s;
        bny = uy * s;
      }
    }
    return { nx: bnx, ny: bny, depth: best };
  }

  /** does this obstacle stand tall enough to stop a flat round? */
  private blocksDirectFire(o: Obstacle): boolean {
    if (!o.alive) return false;
    if (o.kind === 'BUILDING') return (o.building?.stage ?? 0) < 3;
    if (o.kind === 'ROCK') return o.r >= 3.6;
    if (o.kind === 'WRECK') return true;
    return false;
  }

  /**
   * First solid mass intersected by a flight segment — shells and
   * missiles slam into buildings, big rocks and wrecks instead of
   * flying through them. Returns the impact point and the obstacle.
   */
  firstHit(x0: number, y0: number, x1: number, y1: number): { x: number; y: number; o: Obstacle } | null {
    const sx = x1 - x0;
    const sy = y1 - y0;
    const segLen = Math.hypot(sx, sy);
    if (segLen < 1e-4) return null;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const obs = this.near(mx, my, segLen / 2 + 34);
    let bestT = Infinity;
    let hit: { x: number; y: number; o: Obstacle } | null = null;
    for (const o of obs) {
      if (!this.blocksDirectFire(o)) continue;
      let t = Infinity;
      if (o.hw > 0) {
        // slab test in the box's local frame
        const ca = Math.cos(-o.rot);
        const sa = Math.sin(-o.rot);
        const ox0 = (x0 - o.x) * ca - (y0 - o.y) * sa;
        const oy0 = (x0 - o.x) * sa + (y0 - o.y) * ca;
        const ox1 = (x1 - o.x) * ca - (y1 - o.y) * sa;
        const oy1 = (x1 - o.x) * sa + (y1 - o.y) * ca;
        const dx = ox1 - ox0;
        const dy = oy1 - oy0;
        let tEnter = -Infinity;
        let tExit = Infinity;
        if (Math.abs(dx) < 1e-9) {
          if (Math.abs(ox0) > o.hw) continue;
        } else {
          let t0 = (-o.hw - ox0) / dx;
          let t1 = (o.hw - ox0) / dx;
          if (t0 > t1) [t0, t1] = [t1, t0];
          tEnter = Math.max(tEnter, t0);
          tExit = Math.min(tExit, t1);
        }
        if (Math.abs(dy) < 1e-9) {
          if (Math.abs(oy0) > o.hh) continue;
        } else {
          let t0 = (-o.hh - oy0) / dy;
          let t1 = (o.hh - oy0) / dy;
          if (t0 > t1) [t0, t1] = [t1, t0];
          tEnter = Math.max(tEnter, t0);
          tExit = Math.min(tExit, t1);
        }
        if (tEnter > tExit || tExit < 0 || tEnter > 1) continue;
        t = Math.max(tEnter, 0.001);
      } else {
        // circle: solve |P(t) - C| = r
        const ex = x0 - o.x;
        const ey = y0 - o.y;
        const a = sx * sx + sy * sy;
        const b = 2 * (ex * sx + ey * sy);
        const c = ex * ex + ey * ey - o.r * o.r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        const t0 = (-b - sq) / (2 * a);
        const t1 = (-b + sq) / (2 * a);
        if (t1 < 0 || t0 > 1) continue;
        t = Math.max(t0, 0.001);
      }
      if (t < bestT) {
        bestT = t;
        hit = { x: x0 + sx * t, y: y0 + sy * t, o };
      }
    }
    return hit;
  }

  // ── movement collision ─────────────────────────────────────

  /**
   * Resolve a vehicle against the physical world using its EXACT
   * hull — an oriented box, not a proxy circle. The nose stops
   * where the nose is; corners don't clip; glancing contact
   * slides. Heavy tracked vehicles push through trees and
   * dry-stone walls — visibly, destructively.
   */
  resolve(u: { x: number; y: number; angle: number; speedNow: number; def: { kind: string; length: number; width: number } }, dt: number, ctx: SimContext): CollisionResult {
    const res: CollisionResult = { slow: 1, crushed: false };
    const hl = u.def.length * 0.5;
    const hw = u.def.width * 0.5;
    const ca = Math.cos(u.angle);
    const sa = Math.sin(u.angle);
    const reach = Math.hypot(hl, hw);
    const heavy = u.def.kind === 'MBT' || u.def.kind === 'IFV' || u.def.kind === 'SPG' || u.def.kind === 'SPAA';
    const obs = this.near(u.x, u.y, reach + 30);
    for (const o of obs) {
      if (!o.alive) continue;

      // crush checks use the true bow position — timber falls when
      // the hull actually reaches it, not when the centre does
      const noseX = u.x + ca * hl;
      const noseY = u.y + sa * hl;
      const noseD = this.obstacleDist(o, noseX, noseY).d;
      if (noseD < 0) {
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
      }

      // exact hull test: OBB vs circle or OBB vs OBB
      let mtv: { nx: number; ny: number; depth: number } | null = null;
      if (o.hw > 0) {
        mtv = this.obbObbMTV(u.x, u.y, u.angle, hl, hw, o.x, o.y, o.rot, o.hw, o.hh);
      } else {
        mtv = this.obbCircleMTV(u.x, u.y, ca, sa, hl, hw, o.x, o.y, o.r);
      }
      if (!mtv || mtv.depth <= 0) continue;

      // push the hull out of the matter — exactly, capped per step
      const push = Math.min(mtv.depth, 6) + 0.05;
      u.x += mtv.nx * push;
      u.y += mtv.ny * push;

      // friction against the surface — head-on stops, glancing slides
      const into = ca * mtv.nx + sa * mtv.ny; // -1 = square into it
      res.slow = Math.min(res.slow, 1 + into * 0.5);
      u.speedNow *= 0.96;
    }
    return res;
  }

  /** lookahead avoidance — three probes: nose and both whiskers */
  avoidSteer(u: { x: number; y: number; angle: number; speedNow: number; def: { kind: string; length: number; width: number } }): number {
    if (u.speedNow < 1.5) return 0;
    const heavy = u.def.kind === 'MBT' || u.def.kind === 'IFV' || u.def.kind === 'SPG' || u.def.kind === 'SPAA';
    const ca = Math.cos(u.angle);
    const sa = Math.sin(u.angle);
    const look = 13 + u.speedNow * 1.5;
    const halfW = u.def.width * 0.5;
    let steer = 0;

    // nose probe — the classic obstacle-relative side test
    const px = u.x + ca * look;
    const py = u.y + sa * look;
    for (const o of this.near(px, py, 12)) {
      if (!o.alive) continue;
      if (o.kind === 'TREE') continue;
      if (o.kind === 'WALL' && heavy) continue;
      const { d } = this.obstacleDist(o, px, py);
      if (d > 11) continue;
      const cross = Math.sin(Math.atan2(o.y - u.y, o.x - u.x) - u.angle);
      steer -= Math.sign(cross) * (1 - clamp(d / 11, 0, 1));
    }

    // whisker probes — a blocked left whisker pushes right, and vice versa
    const wl = look * 0.62;
    const lat = halfW * 2.6;
    const whiskers: Array<{ x: number; y: number; dir: number }> = [
      { x: u.x + ca * wl - sa * lat, y: u.y + sa * wl + ca * lat, dir: -1 },
      { x: u.x + ca * wl + sa * lat, y: u.y + sa * wl - ca * lat, dir: 1 },
    ];
    for (const w of whiskers) {
      for (const o of this.near(w.x, w.y, 9)) {
        if (!o.alive) continue;
        if (o.kind === 'TREE') continue;
        if (o.kind === 'WALL' && heavy) continue;
        const { d } = this.obstacleDist(o, w.x, w.y);
        if (d > 8) continue;
        steer += w.dir * (1 - clamp(d / 8, 0, 1)) * 0.8;
      }
    }
    return clamp(steer, -1, 1);
  }
'''

out = lines[:197] + [NEW] + lines[261:]
with io.open(PATH, 'w', encoding='utf-8') as f:
    f.writelines(out)
print('replaced OK, new line count:', len(out))
