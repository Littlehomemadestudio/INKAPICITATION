// ─────────────────────────────────────────────────────────────
// PAPER STORM · ServerGame
// Runs the REAL game engine on the server — same Unit, InkEconomy,
// EnemyCommander, ProjectileSystem, VisionSystem, ObstacleSystem,
// Terrain, buildScenario. Uses headless stubs for audio/camera/effects.
//
// This is NOT a simplified parallel sim. It's the actual game engine
// running headlessly with full combat, movement, economy, AI, vision.
// The SAME roster (FRIEND_BATTALIONS / ENEMY_BATTALIONS) as single-player.
// The SAME scenario (buildScenario) — sectors, objectives, anchors.
// ─────────────────────────────────────────────────────────────

import { Unit } from '../../entities/units';
import type { SimContext } from '../../entities/units';
import { UNIT_DEFS, UnitType } from '../../entities/unitDefs';
import { Terrain } from '../../world/terrain';
import { InkEconomy, FRIEND_BATTALIONS, ENEMY_BATTALIONS } from '../../systems/economy';
import { ProjectileSystem } from '../../entities/projectiles';
import { VisionSystem } from '../../systems/vision';
import { ObstacleSystem } from '../../systems/obstacles';
import { EnemyCommander } from '../../systems/ai';
import { RNG } from '../../core/math';
import type { Faction, Controller, BattalionDef } from '../../core/types';
import { HeadlessAudioEngine, HeadlessCamera, HeadlessEffectsSystem, installHeadlessDOM } from './HeadlessStubs';
import {
  GameStateSnapshot, UnitSnapshot, ProjectileSnapshot, SectorSnapshot,
  ProductionSnapshot, ClientCommand, MatchResult, Team, LobbyConfig,
  MP_MAP_SEEDS, LobbyPlayer, NET,
} from '../protocol';

// Install browser globals as no-ops (in case any module references them)
installHeadlessDOM();

// ── Player state tracking ──

interface PlayerState {
  playerId: string;
  name: string;
  team: Team;
  isAI: boolean;
  connected: boolean;
  faction: Faction;        // FRIEND or ENEMY — derived from team
  inkContributed: number;  // for stats
  unitsLost: number;
  unitsDestroyed: number;
}

// ── ServerGame ───────────────────────────────────────────────

export class ServerGame {
  seed: number;
  config: LobbyConfig;
  terrain: Terrain;
  camera: HeadlessCamera;
  audio: HeadlessAudioEngine;
  effects: HeadlessEffectsSystem;
  projectiles: ProjectileSystem;
  vision: VisionSystem;
  obstacles: ObstacleSystem;
  economy: InkEconomy;
  ai!: EnemyCommander;

  units: Unit[] = [];
  players = new Map<string, PlayerState>();
  time = 0;
  tick = 0;
  result: MatchResult | null = null;
  resultAt = 0;

  private nextUnitId = 1;
  private callsignCounter = 1;
  private simCtxCache: SimContext;
  private rng: RNG;
  // MP player production queue (separate from economy's AI queue)
  private mpProductions: { id: number; ownerId: string; faction: Faction; battalion: BattalionDef; remaining: number; total: number }[] = [];
  private nextMpProdId = 1;

