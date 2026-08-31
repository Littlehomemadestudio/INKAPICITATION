// ─────────────────────────────────────────────────────────────
// PAPER STORM · enemy commander — KRAKEN GROUP
// Three layers:
//   STRATEGIC — owns the map: sectors, works, force ratios,
//   ink spending, and the decision to attack / hold / withdraw.
//   TACTICAL  — owns the groups: routes, combined-arms sequen-
//   cing (recon → guns → armour → AD), disengagement.
//   UNIT      — stays in units.ts (targeting, cover, movement).
// The commander acts only on his intelligence picture — never
// on hidden truth. He plays the same economy the player does.
// ─────────────────────────────────────────────────────────────

import type { SimContext, Unit } from '../../entities/units';
import { dist, clamp, Vec2 } from '../../core/math';
import { IntelSystem } from './intel';
import { ENEMY_UNIT_CAP } from '../economy';

export type AIState = 'SCREEN' | 'DEFEND' | 'COUNTERATTACK' | 'WITHDRAW' | 'ALARM';
export type GroupMission = 'HOLD' | 'DEFEND' | 'ATTACK' | 'WITHDRAW' | 'REGROUP';

interface GunRecord {
  unit: Unit;
  missionCooldown: number;
  displaceT: number;
}

interface BattleGroup {
  id: string;
  name: string;
  anchor: Vec2;
  /** where the group falls back to when beaten */
  rally: Vec2;
  units: Unit[];
  mission: GroupMission;
  /** original strength (hp-weighted unit count) */
  strength0: number;
  /** seconds until a regrouped group is committed again */
  regroupT: number;
  /** assault objective while ATTACKing */
  objective: Vec2 | null;
  /** what we are retaking — checked for real victory */
  objectiveTarget: { kind: 'FACTORY' | 'SECTOR'; id: string } | null;
  /** next waypoint on the assault route */
  waypoint: Vec2 | null;
  /** log spam guard */
  logged: boolean;
}

const STRENGTH_CRIT = 0.42; // below this fraction a group breaks off
const REGROUP_TIME = 50;

export class EnemyCommander {
  state: AIState = 'SCREEN';
  intel = new IntelSystem();
  anchors: Record<string, Vec2> = {};
  groups: BattleGroup[] = [];
  guns: GunRecord[] = [];

  private strategicT = 0;
  private tacticalT = 0;
  private purchaseT = 12;
  private probeTimer = 20;
  private hqAlarm = false;
  private counterattackT = 0;
  /** sectors we have already decided to retake (cooldown map) */
  private retakeCooldown = new Map<string, number>();
  private initialEchoStrength = 0;
  /** sector ownership when the shooting started — lost ground is
   *  worth retaking; ground he never held is not */
  private homeSectors = new Set<string>();
  private anchorsById: Record<string, Vec2> = {};

  constructor(anchors: Record<string, Vec2>) {
    this.anchors = anchors;
    this.anchorsById = anchors;
  }

  // ── setup ──────────────────────────────────────────────────

