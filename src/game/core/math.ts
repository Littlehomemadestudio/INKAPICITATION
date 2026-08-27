// ─────────────────────────────────────────────────────────────
// PAPER STORM · core math utilities
// ─────────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

export function v2(x: number, y: number): Vec2 {
  return { x, y };
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(t: number): number {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

/** frame-rate independent exponential smoothing */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

export function angleOf(dx: number, dy: number): number {
  return Math.atan2(dy, dx);
}

/** shortest signed angular difference a→b */
export function angDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function rotateToward(current: number, target: number, maxStep: number): number {
  const d = angDiff(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

// ── seeded RNG (mulberry32) ───────────────────────────────────

export class RNG {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }

  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** string → 32-bit seed */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** military-style grid string from world coords (metres) */
export function gridString(x: number, y: number): string {
  const e = Math.floor(clamp(x, 0, 99999) / 10);
  const n = Math.floor(clamp(y, 0, 99999) / 10);
  return `${String(e).padStart(4, '0')}-${String(n).padStart(4, '0')}`;
}

/** bearing in degrees from +Y-north (screen up = north) */
export function bearingDeg(dx: number, dy: number): number {
  const b = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (b + 360) % 360;
}

export function pad2(n: number): string {
  return String(Math.floor(n)).padStart(2, '0');
}

/** mission clock T+MM:SS */
export function clockString(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${pad2(m)}:${pad2(s)}`;
}
