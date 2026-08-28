// ─────────────────────────────────────────────────────────────
// PAPER STORM · the ink economy
// Ink is the player's ability to sustain and expand the
// operation. Base income trickles always; ground captured on
// the sheet pays; ink works pay heavily — until they burn.
// Ink buys battalions. Battalions take ground. Ground pays ink.
// ─────────────────────────────────────────────────────────────

import type { BattalionDef, Faction, Sector } from '../core/types';
import type { SimContext } from '../entities/units';
import { Unit } from '../entities/units';
import type { UnitType } from '../entities/unitDefs';
import { FRIEND_ROSTER, RosterEntry } from '../entities/roster';
import { dist } from '../core/math';

// ── purchasable formations ────────────────────────────────────

function b(
  id: string,
  name: string,
  comp: string,
  kinds: string[],
  cost: number,
  buildTime: number,
  desc: string,
  units: { type: UnitType; n: number }[],
  air = false,
  naval = false
): BattalionDef {
  return { id, name, composition: comp, kinds, cost, buildTime, desc, units, air, naval };
}

/** the player's arsenal — one unit per purchase (see roster.ts) */
export const FRIEND_BATTALIONS: RosterEntry[] = FRIEND_ROSTER;

/** what the enemy raises at his HQ */
export const ENEMY_BATTALIONS: BattalionDef[] = [
  b('E_TANK', 'TANK PLATOON', '3× MBT', ['MBT', 'MBT', 'MBT'], 240, 42,
    '', [{ type: 'T90M', n: 3 }]),
  b('E_MECH', 'MECH PLATOON', '1× MBT + 2× IFV', ['MBT', 'IFV', 'IFV'], 190, 36,
    '', [{ type: 'T90M', n: 1 }, { type: 'BMP3', n: 2 }]),
  b('E_AD', 'AD SECTION', '1× SAM', ['AD'], 110, 26,
    '', [{ type: 'PANTSIR', n: 1 }]),
  b('E_MSAM', 'SAM BATTERY', '1× M-SAM', ['AD'], 190, 55,
    '', [{ type: 'BUK', n: 1 }]),
  b('E_GUN', 'GUN SECTION', '1× SPG', ['SPG'], 120, 28,
    '', [{ type: '2S19', n: 1 }]),
  b('E_REC', 'RECON PROBE', '1× REC', ['REC'], 60, 18,
    '', [{ type: 'BTR82A', n: 1 }]),
  b('E_AIR', 'CAS SORTIE', '1× CAS', ['AIR'], 150, 40,
    '', [{ type: 'SU25K', n: 1 }], true),
  b('E_PT', 'PATROL CRAFT', '1× PT', ['SEA'], 70, 30,
    '', [{ type: 'PATROL', n: 1 }], false, true),
];

const BASE_INCOME: Record<Faction, number> = { FRIEND: 2.2, ENEMY: 2.0 };
const FACTORY_INCOME = 5;
const FACTORY_CAPTURE_RADIUS = 250;
const FACTORY_CAPTURE_TIME = 7;
/** the player plans in single units and may queue a deep build order */
const MAX_QUEUE: Record<Faction, number> = { FRIEND: 6, ENEMY: 3 };
export const ENEMY_UNIT_CAP = 46;

interface ProductionItem {
  id: number;
  faction: Faction;
  battalion: BattalionDef;
  remaining: number;
  total: number;
}

export class InkEconomy {
  ink: Record<Faction, number> = { FRIEND: 0, ENEMY: 0 };
  sectors: Sector[] = [];
  productions: ProductionItem[] = [];
  private nextProdId = 1;

  /** where friendly reinforcements march in from */
  friendlyEntry = { x: 1300, y: 5560 };
  friendlyAssembly = { x: 1950, y: 4550 };
  /** where enemy reinforcements arrive */
  enemyEntry = { x: 7600, y: 150 };
  enemyRally = { x: 7050, y: 900 };

