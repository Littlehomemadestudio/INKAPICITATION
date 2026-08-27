// ─────────────────────────────────────────────────────────────
// PAPER STORM · combat effects
// Asymmetric ink explosions, layered smoke, ballistic debris,
// craters, permanent stains & wrecks. The battlefield remembers.
// ─────────────────────────────────────────────────────────────

import { RNG, clamp } from '../core/math';
import type { Camera } from '../systems/camera';
import type { AudioEngine } from '../audio/audio';

const SCAR_SCALE = 0.5; // px per metre

export interface Wreck {
  x: number;
  y: number;
  angle: number;
  turretAngle: number;
  type: string;
  faction: 'FRIEND' | 'ENEMY';
  born: number;
  smokeUntil: number;
  /** tossed turret landed nearby */
  turretToss: { x: number; y: number; angle: number } | null;
}

interface InkBlob {
  a: number;
  d0: number;
  d1: number;
  r0: number;
  r1: number;
  seed: number;
  fade: number;
}

interface Streak {
  a: number;
  len: number;
  w: number;
  curve: number;
  delay: number;
}

interface Debris {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  rot: number;
  size: number;
  life: number;
  landed: boolean;
  isTurret: boolean;
  turretAngle: number;
}

export interface SmokePuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  r1: number;
  rot: number;
  sprite: number;
  age: number;
  life: number;
  alpha: number;
  dark: number;
}

interface Explosion {
  x: number;
  y: number;
  dir: number;
  dirStrength: number;
  scale: number;
  t: number;
  blobs: InkBlob[];
  streaks: Streak[];
  smokeLeft: number;
  smokeInterval: number;
  smokeTimer: number;
  ringR: number;
  hasRing: boolean;
  flash: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  r1: number;
  age: number;
  life: number;
}

interface Flash {
  x: number;
  y: number;
  angle: number;
  size: number;
  age: number;
}

export interface OrderMarker {
  x: number;
  y: number;
  kind: 'move' | 'attack' | 'fire';
  t: number;
}

export class EffectsSystem {
  rng: RNG;
  camera: Camera;
  audio: AudioEngine;
  terrainW: number;
  terrainH: number;

  scars: HTMLCanvasElement;
  private scarCtx: CanvasRenderingContext2D;

  explosions: Explosion[] = [];
  smokes: SmokePuff[] = [];
  debris: Debris[] = [];
  rings: Ring[] = [];
  flashes: Flash[] = [];
  orderMarkers: OrderMarker[] = [];
  wrecks: Wreck[] = [];
  /** crisp vector craters (also baked into the scars bitmap) */
  craters: { x: number; y: number; r: number; seed: number }[] = [];

  smokeSprites: HTMLCanvasElement[] = [];
  dustSprite: HTMLCanvasElement | null = null;

  windAngle = -0.6;
  windSpeed = 5.5;
  time = 0;

  private smokePool: SmokePuff[] = [];

  constructor(seed: number, camera: Camera, audio: AudioEngine, terrainW: number, terrainH: number) {
    this.rng = new RNG((seed ^ 0xEFFEC7) >>> 0);
    this.camera = camera;
    this.audio = audio;
    this.terrainW = terrainW;
    this.terrainH = terrainH;
    this.scars = document.createElement('canvas');
    this.scars.width = Math.round(terrainW * SCAR_SCALE);
    this.scars.height = Math.round(terrainH * SCAR_SCALE);
    this.scarCtx = this.scars.getContext('2d')!;
    for (let i = 0; i < 4; i++) this.smokeSprites.push(this.makeSmokeSprite(seed + i * 977));
  }

  // ── sprite factory ─────────────────────────────────────────

  private makeSmokeSprite(seed: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext('2d')!;
    const rng = new RNG(seed >>> 0);
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, 34);
      const cx = 64 + Math.cos(a) * d;
      const cy = 64 + Math.sin(a) * d;
      const r = rng.range(20, 44);
      const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      g.addColorStop(0, 'rgba(56,52,44,0.34)');
      g.addColorStop(0.7, 'rgba(56,52,44,0.16)');
      g.addColorStop(1, 'rgba(56,52,44,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return cv;
  }

