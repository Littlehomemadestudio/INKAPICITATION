// ─────────────────────────────────────────────────────────────
// PAPER STORM · unit simulation
// Movement, pathfinding, turrets, weapons, aircraft sorties.
// ─────────────────────────────────────────────────────────────

import { UNIT_DEFS, UnitDef, UnitType } from './unitDefs';
import type { Faction, IntelState, Order, UnitActivity, Controller } from '../core/types';
import { Vec2, clamp, dist, angleOf, angDiff, rotateToward, RNG } from '../core/math';
import type { Terrain } from '../world/terrain';
import type { EffectsSystem } from './effects';
import type { ProjectileSystem } from './projectiles';
import type { AudioEngine } from '../audio/audio';
import type { InkEconomy } from '../systems/economy';
import { gridString } from '../core/math';

export interface SimContext {
  units: Unit[];
  terrain: Terrain;
  effects: EffectsSystem;
  projectiles: ProjectileSystem;
  audio: AudioEngine;
  economy: InkEconomy;
  time: number;
  rng: RNG;
  log: (text: string, level?: 'info' | 'contact' | 'alert' | 'objective' | 'economy') => void;
}

export type AirState = 'STANDBY' | 'INBOUND' | 'PATROL' | 'RTB' | 'REARM' | 'DOWN';

let NEXT_ID = 1;

export class Unit {
  id = NEXT_ID++;
  def: UnitDef;
  faction: Faction;
  callsign: string;

  x: number;
  y: number;
  angle = -Math.PI / 2;
  turretAngle = 0;
  radarAngle = 0;
  hp: number;
  ammo: number;
  dead = false;

  // movement
  path: Vec2[] = [];
  dest: Vec2 | null = null;
  speedNow = 0;
  stuckT = 0;

  // combat
  target: Unit | null = null;
  reloadT = 0;
  burstLeft = 0;
  burstT = 0;
  visibleTargets: Unit[] = [];
  fireMissionLeft = 0;
  fireMissionArea: Vec2 | null = null;

  // orders
  order: Order = { type: 'HOLD' };
  stance: 'AGGRESSIVE' | 'HOLD' = 'AGGRESSIVE';
  defendPos: Vec2 | null = null;

  // intel (enemy units as seen by the player)
  intel: IntelState = 'HIDDEN';
  lastSeen = -999;
  knownX = 0;
  knownY = 0;

  // factories
  factoryId: string | null = null;
  factoryCtl: Controller = 'ENEMY';
  captureT = 0;
  capturing: Controller | null = null;

  // deployment
  isReinforcement = false;

  // aircraft
  airState: AirState = 'STANDBY';
  patrol: Vec2 = { x: 2048, y: 1536 };
  orbitDir = 1;
  bank = 0;
  rearmT = 0;
  entryUsed = false;

  // fx
  recoil = 0;
  dustT = 0;
  trackDist = 0;
  lastFireT = -999;
  damageFlash = 0;

  rng: RNG;

  constructor(type: UnitType, faction: Faction, x: number, y: number, callsign: string, seedBase: number) {
    this.def = UNIT_DEFS[type];
    this.faction = faction;
    this.x = x;
    this.y = y;
    this.callsign = callsign;
    this.hp = this.def.hp;
    this.ammo = this.def.ammo;
    this.turretAngle = this.angle;
    this.rng = new RNG((seedBase + this.id * 7919) >>> 0);
    if (this.def.isAir) {
      this.airState = 'STANDBY';
    }
  }

  get isAir(): boolean {
    return this.def.isAir;
  }

  // ── orders ─────────────────────────────────────────────────

  orderMove(dest: Vec2, ctx: SimContext) {
    this.order = { type: 'MOVE', pos: dest };
    this.dest = { ...dest };
    this.fireMissionLeft = 0;
    this.fireMissionArea = null;
    this.path = ctx.terrain.findPath({ x: this.x, y: this.y }, dest);
    this.pathIndexStart();
  }

  orderAttackMove(dest: Vec2, ctx: SimContext) {
    this.order = { type: 'ATTACK_MOVE', pos: dest };
    this.dest = { ...dest };
    this.path = ctx.terrain.findPath({ x: this.x, y: this.y }, dest);
    this.pathIndexStart();
  }

