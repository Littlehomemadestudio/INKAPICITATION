// quick forest/rock density audit across seeds
// stub Path2D — not available outside the browser
class Path2DStub {
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  quadraticCurveTo(): void {}
  arc(): void {}
}
(globalThis as unknown as { Path2D: unknown }).Path2D = Path2DStub;

import { Terrain } from '../src/game/world/terrain';

const counts: { seed: number; trees: number; rocks: number; fields: number }[] = [];
for (let i = 0; i < 8; i++) {
  const seed = 1000 + i * 7919;
  const t = new Terrain(seed);
  counts.push({ seed, trees: t.trees.length, rocks: t.rocks.length, fields: t.fields.length });
}
const avg = (k: 'trees' | 'rocks' | 'fields') =>
  Math.round(counts.reduce((s, c) => s + c[k], 0) / counts.length);
console.log(JSON.stringify(counts));
console.log(`avg trees=${avg('trees')} rocks=${avg('rocks')} fields=${avg('fields')}`);
