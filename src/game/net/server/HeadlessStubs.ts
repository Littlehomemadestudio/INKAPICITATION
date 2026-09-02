// ─────────────────────────────────────────────────────────────
// PAPER STORM · Headless stubs for server-side simulation
// These implement the same interfaces as the browser-only systems
// (AudioEngine, Camera, EffectsSystem) but all methods are no-ops.
// This lets the REAL Unit.update(), EnemyCommander.update(), etc.
// run on the server without a browser environment.
// ─────────────────────────────────────────────────────────────

// ── Headless AudioEngine ──
// All methods no-op. The real Unit.update() calls ctx.audio.explosion(),
// ctx.audio.startEngine(), etc. — on the server these do nothing.

export class HeadlessAudioEngine {
  ctx: null = null;
  master: null = null;
  enabled = true;
  music: any = null;
  oceanProximity = 0;
  listenerX = 0;
  listenerY = 0;
  viewSpan = 0;

  ensureStarted() {}
  setOceanProximity(_p: number) {}
  setEnabled(on: boolean) { this.enabled = on; return on; }
  updateListener(_x: number, _y: number, _span: number) {}
  startAmbience() {}
  uiTick() {}
  startEngine(_id: number, _x: number, _y: number) {}
  updateEngine(_id: number, _x: number, _y: number, _active: boolean) {}
  jetPassby(_x: number, _y: number) {}
  stopEngine(_id: number) {}
  stopAllEngines() {}
  startShipEngine(_id: number, _x: number, _y: number, _length: number) {}
  shipGun(_x: number, _y: number, _calibre: number) {}
  explosion(_type: string, _x: number, _y: number, _scale?: number) {}
  shipBreaking(_x: number, _y: number, _length: number) {}
  fireSound(_kind: string, _x: number, _y: number, _calibre?: number) {}
  impactSound(_kind: string, _x: number, _y: number) {}
  // All additional audio methods called by the game — all no-op on server.
  // These must match the real AudioEngine's public interface.
  artilleryFire(_x: number, _y: number, _calibre?: number) {}
  autocannon(_x: number, _y: number) {}
  cannon(_x: number, _y: number, _calibre?: number) {}
  missileLaunch(_x: number, _y: number) {}
  navalGun(_x: number, _y: number, _calibre?: number) {}
  whistle(_x: number, _y: number) {}
  setIntensity(_v: number) {}
  // Catch-all for any method I missed — returns void for any call
  [key: string]: any;
}

// ── Headless Camera ──
// Just stores position. The real Camera has screenToWorld etc.
// but on the server we don't need those (no input picking).

export class HeadlessCamera {
  x = 2048;
  y = 1536;
  zoom = 0.42;
  tx = 2048;
  ty = 1536;
  tzoom = 0.42;
  worldW = 4096;
  worldH = 3072;
  viewW = 1280;
  viewH = 720;
  shakeX = 0;
  shakeY = 0;

  constructor(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
  }

  setViewport(_w: number, _h: number) {}
  focusOn(x: number, y: number, _z: number) { this.x = x; this.y = y; this.tx = x; this.ty = y; }
  panBy(_dx: number, _dy: number) {}
  zoomBy(_f: number, _sx: number, _sy: number) {}
  update(_dt: number) {}
  screenToWorld(sx: number, sy: number) {
    return { x: this.x + sx / this.zoom, y: this.y + sy / this.zoom };
  }
}

// ── Headless EffectsSystem ──
// All spawn/stamp methods are no-op. The real Unit.update() calls
// ctx.effects.spawnExplosion(), spawnSmoke(), stampTrack(), etc.
// On the server these do nothing — the client generates its own
// visual effects from the synced unit state.

export class HeadlessEffectsSystem {
  rng: any = null;
  camera: any = null;
  audio: any = null;
  terrainW = 0;
  terrainH = 0;
  // Visual state arrays — empty on server, but present so any code
  // that reads them (e.g. effects.wrecks.length) doesn't crash.
  wrecks: any[] = [];
  shipWrecks: any[] = [];
  craters: any[] = [];
  rubble: any[] = [];
  scars: any = null;
  orderMarkers: any[] = [];

