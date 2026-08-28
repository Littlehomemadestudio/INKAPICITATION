// ─────────────────────────────────────────────────────────────
// PAPER STORM · vision & intelligence
// Symmetric spotting with forest concealment, movement cues,
// muzzle-flash revelation — and real terrain: ridgelines block
// sight, high ground sees further, valleys hide.
// ─────────────────────────────────────────────────────────────

import type { Unit, SimContext } from '../entities/units';
import { dist, clamp } from '../core/math';

const GHOST_TIME = 32;
/** eye height of a ground vehicle above local terrain (m) */
const EYE_GROUND = 4.5;
const EYE_TARGET = 3.2;

export class VisionSystem {
  timer = 0;
  /** 32×24 exploration grid for the minimap */
  explored: Uint8Array;
  cols = 32;
  rows = 24;

  constructor(seed: number) {
    void seed;
    this.explored = new Uint8Array(this.cols * this.rows);
  }

  update(dt: number, ctx: SimContext) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.15;

    const units = ctx.units;
    for (const u of units) {
      u.visibleTargets.length = 0;
    }

    for (const observer of units) {
      if (observer.dead) continue;
      const obH = observer.isAir ? 999 : ctx.terrain.heightAt(observer.x, observer.y);
      for (const target of units) {
        if (target.dead || target.faction === observer.faction) continue;
        const d = dist(observer.x, observer.y, target.x, target.y);
        const r = this.spotRange(observer, target, ctx, obH);
        if (d < r && this.terrainLOS(observer, target, ctx, obH)) {
          observer.visibleTargets.push(target);
        }
      }
    }

    // player intel over enemy units
    const now = ctx.time;
    for (const e of units) {
      if (e.faction !== 'ENEMY' || e.dead) {
        if (e.dead) e.intel = 'HIDDEN';
        continue;
      }
      // large static structures are known landmarks — no fog for them
      if (e.def.kind === 'FACTORY') {
        e.intel = 'DETECTED';
        e.lastSeen = now;
        e.knownX = e.x;
        e.knownY = e.y;
        continue;
      }
      const seen = units.some(
        (f) => f.faction === 'FRIEND' && !f.dead && f.visibleTargets.includes(e)
      );
      if (seen) {
        if (e.intel !== 'DETECTED' && now - e.lastSeen > 8) {
          ctx.log(`CONTACT — ${labelFor(e)} · GRID ${e.positionGrid()}`, 'contact');
        }
        e.intel = 'DETECTED';
        e.lastSeen = now;
        e.knownX = e.x;
        e.knownY = e.y;
      } else if (now - e.lastSeen < GHOST_TIME) {
        e.intel = 'GHOST';
      } else {
        e.intel = 'HIDDEN';
      }
    }

    // exploration grid
    for (const f of units) {
      if (f.dead || f.faction !== 'FRIEND') continue;
      const cx = Math.floor(f.x / (4096 / this.cols));
      const cy = Math.floor(f.y / (3072 / this.rows));
      const rad = f.isAir ? 3 : 2;
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const gx = cx + dx;
          const gy = cy + dy;
          if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) continue;
          if (dx * dx + dy * dy <= rad * rad) this.explored[gy * this.cols + gx] = 1;
        }
      }
    }
  }

  /** ridgelines interrupt observation; aircraft look down on everything */
  private terrainLOS(observer: Unit, target: Unit, ctx: SimContext, obH: number): boolean {
    if (observer.isAir || target.isAir) return true;
    if (target.def.kind === 'FACTORY') {
      // big structures break the skyline — visible if in range
      return true;
    }
    const tgH = ctx.terrain.heightAt(target.x, target.y);
    return ctx.terrain.losClear(
      observer.x,
      observer.y,
      obH + EYE_GROUND,
      target.x,
      target.y,
      tgH + EYE_TARGET
    );
  }

  private spotRange(observer: Unit, target: Unit, ctx: SimContext, obH: number): number {
    let r = observer.def.vision;
    if (target.isAir) {
      return r * 1.15 + 250;
    }
    // high ground sees further — up to ±30% by relative elevation
    if (!observer.isAir) {
      const tgH = ctx.terrain.heightAt(target.x, target.y);
      const adv = clamp((obH - tgH) * 0.011, -0.3, 0.32);
      r *= 1 + adv;
    }
    const forest = ctx.terrain.forestDensity(target.x, target.y);
    if (forest > 0.42) {
      const stationary = target.speedNow < 1.2;
      r *= observer.isAir ? 0.8 : stationary ? 0.34 : 0.52;
    }
    if (target.speedNow > target.def.speed * 0.55) r *= 1.15;
    // firing reveals
    if (ctx.time - target.lastFireT < 7) r += 430;
    return r;
  }

  revealAll(units: Unit[]) {
    for (const u of units) {
      if (u.faction === 'ENEMY') {
        u.intel = 'GHOST';
        u.lastSeen = 0;
        u.knownX = u.x;
        u.knownY = u.y;
      }
    }
  }
}

function labelFor(u: Unit): string {
  const kind = u.def.kind;
  switch (kind) {
    case 'MBT':
      return 'ARMOR';
    case 'IFV':
      return 'MECH';
    case 'SPG':
      return 'ARTY';
    case 'REC':
      return 'RECCE';
    case 'SPAA':
      return 'AIR DEFENSE';
    case 'HQ':
      return 'COMMAND';
    case 'FACTORY':
      return 'INK WORKS';
    default:
      return 'UNIT';
  }
}

export function ghostAlpha(u: Unit, now: number): number {
  if (u.intel !== 'GHOST') return 0;
  return clamp(1 - (now - u.lastSeen) / GHOST_TIME, 0.15, 1) * 0.55;
}