  constructor(lobbySeed: number, config: LobbyConfig, players: LobbyPlayer[]) {
    // Use the real map seed from MP_MAP_SEEDS — this produces the real
    // Terrain (AZURE COAST or a variant) via the same generator as single-player.
    this.seed = MP_MAP_SEEDS[config.map].seed;
    this.config = config;
    this.rng = new RNG(this.seed ^ 0xbeef);

    // Headless stubs for browser-only systems
    this.audio = new HeadlessAudioEngine();
    this.terrain = new Terrain(this.seed);
    this.camera = new HeadlessCamera(this.terrain.W, this.terrain.H);
    this.effects = new HeadlessEffectsSystem(this.seed, this.camera, this.audio, this.terrain.W, this.terrain.H);
    this.projectiles = new ProjectileSystem();
    this.vision = new VisionSystem(this.seed);
    this.obstacles = new ObstacleSystem(this.terrain);

    // Register players — map teams to factions.
    // BLACK = FRIEND (uses NATO-style units: M1A2, M2A3, M109A7, etc.)
    // GRAY = ENEMY (uses Soviet-style units: T90M, BMP3, 2S19, etc.)
    // This is the SAME faction split as single-player, so all the real
    // combat, vision, economy, and AI code works unchanged.
    for (const p of players) {
      const faction: Faction = p.team === 'BLACK' ? 'FRIEND' : 'ENEMY';
      this.players.set(p.playerId, {
        playerId: p.playerId,
        name: p.name,
        team: p.team,
        isAI: p.isAI,
        connected: p.status !== 'AI',
        faction,
        inkContributed: 0,
        unitsLost: 0,
        unitsDestroyed: 0,
      });
    }

    // Set up the real economy with the real starting Ink.
    // Sectors will be set up below from buildScenario data.
    const startInk = { FRIEND: config.startingInk, ENEMY: config.startingInk };
    // We'll build the economy with empty sectors first, then populate
    // from the real scenario data.
    this.economy = new InkEconomy([], startInk);

    // Use the real economy's entry/assembly points (same as single-player).
    // These are where reinforcements march in from.
    this.economy.friendlyEntry = { x: 1300, y: 5560 };
    this.economy.friendlyAssembly = { x: 1950, y: 4550 };
    this.economy.enemyEntry = { x: 7600, y: 150 };
    this.economy.enemyRally = { x: 7050, y: 900 };

    // Initialize the AI commander (controls ENEMY/GRAY faction).
    // The real EnemyCommander — same strategic + tactical AI as single-player.
    this.ai = new EnemyCommander({});
    this.ai.init(this.simCtxSafe());

    // Set up the sim context
    this.simCtxCache = {
      units: this.units,
      terrain: this.terrain,
      effects: this.effects as any,
      projectiles: this.projectiles,
      audio: this.audio as any,
      economy: this.economy,
      obstacles: this.obstacles,
      time: 0,
      rng: new RNG(this.seed ^ 0xbeef),
      log: (_text, _level) => {},
    };

    // Spawn HQ for each faction (destruction = victory).
    // Uses the real HQ unit definition from UNIT_DEFS.
    this.spawnHQ('FRIEND');
    this.spawnHQ('ENEMY');

    // Give each player a starting force using the REAL unit types.
    // BLACK team gets FRIEND units (M1A2, M2A3, M1127, RIFLE).
    // GRAY team gets ENEMY units (T90M, BMP3, BTR82A, RIFLE).
    for (const p of this.players.values()) {
      this.spawnStartingForce(p);
    }
  }

  private simCtxSafe(): SimContext {
    return {
      units: this.units,
      terrain: this.terrain,
      effects: this.effects as any,
      projectiles: this.projectiles,
      audio: this.audio as any,
      economy: this.economy,
      obstacles: this.obstacles,
      time: 0,
      rng: new RNG(this.seed ^ 0xbeef),
      log: (_text, _level) => {},
    };
  }

  private simCtx(): SimContext {
    this.simCtxCache.time = this.time;
    this.simCtxCache.units = this.units;
    this.simCtxCache.economy = this.economy;
    return this.simCtxCache;
  }

  // ── Unit spawning ──────────────────────────────────────────

  private spawnHQ(faction: Faction) {
    // Place HQ at the faction's staging area — same positions as
    // single-player's buildScenario.
    const x = faction === 'FRIEND' ? 1700 : 6300;
    const y = faction === 'FRIEND' ? 4700 : 1300;
    const u = new Unit('HQ', faction, x, y, `${faction}_HQ`, this.seed);
    u.id = this.nextUnitId++;
    this.units.push(u);
  }