  stats = { inkEarned: 0, inkSpent: 0, battalionsDeployed: 0, factoriesHeld: 0 };
  private counters = new Map<string, number>();
  private aiBuyCooldown = 20;

  constructor(sectors: Sector[], startInk: Record<Faction, number>) {
    this.sectors = sectors;
    this.ink = { ...startInk };
  }

  // ── income ─────────────────────────────────────────────────

  incomeOf(faction: Faction, ctx?: SimContext): { base: number; sectors: number; factories: number } {
    const base = BASE_INCOME[faction];
    let sectors = 0;
    for (const s of this.sectors) {
      if (s.control === faction) sectors += s.income;
    }
    let factories = 0;
    if (ctx) {
      for (const u of ctx.units) {
        if (u.dead || u.def.kind !== 'FACTORY' || u.factoryCtl !== faction) continue;
        const damaged = u.hp < u.def.hp * 0.4 ? 0.5 : 1;
        factories += FACTORY_INCOME * damaged;
      }
    }
    return { base, sectors, factories };
  }

  totalIncome(faction: Faction, ctx?: SimContext): number {
    const i = this.incomeOf(faction, ctx);
    return i.base + i.sectors + i.factories;
  }

  // ── main tick ──────────────────────────────────────────────

  update(dt: number, ctx: SimContext) {
    // income
    for (const faction of ['FRIEND', 'ENEMY'] as Faction[]) {
      const inc = this.totalIncome(faction, ctx);
      this.ink[faction] += inc * dt;
      if (faction === 'FRIEND') this.stats.inkEarned += inc * dt;
    }

    this.updateSectors(dt, ctx);
    this.updateFactories(dt, ctx);
    this.updateProduction(dt, ctx);
  }

  private updateSectors(dt: number, ctx: SimContext) {
    for (const s of this.sectors) {
      let friend = 0;
      let enemy = 0;
      for (const u of ctx.units) {
        if (u.dead || u.isAir || u.def.kind === 'FACTORY' || u.def.kind === 'HQ') continue;
        if (dist(u.x, u.y, s.pos.x, s.pos.y) < s.radius) {
          if (u.faction === 'FRIEND') friend++;
          else enemy++;
        }
      }
      if (friend > 0 && enemy === 0 && s.control !== 'FRIEND') {
        s.capturing = 'FRIEND';
        s.captureT += dt;
        if (s.captureT >= s.captureTime) {
          s.control = 'FRIEND';
          s.captureT = 0;
          s.capturing = null;
          ctx.log(`${s.name} SECURED — GROUND PAYS +${s.income.toFixed(1)} INK/S`, 'economy');
        }
      } else if (enemy > 0 && friend === 0 && s.control !== 'ENEMY') {
        s.capturing = 'ENEMY';
        s.captureT += dt;
        if (s.captureT >= s.captureTime) {
          const was = s.control;
          s.control = 'ENEMY';
          s.captureT = 0;
          s.capturing = null;
          if (was === 'FRIEND') {
            ctx.log(`${s.name} LOST — ENEMY HOLDS THE GROUND`, 'alert');
          } else if (was === 'NEUTRAL') {
            ctx.log(`ENEMY SECURED ${s.name}`, 'contact');
          }
        }
      } else if (friend > 0 && enemy > 0) {
        // contested — progress freezes and decays
        s.captureT = Math.max(0, s.captureT - dt * 0.5);
        if (s.captureT === 0) s.capturing = null;
      } else {
        s.captureT = Math.max(0, s.captureT - dt * 0.4);
        if (s.captureT === 0) s.capturing = null;
      }
    }
  }

