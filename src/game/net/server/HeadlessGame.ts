// ─────────────────────────────────────────────────────────────
// PAPER STORM · server-side authoritative simulation
// HeadlessGame: simplified but REAL sim that runs on the server.
// Validates commands, ticks at fixed rate, broadcasts snapshots.
// ─────────────────────────────────────────────────────────────

import {
  GameStateSnapshot, UnitSnapshot, ProjectileSnapshot, SectorSnapshot,
  ProductionSnapshot, ClientCommand, CommandPayload, MatchResult, Team,
  MP_UNIT_DEFS, MPUnitDef, MP_BATTALIONS, MP_MAPS, MPMapDef, LobbyConfig,
  NET, LobbyPlayer,
} from '../../net/protocol';

// ── RNG (deterministic per match) ────────────────────────────

class SRng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    // mulberry32
    this.s |= 0; this.s = (this.s + 0x6D2B79F5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + this.next() * (b - a); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: T[]): T { return arr[this.int(0, arr.length - 1)]; }
}

// ── Authoritative Unit ───────────────────────────────────────

export interface SimUnit {
  id: number;
  type: string;
  def: MPUnitDef;
  owner: string;          // playerId or 'AI_BLACK' / 'AI_GRAY'
  team: Team;
  callsign: string;
  x: number; y: number;
  angle: number;
  turretAngle: number;
  hp: number;
  ammo: number;
  dead: boolean;
  order: {
    type: 'MOVE' | 'ATTACK' | 'ATTACK_MOVE' | 'STOP' | 'HOLD' | 'FIRE_MISSION' | 'PATROL';
    x?: number; y?: number;
    targetId?: number;
  };
  // movement
  speedNow: number;
  // combat
  reloadT: number;
  burstLeft: number;
  targetId: number | null;
  lastFireT: number;
  // aircraft
  airState: 'STANDBY' | 'INGRESS' | 'ON_STATION' | 'EGRESS' | 'REARM' | 'DOWN';
  rearmT: number;
  patrolX: number; patrolY: number;
  // naval
  sinking: boolean;
  sinkT: number;
  // misc
  suppression: number;
  damageFlash: number;
  // intel — recomputed per observer at snapshot time
}

export interface SimProjectile {
  id: number;
  kind: string;
  x: number; y: number;
  vx: number; vy: number;
  ttl: number;
  team: Team;
  ownerId: number;
  targetId: number;
  damage: number;
  splash: number;
}

export interface SimSector {
  id: string;
  name: string;
  x: number; y: number;
  income: number;
  radius: number;
  control: 'BLACK' | 'GRAY' | 'NEUTRAL';
  captureProgress: number;  // 0..1 toward `capturing`
  capturing: 'BLACK' | 'GRAY' | null;
}

export interface SimProduction {
  id: number;
  owner: string;
  team: Team;
  battalionId: string;
  name: string;
  remaining: number;
  total: number;
}

export interface PlayerSimState {
  playerId: string;
  name: string;
  team: Team;
  isAI: boolean;
  ink: number;
  inkEarned: number;
  inkSpent: number;
  unitsLost: number;
  unitsDestroyed: number;
  connected: boolean;
  lastSeenAliveTick: number;
  aiThinkCooldown: number;
}

// ── HeadlessGame ─────────────────────────────────────────────

export class HeadlessGame {
  seed: number;
  mapDef: MPMapDef;
  config: LobbyConfig;
  players: Map<string, PlayerSimState> = new Map();
  units: SimUnit[] = [];
  projectiles: SimProjectile[] = [];
  sectors: SimSector[] = [];
  productions: SimProduction[] = [];

  time = 0;
  tick = 0;
  result: MatchResult | null = null;
  resultAt = 0;

  private nextUnitId = 1;
  private nextProjId = 1;
  private nextProdId = 1;
  private rng: SRng;
  private callsignCounter = 1;