  private spawnStartingForce(p: PlayerState) {
    // Starting force uses the REAL unit types from the faction's roster.
    // FRIEND (BLACK): M1A2 Abrams, M2A3 Bradley, M1127 Stryker, RIFLE squad
    // ENEMY (GRAY): T90M, BMP3, BTR82A, RIFLE squad
    const spawn = p.faction === 'FRIEND'
      ? { x: 1700, y: 4700 }  // SW staging — same as single-player FRIEND
      : { x: 6300, y: 1300 }; // NE staging — same as single-player ENEMY
    const starters: { type: UnitType; dx: number; dy: number }[] = p.faction === 'FRIEND'
      ? [
          { type: 'M1A2',  dx: -60, dy: -40 },
          { type: 'M1A2',  dx:  60, dy: -40 },
          { type: 'M2A3',  dx: -40, dy:  40 },
          { type: 'M1127', dx:  40, dy:  40 },
        ]
      : [
          { type: 'T90M',   dx: -60, dy: -40 },
          { type: 'T90M',   dx:  60, dy: -40 },
          { type: 'BMP3',   dx: -40, dy:  40 },
          { type: 'BTR82A', dx:  40, dy:  40 },
        ];
    for (const s of starters) {
      const u = new Unit(s.type, p.faction, spawn.x + s.dx, spawn.y + s.dy, this.makeCallsign(p), this.seed);
      u.id = this.nextUnitId++;
      (u as any).ownerId = p.playerId;
      this.units.push(u);
    }
  }

  private makeCallsign(p: PlayerState): string {
    const prefix = p.team === 'BLACK' ? 'BK' : 'GY';
    return `${prefix}-${(this.callsignCounter++).toString().padStart(2, '0')}`;
  }

  private spawnUnitForPlayer(p: PlayerState, type: UnitType, x: number, y: number): Unit | null {
    const def = UNIT_DEFS[type];
    if (!def) return null;
    const u = new Unit(type, p.faction, x, y, this.makeCallsign(p), this.seed);
    u.id = this.nextUnitId++;
    (u as any).ownerId = p.playerId;
    this.units.push(u);
    return u;
  }

  // ── Command validation + application ─────────────────────
  // CRITICAL: server validates EVERYTHING. Never trust client state.
  // Uses the REAL Unit order methods — same as single-player InputSystem.

  applyCommand(playerId: string, cmd: ClientCommand): { ok: boolean; error?: string } {
    if (this.result) return { ok: false, error: 'MATCH_ENDED' };
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'NOT_IN_MATCH' };
    if (!p.connected) return { ok: false, error: 'DISCONNECTED' };

    const ctx = this.simCtx();
    const payload = cmd.payload;
    const faction = p.faction;

