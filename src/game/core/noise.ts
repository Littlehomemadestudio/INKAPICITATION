// ─────────────────────────────────────────────────────────────
// PAPER STORM · seeded value noise + fbm
// ─────────────────────────────────────────────────────────────

import { RNG } from './math';

const SIZE = 256;

export class Noise2D {
  private perm: Float32Array;

  constructor(seed: number) {
    const rng = new RNG(seed);
    const base = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < base.length; i++) base[i] = rng.next();
    // wrap-safe indexing
    this.perm = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        this.perm[y * SIZE + x] = base[((y % SIZE) * SIZE + (x % SIZE)) | 0];
      }
    }
  }

  private val(ix: number, iy: number): number {
    const x = ((ix % SIZE) + SIZE) % SIZE;
    const y = ((iy % SIZE) + SIZE) % SIZE;
    return this.perm[(y | 0) * SIZE + (x | 0)];
  }

  /** smooth value noise, output 0..1 */
  sample(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const v00 = this.val(x0, y0);
    const v10 = this.val(x0 + 1, y0);
    const v01 = this.val(x0, y0 + 1);
    const v11 = this.val(x0 + 1, y0 + 1);
    const a = v00 + (v10 - v00) * sx;
    const b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  }

  /** fractal brownian motion, output ~0..1 */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.sample(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