  // ── public API ─────────────────────────────────────────────

  spawnExplosion(
    x: number,
    y: number,
    opts: {
      dir?: number;
      dirStrength?: number;
      scale: number;
      crater?: number;
      smoke?: number;
      debris?: number;
      stains?: number;
      ring?: boolean;
      sound?: 'shell' | 'arty' | 'missile' | 'kill' | 'small';
      shake?: number;
    }
  ) {
    const rng = this.rng;
    const dir = opts.dir ?? rng.range(0, Math.PI * 2);
    const dirStrength = opts.dirStrength ?? 0.35;
    const scale = opts.scale;
    const nBlobs = Math.round(4 + scale * rng.range(3.5, 5.5));
    const blobs: InkBlob[] = [];
    for (let i = 0; i < nBlobs; i++) {
      const bias = (rng.next() - 0.5) * Math.PI * dirStrength * 2;
      const a = dir + bias + (rng.next() - 0.5) * Math.PI * 1.5;
      blobs.push({
        a,
        d0: scale * rng.range(1, 4),
        d1: scale * rng.range(8, 22),
        r0: scale * rng.range(1.4, 3.2),
        r1: scale * rng.range(5, 12),
        seed: rng.next() * 1000,
        fade: rng.range(0.55, 1),
      });
    }
    const streaks: Streak[] = [];
    const nStreaks = Math.round(10 + scale * 14);
    for (let i = 0; i < nStreaks; i++) {
      const bias = (rng.next() - 0.5) * Math.PI * dirStrength * 2.4;
      streaks.push({
        a: dir + bias + (rng.next() - 0.5) * Math.PI * 1.7,
        len: scale * rng.range(4, 26),
        w: rng.range(0.5, 1.9),
        curve: rng.range(-0.5, 0.5),
        delay: rng.range(0, 0.09),
      });
    }
    this.explosions.push({
      x,
      y,
      dir,
      dirStrength,
      scale,
      t: 0,
      blobs,
      streaks,
      smokeLeft: opts.smoke ?? Math.round(2 + scale * 3),
      smokeInterval: 0.14,
      smokeTimer: 0,
      ringR: scale * 6,
      hasRing: opts.ring ?? scale > 1.3,
      flash: 1,
    });

    // debris
    const nDebris = opts.debris ?? Math.round(scale * rng.range(4, 9));
    for (let i = 0; i < nDebris; i++) {
      const a = dir + (rng.next() - 0.5) * Math.PI * 1.9;
      const sp = scale * rng.range(14, 52);
      this.debris.push({
        x,
        y,
        z: rng.range(2, 9),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: rng.range(18, 46) * Math.sqrt(scale),
        spin: rng.range(-9, 9),
        rot: rng.range(0, Math.PI * 2),
        size: rng.range(0.5, 1.4) * Math.sqrt(scale),
        life: 0,
        landed: false,
        isTurret: false,
        turretAngle: 0,
      });
    }

    // permanent scarring
    if (opts.crater && opts.crater > 0) this.stampCrater(x, y, opts.crater);
    const nStains = opts.stains ?? Math.round(scale * rng.range(14, 26));
    if (nStains > 0) this.stampStains(x, y, dir, dirStrength, scale, nStains);

    if (opts.ring) {
      this.rings.push({ x, y, r: scale * 4, r1: scale * 34, age: 0, life: 0.7 });
    }

    // audio + shake
    if (opts.sound) this.audio.explosion(opts.sound, x, y, scale);
    const sh = opts.shake ?? scale * 2.2;
    if (sh > 0) this.camera.addShake(x, y, sh);
  }

  muzzleFlash(x: number, y: number, angle: number, size: number) {
    this.flashes.push({ x, y, angle, size, age: 0 });
    this.audio.cannon(x, y, size);
  }

  autoFlash(x: number, y: number, angle: number) {
    this.flashes.push({ x, y, angle, size: 0.55, age: 0 });
  }