  private updateFactories(dt: number, ctx: SimContext) {
    for (const u of ctx.units) {
      if (u.dead || u.def.kind !== 'FACTORY') continue;
      let friend = 0;
      let enemy = 0;
      for (const o of ctx.units) {
        if (o.dead || o.isAir || o === u || o.def.kind === 'FACTORY' || o.def.kind === 'HQ') continue;
        if (dist(o.x, o.y, u.x, u.y) < FACTORY_CAPTURE_RADIUS) {
          if (o.faction === 'FRIEND') friend++;
          else enemy++;
        }
      }
      if (friend > 0 && enemy === 0 && u.factoryCtl !== 'FRIEND') {
        u.capturing = 'FRIEND';
        u.captureT += dt;
        if (u.captureT >= FACTORY_CAPTURE_TIME) {
          const was = u.factoryCtl;
          u.factoryCtl = 'FRIEND';
          u.faction = 'FRIEND';
          u.captureT = 0;
          u.capturing = null;
          if (was === 'NEUTRAL') {
            ctx.log(`${u.callsign} OCCUPIED — INK WORKS ONLINE (+${FACTORY_INCOME}/S)`, 'economy');
          } else {
            ctx.log(`${u.callsign} CAPTURED — INK WORKS ONLINE (+${FACTORY_INCOME}/S)`, 'economy');
          }
        }
      } else if (enemy > 0 && friend === 0 && u.factoryCtl !== 'ENEMY') {
        u.capturing = 'ENEMY';
        u.captureT += dt;
        if (u.captureT >= FACTORY_CAPTURE_TIME) {
          const was = u.factoryCtl;
          u.factoryCtl = 'ENEMY';
          u.faction = 'ENEMY';
          u.captureT = 0;
          u.capturing = null;
          if (was === 'FRIEND') {
            ctx.log(`${u.callsign} OVERRUN — WORKS LOST TO THE ENEMY`, 'alert');
          }
        }
      } else if (friend > 0 && enemy > 0) {
        u.captureT = Math.max(0, u.captureT - dt * 0.5);
        if (u.captureT === 0) u.capturing = null;
      } else {
        u.captureT = Math.max(0, u.captureT - dt * 0.4);
        if (u.captureT === 0) u.capturing = null;
      }
    }
  }

  // ── production ─────────────────────────────────────────────

  canQueue(faction: Faction): boolean {
    return this.productions.filter((p) => p.faction === faction).length < MAX_QUEUE[faction];
  }

  purchase(faction: Faction, battalionId: string): BattalionDef | null {
    const roster = faction === 'FRIEND' ? FRIEND_BATTALIONS : ENEMY_BATTALIONS;
    const def = roster.find((bb) => bb.id === battalionId);
    if (!def) return null;
    if (this.ink[faction] < def.cost) return null;
    if (!this.canQueue(faction)) return null;
    this.ink[faction] -= def.cost;
    if (faction === 'FRIEND') this.stats.inkSpent += def.cost;
    this.productions.push({
      id: this.nextProdId++,
      faction,
      battalion: def,
      remaining: def.buildTime,
      total: def.buildTime,
    });
    return def;
  }

  private updateProduction(dt: number, ctx: SimContext) {
    for (let i = this.productions.length - 1; i >= 0; i--) {
      const p = this.productions[i];
      p.remaining -= dt;
      if (p.remaining > 0) continue;
      this.productions.splice(i, 1);
      this.spawnBattalion(p.battalion, p.faction, ctx);
    }
  }

