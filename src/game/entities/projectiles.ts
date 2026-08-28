// ─────────────────────────────────────────────────────────────
// PAPER STORM · projectiles
// Visible, physical munitions: AP shells, ballistic artillery,
// tracers, guided missiles with smoke trails.
// ─────────────────────────────────────────────────────────────

import type { ProjectileKind } from '../core/types';
import type { Unit, SimContext } from './units';
import type { EffectsSystem } from './effects';
import type { AudioEngine } from '../audio/audio';
import { dist, angleOf, clamp, rotateToward, RNG } from '../core/math';

export interface Projectile {
  kind: ProjectileKind;
  friend: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  angle: number;
  t: number;
  ttl: number;
  damage: number;
  splash: number;
  ownerId: number;
  targetId: number;
  /** terminal point for ballistic/unguided */
  aimX: number;
  aimY: number;
  /** arty arc */
  startX: number;
  startY: number;
  flightT: number;
  flightTotal: number;
  arcH: number;
  trailTimer: number;
  whistled: boolean;
  defeated: boolean;
  dead: boolean;
  /** naval gun calibre (mm) — drives splash scale + sound */
  calibre?: number;
  /** torpedo: minimum run before the pistol arms */
  armDist?: number;
  runDist?: number;
}

export interface ProjectileContext {
  units: Unit[];
  effects: EffectsSystem;
  audio: AudioEngine;
}

export class ProjectileSystem {
  list: Projectile[] = [];
  rng = new RNG(0x51ce);
  fired = 0;

  spawn(p: Partial<Projectile> & { kind: ProjectileKind; x: number; y: number; friend: boolean }): Projectile {
    this.fired++;
    const pr = {
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      angle: 0,
      t: 0,
      ttl: 6,
      damage: 20,
      splash: 0,
      ownerId: -1,
      targetId: -1,
      aimX: 0,
      aimY: 0,
      startX: 0,
      startY: 0,
      flightT: 0,
      flightTotal: 0,
      arcH: 0,
      trailTimer: 0,
      whistled: false,
      defeated: false,
      dead: false,
      ...p,
    } as Projectile;
    this.list.push(pr);
    return pr;
  }

  /** tank gun: fast flat shell */
  fireShell(ctx: ProjectileContext, owner: Unit, tx: number, ty: number, damage: number, accuracy: number) {
    const d = dist(owner.x, owner.y, tx, ty);
    let ax = tx;
    let ay = ty;
    if (this.rng.next() > accuracy) {
      const ma = this.rng.range(0, Math.PI * 2);
      const md = this.rng.range(9, 34);
      ax += Math.cos(ma) * md;
      ay += Math.sin(ma) * md;
    }
    const a = angleOf(ax - owner.x, ay - owner.y);
    const muzzle = 4.5;
    const speed = 470;
    void d;
    this.spawn({
      kind: 'SHELL',
      friend: owner.faction === 'FRIEND',
      x: owner.x + Math.cos(a) * muzzle,
      y: owner.y + Math.sin(a) * muzzle,
      angle: a,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      damage,
      ownerId: owner.id,
      aimX: ax,
      aimY: ay,
      ttl: 4,
    });
    ctx.effects.muzzleFlash(owner.x + Math.cos(a) * muzzle, owner.y + Math.sin(a) * muzzle, a, 1.15);
  }

  /** autocannon tracer burst round — misses scatter wider when aim is poor */
  fireAuto(ctx: ProjectileContext, owner: Unit, tx: number, ty: number, damage: number, aim = 1) {
    const ma = this.rng.range(0, Math.PI * 2);
    const md = this.rng.range(0, 7) / Math.max(0.25, aim);
    const ax = tx + Math.cos(ma) * md;
    const ay = ty + Math.sin(ma) * md;
    const a = angleOf(ax - owner.x, ay - owner.y);
    const speed = 640;
    this.spawn({
      kind: 'AUTO',
      friend: owner.faction === 'FRIEND',
      x: owner.x + Math.cos(a) * 3,
      y: owner.y + Math.sin(a) * 3,
      angle: a,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      damage,
      ownerId: owner.id,
      aimX: ax,
      aimY: ay,
      ttl: 1.6,
    });
    ctx.effects.autoFlash(owner.x + Math.cos(a) * 3, owner.y + Math.sin(a) * 3, a);
    ctx.audio.autocannon(owner.x, owner.y);
  }