  constructor(_seed: number, _camera: any, _audio: any, terrainW: number, terrainH: number) {
    this.terrainW = terrainW;
    this.terrainH = terrainH;
  }

  // All spawn/stamp/draw methods — no-op on server.
  // The client generates visual effects from synced unit state.
  spawnExplosion(_x: number, _y: number, _opts?: any) {}
  spawnSmoke(_x: number, _y: number, _opts?: any) {}
  spawnDust(_x: number, _y: number, _vx: number, _vy: number) {}
  spawnWaterSplash(_x: number, _y: number, _scale: number, _ink: boolean) {}
  spawnWake(_x: number, _y: number, _angle: number, _beam: number, _frac: number, _length: number) {}
  spawnBowWave(_x: number, _y: number, _angle: number, _beam: number, _frac: number) {}
  spawnTorpedoWake(_x: number, _y: number) {}
  stampTrack(_x: number, _y: number, _angle: number, _width: number) {}
  stampScorch(_x: number, _y: number, _radius: number, _intensity: number) {}
  stampOilSlick(_x: number, _y: number, _radius: number) {}
  addShipWreck(_opts: any) {}
  orderMarker(_x: number, _y: number, _type: string) {}
  muzzleFlash(_x: number, _y: number, _angle: number, _len: number) {}
  autoFlash(_x: number, _y: number, _angle: number) {}
  // Draw methods (called by Renderer — not on server)
  drawCore() {}
  drawSmoke() {}
  drawWakes() {}
  drawWaterSplashes() {}
  drawCraters() {}
  drawRubble() {}
  drawOrderMarkers() {}
  update(_dt: number) {}
  [key: string]: any;
}

// ── Headless stubs for window/document ──
// The EffectsSystem constructor calls document.createElement('canvas').
// If we use the HeadlessEffectsSystem above, we avoid that. But other
// modules might reference window/document — install globals just in case.

// Path2D polyfill — the real Terrain constructor uses new Path2D()
// for contour paths. On the server we don't render, so this is a no-op
// that just stores path data (in case anything reads it back).
class HeadlessPath2D {
  private ops: any[] = [];
  moveTo(..._a: any[]) {}
  lineTo(..._a: any[]) {}
  arc(..._a: any[]) {}
  closePath(..._a: any[]) {}
  quadraticCurveTo(..._a: any[]) {}
  bezierCurveTo(..._a: any[]) {}
  rect(..._a: any[]) {}
}

export function installHeadlessDOM() {
  const g = globalThis as any;
  if (typeof g.window === 'undefined') {
    g.window = {
      AudioContext: undefined,
      devicePixelRatio: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
    };
  }
  if (typeof g.document === 'undefined') {
    g.document = {
      createElement: (_tag: string) => ({
        width: 0, height: 0,
        getContext: () => ({
          // canvas 2d context stubs
          fillRect: () => {},
          strokeRect: () => {},
          clearRect: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          arc: () => {},
          closePath: () => {},
          fill: () => {},
          stroke: () => {},
          save: () => {},
          restore: () => {},
          translate: () => {},
          rotate: () => {},
          scale: () => {},
          setTransform: () => {},
          createRadialGradient: () => ({ addColorStop: () => {} }),
          createLinearGradient: () => ({ addColorStop: () => {} }),
          createImageData: () => ({ data: new Uint8ClampedArray(0) }),
          getImageData: () => ({ data: new Uint8ClampedArray(0) }),
          putImageData: () => {},
          drawImage: () => {},
          fillText: () => {},
          strokeText: () => {},
          measureText: () => ({ width: 0 }),
        }),
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        appendChild: () => {},
        removeChild: () => {},
        toDataURL: () => '',
        getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 }),
      }),
      addEventListener: () => {},
      removeEventListener: () => {},
      body: { appendChild: () => {} },
      getComputedStyle: () => ({ getPropertyValue: () => '' }),
    };
  }
  // Path2D — used by Terrain for contour paths
  if (typeof g.Path2D === 'undefined') {
    g.Path2D = HeadlessPath2D;
  }
  // getComputedStyle — used by Renderer
  if (typeof g.getComputedStyle === 'undefined') {
    g.getComputedStyle = () => ({ getPropertyValue: () => '' }) as any;
  }
}