  private spawnBattalion(battalion: BattalionDef, faction: Faction, ctx: SimContext) {
    if (faction === 'FRIEND') {
      this.stats.battalionsDeployed++;
      if (battalion.naval) {
        // hulls make their number from open water and join the anchorage
        ctx.log(`${battalion.name} SIGHTED — MAKING FOR THE ANCHORAGE`, 'economy');
        const sea = ctx.terrain.sea;
        let idx = 0;
        const total = battalion.units.reduce((s, u) => s + u.n, 0);
        for (const spec of battalion.units) {
          for (let i = 0; i < spec.n; i++) {
            const u = this.spawnUnit(spec.type, 'FRIEND', sea.entry, ctx);
            u.isReinforcement = true;
            // berth in line ahead east of the anchorage marker
            const ang = Math.PI * 0.85;
            const off = (idx - (total - 1) / 2) * 130;
            const berth = {
              x: sea.anchorage.x + Math.cos(ang + Math.PI / 2) * off,
              y: sea.anchorage.y + Math.sin(ang + Math.PI / 2) * off,
            };
            u.orderMove(berth, ctx);
            idx++;
          }
        }
        return;
      }
      ctx.log(`${battalion.name} ARRIVING — MOVING TO ASSEMBLY ALPHA`, 'economy');
      let idx = 0;
      const total = battalion.units.reduce((s, u) => s + u.n, 0);
      for (const spec of battalion.units) {
        for (let i = 0; i < spec.n; i++) {
          const u = this.spawnUnit(spec.type, 'FRIEND', this.friendlyEntry, ctx);
          u.isReinforcement = true;
          // column into the assembly area
          const ang = Math.PI / 2 + Math.PI; // heading north-west into the map
          const off = (idx - (total - 1) / 2) * 46;
          const tx = this.friendlyAssembly.x + Math.cos(ang + Math.PI / 2) * off;
          const ty = this.friendlyAssembly.y + Math.sin(ang + Math.PI / 2) * off;
          u.orderMove({ x: tx, y: ty }, ctx);
          idx++;
        }
      }
      // aircraft deliver to the flight line, not the march column
      if (battalion.air) {
        ctx.log(`${battalion.name} ON THE FLIGHT LINE — LAUNCH VIA AIR OPERATIONS`, 'info');
      }
    } else {
      // enemy reinforcements — capped so the sheet stays readable
      const enemyCombat = ctx.units.filter(
        (u) => u.faction === 'ENEMY' && !u.dead && !u.isAir && u.def.kind !== 'HQ' && u.def.kind !== 'FACTORY'
      ).length;
      const incoming = battalion.units.reduce((s, u) => s + u.n, 0);
      const navalUnit = battalion.naval === true;
      const airUnit = battalion.air === true;
      if (!navalUnit && !airUnit && enemyCombat + incoming > ENEMY_UNIT_CAP) {
        // refund — the enemy bank keeps the ink for later
        this.ink.ENEMY += battalion.cost * 0.6;
        return;
      }
      if (battalion.naval) {
        // enemy hulls sortie from PORT AZURE
        ctx.log(`ENEMY HULL SORTIE — ${battalion.name}`, 'contact');
        const sea = ctx.terrain.sea;
        const harbour = sea.harbour;
        const at = harbour ? { x: harbour.pos.x - 40, y: harbour.pos.y + 90 } : sea.entry;
        for (const spec of battalion.units) {
          for (let i = 0; i < spec.n; i++) {
            const u = this.spawnUnit(spec.type, 'ENEMY', at, ctx);
            const berth = harbour
              ? { x: harbour.pos.x + 120 + Math.random() * 140, y: harbour.pos.y + 150 + Math.random() * 90 }
              : { x: sea.anchorage.x + (Math.random() - 0.5) * 300, y: sea.anchorage.y + (Math.random() - 0.5) * 200 };
            u.orderMove(berth, ctx);
            u.defendPos = berth;
          }
        }
        return;
      }
      if (battalion.air) {
        ctx.log(`ENEMY AIR — ${battalion.name} INBOUND`, 'contact');
        for (const spec of battalion.units) {
          for (let i = 0; i < spec.n; i++) {
            const u = this.spawnUnit(spec.type, 'ENEMY', this.enemyEntry, ctx);
            // straight onto station over the bay
            u.launchAir({ x: 5000, y: 3200 });
          }
        }
        return;
      }
      ctx.log(`ENEMY REINFORCEMENTS — ${battalion.name}`, 'contact');
      let idx = 0;
      for (const spec of battalion.units) {
        for (let i = 0; i < spec.n; i++) {
          const u = this.spawnUnit(spec.type, 'ENEMY', this.enemyEntry, ctx);
          // heavy SAM batteries emplace covering the HQ approaches —
          // they do not join the rally, they ARE the position
          if (spec.type === 'BUK') {
            const berth = { x: 6900 + this.rngRange(0, 160), y: 420 + this.rngRange(0, 140) };
            u.orderMove(berth, ctx);
            u.defendPos = berth;
            ctx.log(`ENEMY SAM BATTERY EMPLACING NORTH — AIRCRAFT WARNED`, 'alert');
            continue;
          }
          const a = (idx / Math.max(1, battalion.units.length)) * Math.PI * 2;
          const rally = {
            x: this.enemyRally.x + Math.cos(a) * 140,
            y: this.enemyRally.y + Math.sin(a) * 100,
          };
          u.orderMove(rally, ctx);
          u.defendPos = rally;
          idx++;
        }
      }
    }
  }

