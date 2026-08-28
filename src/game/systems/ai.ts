// ─────────────────────────────────────────────────────────────
// PAPER STORM · enemy AI commander
// Defence-in-depth with artillery harassment, a recon screen,
// a committed reserve counterattack and a final HQ alarm.
// ─────────────────────────────────────────────────────────────

import type { SimContext, Unit } from '../entities/units';
import { dist, clamp, Vec2 } from '../core/math';

export type AIState = 'SCREEN' | 'DEFEND' | 'COUNTERATTACK' | 'ALARM';

interface GunRecord {
  unit: Unit;
  missionCooldown: number;
  displaceT: number;
}

export class EnemyCommander {
  state: AIState = 'SCREEN';
  timer = 0;
  reserveCommitted = false;
  hqAlarm = false;
  /** objective anchors supplied by the scenario */
  anchors: Record<string, Vec2> = {};
  guns: GunRecord[] = [];
  probeTimer = 18;
  initialEchoStrength = 0;

  constructor(anchors: Record<string, Vec2>) {
    this.anchors = anchors;
  }

  init(ctx: SimContext) {
    const echo = this.anchors.ECHO;
    if (echo) {
      this.initialEchoStrength = ctx.units.filter(
        (u) => u.faction === 'ENEMY' && !u.dead && dist(u.x, u.y, echo.x, echo.y) < 700 && !u.isAir
      ).length;
    }
    this.guns = ctx.units
      .filter((u) => u.faction === 'ENEMY' && u.def.kind === 'SPG' && !u.dead)
      .map((u) => ({ unit: u, missionCooldown: 8 + Math.random() * 10, displaceT: 0 }));
  }

