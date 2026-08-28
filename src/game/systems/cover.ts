// ─────────────────────────────────────────────────────────────
// PAPER STORM · cover model
// Directional, legible, physical: hard cover (buildings, rocks,
// walls, wrecks, rubble), soft cover (forest), fighting cover
// (trenches). A unit behind a stone wall is hard to hit from the
// wall side — and exposed from the flanks. That is the whole idea.
// ─────────────────────────────────────────────────────────────

import type { SimContext } from '../entities/units';
import { angDiff, angleOf, clamp, dist } from '../core/math';

export type CoverType = 'NONE' | 'SOFT' | 'HARD' | 'TRENCH';

export interface CoverRating {
  /** 0 = exposed, 1 = fully protected */
  value: number;
  type: CoverType;
}

const TRENCH_RADIUS = 9;
const HARD_RADIUS = 13;

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
  // buildings
  const blds = t.buildingsNear(x, y, HARD_RADIUS + 30);
  for (const b of blds) {
    const d = dist(x, y, b.x, b.y);
    const reach = Math.max(b.w, b.h) * 0.5 + HARD_RADIUS;
    if (d > reach) continue;
    // the building must lie toward the threat
    const bAng = angleOf(b.x - x, b.y - y);
    const facing = Math.abs(angDiff(threatAng, bAng));
    if (facing < 1.15) {
      const solid = b.kind === 'RUIN' ? 0.5 : b.kind === 'BUNKER' || b.kind.startsWith('FACTORY') ? 0.66 : 0.6;
      bestHard = Math.max(bestHard, solid * (1 - facing / 1.5));
    }
  }
  // stone walls
  const wall = t.wallNear(x, y, HARD_RADIUS);
  if (wall) {
    const wAng = angleOf(wall.x - x, wall.y - y);
    const facing = Math.abs(angDiff(threatAng, wAng));
    if (facing < 1.0) bestHard = Math.max(bestHard, 0.58 * (1 - facing / 1.4));
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

  // ── soft cover: vegetation breaks observation and aim ──
  const f = t.forestDensity(x, y);
  if (f > 0.42) {
    return { value: clamp(0.18 + f * 0.17, 0, 0.4), type: 'SOFT' };
  }

  return { value: 0, type: 'NONE' };
}

/** find the best hard-cover spot within `radius` of (x, y), sheltering from a threat */
export function findCoverSpot(
  ctx: SimContext,
  x: number,
  y: number,
  fromX: number,
  fromY: number,
  radius: number
): { x: number; y: number; value: number } | null {
  const t = ctx.terrain;
  const rng = ctx.rng;
  let best: { x: number; y: number; value: number } | null = null;
  // candidate anchors: near walls, buildings, trenches, rocks
  const anchors: { x: number; y: number }[] = [];
  for (const w of t.walls) {
    if (dist(x, y, w.x, w.y) < radius + w.len * 0.5) anchors.push({ x: w.x, y: w.y });
  }
  for (const b of t.buildingsNear(x, y, radius + 30)) {
    if (b.kind === 'MAST' || b.kind === 'CHECKPOINT') continue;
    anchors.push({ x: b.x, y: b.y });
  }
  for (const r of t.rocks) {
    if (dist(x, y, r.x, r.y) < radius) anchors.push({ x: r.x, y: r.y });
  }
  // trench anchor points
  for (const tr of t.trenches) {
    for (const p of tr.pts) {
      if (dist(x, y, p.x, p.y) < radius) anchors.push(p);
    }
  }

  const threatAng = angleOf(fromX - x, fromY - y);
  for (const a of anchors) {
    // stand on the far side of the anchor from the threat
    const d = dist(x, y, a.x, a.y);
    if (d > radius || d < 4) continue;
    const px = a.x - Math.cos(threatAng) * 8;
    const py = a.y - Math.sin(threatAng) * 8;
    // passable?
    const gx = clamp(Math.floor(px / 64), 0, t.gw - 1);
    const gy = clamp(Math.floor(py / 64), 0, t.gh - 1);
    if (t.cost[gy * t.gw + gx] < 0) continue;
    const rating = coverFrom(ctx, px, py, fromX, fromY);
    const score = rating.value - d / (radius * 3.2) + rng.range(0, 0.03);
    if (!best || score > best.value) {
      best = { x: px, y: py, value: score };
    }
  }
  return best;
}