  init(ctx: SimContext) {
    const A = this.anchorsById;
    const mk = (id: string, name: string, anchor: Vec2, rally: Vec2): BattleGroup => ({
      id,
      name,
      anchor,
      rally,
      units: [],
      mission: 'HOLD',
      strength0: 1,
      regroupT: 0,
      objective: null,
      objectiveTarget: null,
      waypoint: null,
      logged: false,
    });
    this.groups = [
      mk('ECHO', 'PL ECHO', A.ECHO ?? { x: 3990, y: 3350 }, A.RALLY_E ?? { x: 6100, y: 1500 }),
      mk('FOXTROT', 'PL FOXTROT', A.FOXTROT ?? { x: 4800, y: 1800 }, A.RALLY_E ?? { x: 6100, y: 1500 }),
      mk('GOLF', 'PL GOLF', A.GOLF ?? { x: 6620, y: 1330 }, A.RALLY_E ?? { x: 6100, y: 1500 }),
      mk('WEST', 'WESTWORKS OUTPOST', A.WEST ?? { x: 2320, y: 3150 }, A.RALLY_W ?? { x: 2700, y: 1500 }),
      mk('NORTH', 'MOLOT GARRISON', A.NORTH ?? { x: 2600, y: 950 }, A.RALLY_W ?? { x: 2700, y: 1500 }),
      mk('EAST', 'EASTWORKS GARRISON', A.EAST ?? { x: 5900, y: 2100 }, A.RALLY_E ?? { x: 6100, y: 1500 }),
      mk('PORT', 'PORT AZURE GARRISON', A.PORT ?? { x: 4780, y: 4380 }, A.EAST ?? { x: 5900, y: 2100 }),
      mk('HQ', 'HQ RESERVE', A.HQ ?? { x: 7150, y: 600 }, A.HQ ?? { x: 7150, y: 600 }),
    ];
    // adopt the starting order of battle by proximity
    for (const u of ctx.units) {
      if (u.dead || u.faction !== 'ENEMY' || u.isAir) continue;
      if (u.def.kind === 'HQ' || u.def.kind === 'FACTORY') continue;
      if (u.isShip) continue; // the fleet is handled by naval doctrine
      if (u.def.kind === 'SPG' && !u.isShip) {
        this.guns.push({ unit: u, missionCooldown: 6 + Math.random() * 10, displaceT: 0 });
        continue;
      }
      this.assignToGroup(u, ctx);
    }
    for (const g of this.groups) g.strength0 = Math.max(1, this.groupStrength(g));
    const echo = this.groups.find((g) => g.id === 'ECHO');
    if (echo) this.initialEchoStrength = echo.units.length;
    for (const s of ctx.economy.sectors) if (s.control === 'ENEMY') this.homeSectors.add(s.id);
    // an unclaimed works on our side of the river is ours to take —
    // the nearest group walks in and occupies it before you do
    for (const f of ctx.units) {
      if (f.dead || f.def.kind !== 'FACTORY' || f.factoryCtl !== 'NEUTRAL') continue;
      let closest: BattleGroup | null = null;
      let cd = Infinity;
      for (const g of this.groups) {
        const d = dist(g.anchor.x, g.anchor.y, f.x, f.y);
        if (d < cd) {
          cd = d;
          closest = g;
        }
      }
      if (closest && cd < 1800) {
        closest.mission = 'ATTACK';
        closest.objective = { x: f.x, y: f.y };
        closest.objectiveTarget = { kind: 'FACTORY', id: String(f.id) };
        closest.waypoint = null;
        for (const u of closest.units) {
          u.orderAttackMove({ x: f.x + (Math.random() - 0.5) * 200, y: f.y + (Math.random() - 0.5) * 200 }, ctx);
        }
        ctx.log(`${closest.name} MOVING TO SECURE ${f.callsign} — RACE THEM FOR IT`, 'alert');
      }
    }
  }