  update(dt: number, ctx: SimContext) {
    this.timer -= dt;
    for (const g of this.guns) {
      g.missionCooldown -= dt;
      g.displaceT -= dt;
    }

    // the enemy has a purse too — he rebuilds his force
    ctx.economy?.aiThink(dt, ctx);

    // defend the ink works when they come under threat
    this.factoryResponse(ctx);

    if (this.timer > 0) return;
    this.timer = 1.4;

    // track any new self-propelled guns that marched in as reinforcements
    for (const u of ctx.units) {
      if (u.faction === 'ENEMY' && !u.dead && u.def.kind === 'SPG' && !this.guns.some((g) => g.unit === u)) {
        this.guns.push({ unit: u, missionCooldown: 8 + Math.random() * 10, displaceT: 0 });
      }
    }

    const enemies = ctx.units.filter((u) => u.faction === 'ENEMY' && !u.dead && !u.isAir);
    const friends = ctx.units.filter((u) => u.faction === 'FRIEND' && !u.dead && !u.isAir);
    if (!enemies.length || !friends.length) return;

    // ── perceived threat picture (what the AI can actually see) ──
    const detectedFriends: Unit[] = [];
    for (const e of enemies) {
      for (const t of e.visibleTargets) {
        if (!t.dead && !t.isAir && !detectedFriends.includes(t)) detectedFriends.push(t);
      }
    }

    const hq = this.anchors.HQ;
    const echo = this.anchors.ECHO;
    const enemyStrength = enemies.filter((u) => u.def.kind !== 'HQ' && u.def.kind !== 'SPAA').length;

    // ── state transitions ──────────────────────────────────────
    // HQ under threat?
    let hqThreat = false;
    if (hq) {
      for (const f of friends) {
        if (dist(f.x, f.y, hq.x, hq.y) < 1250) {
          hqThreat = true;
          break;
        }
      }
    }
    if (hqThreat && !this.hqAlarm) {
      this.hqAlarm = true;
      this.state = 'ALARM';
      ctx.log(`ENEMY HQ — ALARM RESPONSE`, 'alert');
      for (const u of enemies) {
        if (u.def.kind === 'SPAA' || u.def.kind === 'SPG') continue;
        const t = nearestOf(u, friends);
        if (t) u.orderAttackMove({ x: t.x, y: t.y }, ctx);
      }
    }

    // forward platoon attrition → commit reserve
    if (echo && !this.reserveCommitted) {
      const echoStrength = enemies.filter((u) => dist(u.x, u.y, echo.x, echo.y) < 700 && u.def.kind !== 'SPAA').length;
      if (echoStrength <= Math.max(1, Math.floor(this.initialEchoStrength * 0.34))) {
        this.reserveCommitted = true;
        this.state = 'COUNTERATTACK';
        ctx.log(`ENEMY RESERVE MOVING — EXPECT COUNTERATTACK`, 'alert');
        const reserve = enemies.filter((u) => dist(u.x, u.y, this.anchors.HQ.x, this.anchors.HQ.y) < 620 && u.def.kind !== 'SPAA' && u.def.kind !== 'SPG' && u.def.kind !== 'HQ');
        const focus = detectedFriends.length
          ? centroid(detectedFriends)
          : { x: echo.x, y: echo.y };
        for (const u of reserve) {
          u.orderAttackMove({ x: focus.x + (Math.random() - 0.5) * 240, y: focus.y + (Math.random() - 0.5) * 240 }, ctx);
          u.stance = 'AGGRESSIVE';
        }
      }
    }

    // last stand
    if (enemyStrength <= 3 && this.state !== 'ALARM') {
      this.state = 'ALARM';
      for (const u of enemies) {
        if (u.def.kind === 'SPAA' || u.def.kind === 'SPG' || u.def.kind === 'HQ') continue;
        const t = nearestOf(u, friends);
        if (t) u.orderAttackMove({ x: t.x, y: t.y }, ctx);
      }
    }

    // ── artillery missions ─────────────────────────────────────
    for (const g of this.guns) {
      if (g.unit.dead || g.missionCooldown > 0 || g.unit.ammo <= 0) continue;
      if (g.displaceT > 0) continue;
      // find a cluster of detected friendlies in range
      const cluster = this.findCluster(g.unit, detectedFriends);
      if (cluster) {
        g.unit.orderFireMission({ x: cluster.x + (Math.random() - 0.5) * 60, y: cluster.y + (Math.random() - 0.5) * 60 });
        g.unit.fireMissionLeft = 4;
        g.missionCooldown = 26 + Math.random() * 14;
        g.displaceT = 40;
        ctx.log(`INCOMING FIRE — GRID ${g.unit.positionGrid() === '' ? '' : ''}`.replace('GRID ', 'GRID '), 'alert');
      }
    }
    // counter-battery displacement
    for (const g of this.guns) {
      if (!g.unit.dead && g.displaceT > 0 && g.displaceT < 38.6 && g.displaceT > 38 && g.unit.fireMissionLeft <= 0) {
        const a = Math.random() * Math.PI * 2;
        const d = 180 + Math.random() * 200;
        g.unit.orderMove({ x: clamp(g.unit.x + Math.cos(a) * d, 100, 3900), y: clamp(g.unit.y + Math.sin(a) * d, 100, 2900) }, ctx);
      }
    }

    // ── screen / probe behaviour ───────────────────────────────
    this.probeTimer -= 1.4;
    if (this.probeTimer <= 0 && this.state === 'SCREEN') {
      this.probeTimer = 40 + Math.random() * 30;
      const recon = ctx.units.find((u) => u.faction === 'ENEMY' && !u.dead && u.def.kind === 'REC');
      if (recon && recon.path.length === 0) {
        const target = friends.length ? nearestOf(recon, friends) : null;
        if (target && dist(recon.x, recon.y, target.x, target.y) < 2200) {
          recon.orderAttackMove({ x: target.x + (Math.random() - 0.5) * 400, y: target.y + (Math.random() - 0.5) * 400 }, ctx);
        }
      }
    }

    // ── defensive posture: units drift home when idle ──────────
    if (this.state === 'SCREEN' || this.state === 'DEFEND') {
      for (const u of enemies) {
        if (!u.defendPos || u.path.length > 0) continue;
        if (u.target && !u.target.dead) continue;
        if (u.def.kind === 'SPAA' || u.def.kind === 'HQ') continue;
        const d = dist(u.x, u.y, u.defendPos.x, u.defendPos.y);
        if (d > 130) {
          u.orderMove({ x: u.defendPos.x + (Math.random() - 0.5) * 60, y: u.defendPos.y + (Math.random() - 0.5) * 60 }, ctx);
        }
      }
    }

    // attack-move units that lost their targets press on to last contact
    if (this.state === 'COUNTERATTACK' || this.state === 'ALARM') {
      for (const u of enemies) {
        if (u.def.kind === 'SPAA' || u.def.kind === 'HQ' || u.path.length > 0) continue;
        if (u.target && !u.target.dead) continue;
        if (detectedFriends.length) {
          const t = nearestOf(u, detectedFriends);
          if (t) u.orderAttackMove({ x: t.x, y: t.y }, ctx);
        }
      }
    }
  }

