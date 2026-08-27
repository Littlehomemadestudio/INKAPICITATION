// ─────────────────────────────────────────────────────────────
// PAPER STORM · game orchestrator
// Fixed-step simulation, scenario lifecycle, HUD snapshots.
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
import type { Unit, SimContext } from './entities/units';
import type { HudSnapshot, HudUnitLine, LogEntry, AfterActionReport } from './core/types';
import { RNG, clockString, clamp } from './core/math';

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

  private simCtxCache: SimContext;
  private raf = 0;
  private lastT = 0;
  private hudT = 0;
  onHud: (s: HudSnapshot) => void;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, onHud: (s: HudSnapshot) => void, seed?: number) {
    this.canvas = canvas;
    this.onHud = onHud;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.seed = seed ?? Math.floor(Math.random() * 1e9);

    this.camera = new Camera(4096, 3072);
    this.audio = new AudioEngine();
    this.terrain = new Terrain(this.seed);
    this.terrainRenderer = new TerrainRenderer(this.terrain);
    this.effects = new EffectsSystem(this.seed, this.camera, this.audio, this.terrain.W, this.terrain.H);
    this.projectiles = new ProjectileSystem();
    this.vision = new VisionSystem(this.seed);
    this.input = new InputSystem(this, this.camera, canvas);
    this.renderer = new Renderer();
    this.renderer.initFonts();

    this.loadScenario();

    this.simCtxCache = {
      units: this.units,
      terrain: this.terrain,
      effects: this.effects,
      projectiles: this.projectiles,
      audio: this.audio,
      time: this.time,
      rng: new RNG(this.seed ^ 0xbeef),
      log: (text, level) => this.log(text, level),
    };

    this.resize();
    this.camera.focusOn(980, 2260, 0.46);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  private loadScenario() {
    const data = buildScenario(this.seed);
    this.units = data.units;
    this.objectives = data.objectives;
    this.anchors = data.anchors;
    this.ai = new EnemyCommander(this.anchors);
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

  simCtx(): SimContext {
    this.simCtxCache.time = this.time;
    this.simCtxCache.units = this.units;
    return this.simCtxCache;
  }

  // ── lifecycle ──────────────────────────────────────────────

  startMission() {
    this.running = true;
    this.audio.ensureStarted();
    this.log(`OPERATION CROSSWIND — TASK FORCE SABRE DEPLOYED`, 'objective');
    this.log(`SCOUT SECTIONS FORWARD · ENEMY HOLDS THE RIVER LINE`, 'info');
  }

  restart(newSeed?: number) {
    this.audio.stopAllEngines();
    this.input.dispose();
    this.seed = newSeed ?? Math.floor(Math.random() * 1e9);
    this.terrain = new Terrain(this.seed);
    this.terrainRenderer = new TerrainRenderer(this.terrain);
    this.effects = new EffectsSystem(this.seed, this.camera, this.audio, this.terrain.W, this.terrain.H);
    this.projectiles = new ProjectileSystem();
    this.loadScenario();
    this.input = new InputSystem(this, this.camera, this.canvas);
    this.simCtxCache = {
      units: this.units,
      terrain: this.terrain,
      effects: this.effects,
      projectiles: this.projectiles,
      audio: this.audio,
      time: 0,
      rng: new RNG(this.seed ^ 0xbeef),
      log: (text, level) => this.log(text, level),
    };
    this.running = true;
    this.paused = false;
    this.speed = 1;
    this.camera.focusOn(980, 2260, 0.46);
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

  // ── main loop ──────────────────────────────────────────────

  private loop(now: number) {
    if (this.disposed) return;
    if (!this.lastT) this.lastT = now;
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    dt = clamp(dt, 0, 0.05);

    this.input.update(dt);
    this.camera.update(dt);

    if (this.running && !this.paused && !this.result) {
      const steps = this.speed;
      for (let i = 0; i < steps; i++) {
        this.simStep(dt);
      }
    } else if (this.result) {
      // let the last effects settle
      this.effects.update(dt);
      this.projectiles.update(dt, this.simCtx());
      this.time += 0; // freeze clock
      if (this.time - this.resultAt > 0 && !this.resultLogged) {
        this.resultLogged = true;
      }
    }

    this.renderer.draw(this.ctx, this, this.dpr);

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.12;
      this.onHud(this.buildHud());
    }

    this.raf = requestAnimationFrame(this.loop);
  }

  private resultLogged = false;

  private simStep(dt: number) {
    this.time += dt;
    const ctx = this.simCtx();

    this.vision.update(dt, ctx);
    this.ai.update(dt, ctx);

    for (const u of this.units) {
      u.update(dt, ctx);
    }

    this.projectiles.update(dt, ctx);
    this.effects.update(dt);

    // dead unit bookkeeping
    for (const u of this.units) {
      if (u.dead && !this.processedDead.has(u.id)) {
        this.processedDead.add(u.id);
        if (u.faction === 'ENEMY') {
          this.stats.enemyDestroyed++;
          this.killsByType.set(u.def.name, (this.killsByType.get(u.def.name) ?? 0) + 1);
          this.log(`ENEMY DESTROYED — ${u.def.name} · GRID ${u.positionGrid()}`, 'info');
        } else {
          this.stats.friendLost++;
          this.lossesByType.set(u.def.name, (this.lossesByType.get(u.def.name) ?? 0) + 1);
          this.log(`${u.callsign} LOST — ${u.def.name}`, 'alert');
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
      } else {
        this.audio.stopEngine(u.id);
      }
    }

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
          (u) => u.faction === 'ENEMY' && !u.dead && u.def.kind !== 'HQ' && Math.hypot(u.x - obj.pos.x, u.y - obj.pos.y) < 680
        );
        if (!hold) {
          obj.secured = true;
          this.log(`${obj.name} SECURED`, 'objective');
        }
      }
    }
    // defeat: every friendly unit destroyed
    if (!this.result) {
      const alive = this.units.some((u) => u.faction === 'FRIEND' && !u.dead);
      if (!alive) this.endMission('DEFEAT');
    }
  }

  private endMission(result: 'VICTORY' | 'DEFEAT') {
    this.result = result;
    this.resultAt = this.time;
    this.log(result === 'VICTORY' ? 'ENEMY HQ DESTROYED — MISSION ACCOMPLISHED' : 'TASK FORCE DESTROYED — MISSION FAILED', 'objective');
  }

  buildAAR(): AfterActionReport {
    return {
      result: this.result ?? 'DEFEAT',
      time: this.time,
      killsByType: [...this.killsByType.entries()].map(([label, n]) => ({ label, n })),
      lossesByType: [...this.lossesByType.entries()].map(([label, n]) => ({ label, n })),
      roundsFired: this.stats.roundsFired,
      objectivesSecured: this.objectives.filter((o) => o.secured).length,
      objectivesTotal: this.objectives.length,
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
    }));
    const detail = sel.length === 1 ? lines[0] : null;
    const detailUnit = sel.length === 1 ? sel[0] : null;
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
                    ? '25 mm AUTOCANNON'
                    : detailUnit.def.projectile === 'MISSILE_AIR'
                      ? 'AGM-114 × 6'
                      : 'SAM',
            range: detailUnit.def.range,
            speedKph: Math.round(detailUnit.def.speed * 3.6),
            vision: detailUnit.def.vision,
            armor: detailUnit.def.kind === 'MBT' ? 'HEAVY' : detailUnit.def.kind === 'IFV' ? 'MEDIUM' : 'LIGHT',
          }
        : null,
      log: this.logEntries.slice(0, 8),
      air: this.units
        .filter((u) => u.isAir)
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
      cursorMode: this.input.cursorMode,
      result: this.result,
      stats: {
        enemyDestroyed: this.stats.enemyDestroyed,
        friendLost: this.stats.friendLost,
        roundsFired: this.stats.roundsFired,
        missionTime: this.time,
      },
    };
  }

  get briefing() {
    return BRIEFING;
  }
}

export function fmtClock(t: number): string {
  return clockString(t);
}