  constructor(seed: number, mapId: LobbyConfig['map'], config: LobbyConfig, players: LobbyPlayer[]) {
    this.seed = seed;
    this.mapDef = MP_MAPS[mapId];
    this.config = config;
    this.rng = new SRng(seed);

    // Register players
    for (const p of players) {
      this.players.set(p.playerId, {
        playerId: p.playerId,
        name: p.name,
        team: p.team,
        isAI: p.isAI,
        ink: config.startingInk,
        inkEarned: config.startingInk,
        inkSpent: 0,
        unitsLost: 0,
        unitsDestroyed: 0,
        connected: p.status !== 'AI',
        lastSeenAliveTick: 0,
        aiThinkCooldown: 0,
      });
    }

    // Set up sectors
    this.sectors = this.mapDef.sectors.map(s => ({
      id: s.id, name: s.name, x: s.x, y: s.y, income: s.income, radius: s.radius,
      control: 'NEUTRAL', captureProgress: 0, capturing: null,
    }));

    // Spawn HQ for each team (immobile, high HP, destruction = victory)
    this.spawnHQ('BLACK');
    this.spawnHQ('GRAY');

    // Give each player a starting force
    for (const p of this.players.values()) {
      this.spawnStartingForce(p);
    }
  }

  private spawnHQ(team: Team) {
    const spawn = team === 'BLACK' ? this.mapDef.blackSpawn : this.mapDef.graySpawn;
    const hqDef: MPUnitDef = {
      type: 'HQ', name: 'COMMAND HQ', shortName: 'HQ', branch: 'GROUND',
      hp: 2000, speed: 0, vision: 600, range: 0, minRange: 0,
      damage: 0, reload: 0, burst: 0, ammo: 0, accuracy: 0,
      canHitAir: false, isAir: false, isShip: false,
      bounty: 0, spawnCost: 0, length: 30, width: 30, kind: 'HQ',
    };
    this.units.push({
      id: this.nextUnitId++,
      type: 'HQ', def: hqDef,
      owner: `AI_${team}`, team,
      callsign: team === 'BLACK' ? 'BLACK HQ' : 'GRAY HQ',
      x: spawn.x, y: spawn.y, angle: 0, turretAngle: 0,
      hp: hqDef.hp, ammo: 0, dead: false,
      order: { type: 'HOLD' },
      speedNow: 0, reloadT: 0, burstLeft: 0, targetId: null,
      lastFireT: -999,
      airState: 'STANDBY', rearmT: 0, patrolX: spawn.x, patrolY: spawn.y,
      sinking: false, sinkT: 0,
      suppression: 0, damageFlash: 0,
    });
  }

  private spawnStartingForce(p: PlayerSimState) {
    const spawn = p.team === 'BLACK' ? this.mapDef.blackSpawn : this.mapDef.graySpawn;
    // Each player starts with: 2 MBTs, 1 IFV, 1 recon
    const starters: { type: string; dx: number; dy: number }[] = [
      { type: 'M1A2',  dx: -60, dy: -40 },
      { type: 'M1A2',  dx:  60, dy: -40 },
      { type: 'M2A3',  dx: -40, dy:  40 },
      { type: 'M1127', dx:  40, dy:  40 },
    ];
    for (const s of starters) {
      this.spawnUnit(p, s.type, spawn.x + s.dx + this.rng.range(-20, 20),
                                       spawn.y + s.dy + this.rng.range(-20, 20));
    }
  }

  private spawnUnit(p: PlayerSimState, type: string, x: number, y: number): SimUnit | null {
    const def = MP_UNIT_DEFS[type];
    if (!def) return null;
    const csPrefix = p.team === 'BLACK' ? 'BK' : 'GY';
    const callsign = `${csPrefix}-${(this.callsignCounter++).toString().padStart(2, '0')}`;
    const u: SimUnit = {
      id: this.nextUnitId++, type, def,
      owner: p.playerId, team: p.team, callsign,
      x, y, angle: p.team === 'BLACK' ? Math.PI * 0.25 : Math.PI * 1.25,
      turretAngle: 0,
      hp: def.hp, ammo: def.ammo, dead: false,
      order: { type: 'HOLD' },
      speedNow: 0, reloadT: 0, burstLeft: 0, targetId: null, lastFireT: -999,
      airState: def.isAir ? 'STANDBY' : 'STANDBY',
      rearmT: 0,
      patrolX: x, patrolY: y,
      sinking: false, sinkT: 0,
      suppression: 0, damageFlash: 0,
    };
    this.units.push(u);
    return u;
  }

  // ── Command validation + application ───────────────────────
  // CRITICAL: server validates EVERYTHING. Never trust client state.