  /** if a works is threatened, nearby forces converge to hold it */
  private factoryResponse(ctx: SimContext) {
    if (this.factoryAlarmT > 0) {
      this.factoryAlarmT -= 1.4 * 0.7;
      return;
    }
    for (const f of ctx.units) {
      if (f.dead || f.def.kind !== 'FACTORY' || f.factoryCtl !== 'ENEMY') continue;
      // threat: friendlies closing on the works
      let threat = 0;
      for (const u of ctx.units) {
        if (u.dead || u.faction !== 'FRIEND' || u.isAir) continue;
        if (dist(u.x, u.y, f.x, f.y) < 640) threat++;
      }
      if (threat > 0 && (f.capturing === 'FRIEND' || f.hp < f.def.hp * 0.85)) {
        this.factoryAlarmT = 42;
        ctx.log(`ENEMY DEFENDS ${f.callsign} — EXPECT RESISTANCE`, 'alert');
        let sent = 0;
        const responders = ctx.units
          .filter(
            (u) =>
              u.faction === 'ENEMY' &&
              !u.dead &&
              !u.isAir &&
              u.def.kind !== 'HQ' &&
              u.def.kind !== 'FACTORY' &&
              u.def.kind !== 'SPG' &&
              dist(u.x, u.y, f.x, f.y) < 1900
          )
          .sort((a, b) => dist(a.x, a.y, f.x, f.y) - dist(b.x, b.y, f.x, f.y));
        for (const u of responders) {
          if (sent++ >= Math.min(threat + 1, 4)) break;
          u.orderAttackMove({ x: f.x + (Math.random() - 0.5) * 220, y: f.y + (Math.random() - 0.5) * 220 }, ctx);
          u.defendPos = { x: f.x + (Math.random() - 0.5) * 160, y: f.y + (Math.random() - 0.5) * 160 };
        }
        break;
      }
    }
  }

  private factoryAlarmT = 0;

  private findCluster(gun: Unit, targets: Unit[]): Vec2 | null {
    let best: Vec2 | null = null;
    let bestCount = 0;
    for (const t of targets) {
      if (dist(gun.x, gun.y, t.x, t.y) > gun.def.range * 0.95) continue;
      if (dist(gun.x, gun.y, t.x, t.y) < gun.def.minRange + 60) continue;
      let count = 0;
      for (const o of targets) {
        if (dist(t.x, t.y, o.x, o.y) < 110) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        best = { x: t.x, y: t.y };
      }
    }
    return bestCount >= 1 ? best : null;
  }
}

function nearestOf(u: Unit, targets: Unit[]): Unit | null {
  let best: Unit | null = null;
  let bd = Infinity;
  for (const t of targets) {
    const d = dist(u.x, u.y, t.x, t.y);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

function centroid(units: Unit[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const u of units) {
    x += u.x;
    y += u.y;
  }
  return { x: x / units.length, y: y / units.length };
}