  spawnSmoke(x: number, y: number, opts?: { r?: number; r1?: number; life?: number; alpha?: number; vx?: number; vy?: number; dark?: number }) {
    const puff = this.acquirePuff();
    puff.x = x;
    puff.y = y;
    puff.vx = opts?.vx ?? 0;
    puff.vy = opts?.vy ?? 0;
    puff.r = opts?.r ?? 6;
    puff.r1 = opts?.r1 ?? 26;
    puff.rot = this.rng.range(0, Math.PI * 2);
    puff.sprite = this.rng.int(0, 3);
    puff.age = 0;
    puff.life = opts?.life ?? 4.5;
    puff.alpha = opts?.alpha ?? 0.4;
    puff.dark = opts?.dark ?? 1;
  }

  spawnDust(x: number, y: number, vx: number, vy: number) {
    if (this.smokes.length > 380) return;
    this.spawnSmoke(x, y, { r: 2.5, r1: 11, life: 1.6, alpha: 0.16, vx: vx * 0.25, vy: vy * 0.25 });
  }

  orderMarker(x: number, y: number, kind: 'move' | 'attack' | 'fire') {
    this.orderMarkers.push({ x, y, kind, t: 0 });
  }

  addWreck(w: Wreck) {
    this.wrecks.push(w);
    if (this.wrecks.length > 46) this.wrecks.shift();
  }

  // ── scar stamping (permanent battlefield memory) ───────────