  private spawnUnit(type: string, faction: Faction, at: { x: number; y: number }, ctx: SimContext): Unit {
    const callsign = this.nextCallsign(type, faction);
    const u = new Unit(type as UnitType, faction, at.x + (Math.random() - 0.5) * 60, at.y + (Math.random() - 0.5) * 40, callsign, ctx.time | 0);
    u.angle = faction === 'FRIEND' ? -Math.PI / 3 : Math.PI / 2;
    u.turretAngle = u.angle;
    ctx.units.push(u);
    return u;
  }

  private nextCallsign(type: string, faction: Faction): string {
    const prefix =
      faction === 'FRIEND'
        ? type === 'M1A2' ? 'SABRE' : type === 'M2A3' ? 'RAIDER' : type === 'M109A7' ? 'HAMMER' : type === 'M1127' ? 'SCOUT' : type === 'RIFLE' ? 'RIFLE'
          : type === 'VULCAN' ? 'IRON' : type === 'LINEBACKER' ? 'GUARD' : type === 'NASAMS' ? 'SHIELD' : type === 'PATRIOT' ? 'SENTRY' : type === 'F16C' ? 'VIPER' : type === 'A10C' ? 'TALON'
          : type === 'PATROL' ? 'SPEAR' : type === 'FRIGATE' ? 'AXE' : type === 'DESTROYER' ? 'LANCE' : type === 'CRUISER' ? 'CROWN' : 'VELIKIY'
        : type === 'T90M' ? 'TK' : type === 'BMP3' ? 'MEC' : type === 'BTR82A' ? 'REC' : type === '2S19' ? 'GUN' : type === 'SU25K' ? 'CLAW'
          : type === 'PATROL' ? 'KPT' : type === 'BUK' ? 'DOME' : 'AD';
    // continue the initial task force's numbering; new systems start at 1
    const starts: Record<string, number> = { SABRE: 3, RAIDER: 2, HAMMER: 2, SCOUT: 2, TALON: 1, RIFLE: 0, IRON: 0, GUARD: 0, SHIELD: 0, SENTRY: 0, VIPER: 0 };
    const n = (this.counters.get(prefix) ?? starts[prefix] ?? 3) + 1;
    this.counters.set(prefix, n);
    return `${prefix} ${n}`;
  }

  private rngRange(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }

  // ── combat rewards ─────────────────────────────────────────

  /** bounty for the destroying side — momentum, not snowball */
  onUnitDestroyed(u: Unit, ctx: SimContext) {
    if (u.def.bounty <= 0) return;
    if (u.faction === 'ENEMY') {
      this.ink.FRIEND += u.def.bounty;
      this.stats.inkEarned += u.def.bounty;
      ctx.log(`+${u.def.bounty} INK — ${u.def.shortName} DESTROYED`, 'economy');
    } else {
      this.ink.ENEMY += u.def.bounty * 0.7;
    }
  }

