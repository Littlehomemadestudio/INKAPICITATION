// ─────────────────────────────────────────────────────────────
// PAPER STORM · camera
// Precise, smooth, momentum-free-of-jank: critically damped
// interpolation, wheel zoom toward cursor, bounded map.
// ─────────────────────────────────────────────────────────────

import { clamp, damp } from '../core/math';

export class Camera {
  x = 2048;
  y = 1536;
  zoom = 0.42;

  // targets
  tx = 2048;
  ty = 1536;
  tzoom = 0.42;

  minZoom = 0.13;
  maxZoom = 9.0;

  worldW = 4096;
  worldH = 3072;

  viewW = 0;
  viewH = 0;
  viewX = 0;
  viewY = 0;

  // shake
  private shakeAmp = 0;
  private shakeTime = 0;
  shakeX = 0;
  shakeY = 0;

  constructor(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
  }

  setViewport(w: number, h: number) {
    this.viewW = w;
    this.viewH = h;
    this.minZoom = Math.max(w / (this.worldW * 2.9), h / (this.worldH * 2.9), 0.1);
    this.maxZoom = 9.0;
    this.clampNow();
  }

  zoomBy(factor: number, cursorX: number, cursorY: number) {
    const nz = clamp(this.tzoom * factor, this.minZoom, this.maxZoom);
    // keep the world point under the cursor fixed
    const wx = this.tx + (cursorX - this.viewW / 2) / this.tzoom;
    const wy = this.ty + (cursorY - this.viewH / 2) / this.tzoom;
    this.tzoom = nz;
    this.tx = wx - (cursorX - this.viewW / 2) / nz;
    this.ty = wy - (cursorY - this.viewH / 2) / nz;
    this.clampTarget();
  }

  panBy(dx: number, dy: number) {
    this.tx -= dx / this.tzoom;
    this.ty -= dy / this.tzoom;
    this.clampTarget();
  }

  /** keyboard pan in screen fraction per second */
  keyPan(dx: number, dy: number) {
    this.tx += (dx / this.tzoom) * 1;
    this.ty += (dy / this.tzoom) * 1;
    this.clampTarget();
  }

  focusOn(x: number, y: number, zoom?: number) {
    this.tx = x;
    this.ty = y;
    if (zoom !== undefined) this.tzoom = clamp(zoom, this.minZoom, this.maxZoom);
    this.clampTarget();
  }

  private clampTarget() {
    const margin = 340;
    this.tx = clamp(this.tx, -margin, this.worldW + margin);
    this.ty = clamp(this.ty, -margin, this.worldH + margin);
    this.tzoom = clamp(this.tzoom, this.minZoom, this.maxZoom);
  }

  private clampNow() {
    this.clampTarget();
    this.x = this.tx;
    this.y = this.ty;
    this.zoom = this.tzoom;
  }

  addShake(x: number, y: number, amp: number) {
    // attenuate by distance to view centre
    const d = Math.hypot(x - this.x, y - this.y);
    const atten = clamp(1 - d / (900 / this.zoom + 600), 0, 1);
    const strength = amp * atten * clamp(this.zoom, 0.2, 1.2);
    if (strength > this.shakeAmp) {
      this.shakeAmp = Math.min(strength, 7);
      this.shakeTime = 0;
    }
  }

  update(dt: number) {
    this.x = damp(this.x, this.tx, 9, dt);
    this.y = damp(this.y, this.ty, 9, dt);
    this.zoom = damp(this.zoom, this.tzoom, 11, dt);

    if (this.shakeAmp > 0.05) {
      this.shakeTime += dt;
      this.shakeAmp *= Math.exp(-dt * 5);
      this.shakeX = Math.sin(this.shakeTime * 63) * this.shakeAmp;
      this.shakeY = Math.cos(this.shakeTime * 47) * this.shakeAmp;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    this.viewX = this.x - this.viewW / 2 / this.zoom;
    this.viewY = this.y - this.viewH / 2 / this.zoom;
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  applyTransform(ctx: CanvasRenderingContext2D, dpr: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.viewW / 2 + this.shakeX, this.viewH / 2 + this.shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
}