  /** howitzer: ballistic arc onto an area.
   *  `quality` multiplies the dispersion ellipse — it is the price
   *  of ignorance: unobserved fire scatters, corrected fire kills. */
  fireArtillery(ctx: ProjectileContext, owner: Unit, tx: number, ty: number, damage: number, splash: number, quality = 1) {
    // elliptical dispersion, stretched along the line of fire —
    // range error beats deflection error, as it does in life
    const baseSigma = 26;
    const sigAlong = baseSigma * quality;
    const sigAcross = baseSigma * 0.62 * quality;
    const fireAng = angleOf(tx - owner.x, ty - owner.y);
    // gaussian-ish: sum of two uniforms
    const g = () => (this.rng.next() + this.rng.next() + this.rng.next() - 1.5) * 0.8;
    const along = g() * sigAlong;
    const across = g() * sigAcross;
    const ax = tx + Math.cos(fireAng) * along - Math.sin(fireAng) * across;
    const ay = ty + Math.sin(fireAng) * along + Math.cos(fireAng) * across;
    const d = dist(owner.x, owner.y, ax, ay);
    const flight = 2.4 + d / 150;
    const a = angleOf(ax - owner.x, ay - owner.y);
    ctx.audio.artilleryFire(owner.x, owner.y);
    ctx.effects.muzzleFlash(owner.x + Math.cos(a) * 5, owner.y + Math.sin(a) * 5, a, 1.7);
    ctx.effects.spawnSmoke(owner.x + Math.cos(a) * 6, owner.y + Math.sin(a) * 6, { r: 3, r1: 18, life: 2.6, alpha: 0.3 });
    this.spawn({
      kind: 'ARTY',
      friend: owner.faction === 'FRIEND',
      x: owner.x,
      y: owner.y,
      startX: owner.x,
      startY: owner.y,
      z: 4,
      angle: a,
      aimX: ax,
      aimY: ay,
      damage,
      splash,
      ownerId: owner.id,
      flightT: 0,
      flightTotal: flight,
      arcH: 70 + d * 0.16,
      ttl: flight + 0.5,
    });
  }

  /** air-launched guided missile */
  fireAGM(ctx: ProjectileContext, owner: Unit, target: Unit, damage: number, splash: number) {
    const a = angleOf(target.x - owner.x, target.y - owner.y);
    this.spawn({
      kind: 'MISSILE_AIR',
      friend: owner.faction === 'FRIEND',
      x: owner.x + Math.cos(a) * 6,
      y: owner.y + Math.sin(a) * 6,
      z: owner.isAir ? 40 : 2,
      angle: a,
      vx: Math.cos(a) * 190,
      vy: Math.sin(a) * 190,
      damage,
      splash,
      ownerId: owner.id,
      targetId: target.id,
      ttl: 7,
    });
    ctx.audio.missileLaunch(owner.x, owner.y);
  }

  /** SAM against aircraft */
  fireSAM(ctx: ProjectileContext, owner: Unit, target: Unit, damage: number) {
    const a = angleOf(target.x - owner.x, target.y - owner.y);
    this.spawn({
      kind: 'MISSILE_SPAA',
      friend: owner.faction === 'FRIEND',
      x: owner.x + Math.cos(a) * 4,
      y: owner.y + Math.sin(a) * 4,
      z: 3,
      angle: a,
      vx: Math.cos(a) * 150,
      vy: Math.sin(a) * 150,
      vz: 55,
      damage,
      splash: 0,
      ownerId: owner.id,
      targetId: target.id,
      ttl: 9,
    });
    ctx.audio.missileLaunch(owner.x, owner.y);
  }

  // ── naval weapons ───────────────────────────────────────