  orderAttack(target: Unit, ctx: SimContext) {
    this.order = { type: 'ATTACK', targetId: target.id };
    this.target = target;
    this.fireMissionLeft = 0;
    this.fireMissionArea = null;
    if (!this.isAir && this.def.projectile !== 'ARTY') {
      // close to weapon range
      this.approachTarget(target, ctx);
    }
  }

  orderStop() {
    this.order = { type: 'STOP' };
    this.path = [];
    this.dest = null;
    this.fireMissionLeft = 0;
    this.fireMissionArea = null;
    this.speedNow = 0;
  }

  orderHold() {
    this.order = { type: 'HOLD' };
    this.path = [];
    this.dest = null;
    this.fireMissionLeft = 0;
    this.fireMissionArea = null;
  }

  orderFireMission(area: Vec2) {
    this.order = { type: 'FIRE_MISSION', area };
    this.fireMissionLeft = 6;
    this.fireMissionArea = { ...area };
    this.path = [];
    this.dest = null;
  }

  orderPatrol(pos: Vec2) {
    if (this.isAir) {
      this.patrol = { ...pos };
    }
  }

  private approachTarget(target: Unit, ctx: SimContext) {
    const d = dist(this.x, this.y, target.x, target.y);
    if (d > this.def.range * 0.85) {
      const t = 0.8;
      const px = this.x + (target.x - this.x) * t;
      const py = this.y + (target.y - this.y) * t;
      this.path = ctx.terrain.findPath({ x: this.x, y: this.y }, { x: px, y: py });
      this.dest = { x: px, y: py };
      this.pathIndexStart();
    }
  }

  private pathIndexStart() {
    // drop the first waypoint if it is behind us
    if (this.path.length > 1) {
      const a = this.path[0];
      const b = this.path[1];
      const toB = angleOf(b.x - this.x, b.y - this.y);
      const toA = angleOf(a.x - this.x, a.y - this.y);
      if (Math.abs(angDiff(toA, toB)) > Math.PI * 0.6) this.path.shift();
    }
  }

  // ── main update ────────────────────────────────────────────

  update(dt: number, ctx: SimContext) {
    if (this.dead) return;
    if (this.def.kind === 'FACTORY') {
      // static structure — no movement, no weapons
      this.damageFlash = Math.max(0, this.damageFlash - dt * 3);
      return;
    }
    this.reloadT -= dt;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 3);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    if (this.def.kind === 'SPAA') this.radarAngle += dt * 1.35;

    if (this.isAir) {
      this.updateAir(dt, ctx);
      return;
    }

