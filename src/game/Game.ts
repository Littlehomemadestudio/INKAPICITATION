// ─────────────────────────────────────────────────────────────
// PAPER STORM · game orchestrator
// Fixed-step simulation, scenario lifecycle, ink economy,
// HUD snapshots.
// ─────────────────────────────────────────────────────────────

import { Camera } from './systems/camera';
import { Terrain } from './world/terrain';
import { TerrainRenderer } from './render/terrainRender';
import { EffectsSystem } from './entities/effects';
import { ProjectileSystem } from './entities/projectiles';
import { AudioEngine } from './audio/audio';
import { VisionSystem } from './systems/vision';
import { EnemyCommander } from './systems/ai';
import { InputSystem } from './systems/input';
import { Renderer } from './render/renderer';
import { buildScenario, ScenarioData, BRIEFING } from './world/scenario';
import { InkEconomy, FRIEND_BATTALIONS } from './systems/economy';
import { ObstacleSystem } from './systems/obstacles';
import type { Unit, SimContext } from './entities/units';
import type { HudSnapshot, HudUnitLine, LogEntry, AfterActionReport } from './core/types';
import { RNG, clockString, clamp } from './core/math';
import { coverFrom } from './systems/cover';
import type { GameStateSnapshot, UnitSnapshot, CommandPayload, Team } from './net/protocol';
import { MP_BATTALIONS } from './net/protocol';
import { Unit as GameUnit } from './entities/units';
import { UNIT_DEFS } from './entities/unitDefs';
const UNIT_DEFS_LOOKUP = UNIT_DEFS;

export type GameMode = 'single' | 'client';