  /** nearest group anchor wins; SAMs prefer the umbrella they started under */
  private assignToGroup(u: Unit, ctx: SimContext) {
    void ctx;
    let best: BattleGroup | null = null;
    let bd = Infinity;
    for (const g of this.groups) {
      const d = dist(u.x, u.y, g.anchor.x, g.anchor.y);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    if (best && bd < 2600) {
      best.units.push(u);
      return best;
    }
    // deep rear reinforcement → the reserve
    const hq = this.groups.find((g) => g.id === 'HQ');
    if (hq) hq.units.push(u);
    return hq ?? best;
  }

  // ── main loop ──────────────────────────────────────────────

  update(dt: number, ctx: SimContext) {
    this.intel.update(dt, ctx);
    this.trackNewUnits(ctx);
    this.trackNewGuns(ctx);

    this.strategicT -= dt;
    this.tacticalT -= dt;
    this.purchaseT -= dt;
    this.counterattackT -= dt;
    for (const g of this.guns) {
      g.missionCooldown -= dt;
      g.displaceT -= dt;
    }
    for (const g of this.groups) if (g.regroupT > 0) g.regroupT -= dt;

    this.unitSurvivalInstinct(ctx);
    this.navalResponse(dt, ctx);

    if (this.strategicT <= 0) {
      this.strategicT = 6;
      this.strategic(ctx);
    }
    if (this.tacticalT <= 0) {
      this.tacticalT = 2.2;
      this.tactical(ctx);
    }
    if (this.purchaseT <= 0) {
      this.purchaseT = 14 + Math.random() * 8;
      this.spendInk(ctx);
    }
  }

  private trackNewUnits(ctx: SimContext) {
    const known = new Set<number>();
    for (const g of this.groups) for (const u of g.units) known.add(u.id);
    for (const gr of this.guns) known.add(gr.unit.id);
    for (const u of ctx.units) {
      if (u.dead || u.faction !== 'ENEMY' || u.isAir || u.isShip) continue;
      if (u.def.kind === 'HQ' || u.def.kind === 'FACTORY') continue;
      if (known.has(u.id)) continue;
      if (u.def.kind === 'SPG') {
        this.guns.push({ unit: u, missionCooldown: 8, displaceT: 0 });
        continue;
      }
      // fresh reinforcement — send it where the war is hottest
      const grp = this.hottestGroup() ?? this.assignToGroup(u, ctx);
      if (!grp) continue;
      grp.units.push(u);
      if (!u.defendPos) {
        u.defendPos = {
          x: grp.anchor.x + (Math.random() - 0.5) * 240,
          y: grp.anchor.y + (Math.random() - 0.5) * 240,
        };
        u.orderMove(u.defendPos, ctx);
      }
    }
    // prune the dead
    for (const g of this.groups) g.units = g.units.filter((u) => !u.dead);
    this.guns = this.guns.filter((g) => !g.unit.dead);
  }

  private trackNewGuns(ctx: SimContext) {
    void ctx; // guns are picked up by trackNewUnits
  }

  // ── STRATEGIC — the map, the money, the decisions ─────────

  private strategic(ctx: SimContext) {
    const A = this.anchorsById;
    // ── HQ alarm: the compound itself is threatened ──
    const hq = ctx.units.find((u) => u.def.kind === 'HQ' && !u.dead);
    if (hq) {
      const threat = this.intel.strengthNear(hq.x, hq.y, 1400);
      if (threat > 2 && !this.hqAlarm) {
        this.hqAlarm = true;
        this.state = 'ALARM';
        ctx.log(`KRAKEN HQ — ALARM. ALL GROUPS CONVERGE`, 'alert');
        for (const g of this.groups) {
          if (g.id === 'HQ' || g.mission === 'WITHDRAW') continue;
          g.mission = 'DEFEND';
          g.objective = { x: hq.x, y: hq.y };
        }
      }
    }

    // ── the works: an economic loss must be answered ──
    for (const f of ctx.units) {
      if (f.dead || f.def.kind !== 'FACTORY' || f.factoryCtl !== 'FRIEND') continue; // NEUTRAL is a land grab, not a loss
      const key = `F${f.id}`;
      if ((this.retakeCooldown.get(key) ?? 0) > ctx.time) continue;
      // plan a counterattack to retake it
      this.retakeCooldown.set(key, ctx.time + 240);
      this.planCounterattack(ctx, { x: f.x, y: f.y }, `${f.callsign} IS LOST — KRAKEN WANTS IT BACK`, { kind: 'FACTORY', id: String(f.id) });
      break;
    }

    // ── sectors bleeding away: retake the valuable ones ──
    if (this.counterattackT <= 0 && this.state !== 'ALARM') {
      for (const s of ctx.economy.sectors) {
        if (s.control !== 'FRIEND') continue;
        if (!this.homeSectors.has(s.id)) continue; // never ours to retake
        if (s.income < 1.8) continue; // not worth the ink
        const key = `S${s.id}`;
        if ((this.retakeCooldown.get(key) ?? 0) > ctx.time) continue;
        this.retakeCooldown.set(key, ctx.time + 300);
        this.planCounterattack(ctx, s.pos, `ENEMY MOVES TO RETAKE ${s.name}`, { kind: 'SECTOR', id: s.id });
        break;
      }
    }

    // ── overall posture ──
    if (this.state === 'SCREEN') {
      const echo = this.groups.find((g) => g.id === 'ECHO');
      if (echo) {
        const frac = this.groupStrengthFrac(echo);
        if (frac < 0.4) {
          this.state = 'DEFEND';
          ctx.log(`ENEMY FORWARD LINE IS THINNING — HE IS FALLING BACK`, 'contact');
        }
      }
    }
    // last stand
    const combat = ctx.units.filter(
      (u) => u.faction === 'ENEMY' && !u.dead && !u.isAir && u.def.kind !== 'HQ' && u.def.kind !== 'FACTORY' && !u.isShip
    ).length;
    if (combat <= 4 && this.state !== 'ALARM') {
      this.state = 'ALARM';
      ctx.log(`KRAKEN GROUP IS FIGHTING FOR ITS LIFE`, 'alert');
    }

    // ── recon probe management ──
    this.probeTimer -= 6;
    if (this.probeTimer <= 0) {
      this.probeTimer = 45 + Math.random() * 30;
      this.sendRecon(ctx);
    }

    void A;
  }

  /** commit the reserve (+ purchases) to retake an objective — the story beat */
  private planCounterattack(ctx: SimContext, objective: Vec2, msg: string, target?: { kind: 'FACTORY' | 'SECTOR'; id: string }) {
    if (this.counterattackT > 0) return;
    this.counterattackT = 150;
    this.state = 'COUNTERATTACK';
    ctx.log(msg, 'alert');

    // the reserve group leads; at most two more healthy groups follow —
    // a counterstroke is a fist, not the whole army
    const hq = this.groups.find((g) => g.id === 'HQ');
    const strikers: BattleGroup[] = [];
    if (hq && this.groupStrengthFrac(hq) > 0.3) strikers.push(hq);
    for (const g of this.groups) {
      if (strikers.length >= 3) break;
      if (g === hq) continue;
      if (g.mission === 'WITHDRAW' || g.mission === 'REGROUP') continue;
      if (this.groupStrengthFrac(g) < 0.55) continue;
      if (dist(g.anchor.x, g.anchor.y, objective.x, objective.y) > 2600) continue;
      strikers.push(g);
    }
    if (!strikers.length) {
      ctx.log(`KRAKEN CANNOT MOUNT A COUNTERSTROKE YET — HE IS SAVING INK`, 'contact');
      this.counterattackT = 60;
      return;
    }
    // artillery preparation falls first
    this.artilleryPreparation(ctx, objective);
    for (const g of strikers) {
      g.mission = 'ATTACK';
      g.objective = { ...objective };
      g.objectiveTarget = target ?? null;
      g.waypoint = this.chooseRoute(g, objective, ctx);
      g.logged = false;
      for (const u of g.units) {
        u.stance = 'AGGRESSIVE';
        const w = g.waypoint ?? g.objective;
        u.orderAttackMove({ x: w.x + (Math.random() - 0.5) * 220, y: w.y + (Math.random() - 0.5) * 220 }, ctx);
      }
      // SHORAD rolls with the spearhead — the armour is not naked
      for (const u of g.units) {
        if (u.def.kind !== 'SPAA' || u.def.aa?.emplace) continue;
        u.defendPos = { x: objective.x - 380, y: objective.y - 320 };
      }
    }
    // standby CAS supports a real counterstroke (a land grab does
    // not warrant burning the ready aircraft)
    if (target) this.launchCAS(ctx, objective);
  }

  /** pick the assault route: not always the shortest — the
   *  defended crossing is expensive, the quiet one is worth km */
  private chooseRoute(g: BattleGroup, objective: Vec2, ctx: SimContext): Vec2 | null {
    const A = this.anchorsById;
    const crossings: { name: string; p: Vec2 }[] = [];
    if (A.NBRIDGE) crossings.push({ name: 'NORTH BRIDGE', p: A.NBRIDGE });
    if (A.WBRIDGE) crossings.push({ name: 'WEST BRIDGE', p: A.WBRIDGE });
    if (A.CBRIDGE) crossings.push({ name: 'CENTRAL BRIDGE', p: A.CBRIDGE });
    if (A.FORD) crossings.push({ name: 'THE FORD', p: A.FORD });
    if (!crossings.length) return null;

    let best: { p: Vec2; score: number; name: string } | null = null;
    const direct = dist(g.anchor.x, g.anchor.y, objective.x, objective.y);
    for (const c of crossings) {
      // does this crossing actually help? (between us and the target)
      const via = dist(g.anchor.x, g.anchor.y, c.p.x, c.p.y) + dist(c.p.x, c.p.y, objective.x, objective.y);
      if (via > direct * 1.35) continue;
      // danger: what does the commander know near the crossing?
      const danger = this.intel.strengthNear(c.p.x, c.p.y, 700);
      const score = via + danger * 320;
      if (!best || score < best.score) best = { p: c.p, score, name: c.name };
    }
    if (best && dist(g.anchor.x, g.anchor.y, best.p.x, best.p.y) > 420) {
      void ctx;
      return best.p;
    }
    return null;
  }

  // ── TACTICAL — the groups ─────────────────────────────────

  private tactical(ctx: SimContext) {
    for (const g of this.groups) {
      g.units = g.units.filter((u) => !u.dead);
      const strength = this.groupStrengthFrac(g);
      const underFire = this.intel.near(g.anchor.x, g.anchor.y, 1500, 0.6).length > 0;

      switch (g.mission) {
        case 'HOLD':
        case 'DEFEND': {
          // a mauled holding force breaks off and regroups
          if (strength < STRENGTH_CRIT && underFire && g.units.length) {
            this.withdraw(g, ctx);
            break;
          }
          this.holdGround(g, ctx);
          break;
        }
        case 'ATTACK': {
          if (strength < STRENGTH_CRIT) {
            this.withdraw(g, ctx, 'BOUNCED');
            break;
          }
          this.pressAttack(g, ctx);
          break;
        }
        case 'WITHDRAW': {
          // arrived at the rally → regroup
          const allArrived = g.units.every(
            (u) => u.path.length === 0 || dist(u.x, u.y, g.rally.x, g.rally.y) < 700
          );
          if (allArrived) {
            g.mission = 'REGROUP';
            g.regroupT = REGROUP_TIME;
            ctx.log(`${g.name} REGROUPING AT THE RALLY — EXPECT A RETURN`, 'contact');
          }
          break;
        }
        case 'REGROUP': {
          if (g.regroupT <= 0) {
            g.mission = 'HOLD';
            // re-occupy the anchor
            for (const u of g.units) {
              u.defendPos = { x: g.anchor.x + (Math.random() - 0.5) * 260, y: g.anchor.y + (Math.random() - 0.5) * 260 };
              if (u.path.length === 0 && dist(u.x, u.y, u.defendPos.x, u.defendPos.y) > 160) {
                u.orderMove(u.defendPos, ctx);
              }
            }
            g.strength0 = Math.max(1, this.groupStrength(g));
            ctx.log(`${g.name} REFORMED AND MOVING BACK TO THE LINE`, 'contact');
          }
          break;
        }
      }
    }

    this.artilleryCycle(ctx);
    this.airDefencePosture(ctx);
  }

  /** units hold their ground: drift home when idle, man the line */
  private holdGround(g: BattleGroup, ctx: SimContext) {
    for (const u of g.units) {
      if (u.def.kind === 'SPAA' && u.def.aa?.emplace) continue; // emplaced systems stay emplaced
      if (u.path.length > 0) continue;
      if (u.target && !u.target.dead) continue;
      const home = u.defendPos ?? g.anchor;
      if (dist(u.x, u.y, home.x, home.y) > 180) {
        u.orderMove({ x: home.x + (Math.random() - 0.5) * 80, y: home.y + (Math.random() - 0.5) * 80 }, ctx);
      }
    }
  }

  /** the assault: press the waypoint, then the objective */
  private pressAttack(g: BattleGroup, ctx: SimContext) {
    const obj = g.objective;
    if (!obj) {
      g.mission = 'HOLD';
      return;
    }
    // did we really take it back? the specific target flies our flag
    // again AND the group is physically on the objective
    let won = false;
    const tgt = g.objectiveTarget;
    if (tgt?.kind === 'SECTOR') {
      const s = ctx.economy.sectors.find((x) => x.id === tgt.id);
      if (s && s.control === 'ENEMY') won = true;
    } else if (tgt?.kind === 'FACTORY') {
      const f = ctx.units.find((u) => String(u.id) === tgt.id);
      if (f && !f.dead && f.factoryCtl === 'ENEMY') won = true;
    } else {
      // no specific target: our flag within 300 m counts
      won =
        ctx.economy.sectors.some(
          (s) => s.control === 'ENEMY' && dist(s.pos.x, s.pos.y, obj.x, obj.y) < Math.min(s.radius, 400)
        ) &&
        g.units.some((u) => dist(u.x, u.y, obj.x, obj.y) < 420);
    }
    if (won) won = g.units.some((u) => dist(u.x, u.y, obj.x, obj.y) < 520);
    if (won) {
      g.mission = 'HOLD';
      g.objective = null;
      g.objectiveTarget = null;
      g.anchor = { ...obj };
      for (const u of g.units) u.defendPos = { x: obj.x + (Math.random() - 0.5) * 280, y: obj.y + (Math.random() - 0.5) * 280 };
      ctx.log(`${g.name} TOOK THE GROUND BACK AND IS DIGGING IN`, 'alert');
      return;
    }
    for (const u of g.units) {
      if (u.def.kind === 'SPAA' && u.def.aa?.emplace) continue;
      if (u.path.length > 0) continue;
      if (u.target && !u.target.dead) continue;
      // pressing on to the last contact or the objective
      const contacts = this.intel.near(u.x, u.y, 1600, 0.5);
      if (contacts.length) {
        const c = contacts[0];
        u.orderAttackMove({ x: c.x + (Math.random() - 0.5) * 200, y: c.y + (Math.random() - 0.5) * 200 }, ctx);
      } else {
        u.orderAttackMove({ x: obj.x + (Math.random() - 0.5) * 300, y: obj.y + (Math.random() - 0.5) * 300 }, ctx);
      }
    }
  }

  /** disengage — a beaten force lives to counterattack again */
  private withdraw(g: BattleGroup, ctx: SimContext, reason = '') {
    g.mission = 'WITHDRAW';
    g.objective = null;
    g.objectiveTarget = null;
    const to = g.rally;
    for (const u of g.units) {
      u.stance = 'HOLD';
      u.orderMove({ x: to.x + (Math.random() - 0.5) * 300, y: to.y + (Math.random() - 0.5) * 300 }, ctx);
    }
    ctx.log(
      reason === 'BOUNCED'
        ? `${g.name} ASSAULT BROKEN — WITHDRAWING UNDER PRESSURE`
        : `${g.name} FALLING BACK — THE POSITION IS UNSUPPORTED`,
      'alert'
    );
  }

  // ── artillery — observed fire, honest scatter ─────────────

  private artilleryCycle(ctx: SimContext) {
    for (const g of this.guns) {
      if (g.unit.dead || g.missionCooldown > 0 || g.unit.ammo <= 0) continue;
      if (g.displaceT > 0) continue;
      // choose the juiciest confirmed cluster in range
      let best: { x: number; y: number; count: number } | null = null;
      for (const c of this.intel.list(0.45)) {
        const d = dist(g.unit.x, g.unit.y, c.x, c.y);
        if (d > g.unit.def.range * 0.95 || d < g.unit.def.minRange + 60) continue;
        const cluster = this.intel.bestCluster(c.x, c.y, 130);
        if (cluster && (!best || cluster.count > best.count)) {
          best = { x: cluster.x, y: cluster.y, count: cluster.count };
        }
      }
      if (best) {
        g.unit.orderFireMission({ x: best.x + (Math.random() - 0.5) * 60, y: best.y + (Math.random() - 0.5) * 60 });
        g.unit.fireMissionLeft = 4;
        g.missionCooldown = 26 + Math.random() * 14;
        g.displaceT = 40;
        ctx.log(`INCOMING FIRE — COUNTER-BATTERY HAS YOUR NUMBER`, 'alert');
      }
    }
    // displacement after missions
    for (const g of this.guns) {
      if (!g.unit.dead && g.displaceT > 0 && g.displaceT < 38.6 && g.displaceT > 38 && g.unit.fireMissionLeft <= 0) {
        const a = Math.random() * Math.PI * 2;
        const d = 180 + Math.random() * 220;
        g.unit.orderMove(
          { x: clamp(g.unit.x + Math.cos(a) * d, 100, 8000), y: clamp(g.unit.y + Math.sin(a) * d, 100, 6000) },
          ctx
        );
      }
    }
  }

  /** every gun in range drops a preparatory volley on an objective */
  private artilleryPreparation(ctx: SimContext, objective: Vec2) {
    let firing = 0;
    for (const g of this.guns) {
      if (g.unit.dead || g.unit.ammo <= 0 || g.displaceT > 0) continue;
      const d = dist(g.unit.x, g.unit.y, objective.x, objective.y);
      if (d > g.unit.def.range * 0.95 || d < g.unit.def.minRange + 60) continue;
      g.unit.orderFireMission({ x: objective.x + (Math.random() - 0.5) * 140, y: objective.y + (Math.random() - 0.5) * 140 });
      g.unit.fireMissionLeft = 5;
      g.missionCooldown = 30 + Math.random() * 10;
      g.displaceT = 44;
      firing++;
    }
    if (firing) ctx.log(`ENEMY GUNS CONCENTRATING — PREPARATORY FIRE INBOUND`, 'alert');
  }

  // ── air defence posture ───────────────────────────────────

  /** medium SAMs emplace over the assets that matter; SHORAD
   *  screens the group it marches with */
  private airDefencePosture(ctx: SimContext) {
    void ctx;
    // emplaced systems were given defendPos at spawn — they hold it.
    // mobile SHORAD handles are re-tasked by attack/hold logic.
  }

  // ── air power ─────────────────────────────────────────────

  private launchCAS(ctx: SimContext, at: Vec2) {
    let launched = false;
    for (const cas of ctx.units) {
      if (cas.faction !== 'ENEMY' || cas.dead || !cas.isAir || cas.airState !== 'STANDBY') continue;
      cas.launchAir({ x: at.x, y: at.y });
      ctx.log(`${cas.callsign} LAUNCHING — ENEMY AIR INBOUND`, 'contact');
      launched = true;
    }
    return launched;
  }

  // ── reconnaissance ────────────────────────────────────────

  private sendRecon(ctx: SimContext) {
    const recs = ctx.units.filter((u) => u.faction === 'ENEMY' && !u.dead && u.def.kind === 'REC');
    if (!recs.length) return;
    // probe the largest blind spot near the front
    let target: Vec2 | null = null;
    let bestScore = -1;
    for (const g of this.groups) {
      if (g.mission === 'WITHDRAW' || g.mission === 'REGROUP') continue;
      const blind = this.intel.near(g.anchor.x, g.anchor.y, 1800, 0.3).length;
      const score = 1 / (1 + blind);
      if (score > bestScore) {
        bestScore = score;
        // look outward from the group toward the player's likely axis
        const A = this.anchorsById;
        const staging = A.STAGING ?? { x: 1700, y: 4700 };
        const dir = Math.atan2(staging.y - g.anchor.y, staging.x - g.anchor.x);
        target = { x: clamp(g.anchor.x + Math.cos(dir) * 1500, 200, 8000), y: clamp(g.anchor.y + Math.sin(dir) * 1500, 200, 5900) };
      }
    }
    if (!target) return;
    for (const rec of recs) {
      if (rec.path.length > 0) continue;
      // recon looks — it does not invade. Plain move; the vehicle's
      // own standoff instincts carry it home if fired upon.
      rec.orderMove({ x: target.x + (Math.random() - 0.5) * 500, y: target.y + (Math.random() - 0.5) * 500 }, ctx);
    }
  }

  // ── unit survival — nobody fights to the last man ─────────

  private unitSurvivalInstinct(ctx: SimContext) {
    for (const u of ctx.units) {
      if (u.dead || u.faction !== 'ENEMY' || u.isAir || u.isShip) continue;
      if (u.def.kind === 'HQ' || u.def.kind === 'FACTORY' || u.def.kind === 'SPG') continue;
      if (u.hp > u.def.hp * 0.3) continue;
      if (u.path.length > 0) continue;
      if (this.hqAlarm) continue; // the last stand has no rear
      // fall back toward the nearest rally
      let rally = this.anchorsById.RALLY_E ?? { x: 6100, y: 1500 };
      if (dist(u.x, u.y, this.anchorsById.RALLY_W?.x ?? 9e9, this.anchorsById.RALLY_W?.y ?? 9e9) < dist(u.x, u.y, rally.x, rally.y)) {
        rally = this.anchorsById.RALLY_W ?? rally;
      }
      u.orderMove({ x: rally.x + (Math.random() - 0.5) * 300, y: rally.y + (Math.random() - 0.5) * 300 }, ctx);
    }
  }

  // ── the naval war ─────────────────────────────────────────

  private navalAlarmT = 0;

  private navalResponse(dt: number, ctx: SimContext) {
    if (this.navalAlarmT > 0) {
      this.navalAlarmT -= dt;
      return;
    }
    const friendlyHulls = ctx.units.filter((u) => u.faction === 'FRIEND' && u.isShip && !u.dead && !u.sinking);
    const enemyHulls = ctx.units.filter((u) => u.faction === 'ENEMY' && u.isShip && !u.dead && !u.sinking);

    // damaged hulls retire to the port — no suicidal charges
    for (const b of enemyHulls) {
      if (b.hp < b.def.hp * 0.4 && b.path.length === 0) {
        const port = this.anchorsById.PORT ?? { x: 4780, y: 4380 };
        b.orderMove({ x: port.x + 120, y: port.y + 260 }, ctx);
        ctx.log(`ENEMY HULL ${b.callsign} LIMPING HOME`, 'contact');
      }
    }

    if (!friendlyHulls.length) return;
    // do the watchers even see them? the sea is wide
    const enemyWatchers = ctx.units.filter((u) => u.faction === 'ENEMY' && !u.dead);
    const spotted = friendlyHulls.filter((h) => enemyWatchers.some((w) => !w.dead && w.visibleTargets.includes(h)));
    if (!spotted.length) return;

    this.navalAlarmT = 30;
    ctx.log(`ENEMY PATROL CRAFT SORTIEING — THE BAY IS CONTESTED`, 'alert');

    // the ready Frogfoots hunt the fleet
    let casLaunched = false;
    for (const cas of ctx.units) {
      if (cas.faction !== 'ENEMY' || cas.dead || !cas.isAir || cas.airState !== 'STANDBY') continue;
      cas.launchAir({ x: spotted[0].x, y: spotted[0].y });
      ctx.log(`${cas.callsign} LAUNCHING — ENEMY AIR OVER THE WATER`, 'contact');
      casLaunched = true;
    }
    void casLaunched;

    // wolfpack: boats concentrate on the nearest spotted hull
    const ready = enemyHulls.filter((b) => b.hp >= b.def.hp * 0.4 && b.path.length === 0);
    for (const b of ready) {
      let best: Unit | null = null;
      let bd = Infinity;
      for (const h of spotted) {
        const d = dist(b.x, b.y, h.x, h.y);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      if (best) {
        b.orderAttack(best, ctx);
        b.stance = 'AGGRESSIVE';
      }
    }

    // shore batteries walk fire onto a threatening hull
    const port = this.anchorsById.PORT ?? { x: 4780, y: 4380 };
    const shoreThreat = spotted.find((h) => dist(h.x, h.y, port.x, port.y) < 2400);
    if (shoreThreat) {
      for (const g of this.guns) {
        if (g.unit.dead || g.unit.ammo <= 0 || g.displaceT > 0) continue;
        if (dist(g.unit.x, g.unit.y, shoreThreat.x, shoreThreat.y) > g.unit.def.range * 0.95) continue;
        g.unit.orderFireMission({ x: shoreThreat.x + (Math.random() - 0.5) * 90, y: shoreThreat.y + (Math.random() - 0.5) * 90 });
        g.unit.fireMissionLeft = 4;
        g.missionCooldown = 24 + Math.random() * 12;
        g.displaceT = 40;
        ctx.log(`SHORE BATTERIES FIRING ON THE FLEET`, 'alert');
        break;
      }
    }
  }

  // ── the purse — KRAKEN plays the same economy ─────────────

  private spendInk(ctx: SimContext) {
    const eco = ctx.economy;
    const enemies = ctx.units.filter((u) => u.faction === 'ENEMY' && !u.dead);
    const arty = enemies.filter((u) => u.def.kind === 'SPG').length;
    const ad = enemies.filter((u) => u.def.kind === 'SPAA').length;
    const msam = enemies.filter((u) => u.def.type === 'BUK').length;
    const rec = enemies.filter((u) => u.def.kind === 'REC').length;
    const pts = enemies.filter((u) => u.isShip).length;
    const cas = enemies.filter((u) => u.isAir && u.airState !== 'STANDBY' && u.airState !== 'DOWN').length;
    const combat = enemies.filter((u) => !u.isAir && !u.isShip && u.def.kind !== 'HQ' && u.def.kind !== 'FACTORY').length;
    const inbound = eco.productions
      .filter((p) => p.faction === 'ENEMY')
      .reduce((s, p) => s + p.battalion.units.reduce((a, u) => a + u.n, 0), 0);
    const queued = eco.productions.filter((p) => p.faction === 'ENEMY');
    const qAir = queued.filter((p) => p.battalion.air).length;
    const qNaval = queued.filter((p) => p.battalion.naval).length;
    const qMSAM = queued.filter((p) => p.battalion.id === 'E_MSAM').length;

    // what does the intelligence picture demand?
    const friendlyHulls = ctx.units.filter((u) => u.faction === 'FRIEND' && u.isShip && !u.dead);
    const fleetSpotted = friendlyHulls.some((h) => this.intel.near(h.x, h.y, 400, 0.5).length > 0);
    const airThreat = ctx.units.some(
      (u) => u.faction === 'FRIEND' && u.isAir && !u.dead && (u.airState === 'PATROL' || u.airState === 'INBOUND')
    );
    const armorMass = this.intel.armoredMass();

    // counterstroke fund: while a counterattack is brewing, hoard
    const savingForStrike = this.counterattackT > 90 && eco.ink.ENEMY < 480;

    let want: string | null = null;
    if (airThreat && msam + qMSAM < 2 && eco.ink.ENEMY >= 190) {
      want = 'E_MSAM'; // air power answered with area denial
    } else if (airThreat && ad < 4 && eco.ink.ENEMY >= 110) {
      want = 'E_AD';
    } else if (fleetSpotted && cas + qAir < 2 && eco.ink.ENEMY >= 150) {
      want = 'E_AIR'; // the Frogfoot hunts the fleet
    } else if (fleetSpotted && pts + qNaval < 3 && eco.ink.ENEMY >= 70) {
      want = 'E_PT';
    } else if (armorMass && cas + qAir < 2 && eco.ink.ENEMY >= 150) {
      want = 'E_AIR'; // CAS against a tank concentration
    } else if (savingForStrike) {
      want = null; // the purse fills
    } else if (rec < 2 && eco.ink.ENEMY >= 60) {
      want = 'E_REC';
    } else if (arty < 3 && eco.ink.ENEMY >= 120) {
      want = 'E_GUN';
    } else if (combat + inbound < ENEMY_UNIT_CAP - 4) {
      want = eco.ink.ENEMY >= 240 ? 'E_TANK' : eco.ink.ENEMY >= 190 ? 'E_MECH' : null;
    }
    // never hoard without purpose — a fat purse still buys tanks
    if (!want && !savingForStrike && eco.ink.ENEMY >= 340 && combat + inbound < ENEMY_UNIT_CAP - 2) want = 'E_TANK';

    if (want) eco.purchase('ENEMY', want);
  }

  // ── helpers ───────────────────────────────────────────────

  private groupStrength(g: BattleGroup): number {
    let s = 0;
    for (const u of g.units) if (!u.dead) s += Math.max(0.15, u.hp / u.def.hp);
    return s;
  }

  private groupStrengthFrac(g: BattleGroup): number {
    if (!g.units.length) return 0;
    return this.groupStrength(g) / Math.max(1, g.strength0);
  }

  private hottestGroup(): BattleGroup | null {
    let best: BattleGroup | null = null;
    let bestThreat = -1;
    for (const g of this.groups) {
      if (g.mission === 'WITHDRAW' || g.mission === 'REGROUP') continue;
      const threat = this.intel.strengthNear(g.anchor.x, g.anchor.y, 1400);
      const frac = this.groupStrengthFrac(g);
      const score = threat * (1.2 - frac);
      if (score > bestThreat && score > 1) {
        bestThreat = score;
        best = g;
      }
    }
    return best;
  }
}