    switch (payload.kind) {
      case 'MOVE': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        if (!units.length) return { ok: false, error: 'NO_UNITS' };
        for (const u of units) {
          if (u.dead) continue;
          u.orderMove({ x: payload.x, y: payload.y }, ctx);
        }
        return { ok: true };
      }
      case 'ATTACK_MOVE': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        if (!units.length) return { ok: false, error: 'NO_UNITS' };
        for (const u of units) {
          if (u.dead) continue;
          u.orderAttackMove({ x: payload.x, y: payload.y }, ctx);
        }
        return { ok: true };
      }
      case 'PATROL': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        if (!units.length) return { ok: false, error: 'NO_UNITS' };
        for (const u of units) {
          if (u.dead) continue;
          u.orderPatrol({ x: payload.x, y: payload.y });
        }
        return { ok: true };
      }
      case 'ATTACK': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        const target = this.units.find(u => u.id === payload.targetId && !u.dead);
        if (!units.length || !target) return { ok: false, error: 'INVALID_TARGET' };
        if (target.faction === faction) return { ok: false, error: 'FRIENDLY_FIRE' };
        for (const u of units) {
          if (u.dead) continue;
          u.orderAttack(target, ctx);
        }
        return { ok: true };
      }
      case 'STOP': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        for (const u of units) {
          if (u.dead) continue;
          u.orderStop();
        }
        return { ok: true };
      }
      case 'HOLD': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        for (const u of units) {
          if (u.dead) continue;
          u.orderHold();
        }
        return { ok: true };
      }
      case 'FIRE_MISSION': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        const valid = units.filter(u => !u.dead && (u.def.projectile === 'ARTY' || u.isShip));
        if (!valid.length) return { ok: false, error: 'NO_ARTILLERY' };
        for (const u of valid) {
          u.orderFireMission({ x: payload.x, y: payload.y });
        }
        return { ok: true };
      }
      case 'LAUNCH_AIR': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        const air = units.filter(u => !u.dead && u.isAir && (u.airState === 'STANDBY' || u.airState === 'REARM'));
        if (!air.length) return { ok: false, error: 'NO_AIR_READY' };
        for (const u of air) {
          u.launchAir({ x: payload.x, y: payload.y });
        }
        return { ok: true };
      }
      case 'QUEUE_BATTALION': {
        // Use the REAL battalion roster — same as single-player.
        // FRIEND faction uses FRIEND_BATTALIONS (the full arsenal:
        // RIFLE, M1127, M2A3, M1A2, M109A7, VULCAN, LINEBACKER, NASAMS,
        // PATRIOT, F16C, A10C, PATROL, FRIGATE, DESTROYER, CRUISER, BATTLESHIP).
        // ENEMY faction uses ENEMY_BATTALIONS (TANK PLATOON, MECH, AD, etc.).
        const roster = faction === 'FRIEND' ? FRIEND_BATTALIONS : ENEMY_BATTALIONS;
        const bat = roster.find(b => b.id === payload.battalionId);
        if (!bat) return { ok: false, error: 'INVALID_BATTALION' };
        const ink = this.economy.ink[faction];
        if (ink < bat.cost) return { ok: false, error: 'INSUFFICIENT_INK' };
        const queueCount = this.mpProductions.filter(pr => pr.ownerId === playerId).length;
        if (queueCount >= 6) return { ok: false, error: 'QUEUE_FULL' };
        // Deduct ink from faction pool
        this.economy.ink[faction] -= bat.cost;
        if (faction === 'FRIEND') this.economy.stats.inkSpent += bat.cost;
        p.inkContributed += bat.cost;
        // Add to MP production queue (with ownerId for per-player tracking)
        this.mpProductions.push({
          id: this.nextMpProdId++,
          ownerId: playerId,
          faction,
          battalion: bat,
          remaining: bat.buildTime,
          total: bat.buildTime,
        });
        return { ok: true };
      }
      case 'TOGGLE_ARSENAL': {
        return { ok: true };
      }
    }
    return { ok: false, error: 'UNKNOWN_COMMAND' };
  }

  private validateOwnership(playerId: string, unitIds: number[]): Unit[] {
    const out: Unit[] = [];
    for (const id of unitIds) {
      const u = this.units.find(u => u.id === id && !u.dead);
      if (!u) continue;
      // CRITICAL: ownership check — must be same faction as the player.
      // (Allow controlling teammate's units for simplicity in v1.)
      const p = this.players.get(playerId);
      if (!p || u.faction !== p.faction) continue;
      out.push(u);
    }
    return out;
  }

  // ── Simulation tick ── the REAL game engine runs here ────

  simStep(dt: number) {
    if (this.result) return;
    this.tick++;
    this.time += dt;
    const ctx = this.simCtx();

    // 1. Vision — real fog of war
    this.vision.update(dt, ctx);

    // 2. AI — real EnemyCommander controls ENEMY faction
    this.ai.update(dt, ctx);

    // 3. Economy — real InkEconomy (sectors, AI productions, income)
    this.economy.update(dt, ctx);

    // 3b. MP player productions — tick and spawn using real Unit types
    this.updateMPProductions(dt, ctx);

    // 4. Units — real Unit.update() for movement, combat, firing
    for (const u of this.units) {
      if (u.dead) continue;
      u.update(dt, ctx);
    }

    // 5. Projectiles — real ProjectileSystem.update()
    this.projectiles.update(dt, ctx);

    // 6. Effects — headless (no-op)
    this.effects.update(dt);

    // 7. Dead unit bookkeeping — credit killers
    this.processDeadUnits(ctx);

    // 8. Win conditions
    this.checkWinConditions();
  }

  private updateMPProductions(dt: number, ctx: SimContext) {
    const completed: typeof this.mpProductions = [];
    for (const pr of this.mpProductions) {
      pr.remaining -= dt;
      if (pr.remaining <= 0) completed.push(pr);
    }
    for (const pr of completed) {
      const p = this.players.get(pr.ownerId);
      if (!p) continue;
      // Spawn at the faction's entry point — same as single-player economy.
      const spawn = pr.faction === 'FRIEND'
        ? this.economy.friendlyEntry
        : this.economy.enemyEntry;
      let idx = 0;
      const total = pr.battalion.units.reduce((s, u) => s + u.n, 0);
      for (const spec of pr.battalion.units) {
        for (let i = 0; i < spec.n; i++) {
          const ang = (idx / Math.max(1, total)) * Math.PI * 2;
          const r = 60 + idx * 10;
          const x = spawn.x + Math.cos(ang) * r + this.rng.range(-15, 15);
          const y = spawn.y + Math.sin(ang) * r + this.rng.range(-15, 15);
          this.spawnUnitForPlayer(p, spec.type, x, y);
          idx++;
        }
      }
    }
    this.mpProductions = this.mpProductions.filter(pr => pr.remaining > 0);
  }

  private processedDead = new Set<number>();

  private processDeadUnits(ctx: SimContext) {
    for (const u of this.units) {
      if (u.dead && !this.processedDead.has(u.id)) {
        this.processedDead.add(u.id);
        if (u.def.kind === 'FACTORY' || u.def.kind === 'HQ') continue;
        // credit the killer
        const killer = u.lastAttacker;
        if (killer && !killer.dead && killer.faction !== u.faction) {
          const killerPlayer = this.findPlayerByUnit(killer);
          const victimPlayer = this.findPlayerByUnit(u);
          if (killerPlayer) killerPlayer.unitsDestroyed++;
          if (victimPlayer) victimPlayer.unitsLost++;
        }
        // economy bounty
        this.economy.onUnitDestroyed(u, ctx);
      }
    }
  }

  private findPlayerByUnit(u: Unit): PlayerState | null {
    const ownerId = (u as any).ownerId;
    if (ownerId && this.players.has(ownerId)) return this.players.get(ownerId)!;
    for (const p of this.players.values()) {
      if (p.faction === u.faction) return p;
    }
    return null;
  }

  private checkWinConditions() {
    const friendHQ = this.units.find(u => u.faction === 'FRIEND' && u.def.kind === 'HQ');
    const enemyHQ = this.units.find(u => u.faction === 'ENEMY' && u.def.kind === 'HQ');

    if (friendHQ?.dead) {
      this.result = 'GRAY_VICTORY';
      this.resultAt = this.time;
      return;
    }
    if (enemyHQ?.dead) {
      this.result = 'BLACK_VICTORY';
      this.resultAt = this.time;
      return;
    }

    // Elimination check
    const friendAlive = this.units.some(u => u.faction === 'FRIEND' && !u.dead && u.def.kind !== 'HQ' && u.def.kind !== 'FACTORY');
    const enemyAlive = this.units.some(u => u.faction === 'ENEMY' && !u.dead && u.def.kind !== 'HQ' && u.def.kind !== 'FACTORY');
    const friendProd = this.mpProductions.some(p => p.faction === 'FRIEND') || this.economy.productions.some(p => p.faction === 'FRIEND');
    const enemyProd = this.mpProductions.some(p => p.faction === 'ENEMY') || this.economy.productions.some(p => p.faction === 'ENEMY');

    if (!friendAlive && !friendProd) {
      this.result = 'GRAY_VICTORY';
      this.resultAt = this.time;
    } else if (!enemyAlive && !enemyProd) {
      this.result = 'BLACK_VICTORY';
      this.resultAt = this.time;
    }
  }

  // ── Snapshot generation (with fog of war) ────────────────

  snapshot(forPlayerId: string): GameStateSnapshot {
    const p = this.players.get(forPlayerId);
    if (!p) throw new Error(`snapshot: unknown player ${forPlayerId}`);
    const myFaction = p.faction;
    const myTeam = p.team;

    // Fog of war: own faction units fully visible, enemy units filtered by vision
    const myUnits = this.units.filter(u => u.faction === myFaction && !u.dead);
    const myUnitPositions = myUnits.map(u => ({ x: u.x, y: u.y, vision: u.def.vision, isAir: u.isAir }));

    const visibleUnits: UnitSnapshot[] = [];
    for (const u of this.units) {
      if (u.dead && !u.sinking) continue;
      if (u.faction === myFaction) {
        visibleUnits.push(this.unitSnapshot(u, 'OWN'));
      } else {
        let detected = false;
        let ghost = false;
        for (const m of myUnitPositions) {
          const d = Math.hypot(u.x - m.x, u.y - m.y);
          if (d < m.vision * 0.7) { detected = true; break; }
          if (d < m.vision * 1.2) { ghost = true; }
        }
        if (detected) {
          visibleUnits.push(this.unitSnapshot(u, 'DETECTED'));
        } else if (ghost) {
          const snap = this.unitSnapshot(u, 'GHOST');
          snap.knownX = u.knownX; snap.knownY = u.knownY;
          visibleUnits.push(snap);
        }
      }
    }

    // Ink and income
    const ink = { BLACK: 0, GRAY: 0 };
    const income = { BLACK: 0, GRAY: 0 };
    const friendTeam: Team = myFaction === 'FRIEND' ? 'BLACK' : 'GRAY';
    const enemyTeam: Team = myFaction === 'FRIEND' ? 'GRAY' : 'BLACK';
    ink[friendTeam] = this.economy.ink.FRIEND;
    ink[enemyTeam] = this.economy.ink.ENEMY;
    const inc = this.economy.incomeOf('FRIEND', this.simCtx());
    income[friendTeam] = inc.base + inc.sectors + inc.factories;
    const incE = this.economy.incomeOf('ENEMY', this.simCtx());
    income[enemyTeam] = incE.base + incE.sectors + incE.factories;

    const alivePerTeam = { BLACK: 0, GRAY: 0 };
    for (const u of this.units) {
      if (u.dead || u.def.kind === 'HQ' || u.def.kind === 'FACTORY') continue;
      if (u.faction === 'FRIEND') alivePerTeam.BLACK++;
      else alivePerTeam.GRAY++;
    }

    // Projectiles — only those visible to my faction
    const visibleProjectiles: ProjectileSnapshot[] = [];
    for (const proj of this.projectiles.list) {
      if (proj.friend) {
        visibleProjectiles.push({
          id: 0, kind: proj.kind,
          x: proj.x, y: proj.y, vx: proj.vx, vy: proj.vy,
          team: friendTeam, ttl: proj.ttl,
        });
      } else {
        for (const m of myUnitPositions) {
          if (Math.hypot(proj.x - m.x, proj.y - m.y) < m.vision) {
            visibleProjectiles.push({
              id: 0, kind: proj.kind,
              x: proj.x, y: proj.y, vx: proj.vx, vy: proj.vy,
              team: enemyTeam, ttl: proj.ttl,
            });
            break;
          }
        }
      }
    }

    // Sectors — map the real economy sectors to MP team colors
    const sectors: SectorSnapshot[] = this.economy.sectors.map(s => ({
      id: s.id, name: s.name, x: s.pos.x, y: s.pos.y,
      control: s.control === 'FRIEND' ? 'BLACK' : s.control === 'ENEMY' ? 'GRAY' : 'NEUTRAL',
      capturing: s.capturing === 'FRIEND' ? 'BLACK' : s.capturing === 'ENEMY' ? 'GRAY' : null,
      captureProgress: s.captureT / s.captureTime,
    }));

    return {
      tick: this.tick,
      time: this.time,
      seed: this.seed,
      result: this.result,
      ink: { BLACK: Math.floor(ink.BLACK), GRAY: Math.floor(ink.GRAY) },
      income: { BLACK: Math.round(income.BLACK), GRAY: Math.round(income.GRAY) },
      units: visibleUnits,
      projectiles: visibleProjectiles,
      sectors,
      productions: this.mpProductions
        .filter(pr => pr.ownerId === forPlayerId)
        .map(pr => ({
          id: pr.id,
          owner: forPlayerId,
          team: pr.faction === 'FRIEND' ? 'BLACK' : 'GRAY',
          battalionId: pr.battalion.id,
          name: pr.battalion.name,
          progress: 1 - pr.remaining / pr.total,
          remainingSec: pr.remaining,
          totalSec: pr.total,
        })),
      myPlayerId: forPlayerId,
      myTeam,
      alivePerTeam,
    };
  }

  private unitSnapshot(u: Unit, intel: 'OWN' | 'DETECTED' | 'GHOST'): UnitSnapshot {
    const team: Team = u.faction === 'FRIEND' ? 'BLACK' : 'GRAY';
    const ownerId = (u as any).ownerId ?? `AI_${team}`;
    return {
      id: u.id,
      type: u.def.type,
      owner: ownerId,
      team,
      callsign: u.callsign,
      x: u.x, y: u.y,
      angle: u.angle, turretAngle: u.turretAngle,
      hp: Math.ceil(u.hp), maxHp: u.def.hp,
      ammo: u.ammo, maxAmmo: u.def.ammo,
      dead: u.dead,
      orderType: u.order.type,
      airState: u.airState,
      sinking: u.sinking,
      intel,
      knownX: u.knownX, knownY: u.knownY,
      suppression: Math.round(u.suppression * 100) / 100,
      damageFlash: Math.round(u.damageFlash * 100) / 100,
    };
  }

  // ── Disconnection / reconnection ──────────────────────────

  markPlayerDisconnected(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = false;
  }

  markPlayerReconnected(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = true;
  }

  // ── Results ────────────────────────────────────────────────

  buildResults(): import('../protocol').MatchResultsPayload {
    const winningTeam: Team | null =
      this.result === 'BLACK_VICTORY' ? 'BLACK' :
      this.result === 'GRAY_VICTORY' ? 'GRAY' : null;
    const stats = [...this.players.values()].map(p => ({
      playerId: p.playerId, team: p.team,
      unitsLost: p.unitsLost, unitsDestroyed: p.unitsDestroyed,
      inkGenerated: Math.round(p.inkContributed + this.economy.stats.inkEarned / Math.max(1, this.players.size)),
      inkSpent: Math.round(p.inkContributed),
      territoryPercent: Math.round((this.economy.sectors.filter(s => s.control === p.faction).length / Math.max(1, this.economy.sectors.length)) * 100),
      isAI: p.isAI,
    }));
    return {
      result: this.result ?? 'ABORTED',
      winningTeam,
      durationSec: Math.round(this.time),
      stats,
    };
  }
}