    this.updateGroundMovement(dt, ctx);
    this.updateTargeting(dt, ctx);
    this.updateFiring(dt, ctx);
    this.updateSurfaceFx(dt, ctx);
  }

  // ── ground movement ────────────────────────────────────────

  private updateGroundMovement(dt: number, ctx: SimContext) {
    // ATTACK order: keep approaching if target far
    if (this.order.type === 'ATTACK' && this.target && !this.target.dead) {
      const d = dist(this.x, this.y, this.target.x, this.target.y);
      if (d > this.def.range * 0.9 && (this.path.length === 0 || !this.dest)) {
        this.approachTarget(this.target, ctx);
      }
      if (d < this.def.range * 0.55 && this.stance === 'HOLD') {
        this.path = [];
        this.dest = null;
      }
    }
    // FIRE_MISSION: hold position
    if (this.order.type === 'FIRE_MISSION') {
      this.path = [];
      this.dest = null;
    }

    if (this.path.length === 0) {
      // decelerate
      this.speedNow = Math.max(0, this.speedNow - dt * this.def.speed * 1.6);
      // rotate turret home slowly
      if (!this.target) {
        this.turretAngle = rotateToward(this.turretAngle, this.angle, this.def.turretRate * 0.35 * dt);
      }
      return;
    }

    const wp = this.path[0];
    const d = dist(this.x, this.y, wp.x, wp.y);
    const arriveR = this.path.length === 1 ? 5 : 14;
    if (d < arriveR) {
      this.path.shift();
      if (this.path.length === 0) {
        this.dest = null;
        this.speedNow = 0;
        this.isReinforcement = false;
      }
      return;
    }

    const desired = angleOf(wp.x - this.x, wp.y - this.y);
    const diff = angDiff(this.angle, desired);
    const turnCap = this.def.turnRate * dt;
    this.angle = rotateToward(this.angle, desired, turnCap);

    // slow down on sharp turns
    const turnFactor = 1 - clamp(Math.abs(diff) / Math.PI, 0, 1) * 0.75;
    // terrain speed
    let terr = 1;
    const forest = ctx.terrain.forestDensity(this.x, this.y);
    if (forest > 0.42) terr *= 0.58;
    const slope = ctx.terrain.slopeAt(this.x, this.y);
    terr *= 1 / (1 + slope * 2.6);
    const road = ctx.terrain.roadFactor(this.x, this.y);
    if (road > 0.3) terr *= 1.25;

    const targetSpeed = this.def.speed * turnFactor * clamp(terr, 0.3, 1.35);
    this.speedNow += clamp(targetSpeed - this.speedNow, -this.def.speed * 2 * dt, this.def.speed * 1.4 * dt);

    const step = this.speedNow * dt;
    this.x += Math.cos(this.angle) * step;
    this.y += Math.sin(this.angle) * step;

    // separation from nearby friendly units
    for (const o of ctx.units) {
      if (o === this || o.dead || o.isAir) continue;
      const od = dist(this.x, this.y, o.x, o.y);
      const minD = (this.def.length + o.def.length) * 0.42;
      if (od < minD && od > 0.01) {
        const push = ((minD - od) / minD) * 26 * dt;
        const a = angleOf(this.x - o.x, this.y - o.y);
        this.x += Math.cos(a) * push;
        this.y += Math.sin(a) * push;
      }
    }

    // stuck detection: nudge sideways
    if (this.speedNow < 0.6 && this.path.length > 0) {
      this.stuckT += dt;
      if (this.stuckT > 2.4) {
        this.stuckT = 0;
        const side = this.rng.chance(0.5) ? 1 : -1;
        this.angle += side * 0.7;
        this.x += Math.cos(this.angle) * 3;
        this.y += Math.sin(this.angle) * 3;
      }
    } else {
      this.stuckT = 0;
    }

    this.x = clamp(this.x, 20, ctx.terrain.W - 20);
    this.y = clamp(this.y, 20, ctx.terrain.H - 20);
  }

  // ── targeting ──────────────────────────────────────────────

  private updateTargeting(dt: number, ctx: SimContext) {
    void dt;
    // validate current target
    if (this.target && (this.target.dead || !this.sees(this.target))) {
      this.target = null;
    }
    // pick new target from currently visible enemies
    if (!this.target || this.target.dead) {
      let best: Unit | null = null;
      let bestScore = -Infinity;
      for (const u of this.visibleTargets) {
        if (u.dead || u.faction === this.faction) continue;
        // factories are engaged on explicit order only — no one wastes
        // main gun rounds on empty halls by accident
        if (u.def.kind === 'FACTORY') continue;
        let s = 100 - dist(this.x, this.y, u.x, u.y) / 30;
        // role preferences
        if (this.def.kind === 'MBT') s += u.def.kind === 'MBT' ? 24 : u.def.kind === 'SPAA' ? 30 : 0;
        if (this.def.kind === 'IFV' || this.def.kind === 'REC') s += u.def.kind === 'REC' ? 18 : u.def.kind === 'IFV' ? 10 : 0;
        if (this.def.kind === 'SPAA') continue; // air defence does not engage ground
        if (u.isAir && !this.def.canHitAir) continue;
        if (s > bestScore) {
          bestScore = s;
          best = u;
        }
      }
      if (best) this.target = best;
    }
    // turret
    if (this.target) {
      const lead = this.def.projectile === 'SHELL' ? this.leadAngle(this.target, 470) : angleOf(this.target.x - this.x, this.target.y - this.y);
      this.turretAngle = rotateToward(this.turretAngle, lead, this.def.turretRate * dt);
    }
  }

  private leadAngle(target: Unit, projSpeed: number): number {
    const d = dist(this.x, this.y, target.x, target.y);
    const t = d / projSpeed;
    const px = target.x + Math.cos(target.angle) * target.speedNow * t;
    const py = target.y + Math.sin(target.angle) * target.speedNow * t;
    return angleOf(px - this.x, py - this.y);
  }

  sees(u: Unit): boolean {
    return this.visibleTargets.includes(u);
  }

  // ── firing ─────────────────────────────────────────────────

  private updateFiring(dt: number, ctx: SimContext) {
    // artillery fire missions (player-directed or AI-directed)
    if (this.def.projectile === 'ARTY') {
      if (this.fireMissionArea && this.fireMissionLeft > 0 && this.reloadT <= 0 && this.ammo > 0 && this.speedNow < 0.6) {
        ctx.projectiles.fireArtillery(ctx, this, this.fireMissionArea.x, this.fireMissionArea.y, this.def.damage, this.def.splash, 38);
        this.ammo--;
        this.fireMissionLeft--;
        this.reloadT = this.def.reload;
        this.recoil = 1.4;
        this.lastFireT = ctx.time;
        if (this.fireMissionLeft === 0) {
          ctx.log(`${this.callsign} · FIRE MISSION COMPLETE`);
          this.fireMissionArea = null;
        }
        if (this.ammo === 0) ctx.log(`${this.callsign} · AMMUNITION EXPENDED`, 'alert');
      }
      return;
    }

    // burst weapons
    if (this.burstLeft > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0 && this.target && !this.target.dead) {
        this.burstT = this.def.burstInterval;
        this.burstLeft--;
        ctx.projectiles.fireAuto(ctx, this, this.target.x, this.target.y, this.def.damage);
        this.ammo--;
        this.recoil = 0.4;
        this.lastFireT = ctx.time;
        if (this.ammo <= 0) {
          this.burstLeft = 0;
          ctx.log(`${this.callsign} · AMMUNITION EXPENDED`, 'alert');
        }
      }
      return;
    }

    if (!this.target || this.target.dead || this.reloadT > 0 || this.ammo <= 0) return;
    if (this.stance === 'HOLD' && this.order.type === 'HOLD' && false) return;

    const d = dist(this.x, this.y, this.target.x, this.target.y);
    if (d > this.def.range || d < this.def.minRange) return;
    if (this.target.isAir && !this.def.canHitAir) return;

    const aimAngle = this.def.projectile === 'SHELL' ? this.leadAngle(this.target, 470) : angleOf(this.target.x - this.x, this.target.y - this.y);
    const aligned = Math.abs(angDiff(this.turretAngle, aimAngle));

    if (this.def.projectile === 'AUTO') {
      if (aligned < 0.14) {
        this.burstLeft = this.def.burst;
        this.burstT = 0;
        this.reloadT = this.def.reload;
      }
    } else if (this.def.projectile === 'SHELL') {
      if (aligned < 0.05) {
        ctx.projectiles.fireShell(ctx, this, this.target.x, this.target.y, this.def.damage, this.def.accuracy);
        this.ammo--;
        this.reloadT = this.def.reload;
        this.recoil = 1.0;
        this.lastFireT = ctx.time;
        if (this.ammo <= 0) ctx.log(`${this.callsign} · AMMUNITION EXPENDED`, 'alert');
      }
    } else if (this.def.projectile === 'MISSILE_SPAA') {
      if (aligned < 0.2 && this.target.isAir) {
        ctx.projectiles.fireSAM(ctx, this, this.target, this.def.damage);
        this.ammo--;
        this.reloadT = this.def.reload;
        this.recoil = 0.6;
        if (this.ammo <= 0) ctx.log(`ENEMY AD · SALVO EXHAUSTED`, 'info');
      }
    }
  }

  // ── surface fx: dust & tracks ──────────────────────────────

  private updateSurfaceFx(dt: number, ctx: SimContext) {
    if (this.speedNow > this.def.speed * 0.45) {
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.24;
        const back = angleOf(-Math.cos(this.angle), -Math.sin(this.angle));
        ctx.effects.spawnDust(
          this.x + Math.cos(this.angle) * -this.def.length * 0.45 + Math.cos(back) * 2,
          this.y + Math.sin(this.angle) * -this.def.length * 0.45 + Math.sin(back) * 2,
          Math.cos(back) * 4,
          Math.sin(back) * 4
        );
      }
      this.trackDist += this.speedNow * dt;
      if (this.trackDist > 3) {
        this.trackDist = 0;
        ctx.effects.stampTrack(this.x, this.y, this.angle, this.def.width * 0.9);
      }
    }
  }

  // ── aircraft ───────────────────────────────────────────────

  private updateAir(dt: number, ctx: SimContext) {
    const speed = this.def.speed;

    switch (this.airState) {
      case 'STANDBY':
        this.rearmT -= dt;
        break;

      case 'INBOUND':
      case 'PATROL': {
        // orbit the patrol point
        const R = 640;
        const dx = this.x - this.patrol.x;
        const dy = this.y - this.patrol.y;
        const d = Math.hypot(dx, dy) || 1;
        const orbitA = angleOf(dx, dy);
        let desired: number;
        if (d > R * 1.6) {
          desired = angleOf(this.patrol.x - this.x, this.patrol.y - this.y);
        } else {
          // tangential heading, correct radius drift
          const radialErr = (d - R) / R;
          desired = orbitA + Math.PI / 2 * this.orbitDir + clamp(radialErr, -0.7, 0.7) * this.orbitDir;
        }
        const diff = angDiff(this.angle, desired);
        const turn = clamp(diff, -this.def.turnRate * dt, this.def.turnRate * dt);
        this.angle += turn;
        this.bank = clamp(this.bank + (turn / (this.def.turnRate * dt || 1) - this.bank) * dt * 3, -1, 1);
        this.x += Math.cos(this.angle) * speed * dt;
        this.y += Math.sin(this.angle) * speed * dt;

        // arrive on station
        if (this.airState === 'INBOUND' && Math.hypot(this.x - this.patrol.x, this.y - this.patrol.y) < R * 1.6) {
          this.airState = 'PATROL';
        }

        // engage ground targets in range while orbiting
        if (this.ammo > 0 && this.reloadT <= 0 && (this.airState === 'PATROL' || this.airState === 'INBOUND')) {
          for (const u of this.visibleTargets) {
            if (u.dead || u.isAir || u.def.kind === 'FACTORY') continue;
            const dd = dist(this.x, this.y, u.x, u.y);
            if (dd < this.def.range) {
              const toT = angleOf(u.x - this.x, u.y - this.y);
              if (Math.abs(angDiff(this.angle, toT)) < 0.4) {
                ctx.projectiles.fireAGM(ctx, this, u, this.def.damage, this.def.splash);
                this.ammo--;
                this.reloadT = this.def.reload;
                if (this.ammo === 0) {
                  ctx.log(`${this.callsign} · ORDnANCE EXPENDED — RTB`, 'info');
                  this.airState = 'RTB';
                }
                break;
              }
            }
          }
        }
        if (this.hp < this.def.hp * 0.4 && this.airState === 'PATROL') {
          ctx.log(`${this.callsign} · AIRFRAME CRITICAL — RTB`, 'alert');
          this.airState = 'RTB';
        }
        // despawn when far off map
        if (this.x < -300 || this.y < -300 || this.x > ctx.terrain.W + 300 || this.y > ctx.terrain.H + 300) {
          this.airState = 'REARM';
          this.rearmT = 38;
          this.hp = Math.max(this.hp, this.def.hp * 0.55);
          this.damageSmokeT = 0;
        }
        break;
      }

      case 'RTB': {
        // exit toward SW
        const desired = angleOf(-600 - this.x, 3300 - this.y);
        const diff = angDiff(this.angle, desired);
        this.angle += clamp(diff, -this.def.turnRate * dt, this.def.turnRate * dt);
        this.x += Math.cos(this.angle) * speed * dt;
        this.y += Math.sin(this.angle) * speed * dt;
        this.bank = clamp(this.bank + (Math.sign(diff) - this.bank) * dt * 2, -1, 1);
        if (this.x < -260 || this.y > ctx.terrain.H + 260) {
          this.airState = 'REARM';
          this.rearmT = 34;
          this.hp = Math.max(this.hp, this.def.hp * 0.6);
        }
        break;
      }

      case 'REARM': {
        this.rearmT -= dt;
        if (this.rearmT <= 0) {
          this.airState = 'INBOUND';
          this.ammo = this.def.ammo;
          this.hp = this.def.hp;
          this.x = 200;
          this.y = ctx.terrain.H - 60;
          this.angle = -Math.PI / 3;
          ctx.log(`${this.callsign} · ON STATION — INBOUND`, 'info');
        }
        break;
      }

      case 'DOWN':
        break;
    }

    // aircraft damaged smoke
    if (this.hp < this.def.hp * 0.55 && (this.airState === 'PATROL' || this.airState === 'RTB')) {
      this.damageSmokeT -= dt;
      if (this.damageSmokeT <= 0) {
        this.damageSmokeT = 0.22;
        ctx.effects.spawnSmoke(this.x, this.y, { r: 1.6, r1: 9, life: 2.4, alpha: 0.34 });
      }
    }

    // separation from other aircraft is unnecessary (only 2, offset patrols)
    void this.turretAngle;
  }

  damageSmokeT = 0;

  onEvaded() {
    // flare pop — visual handled by projectile system
  }

  /** launch aircraft from standby */
  launchAir(patrol: Vec2) {
    this.patrol = { ...patrol };
    this.airState = 'INBOUND';
    this.ammo = this.def.ammo;
    this.hp = this.def.hp;
    this.x = 200;
    this.y = 3200;
    this.angle = -Math.PI / 3;
  }

  // ── damage ─────────────────────────────────────────────────

  takeDamage(dmg: number, ctx: SimContext, projKind?: string) {
    if (this.dead) return;
    let d = dmg;
    if (projKind === 'AUTO') {
      if (this.def.kind === 'MBT') d *= 0.28;
      else if (this.def.kind === 'IFV') d *= 0.7;
      else if (this.def.kind === 'HQ') d *= 0.12;
      else if (this.def.kind === 'FACTORY') d *= 0.06;
    }
    if (projKind === 'SHELL' && this.def.kind === 'HQ') d *= 0.55;
    if (projKind === 'SHELL' && this.def.kind === 'FACTORY') d *= 0.8;
    if (projKind === 'MISSILE_AIR' && this.def.kind === 'HQ') d *= 0.8;
    if (projKind === 'MISSILE_AIR' && this.def.kind === 'FACTORY') d *= 1.25;
    if (projKind === 'ARTY' && this.def.kind === 'FACTORY') d *= 1.15;
    this.hp -= d;
    this.damageFlash = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(ctx);
    }
  }

  die(ctx: SimContext) {
    this.dead = true;
    const fx = ctx.effects;
    if (this.def.kind === 'FACTORY') {
      // ── an ink works dies spectacularly ─────────────────────
      // initial eruption
      fx.spawnExplosion(this.x, this.y, {
        dir: this.rng.range(0, Math.PI * 2),
        dirStrength: 0.3,
        scale: 4.6,
        crater: 18,
        smoke: 18,
        debris: 26,
        stains: 90,
        ring: true,
        sound: 'kill',
        shake: 8,
      });
      // secondary structural collapses rolling through the plant
      fx.scheduleBlasts(this.x, this.y, {
        count: 8,
        duration: 5.5,
        spread: 60,
        scaleMin: 1.6,
        scaleMax: 3.1,
        delay: 0.7,
      });
      // a permanent scar and a smoking ruin
      fx.stampScorch(this.x, this.y, 130, 0.6);
      fx.stampScorch(this.x + 30, this.y - 20, 70, 0.5);
      fx.stampScorch(this.x - 34, this.y + 24, 60, 0.5);
      fx.addRubble({
        x: this.x,
        y: this.y,
        w: 56,
        h: 38,
        rot: 0.08,
        seed: this.rng.next(),
        born: ctx.time,
        smokeUntil: ctx.time + 720,
      });
      ctx.log(`${this.callsign} DESTROYED — THE WORKS BURN`, 'alert');
      ctx.economy?.onFactoryDestroyed(this);
      ctx.audio.explosion('kill', this.x, this.y, 4.4);
      return;
    }
    if (this.isAir) {
      // aircraft goes down in a streak of explosions
      const dir = this.angle;
      for (let i = 0; i < 3; i++) {
        const px = this.x + Math.cos(dir) * i * 22;
        const py = this.y + Math.sin(dir) * i * 22;
        fx.spawnExplosion(px, py, {
          dir,
          dirStrength: 1,
          scale: 1.0 + i * 0.3,
          crater: i === 2 ? 6 : 2,
          smoke: 4,
          debris: 6,
          stains: 22,
          sound: 'kill',
          shake: 2.6,
        });
      }
      fx.addWreck({
        x: this.x + Math.cos(dir) * 44,
        y: this.y + Math.sin(dir) * 44,
        angle: dir,
        turretAngle: 0,
        type: this.def.type,
        faction: this.faction,
        born: ctx.time,
        smokeUntil: ctx.time + 240,
        turretToss: null,
      });
      ctx.log(`${this.callsign} · SHOT DOWN`, 'alert');
    } else {
      fx.spawnExplosion(this.x, this.y, {
        dir: this.angle,
        dirStrength: 0.55,
        scale: this.def.kind === 'HQ' ? 3.2 : 2.1,
        crater: this.def.kind === 'HQ' ? 12 : 6,
        smoke: 9,
        debris: this.def.kind === 'HQ' ? 16 : 11,
        stains: 40,
        ring: true,
        sound: 'kill',
        shake: 4.5,
      });
      // turret toss for tanks
      let toss: { x: number; y: number; angle: number } | null = null;
      if (this.def.kind === 'MBT' || this.def.kind === 'IFV') {
        const a = this.rng.range(0, Math.PI * 2);
        toss = { x: this.x + Math.cos(a) * this.rng.range(10, 20), y: this.y + Math.sin(a) * this.rng.range(10, 20), angle: this.rng.range(0, Math.PI * 2) };
        fx.debris.push({
          x: this.x,
          y: this.y,
          z: 3,
          vx: Math.cos(a) * 26,
          vy: Math.sin(a) * 26,
          vz: 42,
          spin: this.rng.range(-4, 4),
          rot: this.turretAngle,
          size: 3.2,
          life: 0,
          landed: false,
          isTurret: true,
          turretAngle: this.turretAngle,
        });
      }
      fx.addWreck({
        x: this.x,
        y: this.y,
        angle: this.angle + this.rng.range(-0.12, 0.12),
        turretAngle: this.turretAngle,
        type: this.def.type,
        faction: this.faction,
        born: ctx.time,
        smokeUntil: ctx.time + (this.def.kind === 'HQ' ? 400 : 150),
        turretToss: toss,
      });
      if (this.def.kind === 'HQ') {
        fx.stampScorch(this.x, this.y, 42, 0.5);
      }
    }
    ctx.audio.explosion('kill', this.x, this.y, 2.2);
  }

  // ── HUD helpers ────────────────────────────────────────────

  getActivity(): UnitActivity {
    if (this.dead) return 'DESTROYED';
    if (this.isAir) {
      switch (this.airState) {
        case 'STANDBY':
          return 'REARMING';
        case 'INBOUND':
          return 'PATROLLING';
        case 'PATROL':
          return this.target && !this.target.dead ? 'ATTACK RUN' : 'PATROLLING';
        case 'RTB':
          return 'RTB';
        case 'REARM':
          return 'REARMING';
        case 'DOWN':
          return 'DESTROYED';
      }
    }
    if (this.def.kind === 'FACTORY') {
      return 'HOLDING';
    }
    if (this.isReinforcement) return 'INBOUND';
    if (this.order.type === 'FIRE_MISSION') return 'FIRE MISSION';
    if (this.target && !this.target.dead) return this.reloadT > 0 ? 'RELOADING' : 'ENGAGING';
    if (this.path.length > 0) return 'MOVING';
    return 'HOLDING';
  }

  positionGrid(): string {
    return gridString(this.x, this.y);
  }
}
