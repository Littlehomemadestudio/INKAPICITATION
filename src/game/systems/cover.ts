// ─────────────────────────────────────────────────────────────
// PAPER STORM · cover model
// Directional, legible, physical: hard cover (buildings, rocks,
// walls, wrecks, rubble), soft cover (forest), fighting cover
// (trenches), and terrain cover (the back side of a ridge).
// A unit behind a stone wall is hard to hit from the wall side —
// and exposed from the flanks. A breached wall shelters less.
// That is the whole idea.
// ─────────────────────────────────────────────────────────────

import type { SimContext } from '../entities/units';
import { angDiff, angleOf, clamp, dist } from '../core/math';

export type CoverType = 'NONE' | 'SOFT' | 'HARD' | 'TRENCH' | 'TERRAIN';

export interface CoverRating {
  /** 0 = exposed, 1 = fully protected */
  value: number;
  type: CoverType;
}

const TRENCH_RADIUS = 9;
const HARD_RADIUS = 13;

/** eye heights used for defilade tests (match vision.ts) */
const EYE_A = 4.5;
const EYE_B = 3.2;

/**
 * How protected is a unit at (x, y) against fire arriving from
 * (fromX, fromY)? Cover is directional: an object only shelters
 * the unit if it actually stands between them.
 */
export function coverFrom(ctx: SimContext, x: number, y: number, fromX: number, fromY: number): CoverRating {
  const t = ctx.terrain;
  const threatAng = angleOf(fromX - x, fromY - y);

  // ── fighting cover: a dug position shelters from every direction ──
  const td = t.trenchDist(x, y);
  if (td < TRENCH_RADIUS) {
    return { value: 0.72, type: 'TRENCH' };
  }

  // ── hard cover: something solid between the unit and the threat ──
  let bestHard = 0;
  // buildings (collapsed ones are rubble — weaker, but rubble counts below)
  const blds = t.buildingsNear(x, y, HARD_RADIUS + 30);
  for (const b of blds) {
    if ((b.stage ?? 0) >= 3) continue; // collapsed — see rubble
    const d = dist(x, y, b.x, b.y);
    const reach = Math.max(b.w, b.h) * 0.5 + HARD_RADIUS;
    if (d > reach) continue;
    // the building must lie toward the threat
    const bAng = angleOf(b.x - x, b.y - y);
    const facing = Math.abs(angDiff(threatAng, bAng));
    if (facing < 1.15) {
      let solid = b.kind === 'RUIN' ? 0.5 : b.kind === 'BUNKER' || b.kind.startsWith('FACTORY') ? 0.66 : 0.6;
      const stage = b.stage ?? 0;
      if (stage === 1) solid *= 0.9; // scarred walls stand
      if (stage === 2) solid *= 0.68; // a wrecked shell shelters less
      bestHard = Math.max(bestHard, solid * (1 - facing / 1.5));
    }
  }
  // stone walls — only the segments still standing; direction measured
  // toward the nearest point on the wall, not its centre
  const wall = t.wallNear(x, y, HARD_RADIUS);
  if (wall && t.wallSegmentAlive(wall, x, y)) {
    const wp = t.wallPointAt(wall, x, y);
    const wAng = angleOf(wp.x - x, wp.y - y);
    const facing = Math.abs(angDiff(threatAng, wAng));
    if (facing < 1.0) {
      const integrity = t.wallIntegrity(wall);
      bestHard = Math.max(bestHard, 0.58 * integrity * (1 - facing / 1.4));
    }
  }
  // boulders
  for (const r of t.rocks) {
    const d = dist(x, y, r.x, r.y);
    if (d > r.r + HARD_RADIUS) continue;
    const rAng = angleOf(r.x - x, r.y - y);
    const facing = Math.abs(angDiff(threatAng, rAng));
    if (facing < 1.2) bestHard = Math.max(bestHard, 0.5 * (1 - facing / 1.6));
  }
  // burning wrecks — steel hulks are honest cover
  for (const w of ctx.effects.wrecks) {
    const d = dist(x, y, w.x, w.y);
    if (d > 14) continue;
    const wAng = angleOf(w.x - x, w.y - y);
    const facing = Math.abs(angDiff(threatAng, wAng));
    if (facing < 1.1) bestHard = Math.max(bestHard, 0.45 * (1 - facing / 1.5));
  }
  // rubble fields from destroyed structures
  for (const r of ctx.effects.rubble) {
    const d = dist(x, y, r.x, r.y);
    if (d > Math.max(r.w, r.h) * 0.7 + 10) continue;
    const rAng = angleOf(r.x - x, r.y - y);
    const facing = Math.abs(angDiff(threatAng, rAng));
    if (facing < 1.0) bestHard = Math.max(bestHard, 0.5 * (1 - facing / 1.5));
  }

  if (bestHard > 0.25) {
    return { value: clamp(bestHard, 0, 0.68), type: 'HARD' };
  }

  // ── terrain cover: a fold of ground breaks the firing line ──
  if (!ctx.terrain.losClear(x, y, t.heightAt(x, y) + EYE_A, fromX, fromY, t.heightAt(fromX, fromY) + EYE_B)) {
    return { value: 0.55, type: 'TERRAIN' };
  }

  // ── soft cover: vegetation breaks observation and aim ──
  const f = t.forestDensity(x, y);
  if (f > 0.42) {
    return { value: clamp(0.18 + f * 0.17, 0, 0.4), type: 'SOFT' };
  }

  return { value: 0, type: 'NONE' };
}