  /** naval gunfire: a flat ballistic arc, dispersion by range,
   *  and the splash language of shells finding the sea */
  fireNavalShell(
    ctx: SimContext,
    owner: Unit,
    muzzle: { x: number; y: number; angle: number },
    tx: number,
    ty: number,
    def: { calibre?: number; damage: number; barrels?: number },
    accuracy: number
  ) {
    const cal = def.calibre ?? 76;
    // dispersion grows with range — gunnery is a statistics problem
    const d = dist(owner.x, owner.y, tx, ty);
    const sigma = (14 + cal * 0.22) * (1 + d / 2400) * (1.4 - accuracy * 0.55);
    const g = () => (this.rng.next() + this.rng.next() + this.rng.next() - 1.5) * 0.8;
    const along = g() * sigma;
    const across = g() * sigma * 0.55;
    const fireAng = angleOf(tx - owner.x, ty - owner.y);
    const ax = tx + Math.cos(fireAng) * along - Math.sin(fireAng) * across;
    const ay = ty + Math.sin(fireAng) * along + Math.cos(fireAng) * across;
    const flight = 0.6 + d / (240 + cal * 1.6);
    this.spawn({
      kind: 'NAVAL_SHELL',
      friend: owner.faction === 'FRIEND',
      x: muzzle.x,
      y: muzzle.y,
      startX: muzzle.x,
      startY: muzzle.y,
      z: 6 + cal * 0.05,
      angle: fireAng,
      aimX: ax,
      aimY: ay,
      damage: def.damage,
      splash: cal * 0.12,
      ownerId: owner.id,
      calibre: cal,
      flightT: 0,
      flightTotal: flight,
      arcH: d * 0.03 + cal * 0.09,
      ttl: flight + 0.5,
    });
    // the gun speaks: flash, propellant wash, a sound with weight
    ctx.effects.muzzleFlash(muzzle.x, muzzle.y, fireAng, 0.9 + cal / 190);
    ctx.effects.spawnSmoke(muzzle.x + Math.cos(fireAng) * 4, muzzle.y + Math.sin(fireAng) * 4, {
      r: 2 + cal * 0.02,
      r1: 12 + cal * 0.1,
      life: 2.2,
      alpha: 0.3,
    });
    ctx.audio.navalGun(muzzle.x, muzzle.y, cal);
  }

  /** ship-to-ship / ship-to-shore missile — sea-skimming, winged */
  fireSSM(
    ctx: ProjectileContext,
    owner: Unit,
    launcher: { x: number; y: number },
    target: Unit,
    def: { damage: number }
  ) {
    const a = angleOf(target.x - launcher.x, target.y - launcher.y);
    this.spawn({
      kind: 'SSM',
      friend: owner.faction === 'FRIEND',
      x: launcher.x + Math.cos(a) * 8,
      y: launcher.y + Math.sin(a) * 8,
      z: 2,
      angle: a,
      vx: Math.cos(a) * 170,
      vy: Math.sin(a) * 170,
      damage: def.damage,
      splash: 16,
      ownerId: owner.id,
      targetId: target.id,
      ttl: 12,
    });
    // booster flare off the launcher
    ctx.effects.spawnSmoke(launcher.x, launcher.y, { r: 2.4, r1: 14, life: 1.6, alpha: 0.4 });
    ctx.audio.missileLaunch(launcher.x, launcher.y);
  }

  /** ship SAM — faction-correct air defence */
  fireNavalSAM(
    ctx: ProjectileContext,
    owner: Unit,
    launcher: { x: number; y: number },
    target: Unit,
    def: { damage: number }
  ) {
    const a = angleOf(target.x - launcher.x, target.y - launcher.y);
    this.spawn({
      kind: 'MISSILE_SPAA',
      friend: owner.faction === 'FRIEND',
      x: launcher.x + Math.cos(a) * 6,
      y: launcher.y + Math.sin(a) * 6,
      z: 8,
      angle: a,
      vx: Math.cos(a) * 160,
      vy: Math.sin(a) * 160,
      vz: 48,
      damage: def.damage,
      splash: 0,
      ownerId: owner.id,
      targetId: target.id,
      ttl: 10,
    });
    ctx.audio.missileLaunch(launcher.x, launcher.y);
  }