  applyCommand(playerId: string, cmd: ClientCommand): { ok: boolean; error?: string } {
    if (this.result) return { ok: false, error: 'MATCH_ENDED' };
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'NOT_IN_MATCH' };
    if (!p.connected) return { ok: false, error: 'DISCONNECTED' };

    const payload = cmd.payload;
    switch (payload.kind) {
      case 'MOVE':
      case 'ATTACK_MOVE':
      case 'PATROL': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        if (!units.length) return { ok: false, error: 'NO_UNITS' };
        for (const u of units) {
          if (u.dead) continue;
          u.order = { type: payload.kind, x: payload.x, y: payload.y };
          u.targetId = null;
        }
        return { ok: true };
      }
      case 'ATTACK': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        const target = this.units.find(u => u.id === payload.targetId && !u.dead);
        if (!units.length || !target) return { ok: false, error: 'INVALID_TARGET' };
        if (target.team === p.team) return { ok: false, error: 'FRIENDLY_FIRE' };
        for (const u of units) {
          if (u.dead) continue;
          u.order = { type: 'ATTACK', targetId: target.id };
          u.targetId = target.id;
        }
        return { ok: true };
      }
      case 'STOP':
      case 'HOLD': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        for (const u of units) {
          if (u.dead) continue;
          u.order = { type: payload.kind };
          u.targetId = null;
          u.speedNow = 0;
        }
        return { ok: true };
      }
      case 'FIRE_MISSION': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        // Only SPGs / naval can fire missions
        const valid = units.filter(u => !u.dead && (u.def.kind === 'SPG' || u.def.isShip));
        if (!valid.length) return { ok: false, error: 'NO_ARTILLERY' };
        for (const u of valid) {
          u.order = { type: 'FIRE_MISSION', x: payload.x, y: payload.y };
        }
        return { ok: true };
      }
      case 'LAUNCH_AIR': {
        const units = this.validateOwnership(playerId, payload.unitIds);
        const air = units.filter(u => !u.dead && u.def.isAir && u.airState === 'STANDBY');
        if (!air.length) return { ok: false, error: 'NO_AIR_READY' };
        for (const u of air) {
          u.airState = 'INGRESS';
          u.patrolX = payload.x; u.patrolY = payload.y;
          u.order = { type: 'ATTACK_MOVE', x: payload.x, y: payload.y };
        }
        return { ok: true };
      }
      case 'QUEUE_BATTALION': {
        const bat = MP_BATTALIONS.find(b => b.id === payload.battalionId);
        if (!bat) return { ok: false, error: 'INVALID_BATTALION' };
        if (p.ink < bat.cost) return { ok: false, error: 'INSUFFICIENT_INK' };
        if (this.productions.filter(pr => pr.owner === playerId).length >= 4) {
          return { ok: false, error: 'QUEUE_FULL' };
        }
        p.ink -= bat.cost;
        p.inkSpent += bat.cost;
        this.productions.push({
          id: this.nextProdId++,
          owner: playerId, team: p.team,
          battalionId: bat.id, name: bat.name,
          remaining: bat.buildTime, total: bat.buildTime,
        });
        return { ok: true };
      }
      case 'TOGGLE_ARSENAL': {
        // UI-only — no sim effect
        return { ok: true };
      }
    }
    return { ok: false, error: 'UNKNOWN_COMMAND' };
  }

  private validateOwnership(playerId: string, unitIds: number[]): SimUnit[] {
    const out: SimUnit[] = [];
    for (const id of unitIds) {
      const u = this.units.find(u => u.id === id && !u.dead);
      if (!u) continue;
      if (u.owner !== playerId) continue;  // CRITICAL: ownership check
      out.push(u);
    }
    return out;
  }

  // ── Simulation tick ────────────────────────────────────────

  simStep(dt: number) {
    if (this.result) return;
    this.tick++;
    this.time += dt;

    // 1. Economy — sectors + productions
    this.updateSectors(dt);
    this.updateProductions(dt);

    // 2. AI for disconnected players
    this.updateAIPlayers(dt);

    // 3. Units
    for (const u of this.units) {
      if (u.dead) continue;
      this.updateUnit(u, dt);
    }

    // 4. Projectiles
    this.updateProjectiles(dt);

    // 5. Dead bookkeeping — already handled inline

    // 6. Win check
    this.checkWinConditions();
  }

  private updateSectors(dt: number) {
    for (const s of this.sectors) {
      // count friendly/enemy units inside
      let black = 0, gray = 0;
      for (const u of this.units) {
        if (u.dead) continue;
        if (u.def.kind === 'HQ') continue;
        const d2 = (u.x - s.x) ** 2 + (u.y - s.y) ** 2;
        if (d2 > s.radius * s.radius) continue;
        if (u.team === 'BLACK') black++;
        else gray++;
      }
      const contested = black > 0 && gray > 0;
      if (contested) {
        // contested — no progress
      } else if (black > 0 && s.control !== 'BLACK') {
        s.capturing = 'BLACK';
        s.captureProgress = Math.min(1, s.captureProgress + dt / 7);
        if (s.captureProgress >= 1) {
          s.control = 'BLACK'; s.capturing = null; s.captureProgress = 0;
        }
      } else if (gray > 0 && s.control !== 'GRAY') {
        s.capturing = 'GRAY';
        s.captureProgress = Math.min(1, s.captureProgress + dt / 7);
        if (s.captureProgress >= 1) {
          s.control = 'GRAY'; s.capturing = null; s.captureProgress = 0;
        }
      } else if (black === 0 && gray === 0 && s.capturing) {
        // no one present — decay progress
        s.captureProgress = Math.max(0, s.captureProgress - dt / 14);
        if (s.captureProgress <= 0) s.capturing = null;
      }
      // income
      if (s.control === 'BLACK' || s.control === 'GRAY') {
        for (const p of this.players.values()) {
          if (p.team === s.control) {
            const inc = s.income * this.config.inkIncomeRate * dt;
            p.ink += inc;
            p.inkEarned += inc;
          }
        }
      }
    }
    // Base income for everyone
    for (const p of this.players.values()) {
      p.ink += 1.0 * this.config.inkIncomeRate * dt;
      p.inkEarned += 1.0 * this.config.inkIncomeRate * dt;
    }
  }

  private updateProductions(dt: number) {
    const completed: SimProduction[] = [];
    for (const pr of this.productions) {
      pr.remaining -= dt;
      if (pr.remaining <= 0) completed.push(pr);
    }
    for (const pr of completed) {
      const p = this.players.get(pr.owner);
      if (!p) continue;
      const bat = MP_BATTALIONS.find(b => b.id === pr.battalionId);
      if (!bat) continue;
      const spawn = p.team === 'BLACK' ? this.mapDef.blackSpawn : this.mapDef.graySpawn;
      let i = 0;
      for (const u of bat.units) {
        for (let n = 0; n < u.n; n++) {
          const ang = (i / Math.max(1, bat.units.length)) * Math.PI * 2;
          const r = 60 + i * 12;
          this.spawnUnit(p, u.type,
            spawn.x + Math.cos(ang) * r + this.rng.range(-15, 15),
            spawn.y + Math.sin(ang) * r + this.rng.range(-15, 15));
          i++;
        }
      }
    }
    this.productions = this.productions.filter(pr => pr.remaining > 0);
  }

  private updateAIPlayers(dt: number) {
    for (const p of this.players.values()) {
      if (!p.isAI && p.connected) continue;
      p.aiThinkCooldown -= dt;
      if (p.aiThinkCooldown > 0) continue;
      p.aiThinkCooldown = NET.AI_DECISION_INTERVAL_SEC + this.rng.range(-0.1, 0.2);
      this.aiThink(p);
    }
  }

  private aiThink(p: PlayerSimState) {
    const myUnits = this.units.filter(u => u.owner === p.playerId && !u.dead && u.def.kind !== 'HQ');
    if (!myUnits.length) return;
    const enemySpawn = p.team === 'BLACK' ? this.mapDef.graySpawn : this.mapDef.blackSpawn;

    // Find enemy units near my force
    const myCenter = avg(myUnits.map(u => ({ x: u.x, y: u.y })));
    let nearestEnemy: SimUnit | null = null;
    let nearestD = Infinity;
    for (const e of this.units) {
      if (e.dead || e.team === p.team) continue;
      const d = (e.x - myCenter.x) ** 2 + (e.y - myCenter.y) ** 2;
      if (d < nearestD) { nearestD = d; nearestEnemy = e; }
    }

    // Issue orders: if enemy in range, attack; else attack-move toward enemy spawn
    if (nearestEnemy && nearestD < 500 * 500) {
      for (const u of myUnits) {
        if (u.def.kind === 'SPG') {
          u.order = { type: 'FIRE_MISSION', x: nearestEnemy.x, y: nearestEnemy.y };
        } else {
          u.order = { type: 'ATTACK', targetId: nearestEnemy.id };
          u.targetId = nearestEnemy.id;
        }
      }
    } else if (this.rng.next() < 0.4) {
      // Advance toward enemy spawn with jitter
      const tx = enemySpawn.x + this.rng.range(-300, 300);
      const ty = enemySpawn.y + this.rng.range(-300, 300);
      for (const u of myUnits) {
        u.order = { type: 'ATTACK_MOVE', x: tx, y: ty };
      }
    }

    // Queue reinforcements if affordable
    if (p.ink > 240 && this.productions.filter(pr => pr.owner === p.playerId).length < 2) {
      const bat = this.rng.pick(MP_BATTALIONS);
      if (p.ink >= bat.cost) {
        p.ink -= bat.cost;
        p.inkSpent += bat.cost;
        this.productions.push({
          id: this.nextProdId++,
          owner: p.playerId, team: p.team,
          battalionId: bat.id, name: bat.name,
          remaining: bat.buildTime, total: bat.buildTime,
        });
      }
    }
  }

  private updateUnit(u: SimUnit, dt: number) {
    if (u.sinking) {
      u.sinkT += dt;
      if (u.sinkT > 6) { u.dead = true; }
      return;
    }
    u.damageFlash = Math.max(0, u.damageFlash - dt * 4);
    u.suppression = Math.max(0, u.suppression - dt * 0.15);
    u.reloadT = Math.max(0, u.reloadT - dt);
    if (u.def.isAir && u.airState === 'REARM') {
      u.rearmT -= dt;
      if (u.rearmT <= 0) { u.airState = 'STANDBY'; u.ammo = u.def.ammo; }
      return;
    }

    // Resolve target from order.targetId if needed
    if (u.order.type === 'ATTACK' && u.order.targetId != null) {
      const t = this.units.find(x => x.id === u.order.targetId && !x.dead);
      if (!t) {
        u.order = { type: 'HOLD' };
        u.targetId = null;
      } else {
        u.targetId = t.id;
      }
    } else if (u.order.type !== 'ATTACK') {
      u.targetId = null;
    }

    // Movement
    const isAir = u.def.isAir;
    const dest = this.orderDestination(u);
    if (dest) {
      const dx = dest.x - u.x, dy = dest.y - u.y;
      const d = Math.hypot(dx, dy);
      const stopRange = isAir ? 80 : (u.order.type === 'ATTACK_MOVE' ? 30 : 8);
      if (d > stopRange) {
        const desiredAngle = Math.atan2(dy, dx);
        u.angle = rotateToward(u.angle, desiredAngle, (isAir ? 1.2 : 1.5) * dt);
        const speed = u.def.speed * (u.suppression > 0.5 ? 0.5 : 1.0);
        u.speedNow = speed;
        u.x += Math.cos(u.angle) * speed * dt;
        u.y += Math.sin(u.angle) * speed * dt;
        // clamp to world
        u.x = Math.max(40, Math.min(this.mapDef.worldW - 40, u.x));
        u.y = Math.max(40, Math.min(this.mapDef.worldH - 40, u.y));
      } else {
        u.speedNow = 0;
        if (u.order.type === 'MOVE' || u.order.type === 'ATTACK_MOVE') {
          u.order = { type: 'HOLD' };
        }
      }
    } else {
      u.speedNow = 0;
    }

    // Targeting & firing
    if (u.targetId != null) {
      const target = this.units.find(x => x.id === u.targetId && !x.dead);
      if (target) {
        const dx = target.x - u.x, dy = target.y - u.y;
        const d = Math.hypot(dx, dy);
        // Face target with turret
        const desiredTurret = Math.atan2(dy, dx);
        u.turretAngle = rotateToward(u.turretAngle, desiredTurret, 2.0 * dt);
        // Face target with body for non-turret units
        if (u.def.kind === 'INF' || u.def.kind === 'AIR') {
          u.angle = rotateToward(u.angle, desiredTurret, 1.5 * dt);
        }
        // Fire if in range
        if (d <= u.def.range && d >= u.def.minRange && u.reloadT <= 0 && u.ammo > 0) {
          this.fire(u, target, d);
          u.reloadT = u.def.reload;
          u.burstLeft = u.def.burst - 1;
          u.lastFireT = this.time;
        } else if (d > u.def.range && u.order.type === 'ATTACK') {
          // Chase
          u.order = { type: 'ATTACK_MOVE', x: target.x, y: target.y, targetId: target.id };
        }
      } else {
        u.targetId = null;
      }
    } else {
      // Auto-acquire nearby enemy
      const enemy = this.findNearestEnemy(u, u.def.vision);
      if (enemy && u.def.kind !== 'INF') {
        const d = Math.hypot(enemy.x - u.x, enemy.y - u.y);
        if (d <= u.def.range) {
          u.targetId = enemy.id;
        }
      }
    }

    // Aircraft behavior state machine
    if (isAir) {
      this.updateAircraft(u, dt);
    }
  }

  private orderDestination(u: SimUnit): { x: number; y: number } | null {
    switch (u.order.type) {
      case 'MOVE':
      case 'ATTACK_MOVE':
      case 'PATROL':
      case 'FIRE_MISSION':
        return (u.order.x != null && u.order.y != null) ? { x: u.order.x, y: u.order.y } : null;
      case 'ATTACK': {
        if (u.order.targetId == null) return null;
        const t = this.units.find(x => x.id === u.order.targetId && !x.dead);
        return t ? { x: t.x, y: t.y } : null;
      }
      default: return null;
    }
  }

  private findNearestEnemy(u: SimUnit, range: number): SimUnit | null {
    let best: SimUnit | null = null;
    let bestD = range * range;
    for (const e of this.units) {
      if (e.dead || e.team === u.team) continue;
      if (e.def.isAir && !u.def.canHitAir) continue;
      const d2 = (e.x - u.x) ** 2 + (e.y - u.y) ** 2;
      if (d2 < bestD) { bestD = d2; best = e; }
    }
    return best;
  }

  private fire(u: SimUnit, target: SimUnit, d: number) {
    // Hit roll
    const acc = u.def.accuracy * (1 - Math.min(0.5, d / (u.def.range * 2)));
    const hit = this.rng.next() < acc;
    const dmg = hit ? u.def.damage * this.rng.range(0.85, 1.15) : 0;
    // Spawn projectile
    const proj: SimProjectile = {
      id: this.nextProjId++,
      kind: u.def.isAir ? 'MISSILE_AIR' : (u.def.kind === 'SPG' ? 'ARTY' : (u.def.isShip ? 'NAVAL_SHELL' : 'SHELL')),
      x: u.x, y: u.y,
      vx: (target.x - u.x) / 0.5, vy: (target.y - u.y) / 0.5,
      ttl: u.def.kind === 'SPG' ? 1.2 : (u.def.isAir ? 1.5 : 0.6),
      team: u.team, ownerId: u.id, targetId: target.id,
      damage: Math.max(0, dmg),
      splash: u.def.kind === 'SPG' ? 25 : (u.def.isShip ? 18 : 0),
    };
    this.projectiles.push(proj);
    u.ammo = Math.max(0, u.ammo - 1);
    if (u.ammo === 0 && u.def.isAir) {
      u.airState = 'EGRESS';
    }
  }

  private updateAircraft(u: SimUnit, dt: number) {
    if (u.airState === 'STANDBY' || u.airState === 'REARM') return;
    if (u.airState === 'EGRESS') {
      const spawn = u.team === 'BLACK' ? this.mapDef.blackSpawn : this.mapDef.graySpawn;
      u.order = { type: 'MOVE', x: spawn.x, y: spawn.y };
      const d = Math.hypot(u.x - spawn.x, u.y - spawn.y);
      if (d < 200) {
        u.airState = 'REARM';
        u.rearmT = 10;
        u.hp = Math.min(u.def.hp, u.hp + u.def.hp * 0.5); // partial repair
      }
    }
  }

  private updateProjectiles(dt: number) {
    const remaining: SimProjectile[] = [];
    for (const p of this.projectiles) {
      p.ttl -= dt;
      if (p.ttl <= 0) {
        // Apply damage at impact point
        this.applyProjectileDamage(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Check direct hit on target
      const target = this.units.find(u => u.id === p.targetId && !u.dead);
      if (target) {
        const d = Math.hypot(p.x - target.x, p.y - target.y);
        if (d < 8 + (target.def.length / 2)) {
          this.applyProjectileDamage(p);
          continue;
        }
      }
      remaining.push(p);
    }
    this.projectiles = remaining;
  }

  private applyProjectileDamage(p: SimProjectile) {
    const owner = this.units.find(u => u.id === p.ownerId && !u.dead);
    for (const u of this.units) {
      if (u.dead || u.team === p.team) continue;
      const d = Math.hypot(u.x - p.x, u.y - p.y);
      if (p.splash > 0) {
        if (d < p.splash) {
          const falloff = 1 - (d / p.splash) * 0.6;
          this.damageUnit(u, p.damage * falloff, owner);
        }
      } else if (d < 12) {
        this.damageUnit(u, p.damage, owner);
      }
    }
  }

  private damageUnit(u: SimUnit, dmg: number, attacker: SimUnit | null) {
    if (u.dead || dmg <= 0) return;
    u.hp -= dmg;
    u.damageFlash = 1;
    u.suppression = Math.min(1, u.suppression + 0.05);
    if (u.hp <= 0) {
      if (u.def.isShip && !u.sinking) {
        u.sinking = true;
        u.sinkT = 0;
      } else {
        u.dead = true;
      }
      // Credit killer
      if (attacker) {
        const killer = this.players.get(attacker.owner);
        const victim = this.players.get(u.owner);
        if (killer && victim && killer.team !== victim.team) {
          killer.unitsDestroyed++;
          killer.ink += u.def.bounty;
          killer.inkEarned += u.def.bounty;
          victim.unitsLost++;
        }
      }
    }
  }

  private checkWinConditions() {
    const blackHQ = this.units.find(u => u.team === 'BLACK' && u.def.kind === 'HQ');
    const grayHQ = this.units.find(u => u.team === 'GRAY' && u.def.kind === 'HQ');
    if (blackHQ?.dead) {
      this.result = 'GRAY_VICTORY';
      this.resultAt = this.time;
      return;
    }
    if (grayHQ?.dead) {
      this.result = 'BLACK_VICTORY';
      this.resultAt = this.time;
      return;
    }
    // Also: elimination
    const blackAlive = this.units.some(u => u.team === 'BLACK' && !u.dead && u.def.kind !== 'HQ');
    const grayAlive = this.units.some(u => u.team === 'GRAY' && !u.dead && u.def.kind !== 'HQ');
    const blackProd = this.productions.some(p => p.team === 'BLACK');
    const grayProd = this.productions.some(p => p.team === 'GRAY');
    if (!blackAlive && !blackProd) { this.result = 'GRAY_VICTORY'; this.resultAt = this.time; return; }
    if (!grayAlive && !grayProd) { this.result = 'BLACK_VICTORY'; this.resultAt = this.time; return; }
  }

  // ── Snapshot generation (with fog of war per recipient) ────

  snapshot(forPlayerId: string): GameStateSnapshot {
    const p = this.players.get(forPlayerId);
    if (!p) throw new Error(`snapshot: unknown player ${forPlayerId}`);
    const myTeam = p.team;

    // Fog of war: only show own units fully + enemy units within vision of any of my units
    const myUnitPositions = this.units
      .filter(u => u.owner === forPlayerId && !u.dead)
      .map(u => ({ x: u.x, y: u.y, vision: u.def.vision, isAir: u.def.isAir }));

    const visibleUnits: UnitSnapshot[] = [];
    for (const u of this.units) {
      if (u.dead && u.sinkT > 6) continue;  // hidden once fully sunk
      if (u.team === myTeam || u.owner === forPlayerId) {
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
          visibleUnits.push({ ...this.unitSnapshot(u, 'GHOST'), x: u.x, y: u.y, knownX: u.x, knownY: u.y });
        }
        // else: HIDDEN — not included
      }
    }

    const ink = { BLACK: 0, GRAY: 0 };
    const income = { BLACK: 0, GRAY: 0 };
    for (const pl of this.players.values()) {
      ink[pl.team] += pl.ink;
      income[pl.team] += 1.0 * this.config.inkIncomeRate; // base
    }
    for (const s of this.sectors) {
      if (s.control === 'BLACK' || s.control === 'GRAY') {
        income[s.control] += s.income * this.config.inkIncomeRate;
      }
    }
    // For the player's team, show actual values; for enemy team, show only what they'd see
    // (For simplicity, both teams see aggregated values — could be hidden in hardcore mode)
    const alivePerTeam = { BLACK: 0, GRAY: 0 };
    for (const u of this.units) {
      if (u.dead || u.def.kind === 'HQ') continue;
      alivePerTeam[u.team]++;
    }

    return {
      tick: this.tick,
      time: this.time,
      seed: this.seed,
      result: this.result,
      ink: { BLACK: myTeam === 'BLACK' ? ink.BLACK : Math.floor(ink.BLACK),
             GRAY: myTeam === 'GRAY' ? ink.GRAY : Math.floor(ink.GRAY) },
      income: { BLACK: myTeam === 'BLACK' ? income.BLACK : Math.round(income.BLACK),
                GRAY: myTeam === 'GRAY' ? income.GRAY : Math.round(income.GRAY) },
      units: visibleUnits,
      projectiles: this.projectiles
        .filter(p => p.team === myTeam || this.isProjectileVisible(p, myUnitPositions))
        .map(p => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, vx: p.vx, vy: p.vy, team: p.team, ttl: p.ttl })),
      sectors: this.sectors.map(s => ({
        id: s.id, name: s.name, x: s.x, y: s.y,
        control: s.control, capturing: s.capturing,
        captureProgress: s.captureProgress,
      })),
      productions: this.productions
        .filter(pr => pr.owner === forPlayerId)
        .map(pr => ({
          id: pr.id, owner: pr.owner, team: pr.team,
          battalionId: pr.battalionId, name: pr.name,
          progress: 1 - pr.remaining / pr.total,
          remainingSec: pr.remaining,
          totalSec: pr.total,
        })),
      myPlayerId: forPlayerId,
      myTeam,
      alivePerTeam,
    };
  }

  private isProjectileVisible(p: SimProjectile, myUnits: { x: number; y: number; vision: number }[]): boolean {
    for (const m of myUnits) {
      if (Math.hypot(p.x - m.x, p.y - m.y) < m.vision) return true;
    }
    return false;
  }

  private unitSnapshot(u: SimUnit, intel: 'OWN' | 'DETECTED' | 'GHOST'): UnitSnapshot {
    return {
      id: u.id, type: u.type, owner: u.owner, team: u.team, callsign: u.callsign,
      x: u.x, y: u.y, angle: u.angle, turretAngle: u.turretAngle,
      hp: Math.ceil(u.hp), maxHp: u.def.hp,
      ammo: u.ammo, maxAmmo: u.def.ammo,
      dead: u.dead,
      orderType: u.order.type,
      airState: u.airState,
      sinking: u.sinking,
      intel,
      knownX: intel === 'GHOST' ? u.x : undefined,
      knownY: intel === 'GHOST' ? u.y : undefined,
      suppression: Math.round(u.suppression * 100) / 100,
      damageFlash: Math.round(u.damageFlash * 100) / 100,
    };
  }

  // ── Disconnection / reconnection handling ──────────────────

  markPlayerDisconnected(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = false;
    // If AI backfill is enabled, treat as AI
    if (this.config.aiFillEnabled) {
      p.isAI = true;
    }
  }

  markPlayerReconnected(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = true;
    p.isAI = false;  // resume human control
  }

  // ── Results ────────────────────────────────────────────────

  buildResults(): import('../../net/protocol').MatchResultsPayload {
    const winningTeam: Team | null =
      this.result === 'BLACK_VICTORY' ? 'BLACK' :
      this.result === 'GRAY_VICTORY' ? 'GRAY' : null;
    const stats = [...this.players.values()].map(p => ({
      playerId: p.playerId, team: p.team,
      unitsLost: p.unitsLost, unitsDestroyed: p.unitsDestroyed,
      inkGenerated: Math.round(p.inkEarned), inkSpent: Math.round(p.inkSpent),
      territoryPercent: Math.round((this.sectors.filter(s => s.control === p.team).length / this.sectors.length) * 100),
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

// ── Helpers ──────────────────────────────────────────────────

function avg(points: { x: number; y: number }[]): { x: number; y: number } {
  if (!points.length) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const p of points) { sx += p.x; sy += p.y; }
  return { x: sx / points.length, y: sy / points.length };
}

function rotateToward(current: number, target: number, maxStep: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}