/** passable ground for a vehicle */
function passable(ctx: SimContext, x: number, y: number): boolean {
  const t = ctx.terrain;
  const gx = clamp(Math.floor(x / 64), 0, t.gw - 1);
  const gy = clamp(Math.floor(y / 64), 0, t.gh - 1);
  return t.cost[gy * t.gw + gx] >= 0;
}

interface Spot {
  x: number;
  y: number;
  /** selection score (protection minus distance) */
  value: number;
  /** the protection itself, 0..1 — what the caller compares */
  protect: number;
}

/**
 * Find the best cover within `radius` of (x, y), sheltering from a
 * threat at (fromX, fromY). The spot lies on the PROTECTED side of
 * something solid — between the unit and the object, with the
 * object facing the threat. Folds of ground count too: the back
 * slope of a ridge is cover no one built.
 */
export function findCoverSpot(
  ctx: SimContext,
  x: number,
  y: number,
  fromX: number,
  fromY: number,
  radius: number
): Spot | null {
  const t = ctx.terrain;
  const rng = ctx.rng;
  const dirAwayFromThreat = angleOf(x - fromX, y - fromY);
  let best: Spot | null = null;

  const consider = (px: number, py: number) => {
    if (dist(px, py, x, y) > radius) return;
    if (!passable(ctx, px, py)) return;
    const rating = coverFrom(ctx, px, py, fromX, fromY);
    const d = dist(x, y, px, py);
    const score = rating.value - d / (radius * 3.2) + rng.range(0, 0.03);
    if (!best || score > best.value) {
      best = { x: px, y: py, value: score, protect: rating.value };
    }
  };

  // ── candidate anchors: objects you can stand behind ──
  for (const w of t.walls) {
    if (dist(x, y, w.x, w.y) > radius + w.len * 0.5) continue;
    if (!w.segs) continue;
    const segLen = w.len / w.segs.length;
    const c = Math.cos(w.rot);
    const s = Math.sin(w.rot);
    for (let i = 0; i < w.segs.length; i++) {
      if (w.segs[i].hp <= 0) continue; // a breach is not a wall
      const lx = -w.len / 2 + segLen * (i + 0.5);
      const ax = w.x + c * lx;
      const ay = w.y + s * lx;
      // stand on the far side of the wall from the threat
      consider(ax + Math.cos(dirAwayFromThreat) * 6, ay + Math.sin(dirAwayFromThreat) * 6);
    }
  }
  for (const b of t.buildingsNear(x, y, radius + 40)) {
    if (b.kind === 'MAST' || b.kind === 'CHECKPOINT') continue;
    if ((b.stage ?? 0) >= 3) continue; // collapsed — rubble covers, but weakly
    const standoff = Math.max(b.w, b.h) * 0.5 + 8;
    consider(b.x + Math.cos(dirAwayFromThreat) * standoff, b.y + Math.sin(dirAwayFromThreat) * standoff);
  }
  for (const r of t.rocks) {
    if (dist(x, y, r.x, r.y) > radius) continue;
    const standoff = r.r + 6;
    consider(r.x + Math.cos(dirAwayFromThreat) * standoff, r.y + Math.sin(dirAwayFromThreat) * standoff);
  }
  // trench anchor points — dug positions you can drop into
  for (const tr of t.trenches) {
    for (const p of tr.pts) {
      if (dist(x, y, p.x, p.y) < radius) consider(p.x, p.y);
    }
  }

  // ── terrain folds: the back slope of a ridge hides a hull ──
  const thEye = t.heightAt(fromX, fromY) + EYE_B;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng.range(0, 0.4);
    for (const rr of [radius * 0.5, radius * 0.8]) {
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (!passable(ctx, px, py)) continue;
      const hidden = !t.losClear(px, py, t.heightAt(px, py) + EYE_A, fromX, fromY, thEye);
      if (hidden) {
        const d = dist(x, y, px, py);
        const score = 0.58 - d / (radius * 3.2) + rng.range(0, 0.03);
        if (!best || score > best.value) {
          best = { x: px, y: py, value: score, protect: 0.58 };
        }
      }
    }
  }

  return best;
}

/**
 * Nudge a formation arrival point toward the best cover within a
 * short walk — so a group ordered onto contested ground settles
 * behind the wall line instead of the open field beside it.
 */
export function refineCover(
  ctx: SimContext,
  dest: { x: number; y: number },
  threat: { x: number; y: number } | null,
  searchR = 34
): { x: number; y: number } {
  if (!threat) return dest;
  const spot = findCoverSpot(ctx, dest.x, dest.y, threat.x, threat.y, searchR);
  if (!spot) return dest;
  const current = coverFrom(ctx, dest.x, dest.y, threat.x, threat.y);
  if (spot.protect > current.value + 0.14) {
    return { x: spot.x, y: spot.y };
  }
  return dest;
}