export interface GameOptions {
  mode?: GameMode;
  /** In client mode, called when the player issues an order. */
  onCommand?: (payload: CommandPayload) => void;
  /** In client mode, the local player's ID (for filtering selection). */
  myPlayerId?: string;
  /** In client mode, the local player's team (for faction mapping). */
  myTeam?: Team;
}

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1;

  seed: number;
  camera: Camera;
  terrain: Terrain;
  terrainRenderer: TerrainRenderer;
  effects: EffectsSystem;
  projectiles: ProjectileSystem;
  audio: AudioEngine;
  vision: VisionSystem;
  ai!: EnemyCommander;
  input: InputSystem;
  renderer: Renderer;
  economy!: InkEconomy;
  obstacles!: ObstacleSystem;

  units: Unit[] = [];
  objectives: ScenarioData['objectives'] = [];
  anchors!: ScenarioData['anchors'];

  time = 0;
  speed = 1;
  paused = false;
  running = false;
  result: null | 'VICTORY' | 'DEFEAT' = null;
  private resultAt = 0;

  logEntries: LogEntry[] = [];
  private logId = 1;
  stats = { enemyDestroyed: 0, friendLost: 0, roundsFired: 0 };
  killsByType = new Map<string, number>();
  lossesByType = new Map<string, number>();
  private processedDead = new Set<number>();
  /** the ARSENAL command console — toggled with [R] */
  arsenalOpen = false;

  private simCtxCache: SimContext;
  private raf = 0;
  private lastT = 0;
  private hudT = 0;
  onHud: (s: HudSnapshot) => void;
  private disposed = false;

  // ── multiplayer client mode ──
  mode: GameMode;
  onCommand?: (payload: CommandPayload) => void;
  myPlayerId?: string;
  myTeam?: Team;
  /** interpolation state for smooth remote unit motion */
  private unitLerp: Map<number, { fromX: number; fromY: number; toX: number; toY: number; t: number }> = new Map();
  private snapshotTick = 0;

  constructor(canvas: HTMLCanvasElement, onHud: (s: HudSnapshot) => void, seed?: number, options?: GameOptions) {
    this.canvas = canvas;
    this.onHud = onHud;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.seed = seed ?? Math.floor(Math.random() * 1e9);
    this.mode = options?.mode ?? 'single';
    this.onCommand = options?.onCommand;
    this.myPlayerId = options?.myPlayerId;
    this.myTeam = options?.myTeam;

    this.audio = new AudioEngine();
    this.terrain = new Terrain(this.seed);
    this.camera = new Camera(this.terrain.W, this.terrain.H);
    this.terrainRenderer = new TerrainRenderer(this.terrain);
    this.effects = new EffectsSystem(this.seed, this.camera, this.audio, this.terrain.W, this.terrain.H);
    this.projectiles = new ProjectileSystem();
    this.vision = new VisionSystem(this.seed);
    this.obstacles = new ObstacleSystem(this.terrain);
    this.input = new InputSystem(this, this.camera, canvas);
    this.renderer = new Renderer();
    this.renderer.initFonts();

    this.loadScenario();

    // In client mode, we don't run the sim — the server is authoritative.
    // We clear the scenario units and wait for snapshots.
    if (this.mode === 'client') {
      this.units = [];
      this.running = true;  // let effects/camera update, but simStep is skipped
    }

    this.simCtxCache = {
      units: this.units,
      terrain: this.terrain,
      effects: this.effects,
      projectiles: this.projectiles,
      audio: this.audio,
      economy: this.economy,
      obstacles: this.obstacles,
      time: this.time,
      rng: new RNG(this.seed ^ 0xbeef),
      log: (text, level) => this.log(text, level),
    };

    this.resize();
    this.camera.focusOn(1700, 4700, 0.42);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  private loadScenario() {
    const data = buildScenario(this.seed, this.terrain);
    this.units = data.units;
    this.objectives = data.objectives;
    this.anchors = data.anchors;
    this.economy = new InkEconomy(data.sectors, data.startInk);
    this.economy.friendlyEntry = { x: 1300, y: 5560 };
    this.economy.friendlyAssembly = { x: 1950, y: 4550 };
    this.economy.enemyEntry = { x: 7600, y: 150 };
    this.economy.enemyRally = { x: 7050, y: 900 };
    this.ai = new EnemyCommander(this.anchors);
    this.ai.init(this.simCtxSafe());
    this.time = 0;
    this.result = null;
    this.stats = { enemyDestroyed: 0, friendLost: 0, roundsFired: 0 };
    this.killsByType = new Map();
    this.lossesByType = new Map();
    this.processedDead = new Set();
    this.logEntries = [];
    this.logId = 1;
    this.renderer.minimapBase = null;
    this.vision = new VisionSystem(this.seed);
  }

  private simCtxSafe(): SimContext {
    // pre-economy context for AI init
    return {
      units: this.units,
      terrain: this.terrain,
      effects: this.effects,
      projectiles: this.projectiles,
      audio: this.audio,
      economy: this.economy,
      obstacles: this.obstacles,
      time: 0,
      rng: new RNG(this.seed ^ 0xbeef),
      log: (text: string, level?: 'info' | 'contact' | 'alert' | 'objective' | 'economy') => this.log(text, level),
    };
  }

  simCtx(): SimContext {
    this.simCtxCache.time = this.time;
    this.simCtxCache.units = this.units;
    this.simCtxCache.economy = this.economy;
    return this.simCtxCache;
  }

  // ── lifecycle ──────────────────────────────────────────────

  startMission() {
    this.running = true;
    this.audio.ensureStarted();
    this.log(`OPERATION CROSSWIND — TASK FORCE SABRE DEPLOYED`, 'objective');
    this.log(`BASE INK 280 · SECTORS AND WORKS PAY — READ THE DEPLOY PANEL`, 'economy');
    this.log(`ZAVOD WEST LIES ABANDONED ON THE WEST ROAD — OCCUPY IT EARLY`, 'info');
    this.log(`AZURE BAY PAYS INK — HULLS ARRIVE FROM THE SOUTHERN APPROACHES`, 'info');
    this.log(`THE THEATRE IS WIDE — USE THE MINIMAP AND THE SPEED CONTROLS`, 'info');
  }

  restart(newSeed?: number) {
    this.audio.stopAllEngines();
    this.input.dispose();
    this.seed = newSeed ?? Math.floor(Math.random() * 1e9);
    this.terrain = new Terrain(this.seed);
    this.terrainRenderer = new TerrainRenderer(this.terrain);
    this.effects = new EffectsSystem(this.seed, this.camera, this.audio, this.terrain.W, this.terrain.H);
    this.projectiles = new ProjectileSystem();
    this.obstacles = new ObstacleSystem(this.terrain);
    this.loadScenario();
    this.input = new InputSystem(this, this.camera, this.canvas);
    this.simCtxCache = {
      units: this.units,
      terrain: this.terrain,
      effects: this.effects,
      projectiles: this.projectiles,
      audio: this.audio,
      economy: this.economy,
      obstacles: this.obstacles,
      time: 0,
      rng: new RNG(this.seed ^ 0xbeef),
      log: (text, level) => this.log(text, level),
    };
    this.running = true;
    this.paused = false;
    this.speed = 1;
    this.camera.focusOn(1700, 4700, 0.42);
    this.log(`NEW SHEET — OPERATION CROSSWIND RESTARTED`, 'objective');
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    this.audio.stopAllEngines();
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  setSpeed(s: number) {
    this.speed = s;
    this.paused = false;
  }

  toggleSound() {
    this.audio.setEnabled(!this.audio.enabled);
    return this.audio.enabled;
  }

  log(text: string, level: LogEntry['level'] = 'info') {
    this.logEntries.unshift({ id: this.logId++, time: this.time, text, level });
    if (this.logEntries.length > 60) this.logEntries.pop();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.camera.setViewport(rect.width, rect.height);
  }

  /** player queues a unit from the arsenal / deploy panel */
  queueBattalion(battalionId: string): boolean {
    if (this.result) return false;

    // ── client mode: emit command to server ──
    if (this.mode === 'client') {
      this.emitCommand({ kind: 'QUEUE_BATTALION', battalionId });
      this.log(`ORDER TRANSMITTED — ${battalionId}`, 'economy');
      this.audio.uiTick();
      return true;
    }

    // ── single-player: local validation ──
    const def = FRIEND_BATTALIONS.find((b) => b.id === battalionId);
    if (!def) return false;
    if (this.economy.ink.FRIEND < def.cost) {
      this.log(`INSUFFICIENT INK — ${def.name} REQUIRES ${def.cost}`, 'alert');
      this.audio.uiTick();
      return false;
    }
    if (!this.economy.canQueue('FRIEND')) {
      this.log(`PRODUCTION QUEUE FULL`, 'alert');
      return false;
    }
    const ok = this.economy.purchase('FRIEND', battalionId);
    if (ok) {
      this.log(`${def.name} ORDERED — ${Math.round(def.buildTime)}s TO MUSTER`, 'economy');
      this.audio.uiTick();
    }
    return !!ok;
  }

  toggleArsenal(force?: boolean) {
    this.arsenalOpen = force ?? !this.arsenalOpen;
    this.audio.uiTick();
  }

  // ── multiplayer client mode: sync from server snapshot ─────

  /**
   * Update the local game state from a server snapshot.
   * Creates/updates/removes real Unit objects so the real Renderer
   * can draw them with full fidelity.
   */
  syncFromSnapshot(snap: GameStateSnapshot) {
    if (this.mode !== 'client') return;
    this.snapshotTick = snap.tick;
    this.time = snap.time;

    // Map team → faction: my team is FRIEND, enemy team is ENEMY.
    // This way all existing rendering/input/economy logic works unchanged.
    const myTeam = snap.myTeam;
    const friendTeam: Team = myTeam;
    const enemyTeam: Team = myTeam === 'BLACK' ? 'GRAY' : 'BLACK';

    // ── update economy ──
    this.economy.ink.FRIEND = snap.ink[friendTeam];
    this.economy.ink.ENEMY = snap.ink[enemyTeam];

    // ── update sectors ──
    for (const ss of snap.sectors) {
      const es = this.economy.sectors.find(s => s.id === ss.id);
      if (!es) continue;
      es.control = ss.control === friendTeam ? 'FRIEND' :
                   ss.control === enemyTeam ? 'ENEMY' : 'NEUTRAL';
      es.capturing = ss.capturing === friendTeam ? 'FRIEND' :
                     ss.capturing === enemyTeam ? 'ENEMY' : null;
      es.captureT = ss.captureProgress * (es.captureTime || 7);
    }

    // ── update units ──
    const seen = new Set<number>();
    for (const su of snap.units) {
      seen.add(su.id);
      let u = this.units.find(u => u.id === su.id);
      const faction = su.team === friendTeam ? 'FRIEND' : 'ENEMY';

      if (!u) {
        // Create a new real Unit instance
        const type = su.type as any;
        if (!UNIT_DEFS_LOOKUP[type]) continue; // skip unknown types
        u = new GameUnit(type, faction, su.x, su.y, su.callsign, this.seed);
        u.id = su.id; // overwrite auto-assigned id with server id
        // for ships, mount states are created in constructor
        this.units.push(u);
      }

      // Update interpolation target
      const prev = this.unitLerp.get(su.id);
      if (prev) {
        // continue from current interpolated position toward new target
        this.unitLerp.set(su.id, {
          fromX: u.x, fromY: u.y,
          toX: su.x, toY: su.y,
          t: 0,
        });
      } else {
        // first time seeing this unit — snap immediately
        u.x = su.x; u.y = su.y;
        this.unitLerp.set(su.id, { fromX: su.x, fromY: su.y, toX: su.x, toY: su.y, t: 1 });
      }

      // Update render-relevant fields
      u.angle = su.angle;
      u.turretAngle = su.turretAngle;
      u.hp = su.hp;
      u.ammo = su.ammo;
      u.dead = su.dead;
      u.suppression = su.suppression || 0;
      u.damageFlash = su.damageFlash || 0;
      u.intel = su.intel === 'OWN' ? 'DETECTED' : su.intel; // FRIEND units visible
      if (su.knownX != null) { u.knownX = su.knownX; u.knownY = su.knownY ?? su.knownY; }
      if (su.airState) u.airState = su.airState as any;
      if (su.sinking != null) u.sinking = su.sinking;
      // set order type for activity display
      u.order = { type: su.orderType as any } as any;
    }

    // Remove units not in snapshot (after a grace period for sink animations)
    this.units = this.units.filter(u => {
      if (seen.has(u.id)) return true;
      // let sinking ships finish their animation
      if (u.sinking && u.sinkT < 6) return true;
      this.unitLerp.delete(u.id);
      return false;
    });

    // Clean up selection (remove dead/desynced units)
    this.input.selection = this.input.selection.filter(u => seen.has(u.id) && !u.dead);

    // ── update projectiles ──
    // Replace the projectile list with snapshot data
    this.projectiles.list = snap.projectiles.map(p => ({
      kind: p.kind as any,
      friend: p.team === friendTeam,
      x: p.x, y: p.y,
      vx: p.vx, vy: p.vy,
      z: 0, vz: 0,
      angle: Math.atan2(p.vy, p.vx),
      t: 0, ttl: p.ttl,
      damage: 0, splash: 0,
      ownerId: 0, targetId: -1,
      aimX: p.x, aimY: p.y,
      startX: p.x, startY: p.y,
      flightT: 0, flightTotal: 0, arcH: 0,
      trailTimer: 0, whistled: false, defeated: false, dead: false,
    })) as any;

    // ── update productions (for HUD) ──
    // Map MP productions to the economy's production format
    this.economy.productions = snap.productions.map(p => ({
      id: p.id,
      faction: 'FRIEND' as const,
      battalion: { id: p.battalionId, name: p.name, cost: 0, buildTime: p.totalSec ?? 0, composition: '', kinds: [], units: [], desc: '' } as any,
      remaining: p.remainingSec,
      total: p.remainingSec / (1 - p.progress) || p.remainingSec,
    })) as any;

    // ── update result ──
    if (snap.result) {
      const weWon = snap.result === `${friendTeam}_VICTORY`;
      this.result = weWon ? 'VICTORY' : 'DEFEAT';
    }
  }

  /** In client mode, emit a command to the server instead of mutating units. */
  emitCommand(payload: CommandPayload) {
    if (this.onCommand) {
      this.onCommand(payload);
    }
  }

  // ── main loop ──────────────────────────────────────────────

  private loop(now: number) {
    if (this.disposed) return;
    if (!this.lastT) this.lastT = now;
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    dt = clamp(dt, 0, 0.05);

    this.input.update(dt);
    this.camera.update(dt);
    this.audio.music?.update(dt);

    if (this.mode === 'single') {
      // ── single-player: run the full sim ──
      if (this.running && !this.paused && !this.result) {
        const steps = this.speed;
        for (let i = 0; i < steps; i++) {
          this.simStep(dt);
        }
      } else if (this.result) {
        this.effects.update(dt);
        this.projectiles.update(dt, this.simCtx());
      }
    } else {
      // ── client mode: no sim, just interpolate + effects + audio ──
      this.interpolateUnits(dt);
      this.effects.update(dt);
      this.audio.updateListener(this.camera.x, this.camera.y, this.camera.viewW / this.camera.zoom);
    }

    this.renderer.draw(this.ctx, this, this.dpr);

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.12;
      this.onHud(this.buildHud());
    }

    this.raf = requestAnimationFrame(this.loop);
  }

  /** smooth remote unit motion between snapshots */
  private interpolateUnits(dt: number) {
    for (const [id, lerp] of this.unitLerp) {
      lerp.t = Math.min(1, lerp.t + dt * 10); // ~100ms to reach target
      const u = this.units.find(u => u.id === id);
      if (!u) continue;
      u.x = lerp.fromX + (lerp.toX - lerp.fromX) * lerp.t;
      u.y = lerp.fromY + (lerp.toY - lerp.fromY) * lerp.t;
    }
  }

  private resultLogged = false;

  private simStep(dt: number) {
    this.time += dt;
    const ctx = this.simCtx();

    this.vision.update(dt, ctx);
    this.ai.update(dt, ctx);
    this.economy.update(dt, ctx);

    for (const u of this.units) {
      u.update(dt, ctx);
    }

    this.projectiles.update(dt, ctx);
    this.effects.update(dt);

    // dead unit bookkeeping
    for (const u of this.units) {
      if (u.dead && !this.processedDead.has(u.id)) {
        this.processedDead.add(u.id);
        if (u.def.kind === 'FACTORY') {
          // a destroyed works is its own event — not a kill tally
          continue;
        }
        if (u.faction === 'ENEMY') {
          this.stats.enemyDestroyed++;
          this.killsByType.set(u.def.name, (this.killsByType.get(u.def.name) ?? 0) + 1);
          this.log(`ENEMY DESTROYED — ${u.def.name} · GRID ${u.positionGrid()}`, 'info');
          this.economy.onUnitDestroyed(u, ctx);
        } else {
          this.stats.friendLost++;
          this.lossesByType.set(u.def.name, (this.lossesByType.get(u.def.name) ?? 0) + 1);
          this.log(`${u.callsign} LOST — ${u.def.name}`, 'alert');
          this.economy.onUnitDestroyed(u, ctx);
        }
      }
    }
    // clean selection & hover of dead units
    this.input.selection = this.input.selection.filter((u) => !u.dead);
    if (this.input.hoverUnit?.dead) this.input.hoverUnit = null;

    // aircraft audio
    for (const u of this.units) {
      if (!u.isAir) continue;
      const flying = !u.dead && u.airState !== 'STANDBY' && u.airState !== 'REARM' && u.airState !== 'DOWN';
      if (flying) {
        this.audio.startEngine(u.id, u.x, u.y);
        this.audio.updateEngine(u.id, u.x, u.y, true);
        // the fly-by swell as it crosses the camera
        const d = Math.hypot(u.x - this.camera.x, u.y - this.camera.y);
        if (d < 420) this.audio.jetPassby(u.x, u.y);
      } else {
        this.audio.stopEngine(u.id);
      }
    }

    // ship engines — the deep heartbeat of the big hulls
    for (const u of this.units) {
      if (!u.isShip) continue;
      const underWay = !u.dead && !u.sinking;
      if (underWay && u.def.length >= 60) {
        this.audio.startShipEngine(u.id, u.x, u.y, u.def.length);
        this.audio.updateEngine(u.id, u.x, u.y, u.speedNow > 0.5);
      } else {
        this.audio.stopEngine(u.id);
      }
    }

    // the score reads the theatre: fire, fleets, and the BIG BOI
    this.updateMusic();

    // the ocean swells when the listener nears open water
    const camShore = this.terrain.shoreDistAt(this.camera.x, this.camera.y);
    this.audio.setOceanProximity(clamp(1 - Math.max(0, -camShore) / 1000, 0, 1));

    this.stats.roundsFired = this.projectiles.fired;

    // HQ damage smoke
    const hq = this.units.find((u) => u.def.kind === 'HQ');
    if (hq && !hq.dead && hq.hp < hq.def.hp * 0.7 && Math.random() < dt * 2.2) {
      this.effects.spawnSmoke(hq.x + (Math.random() - 0.5) * 20, hq.y + (Math.random() - 0.5) * 14, {
        r: 2.5,
        r1: 16,
        life: 4,
        alpha: 0.3,
        vy: -4,
      });
    }

    // living works breathe — chimney steam; damaged ones smoke
    for (const u of this.units) {
      if (u.dead || u.def.kind !== 'FACTORY') continue;
      if (u.hp < u.def.hp * 0.6) {
        if (Math.random() < dt * 3) {
          this.effects.spawnSmoke(u.x + (Math.random() - 0.5) * 26, u.y + (Math.random() - 0.5) * 16, {
            r: 3,
            r1: 18,
            life: 4,
            alpha: 0.34,
            vy: -5,
            dark: 1.25,
          });
        }
      } else if (Math.random() < dt * 0.9) {
        // faint working-works steam off the chimney
        this.effects.spawnSmoke(u.x + 26, u.y - 18, {
          r: 2,
          r1: 12,
          life: 5,
          alpha: 0.1,
          vy: -3.5,
          dark: 0.5,
        });
      }
    }

    this.audio.updateListener(this.camera.x, this.camera.y, this.camera.viewW / this.camera.zoom);

    this.checkObjectives();
  }

  private checkObjectives() {
    for (const obj of this.objectives) {
      if (obj.secured) continue;
      if (obj.id === 'KRAKEN') {
        const hq = this.units.find((u) => u.def.kind === 'HQ');
        if (hq && hq.dead) {
          obj.secured = true;
          this.endMission('VICTORY');
        }
      } else {
        const hold = this.units.some(
          (u) => u.faction === 'ENEMY' && !u.dead && u.def.kind !== 'HQ' && u.def.kind !== 'FACTORY' && Math.hypot(u.x - obj.pos.x, u.y - obj.pos.y) < 680
        );
        if (!hold) {
          obj.secured = true;
          this.log(`${obj.name} SECURED`, 'objective');
        }
      }
    }
    // defeat: the force is annihilated with nothing inbound
    if (!this.result) {
      const alive = this.units.some((u) => u.faction === 'FRIEND' && !u.dead && u.def.kind !== 'FACTORY');
      const inbound = this.economy.productions.some((p) => p.faction === 'FRIEND');
      if (!alive && !inbound) this.endMission('DEFEAT');
    }
  }

  private endMission(result: 'VICTORY' | 'DEFEAT') {
    this.result = result;
    this.resultAt = this.time;
    this.log(result === 'VICTORY' ? 'ENEMY HQ DESTROYED — MISSION ACCOMPLISHED' : 'TASK FORCE DESTROYED — MISSION FAILED', 'objective');
    this.audio.music?.stinger(result === 'VICTORY' ? 'victory' : 'defeat');
  }

  // ── the score ── the music must know what the battle is doing ──

  private prevBB = 0;
  private fleetContactCooldown = 0;

  private updateMusic() {
    const m = this.audio.music;
    if (!m) return;

    // a capital ship joining the fleet is the biggest event on the sheet
    const bb = this.units.filter((u) => u.faction === 'FRIEND' && u.isShip && u.def.length > 200 && !u.dead && !u.sinking).length;
    if (bb > this.prevBB) {
      m.stinger('capital');
      this.log(`THE BIG BOI IS ON THE SHEET — ${this.units.find((u) => u.faction === 'FRIEND' && u.def.length > 200 && !u.dead)?.callsign} MAKING FOR THE ANCHORAGE`, 'objective');
    }
    this.prevBB = bb;

    // first sight of an enemy hull — the score tenses
    this.fleetContactCooldown -= 0.016;
    const hullSighted = this.units.some((u) => u.isShip && u.faction === 'ENEMY' && u.intel === 'DETECTED' && !u.dead);
    if (hullSighted && this.fleetContactCooldown <= 0) {
      this.fleetContactCooldown = 90;
      m.stinger('contact');
    }

    // intensity from the fire picture
    let heat = 0;
    let firing = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      if (this.time - u.lastFireT < 5) firing++;
      if (u.target && !u.target.dead && !u.isAir) heat += 0.34;
      if (u.isShip && u.target && !u.target.dead) heat += 0.6;
    }
    heat += Math.min(1.6, firing * 0.18);
    if (bb > 0) heat += 0.7;
    m.setIntensity(heat);
  }

  buildAAR(): AfterActionReport {
    const factoriesTotal = this.units.filter((u) => u.def.kind === 'FACTORY').length;
    const factoriesHeld = this.units.filter((u) => u.def.kind === 'FACTORY' && !u.dead && u.factoryCtl === 'FRIEND').length;
    return {
      result: this.result ?? 'DEFEAT',
      time: this.time,
      killsByType: [...this.killsByType.entries()].map(([label, n]) => ({ label, n })),
      lossesByType: [...this.lossesByType.entries()].map(([label, n]) => ({ label, n })),
      roundsFired: this.stats.roundsFired,
      objectivesSecured: this.objectives.filter((o) => o.secured).length,
      objectivesTotal: this.objectives.length,
      inkEarned: Math.round(this.economy.stats.inkEarned),
      inkSpent: Math.round(this.economy.stats.inkSpent),
      battalionsDeployed: this.economy.stats.battalionsDeployed,
      factoriesHeld,
      factoriesTotal,
    };
  }

  // ── HUD ────────────────────────────────────────────────────

  private buildHud(): HudSnapshot {
    const sel = this.input.selection;
    const lines: HudUnitLine[] = sel.map((u) => ({
      callsign: u.callsign,
      typeName: u.def.name,
      kind: u.def.kind,
      activity: u.getActivity(),
      hp: Math.ceil(u.hp),
      hpMax: u.def.hp,
      ammo: u.ammo,
      ammoMax: u.def.ammo,
      selected: true,
      suppression: Math.round(u.suppression * 100) / 100,
    }));
    const detail = sel.length === 1 ? lines[0] : null;
    const detailUnit = sel.length === 1 ? sel[0] : null;
    const inc = this.economy.incomeOf('FRIEND', this.simCtx());
    const enemyStrength = this.units.filter(
      (u) => u.faction === 'ENEMY' && !u.dead && !u.isAir && u.def.kind !== 'HQ' && u.def.kind !== 'FACTORY'
    ).length;
    // cover state of the detailed unit — against its last attacker,
    // else the nearest known contact
    let coverLabel = 'EXPOSED';
    if (detailUnit && !detailUnit.isAir && !detailUnit.isShip) {
      let tx = 0;
      let ty = 0;
      let td = Infinity;
      if (detailUnit.lastAttacker && !detailUnit.lastAttacker.dead && this.time - detailUnit.lastAttackedT < 20) {
        tx = detailUnit.lastAttacker.x;
        ty = detailUnit.lastAttacker.y;
        td = 0;
      } else {
        for (const e of this.units) {
          if (e.dead || e.faction !== 'ENEMY' || e.isAir) continue;
          if (e.intel === 'HIDDEN' && e.def.kind !== 'FACTORY') continue;
          const d = Math.hypot(e.x - detailUnit.x, e.y - detailUnit.y);
          if (d < td && d < 1500) {
            td = d;
            tx = e.x;
            ty = e.y;
          }
        }
      }
      if (td < Infinity) {
        const cov = coverFrom(this.simCtx(), detailUnit.x, detailUnit.y, tx, ty);
        coverLabel =
          cov.type === 'TRENCH'
            ? 'DUG IN'
            : cov.value >= 0.6
              ? 'HARD COVER'
              : cov.value >= 0.42
                ? 'GOOD COVER'
                : cov.value >= 0.28
                  ? 'LIGHT COVER'
                  : cov.type === 'TERRAIN'
                    ? 'HULL DEFILE'
                    : 'EXPOSED';
      } else {
        coverLabel = '—';
      }
    }
    return {
      running: this.running,
      paused: this.paused,
      speed: this.speed,
      missionTime: this.time,
      objectives: this.objectives.map((o) => ({
        id: o.id,
        name: o.name,
        status: o.secured ? 'SECURED' : 'HOSTILE',
        primary: o.primary,
      })),
      selectionCount: sel.length,
      selectionLines: lines,
      detailUnit: detail,
      detailExtra: detailUnit
        ? {
            weapon:
              detailUnit.def.projectile === 'ARTY'
                ? '155 mm HE (AREA)'
                : detailUnit.def.projectile === 'SHELL'
                  ? '120 mm AP'
                  : detailUnit.def.projectile === 'AUTO'
                    ? detailUnit.def.type === 'PATROL'
                      ? '25 mm + 2× TORPEDO'
                      : detailUnit.def.type === 'VULCAN'
                        ? '20 mm ROTARY'
                        : detailUnit.def.type === 'RIFLE'
                          ? '5.56 mm RIFLES'
                          : '25 mm AUTOCANNON'
                    : detailUnit.def.projectile === 'MISSILE_AIR'
                      ? detailUnit.def.type === 'F16C'
                        ? 'AIM-120 AAM ×4'
                        : 'AGM-114 × 6'
                      : detailUnit.def.type === 'BATTLESHIP'
                        ? '9× 380 mm MAIN BATTERY'
                        : detailUnit.def.type === 'CRUISER'
                          ? '2×2 152 mm + SSM'
                          : detailUnit.def.type === 'DESTROYER'
                            ? '130 mm + 8 SSM'
                            : detailUnit.def.type === 'FRIGATE'
                              ? '76 mm + SAM'
                              : detailUnit.def.type === 'PATRIOT'
                                ? 'PAC-3 INTERCEPTORS ×4'
                                : detailUnit.def.type === 'NASAMS'
                                  ? 'AIM-120 AMRAAM ×6'
                                  : detailUnit.def.type === 'LINEBACKER'
                                    ? 'FIM-92 STINGER ×8'
                                    : detailUnit.def.type === 'BUK'
                                      ? '9M38 MISSILES ×6'
                                      : 'SAM',
            range: detailUnit.def.range,
            speedKph: Math.round(detailUnit.def.speed * 3.6),
            vision: detailUnit.def.vision,
            armor:
              detailUnit.isShip
                ? detailUnit.def.length > 200
                  ? 'CAPITAL HULL'
                  : 'NAVAL HULL'
                : detailUnit.def.kind === 'MBT'
                  ? 'HEAVY'
                  : detailUnit.def.kind === 'IFV'
                    ? 'MEDIUM'
                    : 'LIGHT',
            suppression: Math.round(detailUnit.suppression * 100),
            cover: detailUnit.isShip ? 'OPEN WATER' : coverLabel,
          }
        : null,
      log: this.logEntries.slice(0, 8),
      air: this.units
        .filter((u) => u.isAir && u.faction === 'FRIEND')
        .map((u) => ({
          callsign: u.callsign,
          state:
            u.dead
              ? 'DOWN'
              : u.airState === 'STANDBY'
                ? 'READY'
                : u.airState === 'REARM'
                  ? `REARM ${Math.ceil(u.rearmT)}s`
                  : u.airState,
          missiles: u.ammo,
          hp: Math.ceil(u.hp),
        })),
      navy: this.units
        .filter((u) => u.isShip && u.faction === 'FRIEND')
        .map((u) => ({
          callsign: u.callsign,
          cls: u.def.shortName,
          state: u.dead ? 'LOST' : u.sinking ? 'SINKING' : u.getActivity(),
          hp: Math.ceil(u.hp),
          hpMax: u.def.hp,
          guns: u.ammo,
          ssm: u.mounts.filter((m) => m.def.kind === 'SSM').reduce((a, m) => a + m.ammo, 0),
          torps: u.mounts.filter((m) => m.def.kind === 'TORP').reduce((a, m) => a + m.ammo, 0),
        })),
      cursorMode: this.input.cursorMode,
      result: this.result,
      stats: {
        enemyDestroyed: this.stats.enemyDestroyed,
        friendLost: this.stats.friendLost,
        roundsFired: this.stats.roundsFired,
        missionTime: this.time,
      },
      ink: Math.floor(this.economy.ink.FRIEND),
      income: inc.base + inc.sectors + inc.factories,
      incomeBase: inc.base,
      incomeSectors: inc.sectors,
      incomeFactories: inc.factories,
      sectorsHeld: this.economy.sectorsHeld('FRIEND'),
      sectorsTotal: this.economy.sectors.length,
      battalions: this.mode === 'client'
        ? MP_BATTALIONS.map((b) => ({
            ...b,
            available: this.economy.ink.FRIEND >= b.cost && !this.result,
          }))
        : FRIEND_BATTALIONS.map((b) => ({
            ...b,
            available: this.economy.ink.FRIEND >= b.cost && this.economy.canQueue('FRIEND') && !this.result,
          })),
      arsenalOpen: this.arsenalOpen,
      production: this.economy.productions
        .filter((p) => p.faction === 'FRIEND')
        .map((p) => ({
          id: p.id,
          battalionId: p.battalion.id,
          name: p.battalion.name,
          progress: 1 - p.remaining / p.total,
          remaining: p.remaining,
        })),
      factories: this.units
        .filter((u) => u.def.kind === 'FACTORY')
        .map((u) => ({
          id: u.factoryId ?? String(u.id),
          name: u.callsign,
          control: u.factoryCtl,
          hp: Math.ceil(u.hp),
          hpMax: u.def.hp,
          alive: !u.dead,
          capturing: u.capturing,
          captureProgress: u.captureT / 7,
        })),
      enemyStrength,
    };
  }

  get briefing() {
    return BRIEFING;
  }
}

export function fmtClock(t: number): string {
  return clockString(t);
}