  /** torpedo — a pale shadow under the surface, running true */
  fireTorpedo(
    ctx: ProjectileContext,
    owner: Unit,
    tube: { x: number; y: number; angle: number },
    target: Unit,
    def: { damage: number; speed?: number; range: number }
  ) {
    this.spawn({
      kind: 'TORPEDO',
      friend: owner.faction === 'FRIEND',
      x: tube.x + Math.cos(tube.angle) * 3,
      y: tube.y + Math.sin(tube.angle) * 3,
      z: -1.5,
      angle: tube.angle,
      vx: Math.cos(tube.angle) * (def.speed ?? 46),
      vy: Math.sin(tube.angle) * (def.speed ?? 46),
      damage: def.damage,
      splash: 26,
      ownerId: owner.id,
      targetId: target.id,
      ttl: def.range / (def.speed ?? 46) + 1,
      calibre: 533,
      armDist: 90,
      runDist: 0,
    });
    // the soft pneumatic thump of tubes blowing clear
    ctx.effects.spawnWake(tube.x, tube.y, tube.angle, 3, 0.7, 27);
  }

  // ── simulation ─────────────────────────────────────────────

  update(dt: number, ctx: SimContext) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.t > p.ttl) {
        this.list.splice(i, 1);
        continue;
      }

      switch (p.kind) {
        case 'SHELL':
        case 'AUTO': {
          const px0 = p.x;
          const py0 = p.y;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          // mass in the flight path — rounds slam into buildings,
          // boulders and wrecks instead of ghosting through them
          if (ctx.obstacles) {
            const hit = ctx.obstacles.firstHit(px0, py0, p.x, p.y);
            if (hit) {
              p.x = hit.x;
              p.y = hit.y;
              this.impact(p, ctx);
              this.list.splice(i, 1);
              break;
            }
          }
          if (dist(p.x, p.y, p.aimX, p.aimY) < 10) {
            this.impact(p, ctx);
            this.list.splice(i, 1);
          }
          break;
        }
        case 'ARTY':
        case 'NAVAL_SHELL': {
          p.flightT += dt;
          const t = clamp(p.flightT / p.flightTotal, 0, 1);
          p.x = p.startX + (p.aimX - p.startX) * t;
          p.y = p.startY + (p.aimY - p.startY) * t;
          p.z = Math.sin(Math.PI * t) * p.arcH;
          p.angle = angleOf(p.aimX - p.startX, p.aimY - p.startY);
          const whistleOK = p.kind === 'ARTY' || (p.calibre ?? 0) >= 130;
          if (whistleOK && !p.whistled && p.flightTotal - p.flightT < 1.15) {
            p.whistled = true;
            ctx.audio.whistle(p.aimX, p.aimY);
          }
          if (t >= 1) {
            this.impact(p, ctx);
            this.list.splice(i, 1);
          }
          break;
        }
        case 'SSM': {
          const target = ctx.units.find((u) => u.id === p.targetId && !u.dead && !u.sinking);
          if (target) {
            const ta = angleOf(target.x - p.x, target.y - p.y);
            p.angle = rotateToward(p.angle, ta, 2.6 * dt * (1 + p.t));
            const speed = 185 + p.t * 24;
            p.vx = Math.cos(p.angle) * speed;
            p.vy = Math.sin(p.angle) * speed;
          } else {
            p.ttl = Math.min(p.ttl, p.t + 0.9);
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          this.trail(p, ctx, dt);
          const hitR = target && target.isShip ? 8 + target.def.length * 0.22 : 7;
          if (target && dist(p.x, p.y, target.x, target.y) < hitR) {
            this.impact(p, ctx);
            this.list.splice(i, 1);
          }
          break;
        }
        case 'TORPEDO': {
          const step = Math.hypot(p.vx, p.vy) * dt;
          p.runDist = (p.runDist ?? 0) + step;
          // a mild homing fish — the gyro keeps it honest
          const target = ctx.units.find((u) => u.id === p.targetId && !u.dead && !u.sinking);
          if (target && (p.runDist ?? 0) > 70) {
            const ta = angleOf(target.x - p.x, target.y - p.y);
            p.angle = rotateToward(p.angle, ta, 0.2 * dt);
            const sp = Math.hypot(p.vx, p.vy) || 46;
            p.vx = Math.cos(p.angle) * sp;
            p.vy = Math.sin(p.angle) * sp;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          // a thin seam of foam over the runner
          p.trailTimer -= dt;
          if (p.trailTimer <= 0) {
            p.trailTimer = 0.09;
            ctx.effects.spawnTorpedoWake(p.x, p.y);
          }
          // armed fish test their pistols against hulls
          if ((p.runDist ?? 0) > (p.armDist ?? 90)) {
            let hit: Unit | null = null;
            for (const u of ctx.units) {
              if (u.dead || u.sinking || u.isAir || !u.isShip) continue;
              if (u.faction === (p.friend ? 'FRIEND' : 'ENEMY')) continue;
              if (dist(p.x, p.y, u.x, u.y) < u.def.length * 0.42 + 7) {
                hit = u;
                break;
              }
            }
            if (hit) {
              this.impact(p, ctx);
              this.list.splice(i, 1);
              break;
            }
          }
          if (p.t >= p.ttl - 0.02) {
            // a fish that spent its fuel froths out quietly
            ctx.effects.spawnWaterSplash(p.x, p.y, 0.35, false);
          }
          break;
        }
        case 'MISSILE_AIR':
        case 'MISSILE_SPAA': {
          const target = ctx.units.find((u) => u.id === p.targetId && !u.dead);
          if (!target || target.dead) {
            // sail on and expire
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.ttl = Math.min(p.ttl, p.t + 0.8);
            this.trail(p, ctx, dt);
            break;
          }
          const ta = angleOf(target.x - p.x, target.y - p.y);
          p.angle = rotateToward(p.angle, ta, 3.4 * dt * (1 + p.t));
          const speed = 205 + p.t * 30;
          p.vx = Math.cos(p.angle) * speed;
          p.vy = Math.sin(p.angle) * speed;
          const mx0 = p.x;
          const my0 = p.y;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          // a missile that flies into a building dies against the
          // building — cover means something against air power too
          if (p.kind === 'MISSILE_AIR' && ctx.obstacles) {
            const hit = ctx.obstacles.firstHit(mx0, my0, p.x, p.y);
            if (hit) {
              p.x = hit.x;
              p.y = hit.y;
              this.impact(p, ctx);
              this.list.splice(i, 1);
              break;
            }
          }
          if (p.kind === 'MISSILE_SPAA') {
            p.z += p.vz * dt;
            p.vz -= 30 * dt;
            // proximity to aircraft → evasion roll
            const d = dist(p.x, p.y, target.x, target.y);
            if (d < 230 && !p.defeated) {
              p.defeated = true;
              if (this.rng.next() < 0.34) {
                // flares defeat the missile
                target.onEvaded?.();
                p.targetId = -1;
                p.angle += this.rng.range(-1.4, 1.4);
                p.ttl = Math.min(p.ttl, p.t + 1.1);
                for (let f = 0; f < 5; f++) {
                  ctx.effects.spawnSmoke(p.x + this.rng.range(-8, 8), p.y + this.rng.range(-8, 8), {
                    r: 1,
                    r1: 5,
                    life: 0.8,
                    alpha: 0.5,
                  });
                }
                break;
              }
            }
          }
          this.trail(p, ctx, dt);
          if (dist(p.x, p.y, target.x, target.y) < 7) {
            this.impact(p, ctx);
            this.list.splice(i, 1);
          }
          break;
        }
      }
    }
  }

  private trail(p: Projectile, ctx: ProjectileContext, dt: number) {
    p.trailTimer -= dt;
    if (p.trailTimer <= 0) {
      p.trailTimer = 0.035;
      ctx.effects.spawnSmoke(p.x, p.y, {
        r: 0.9,
        r1: 6.5,
        life: 1.5,
        alpha: 0.26,
        vx: -p.vx * 0.02,
        vy: -p.vy * 0.02,
      });
    }
  }

  private impact(p: Projectile, ctx: SimContext) {
    const fx = ctx.effects;
    const audio = ctx.audio;
    // ── does the round find the sea? ── the two explosion
    // languages split here: water columns vs ink craters
    const overWater = ctx.terrain.isWater(p.x, p.y) && !ctx.terrain.bridgeAt(p.x, p.y, 22);
    switch (p.kind) {
      case 'SHELL':
        if (overWater) {
          fx.spawnWaterSplash(p.x, p.y, 0.42, false);
          audio.bigSplash(p.x, p.y, 85);
          this.applyDamage(p, ctx, p.x, p.y);
          return;
        }
        fx.spawnExplosion(p.x, p.y, {
          dir: p.angle,
          dirStrength: 0.85,
          scale: 0.55,
          crater: 3.2,
          smoke: 2,
          debris: 3,
          stains: 10,
          sound: 'shell',
          shake: 1.2,
        });
        break;
      case 'AUTO':
        if (overWater) {
          fx.spawnWaterSplash(p.x, p.y, 0.16, false);
          return;
        }
        fx.spawnExplosion(p.x, p.y, {
          dir: p.angle,
          dirStrength: 1,
          scale: 0.22,
          crater: 0,
          smoke: 0,
          debris: 0,
          stains: 2,
          sound: 'small',
          shake: 0,
        });
        break;
      case 'ARTY':
        if (overWater) {
          fx.spawnWaterSplash(p.x, p.y, 1.5, true);
          audio.bigSplash(p.x, p.y, 155);
          this.applyDamage(p, ctx, p.x, p.y);
          return;
        }
        fx.spawnExplosion(p.x, p.y, {
          dir: this.rng.range(0, Math.PI * 2),
          dirStrength: 0.1,
          scale: 1.6,
          crater: 8.5,
          smoke: 6,
          debris: 10,
          stains: 30,
          ring: true,
          sound: 'arty',
          shake: 3.2,
        });
        break;
      case 'NAVAL_SHELL': {
        const cal = p.calibre ?? 76;
        if (overWater) {
          // THE water column — a shell hitting the sea throws a
          // vertical plume, spray, and ink-contaminated foam
          fx.spawnWaterSplash(p.x, p.y, 0.45 + cal / 110, cal >= 200);
          audio.bigSplash(p.x, p.y, cal);
          this.applyDamage(p, ctx, p.x, p.y);
          return;
        }
        const gunScale = 0.42 + cal / 190;
        fx.spawnExplosion(p.x, p.y, {
          dir: p.angle,
          dirStrength: 0.6,
          scale: gunScale,
          crater: cal / 16,
          smoke: 2 + cal / 90,
          debris: 3 + cal / 70,
          stains: 10 + cal / 8,
          ring: cal >= 130,
          sound: 'shell',
          shake: 1 + cal / 130,
        });
        break;
      }
      case 'SSM':
        if (overWater) {
          fx.spawnWaterSplash(p.x, p.y, 0.9, false);
          audio.bigSplash(p.x, p.y, 240);
          this.applyDamage(p, ctx, p.x, p.y);
          return;
        }
        fx.spawnExplosion(p.x, p.y, {
          dir: p.angle,
          dirStrength: 0.4,
          scale: 1.3,
          crater: 6,
          smoke: 5,
          debris: 6,
          stains: 22,
          ring: true,
          sound: 'missile',
          shake: 2.6,
        });
        break;
      case 'TORPEDO': {
        // a torpedo detonation is water and violence — plume,
        // spray, a shock ring across the surface
        fx.spawnWaterSplash(p.x, p.y, 1.9, true);
        fx.spawnWaterSplash(p.x + this.rng.range(-8, 8), p.y + this.rng.range(-8, 8), 1.1, false);
        audio.bigSplash(p.x, p.y, 533);
        break;
      }
      case 'MISSILE_AIR':
        if (overWater) {
          fx.spawnWaterSplash(p.x, p.y, 0.7, false);
          audio.bigSplash(p.x, p.y, 160);
          this.applyDamage(p, ctx, p.x, p.y);
          return;
        }
        fx.spawnExplosion(p.x, p.y, {
          dir: p.angle,
          dirStrength: 0.4,
          scale: 1.05,
          crater: 4.5,
          smoke: 4,
          debris: 5,
          stains: 18,
          ring: true,
          sound: 'missile',
          shake: 2.2,
        });
        break;
      case 'MISSILE_SPAA':
        if (overWater) {
          fx.spawnWaterSplash(p.x, p.y, 0.4, false);
          return;
        }
        fx.spawnExplosion(p.x, p.y, {
          dir: p.angle,
          dirStrength: 0.5,
          scale: 0.8,
          crater: 2.5,
          smoke: 3,
          debris: 3,
          stains: 8,
          sound: 'missile',
          shake: 1.4,
        });
        break;
    }
    // damage
    this.applyDamage(p, ctx, p.x, p.y);
    // the world takes the hit too — timber, stone, concrete, roofs
    if (ctx.obstacles) {
      switch (p.kind) {
        case 'SHELL':
          ctx.obstacles.damageAt(ctx, p.x, p.y, 9, p.damage * 2.0, p.kind);
          break;
        case 'AUTO':
          ctx.obstacles.damageAt(ctx, p.x, p.y, 2.5, 5, p.kind);
          break;
        case 'ARTY':
          ctx.obstacles.damageAt(ctx, p.x, p.y, Math.max(20, p.splash), p.damage * 1.7, p.kind);
          break;
        case 'NAVAL_SHELL':
          ctx.obstacles.damageAt(ctx, p.x, p.y, Math.max(12, p.splash), p.damage * (1 + (p.calibre ?? 76) / 160), p.kind);
          break;
        case 'SSM':
        case 'MISSILE_AIR':
          ctx.obstacles.damageAt(ctx, p.x, p.y, Math.max(10, p.splash * 0.7), p.damage * 2.2, p.kind);
          break;
        default:
          break;
      }
    }
  }

  private applyDamage(p: Projectile, ctx: SimContext, x: number, y: number) {
    const owner = ctx.units.find((u) => u.id === p.ownerId) ?? null;
    for (const u of ctx.units) {
      if (u.dead || u.sinking || u.faction === (p.friend ? 'FRIEND' : 'ENEMY')) continue;
      const d = dist(u.x, u.y, x, y);
      if (p.splash > 0) {
        if (d < p.splash) {
          const falloff = 1 - (d / p.splash) * 0.65;
          u.takeDamage(p.damage * falloff, ctx, p.kind, owner ?? undefined);
        } else if (d < p.splash * 1.8) {
          // a near miss is still a near miss — spray, blast, fear
          const near = 1 - (d - p.splash) / (p.splash * 0.8);
          u.suppression = Math.min(1, u.suppression + near * (u.isShip ? 0.18 : 0.32));
          if (owner) {
            u.lastAttacker = owner;
            u.lastAttackedT = ctx.time;
          }
        }
      } else if (d < (u.isShip ? u.def.length * 0.42 : 8)) {
        // aspect: where the round strikes the hull matters
        let aspect = 1;
        if ((p.kind === 'SHELL' || p.kind === 'MISSILE_AIR') && owner && !u.isAir && !u.isShip) {
          const rel = angleOf(x - u.x, y - u.y);
          const facing = Math.abs(
            Math.atan2(Math.sin(rel - u.angle), Math.cos(rel - u.angle))
          );
          if (facing > Math.PI * 0.62) aspect = 1.65; // rear
          else if (facing > Math.PI * 0.34) aspect = 1.3; // flank
        }
        u.takeDamage(p.damage, ctx, p.kind, owner ?? undefined, aspect);
      } else if (d < 16 && (p.kind === 'SHELL' || p.kind === 'AUTO')) {
        // rounds cracking past — suppressing even when they miss
        u.suppression = Math.min(1, u.suppression + (p.kind === 'SHELL' ? 0.1 : 0.045));
      }
    }
  }

  // ── drawing ────────────────────────────────────────────────

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      switch (p.kind) {
        case 'SHELL': {
          // sharp dark dart with a hot trail
          ctx.strokeStyle = 'rgba(20,17,11,0.6)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.fillStyle = '#0e0c08';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.05, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'AUTO': {
          ctx.strokeStyle = p.friend ? 'rgba(20,17,11,0.78)' : 'rgba(66,60,48,0.8)';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(p.x - p.vx * 0.028, p.y - p.vy * 0.028);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          break;
        }
        case 'ARTY':
        case 'NAVAL_SHELL': {
          // ground shadow
          ctx.fillStyle = 'rgba(25,22,14,0.14)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 2.4, 1.7, 0, 0, Math.PI * 2);
          ctx.fill();
          // shell in the air (offset by altitude)
          const ax = p.x;
          const ay = p.y - p.z * 0.42;
          const big = p.kind === 'NAVAL_SHELL' ? 1 + (p.calibre ?? 76) / 220 : 1;
          ctx.strokeStyle = 'rgba(20,17,11,0.25)';
          ctx.lineWidth = 0.7 * big;
          ctx.beginPath();
          ctx.moveTo(ax - Math.cos(p.angle) * 5 * big, ay - Math.sin(p.angle) * 5 * big);
          ctx.lineTo(ax, ay);
          ctx.stroke();
          ctx.fillStyle = '#100e09';
          ctx.beginPath();
          ctx.arc(ax, ay, 1.05 * big, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'SSM': {
          // sea-skimmer — low over the water, hot exhaust
          ctx.fillStyle = 'rgba(25,22,14,0.12)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 2.0, 1.2, 0, 0, Math.PI * 2);
          ctx.fill();
          const my = p.y - p.z * 0.12;
          ctx.save();
          ctx.translate(p.x, my);
          ctx.rotate(p.angle);
          // small swept wings
          ctx.fillStyle = '#14110b';
          ctx.fillRect(-2.6, -1.7, 1.6, 3.4);
          ctx.fillRect(-2.4, -0.5, 4.8, 1.0);
          // exhaust flare
          ctx.fillStyle = 'rgba(255,253,244,0.85)';
          ctx.fillRect(-3.9, -0.3, 1.4, 0.6);
          ctx.restore();
          break;
        }
        case 'TORPEDO': {
          // barely there — a dark sliver under the glass, foam seam above
          ctx.strokeStyle = 'rgba(30,34,38,0.5)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(p.x - Math.cos(p.angle) * 4.5, p.y - Math.sin(p.angle) * 4.5);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(240,240,236,0.5)';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(p.x - Math.cos(p.angle) * 2.2, p.y - Math.sin(p.angle) * 2.2);
          ctx.lineTo(p.x + Math.cos(p.angle) * 1.2, p.y + Math.sin(p.angle) * 1.2);
          ctx.stroke();
          break;
        }
        case 'MISSILE_AIR':
        case 'MISSILE_SPAA': {
          // ground shadow
          ctx.fillStyle = 'rgba(25,22,14,0.12)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 1.6, 1.1, 0, 0, Math.PI * 2);
          ctx.fill();
          const mx = p.x;
          const my = p.y - (p.z > 0 ? p.z * 0.2 : 0);
          ctx.save();
          ctx.translate(mx, my);
          ctx.rotate(p.angle);
          // body
          ctx.fillStyle = '#14110b';
          ctx.fillRect(-2.4, -0.5, 4.8, 1.0);
          // exhaust flare
          ctx.fillStyle = 'rgba(255,253,244,0.8)';
          ctx.fillRect(-3.6, -0.28, 1.3, 0.56);
          ctx.restore();
          break;
        }
      }
    }
  }
}