  stampCrater(x: number, y: number, r: number) {
    this.craters.push({ x, y, r, seed: this.rng.next() * 100 });
    if (this.craters.length > 300) this.craters.shift();
    const ctx = this.scarCtx;
    ctx.save();
    ctx.translate(x * SCAR_SCALE, y * SCAR_SCALE);
    ctx.scale(SCAR_SCALE, SCAR_SCALE);
    // irregular hole
    ctx.fillStyle = 'rgba(24,21,14,0.52)';
    ctx.beginPath();
    const n = 11;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.72 + 0.38 * Math.abs(Math.sin(i * 3.1 + r)));
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr * 0.88;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    // darker heart
    ctx.fillStyle = 'rgba(12,10,6,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.42, r * 0.36, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // NW rim light
    ctx.strokeStyle = 'rgba(255,252,240,0.4)';
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.9, Math.PI * 0.85, Math.PI * 1.6);
    ctx.stroke();
    // radial cracks
    ctx.strokeStyle = 'rgba(20,17,11,0.4)';
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const l = r * this.rng.range(1.3, 2.4);
      ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
      ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l);
    }
    ctx.stroke();
    ctx.restore();
  }

  stampStains(x: number, y: number, dir: number, dirStrength: number, scale: number, count: number) {
    const ctx = this.scarCtx;
    ctx.save();
    ctx.translate(x * SCAR_SCALE, y * SCAR_SCALE);
    ctx.scale(SCAR_SCALE, SCAR_SCALE);
    for (let i = 0; i < count; i++) {
      const bias = (this.rng.next() - 0.5) * Math.PI * (0.5 + dirStrength);
      const a = dir + bias + (this.rng.next() - 0.5) * Math.PI * 1.6;
      const d = scale * this.rng.range(3, 26);
      const px = Math.cos(a) * d;
      const py = Math.sin(a) * d;
      const r = this.rng.range(0.4, 1.1) * (0.7 + scale * 0.5);
      const elong = this.rng.range(1, 3.2);
      ctx.fillStyle = `rgba(16,13,8,${this.rng.range(0.25, 0.6)})`;
      ctx.beginPath();
      ctx.ellipse(px, py, r * elong, r, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  stampScorch(x: number, y: number, r: number, alpha = 0.35) {
    const ctx = this.scarCtx;
    ctx.save();
    ctx.translate(x * SCAR_SCALE, y * SCAR_SCALE);
    ctx.scale(SCAR_SCALE, SCAR_SCALE);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(18,15,9,${alpha})`);
    g.addColorStop(1, 'rgba(18,15,9,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** faint vehicle track marks — corridors darken over a battle */
  stampTrack(x: number, y: number, angle: number, width: number) {
    const ctx = this.scarCtx;
    ctx.save();
    ctx.translate(x * SCAR_SCALE, y * SCAR_SCALE);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(60,52,38,0.028)';
    ctx.fillRect(-1.6 * SCAR_SCALE, -width * 0.5 * SCAR_SCALE, 3.2 * SCAR_SCALE, width * SCAR_SCALE);
    ctx.restore();
  }

  // ── update ─────────────────────────────────────────────────

  update(dt: number) {
    this.time += dt;
    this.windAngle = -0.6 + Math.sin(this.time * 0.013) * 0.45;

    // explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt * 14);
      // staged smoke
      if (e.smokeLeft > 0) {
        e.smokeTimer -= dt;
        if (e.smokeTimer <= 0) {
          e.smokeTimer = e.smokeInterval;
          e.smokeLeft--;
          const jitter = e.scale * 3;
          const early = e.t < 0.5;
          this.spawnSmoke(
            e.x + this.rng.range(-jitter, jitter),
            e.y + this.rng.range(-jitter, jitter),
            {
              r: e.scale * this.rng.range(2.5, 5),
              r1: e.scale * this.rng.range(18, 34) + 14,
              life: this.rng.range(3.4, 7.5),
              alpha: early ? this.rng.range(0.5, 0.62) : this.rng.range(0.34, 0.5),
              vx: Math.cos(e.dir) * e.scale * 3 * e.dirStrength,
              vy: Math.sin(e.dir) * e.scale * 3 * e.dirStrength,
              dark: early ? 1.6 : 1,
            }
          );
        }
      }
      if (e.t > 1.4) this.explosions.splice(i, 1);
    }

    // debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life += dt;
      if (d.landed) continue;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.vz -= 90 * dt;
      d.rot += d.spin * dt;
      if (d.z <= 0) {
        d.z = 0;
        d.landed = true;
        if (d.isTurret) {
          this.stampScorch(d.x, d.y, 7, 0.3);
        } else {
          this.stampScorch(d.x, d.y, 1.4 * d.size, 0.22);
        }
        d.vx = 0;
        d.vy = 0;
      }
      if (d.landed && d.life > 0) {
        // keep landed debris visible for a while, then bake tiny stain
        if (d.life > 6 && !d.isTurret) this.debris.splice(i, 1);
      }
    }

    // smoke
    const wx = Math.cos(this.windAngle) * this.windSpeed;
    const wy = Math.sin(this.windAngle) * this.windSpeed;
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.age += dt;
      if (s.age >= s.life) {
        this.smokes.splice(i, 1);
        continue;
      }
      s.x += (s.vx + wx * 0.4) * dt;
      s.y += (s.vy + wy * 0.4) * dt;
      s.vx *= 1 - dt * 0.4;
      s.vy *= 1 - dt * 0.4;
      s.rot += dt * 0.1;
    }

    // rings & flashes
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      if (r.age >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].age += dt;
      if (this.flashes[i].age > 0.09) this.flashes.splice(i, 1);
    }

    // order markers
    for (let i = this.orderMarkers.length - 1; i >= 0; i--) {
      this.orderMarkers[i].t += dt;
      if (this.orderMarkers[i].t > 0.8) this.orderMarkers.splice(i, 1);
    }

    // wreck smoke
    for (const w of this.wrecks) {
      if (this.time < w.smokeUntil && this.smokes.length < 380) {
        if (this.rng.chance(dt * 2.2)) {
          const life = clamp((w.smokeUntil - this.time) / 20, 0.4, 3.6);
          this.spawnSmoke(w.x + this.rng.range(-3, 3), w.y + this.rng.range(-3, 3), {
            r: 2.5,
            r1: 15 + this.rng.range(0, 14),
            life: 2.5 + this.rng.range(0, 3),
            alpha: 0.24 + 0.14 * clamp((w.smokeUntil - this.time) / 40, 0, 1),
            vy: -3,
          });
          void life;
        }
      }
    }
  }

  // ── draw ───────────────────────────────────────────────────

  /** vector craters stay crisp at every zoom (bitmap scars persist underneath) */
  drawCraters(ctx: CanvasRenderingContext2D, cam: Camera) {
    const strategic = cam.zoom < 0.7;
    const pad = 60;
    for (const c of this.craters) {
      if (c.x + c.r < cam.viewX - pad || c.x - c.r > cam.viewX + cam.viewW + pad) continue;
      if (c.y + c.r < cam.viewY - pad || c.y - c.r > cam.viewY + cam.viewH + pad) continue;
      if (strategic) {
        // zoom-compensated mark: the war must be visible from the strategic view
        const r = Math.max(c.r, 7 / cam.zoom);
        ctx.fillStyle = 'rgba(24,21,14,0.38)';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, r, r * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const r = c.r;
      // hole
      ctx.fillStyle = 'rgba(24,21,14,0.5)';
      ctx.beginPath();
      const n = 11;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (0.74 + 0.34 * Math.abs(Math.sin(i * 3.1 + c.seed)));
        const px = c.x + Math.cos(a) * rr;
        const py = c.y + Math.sin(a) * rr * 0.9;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      // heart
      ctx.fillStyle = 'rgba(12,10,6,0.5)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, r * 0.4, r * 0.34, 0.3, 0, Math.PI * 2);
      ctx.fill();
      // NW rim light
      ctx.strokeStyle = 'rgba(255,252,240,0.5)';
      ctx.lineWidth = Math.max(0.9, r * 0.14);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 0.9, Math.PI * 0.85, Math.PI * 1.6);
      ctx.stroke();
      // cracks
      if (cam.zoom > 2) {
        ctx.strokeStyle = 'rgba(20,17,11,0.42)';
        ctx.lineWidth = Math.max(0.5, r * 0.06);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = c.seed + i * 1.9;
          const l = r * (1.3 + 0.9 * Math.abs(Math.sin(i * 4.7 + c.seed)));
          ctx.moveTo(c.x + Math.cos(a) * r * 0.7, c.y + Math.sin(a) * r * 0.7);
          ctx.lineTo(c.x + Math.cos(a) * l, c.y + Math.sin(a) * l);
        }
        ctx.stroke();
      }
    }
  }

  /** ink cores, debris, rings, flashes — above units */
  drawCore(ctx: CanvasRenderingContext2D) {
    // explosion ink
    for (const e of this.explosions) {
      const t = e.t;
      const grow = clamp(t / 0.28, 0, 1);
      const fade = clamp(1 - (t - 0.35) / 0.9, 0, 1);
      const ink = clamp(fade, 0, 1);
      ctx.fillStyle = `rgba(16,13,8,${0.8 * ink})`;
      for (const b of e.blobs) {
        const d = b.d0 + (b.d1 - b.d0) * grow;
        const r = b.r0 + (b.r1 - b.r0) * grow;
        const bx = e.x + Math.cos(b.a) * d;
        const by = e.y + Math.sin(b.a) * d;
        // irregular ink blob
        ctx.beginPath();
        const n = 9;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2 + b.seed;
          const rr = r * (0.6 + 0.45 * Math.abs(Math.sin(i * 2.3 + b.seed)));
          const px = bx + Math.cos(a) * rr;
          const py = by + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.globalAlpha = b.fade * ink;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // spatter streaks
      ctx.strokeStyle = `rgba(14,11,7,${0.75 * ink})`;
      ctx.lineCap = 'round';
      for (const s of e.streaks) {
        const tt = clamp((t - s.delay) / 0.2, 0, 1);
        if (tt <= 0) continue;
        const d0 = e.scale * 2 + tt * s.len;
        const d1 = d0 + s.len * 0.5 * tt;
        ctx.lineWidth = s.w * (1 - tt * 0.5);
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(s.a) * d0, e.y + Math.sin(s.a) * d0);
        // curved streak
        const midA = s.a + s.curve * 0.35;
        ctx.quadraticCurveTo(
          e.x + Math.cos(midA) * (d0 + d1) * 0.5,
          e.y + Math.sin(midA) * (d0 + d1) * 0.5,
          e.x + Math.cos(s.a) * d1,
          e.y + Math.sin(s.a) * d1
        );
        ctx.stroke();
      }
      // white-hot flash core (brief)
      if (e.flash > 0) {
        ctx.fillStyle = `rgba(255,253,246,${e.flash * 0.9})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.scale * 2.6 * (1.2 - e.flash * 0.4), 0, Math.PI * 2);
        ctx.fill();
        // directional hot wedges
        ctx.fillStyle = `rgba(255,253,246,${e.flash * 0.55})`;
        for (let i = 0; i < 4; i++) {
          const a = e.dir + (i - 1.5) * 0.4;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(a) * e.scale * 8 * e.flash, e.y + Math.sin(a) * e.scale * 8 * e.flash);
          ctx.lineTo(e.x + Math.cos(a + 0.22) * e.scale * 4 * e.flash, e.y + Math.sin(a + 0.22) * e.scale * 4 * e.flash);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // debris
    for (const d of this.debris) {
      if (d.isTurret) continue; // drawn in wreck layer
      const px = d.x;
      const py = d.y - d.z * 0.35;
      // ground shadow
      ctx.fillStyle = 'rgba(20,17,11,0.18)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.landed ? 'rgba(24,20,14,0.8)' : '#171410';
      ctx.fillRect(-d.size, -d.size * 0.55, d.size * 2, d.size * 1.1);
      ctx.restore();
    }

    // shockwave rings
    for (const r of this.rings) {
      const t = r.age / r.life;
      const rr = r.r + (r.r1 - r.r) * t;
      ctx.strokeStyle = `rgba(30,26,18,${0.22 * (1 - t)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // muzzle flashes
    for (const f of this.flashes) {
      const a = f.age / 0.09;
      const alpha = 1 - a;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      // dark propellant wash
      ctx.fillStyle = `rgba(30,26,18,${0.35 * alpha})`;
      ctx.beginPath();
      ctx.moveTo(0, -f.size * 1.4);
      ctx.lineTo(f.size * 7, 0);
      ctx.lineTo(0, f.size * 1.4);
      ctx.closePath();
      ctx.fill();
      // hot core
      ctx.fillStyle = `rgba(255,254,248,${0.85 * alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, f.size * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** smoke & dust — topmost battlefield layer */
  drawSmoke(ctx: CanvasRenderingContext2D) {
    for (const s of this.smokes) {
      const t = s.age / s.life;
      const r = s.r + (s.r1 - s.r) * Math.pow(t, 0.6);
      const alpha = s.alpha * Math.pow(1 - t, 1.4);
      if (alpha < 0.01) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.globalAlpha = alpha;
      ctx.drawImage(this.smokeSprites[s.sprite], -r, -r, r * 2, r * 2);
      if (s.dark > 1.2 && t < 0.5) {
        // dense ink heart of a fresh explosion
        ctx.globalAlpha = alpha * 0.7;
        ctx.fillStyle = 'rgba(30,26,20,0.5)';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** order feedback markers */
  drawOrderMarkers(ctx: CanvasRenderingContext2D) {
    for (const m of this.orderMarkers) {
      const t = m.t / 0.8;
      const r = 4 + t * 16;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      if (m.kind === 'move') {
        ctx.strokeStyle = '#141210';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(m.x - 4, m.y);
        ctx.lineTo(m.x + 4, m.y);
        ctx.moveTo(m.x, m.y - 4);
        ctx.lineTo(m.x, m.y + 4);
        ctx.stroke();
      } else if (m.kind === 'attack' || m.kind === 'fire') {
        ctx.strokeStyle = '#141210';
        ctx.lineWidth = 1.4;
        const s = 5;
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
          ctx.beginPath();
          ctx.moveTo(m.x + sx * r, m.y + sy * r - sy * s);
          ctx.lineTo(m.x + sx * r, m.y + sy * r);
          ctx.lineTo(m.x + sx * r - sx * s, m.y + sy * r);
          ctx.stroke();
        }
        if (m.kind === 'fire') {
          ctx.beginPath();
          ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  private acquirePuff(): SmokePuff {
    let p = this.smokePool.pop();
    if (!p) {
      p = { x: 0, y: 0, vx: 0, vy: 0, r: 0, r1: 0, rot: 0, sprite: 0, age: 0, life: 1, alpha: 0.4, dark: 1 };
    }
    this.smokes.push(p);
    return p;
  }
}
