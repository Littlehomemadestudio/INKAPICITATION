// ─────────────────────────────────────────────────────────────
// PAPER STORM · ServerGame
// Runs the REAL game engine on the server — same Unit, InkEconomy,
// EnemyCommander, ProjectileSystem, VisionSystem, ObstacleSystem,
// Terrain. Uses headless stubs for AudioEngine/Camera/EffectsSystem.
//
// This is NOT a simplified parallel sim. It's the actual game engine
// running headlessly with full combat, movement, economy, AI, vision.
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
import type { Faction, Controller } from '../../core/types';
import { HeadlessAudioEngine, HeadlessCamera, HeadlessEffectsSystem, installHeadlessDOM } from './HeadlessStubs';
import {
  GameStateSnapshot, UnitSnapshot, ProjectileSnapshot, SectorSnapshot,
  ProductionSnapshot, ClientCommand, MatchResult, Team, LobbyConfig,
  MP_BATTALIONS, MP_MAPS, MPMapDef, LobbyPlayer, NET,
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
  mapDef: MPMapDef;
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
  private mpProductions: { id: number; ownerId: string; faction: Faction; battalion: any; remaining: number; total: number }[] = [];
  private nextMpProdId = 1;

  constructor(seed: number, config: LobbyConfig, players: LobbyPlayer[]) {
    this.seed = seed;
    this.config = config;
    this.mapDef = MP_MAPS[config.map];
    this.rng = new RNG(seed ^ 0xbeef);

    // Headless stubs for browser-only systems
    this.audio = new HeadlessAudioEngine();
    this.terrain = new Terrain(seed);
    this.camera = new HeadlessCamera(this.terrain.W, this.terrain.H);
    this.effects = new HeadlessEffectsSystem(seed, this.camera, this.audio, this.terrain.W, this.terrain.H);
    this.projectiles = new ProjectileSystem();
    this.vision = new VisionSystem(seed);
    this.obstacles = new ObstacleSystem(this.terrain);

    // Register players — map teams to factions
    // BLACK = FRIEND (uses NATO-style units: M1A2, M2A3, etc.)
    // GRAY = ENEMY (uses Soviet-style units: T90M, BMP3, etc.)
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

    // Set up economy with MP sectors
    const sectors = this.mapDef.sectors.map(s => ({
      id: s.id, name: s.name, pos: { x: s.x, y: s.y }, radius: s.radius,
      income: s.income, control: 'NEUTRAL' as Controller,
      captureTime: 7, captureT: 0, capturing: null, hasFactory: false,
    }));
    this.economy = new InkEconomy(sectors, { FRIEND: config.startingInk, ENEMY: config.startingInk });
    this.economy.friendlyEntry = { ...this.mapDef.blackSpawn };
    this.economy.friendlyAssembly = { x: this.mapDef.blackSpawn.x + 100, y: this.mapDef.blackSpawn.y + 100 };
    this.economy.enemyEntry = { ...this.mapDef.graySpawn };
    this.economy.enemyRally = { x: this.mapDef.graySpawn.x - 100, y: this.mapDef.graySpawn.y - 100 };

    // Initialize the AI commander (controls ENEMY/GRAY faction)
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
      rng: new RNG(seed ^ 0xbeef),
      log: (text, level) => this.log(text, level),
    };

    // Spawn HQ for each faction (destruction = victory)
    this.spawnHQ('FRIEND');
    this.spawnHQ('ENEMY');

    // Give each player a starting force
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
      log: (text, level) => this.log(text, level),
    };
  }

  private simCtx(): SimContext {
    this.simCtxCache.time = this.time;
    this.simCtxCache.units = this.units;
    this.simCtxCache.economy = this.economy;
    return this.simCtxCache;
  }

  private log(text: string, _level?: string) {
    // could log to a buffer if needed
  }

  // ── Unit spawning ──────────────────────────────────────────

  private spawnHQ(faction: Faction) {
    const spawn = faction === 'FRIEND' ? this.mapDef.blackSpawn : this.mapDef.graySpawn;
    const type: UnitType = 'HQ';
    const u = new Unit(type, faction, spawn.x, spawn.y, `${faction}_HQ`, this.seed);
    u.id = this.nextUnitId++;
    this.units.push(u);
  }

  private spawnStartingForce(p: PlayerState) {
    const spawn = p.faction === 'FRIEND' ? this.mapDef.blackSpawn : this.mapDef.graySpawn;
    // Starting force: 2 MBTs, 1 IFV, 1 recon, 1 rifle squad
    const starters: { type: UnitType; dx: number; dy: number }[] = [
      { type: p.faction === 'FRIEND' ? 'M1A2' : 'T90M',  dx: -60, dy: -40 },
      { type: p.faction === 'FRIEND' ? 'M1A2' : 'T90M',  dx:  60, dy: -40 },
      { type: p.faction === 'FRIEND' ? 'M2A3' : 'BMP3',  dx: -40, dy:  40 },
      { type: p.faction === 'FRIEND' ? 'M1127' : 'BTR82A', dx:  40, dy:  40 },
    ];
    for (const s of starters) {
      const u = new Unit(s.type, p.faction, spawn.x + s.dx, spawn.y + s.dy, this.makeCallsign(p), this.seed);
      u.id = this.nextUnitId++;
      // tag with owner
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
    if (def.faction !== p.faction) {
      // wrong faction unit — pick the equivalent
      return null;
    }
    const u = new Unit(type, p.faction, x, y, this.makeCallsign(p), this.seed);
    u.id = this.nextUnitId++;
    (u as any).ownerId = p.playerId;
    this.units.push(u);
    return u;
  }

  // ── Command validation + application ─────────────────────
  // CRITICAL: server validates EVERYTHING. Never trust client state.

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
        const bat = MP_BATTALIONS.find(b => b.id === payload.battalionId);
        if (!bat) return { ok: false, error: 'INVALID_BATTALION' };
        const ink = this.economy.ink[faction];
        if (ink < bat.cost) return { ok: false, error: 'INSUFFICIENT_INK' };
        const queueCount = this.mpProductions.filter(pr => pr.ownerId === playerId).length;
        if (queueCount >= 4) return { ok: false, error: 'QUEUE_FULL' };
        // Deduct ink from faction pool
        this.economy.ink[faction] -= bat.cost;
        if (faction === 'FRIEND') this.economy.stats.inkSpent += bat.cost;
        p.inkContributed += bat.cost;
        // Map MP battalion units to faction-specific types
        const factionUnits = bat.units.map(u => ({
          type: this.mapUnitType(u.type, faction),
          n: u.n,
        }));
        const battalionDef = {
          ...bat,
          units: factionUnits,
          composition: '',
          kinds: [],
          desc: '',
        };
        this.mpProductions.push({
          id: this.nextMpProdId++,
          ownerId: playerId,
          faction,
          battalion: battalionDef,
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
      // CRITICAL: ownership check — either owned by this player, or same faction
      // (allow controlling teammate's units for simplicity in v1)
      const p = this.players.get(playerId);
      if (!p || u.faction !== p.faction) continue;
      out.push(u);
    }
    return out;
  }

  private mapUnitType(mpType: string, faction: Faction): UnitType {
    // MP protocol uses FRIEND-side type names. Map to faction equivalents.
    if (faction === 'FRIEND') return mpType as UnitType;
    // ENEMY equivalents (Soviet-style)
    const enemyMap: Record<string, UnitType> = {
      M1A2: 'T90M',
      M2A3: 'BMP3',
      M109A7: '2S19',
      M1127: 'BTR82A',
      RIFLE: 'RIFLE',  // infantry is universal
      F16C: 'SU25K',
      A10C: 'SU25K',
      PATROL: 'PATROL',
      FRIGATE: 'FRIGATE',
    };
    return enemyMap[mpType] ?? (mpType as UnitType);
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

    // 3b. MP player productions — tick and spawn
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
    const completed = [];
    for (const pr of this.mpProductions) {
      pr.remaining -= dt;
      if (pr.remaining <= 0) completed.push(pr);
    }
    for (const pr of completed) {
      const p = this.players.get(pr.ownerId);
      if (!p) continue;
      const spawn = pr.faction === 'FRIEND' ? this.mapDef.blackSpawn : this.mapDef.graySpawn;
      let idx = 0;
      const total = pr.battalion.units.reduce((s: number, u: any) => s + u.n, 0);
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
    // if no owner, it's a scenario-spawned enemy — find by faction
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
    const friendProd = this.economy.productions.some(p => p.faction === 'FRIEND');
    const enemyProd = this.economy.productions.some(p => p.faction === 'ENEMY');

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
        // Check if any of my units can see this enemy
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
        // HIDDEN — not included
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
        // my faction's projectiles — always visible
        visibleProjectiles.push({
          id: 0, kind: proj.kind,
          x: proj.x, y: proj.y, vx: proj.vx, vy: proj.vy,
          team: proj.friend ? friendTeam : enemyTeam, ttl: proj.ttl,
        });
      } else {
        // enemy projectile — only if near my units
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

    return {
      tick: this.tick,
      time: this.time,
      seed: this.seed,
      result: this.result,
      ink: { BLACK: Math.floor(ink.BLACK), GRAY: Math.floor(ink.GRAY) },
      income: { BLACK: Math.round(income.BLACK), GRAY: Math.round(income.GRAY) },
      units: visibleUnits,
      projectiles: visibleProjectiles,
      sectors: this.economy.sectors.map(s => ({
        id: s.id, name: s.name, x: s.pos.x, y: s.pos.y,
        control: s.control === 'FRIEND' ? 'BLACK' : s.control === 'ENEMY' ? 'GRAY' : 'NEUTRAL',
        capturing: s.capturing === 'FRIEND' ? 'BLACK' : s.capturing === 'ENEMY' ? 'GRAY' : null,
        captureProgress: s.captureT / s.captureTime,
      })),
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
      territoryPercent: Math.round((this.economy.sectors.filter(s => s.control === p.faction).length / this.economy.sectors.length) * 100),
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