  onFactoryDestroyed(u: Unit) {
    void u;
    // the structure's income simply stops; control marks burn with it
  }

  /** enemy AI purse behaviour — called from EnemyCommander */
  aiThink(dt: number, ctx: SimContext) {
    this.aiBuyCooldown -= dt;
    if (this.aiBuyCooldown > 0) return;
    this.aiBuyCooldown = 14 + Math.random() * 8;

    const enemies = ctx.units.filter((u) => u.faction === 'ENEMY' && !u.dead);
    const arty = enemies.filter((u) => u.def.kind === 'SPG').length;
    const ad = enemies.filter((u) => u.def.kind === 'SPAA').length;
    const msam = enemies.filter((u) => u.def.type === 'BUK').length;
    const rec = enemies.filter((u) => u.def.kind === 'REC').length;
    const pts = enemies.filter((u) => u.isShip).length;
    const cas = enemies.filter((u) => u.isAir && u.airState !== 'STANDBY' && u.airState !== 'DOWN').length;
    const combat = enemies.filter((u) => !u.isAir && !u.isShip && u.def.kind !== 'HQ' && u.def.kind !== 'FACTORY').length;
    // don't buy what cannot deploy — the cap includes everything already inbound
    const inbound = this.productions
      .filter((p) => p.faction === 'ENEMY')
      .reduce((s, p) => s + p.battalion.units.reduce((a, u) => a + u.n, 0), 0);

    // does the enemy see friendly hulls on the water? then the bay
    // is a war and he fights it: air to hunt them, hulls to screen
    const friendlyHulls = ctx.units.filter((u) => u.faction === 'FRIEND' && u.isShip && !u.dead);
    const fleetSpotted = friendlyHulls.length > 0;
    // is the player flying? then the sky needs defending — a medium
    // SAM battery is the counter to an air habit
    const friendlyAirActive = ctx.units.some(
      (u) => u.faction === 'FRIEND' && u.isAir && !u.dead && (u.airState === 'PATROL' || u.airState === 'INBOUND')
    );
    // count what is already on the ways — no buying past the cap
    const queued = this.productions.filter((p) => p.faction === 'ENEMY');
    const queuedAir = queued.filter((p) => p.battalion.air).length;
    const queuedNaval = queued.filter((p) => p.battalion.naval).length;
    const queuedMSAM = queued.filter((p) => p.battalion.id === 'E_MSAM').length;

    let want: string | null = null;
    if (fleetSpotted && cas + queuedAir < 2 && this.ink.ENEMY >= 150 && Math.random() < 0.65) {
      want = 'E_AIR'; // the Frogfoot goes after the fleet
    } else if (fleetSpotted && pts + queuedNaval < 3 && this.ink.ENEMY >= 70 && Math.random() < 0.5) {
      want = 'E_PT';
    } else if (friendlyAirActive && msam + queuedMSAM < 1 && this.ink.ENEMY >= 190) {
      want = 'E_MSAM'; // air power answered with area denial
    } else if (rec < 1 && this.ink.ENEMY >= 60) {
      want = 'E_REC';
    } else if (arty < 2 && this.ink.ENEMY >= 120) {
      want = 'E_GUN';
    } else if (ad < 3 && this.ink.ENEMY >= 110) {
      want = 'E_AD';
    } else if (combat + inbound < ENEMY_UNIT_CAP - 2) {
      want = this.ink.ENEMY >= 240 ? 'E_TANK' : this.ink.ENEMY >= 190 ? 'E_MECH' : null;
    }
    // never hoard — if the purse is fat and there is room, strike again
    if (!want && this.ink.ENEMY >= 320 && combat + inbound < ENEMY_UNIT_CAP - 2) want = 'E_TANK';

    if (want) this.purchase('ENEMY', want);
  }

  // ── queries for HUD ────────────────────────────────────────

  sectorsHeld(faction: Faction): number {
    return this.sectors.filter((s) => s.control === faction).length;
  }
}
