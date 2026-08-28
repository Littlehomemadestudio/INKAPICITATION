// ─────────────────────────────────────────────────────────────
// PAPER STORM · terrain rendering
// Pre-rendered hillshade wash + live vector overlays (contours,
// roads, railway, river, ford, buildings, rocks, pylons, grid,
// map furniture). The land itself is the hero.
// ─────────────────────────────────────────────────────────────

import { Terrain, TreePoint } from '../world/terrain';
import { RNG, clamp } from '../core/math';
import type { Camera } from '../systems/camera';

export const PAPER = '#f3f1ea';
export const INK = '#17150f';
export const INK_SOFT = '#4c4840';

const WASH_SCALE = 0.25; // wash px per metre

export class TerrainRenderer {
  wash: HTMLCanvasElement;
  grain: HTMLCanvasElement;
  stains: HTMLCanvasElement;
  terrain: Terrain;

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    this.wash = this.buildWash(terrain);
    this.grain = this.buildGrain(terrain.seed);
    this.stains = this.buildStains(terrain.seed);
  }

  // ── pre-rendered layers ────────────────────────────────────

  private buildWash(t: Terrain): HTMLCanvasElement {
    const w = Math.round(t.W * WASH_SCALE);
    const h = Math.round(t.H * WASH_SCALE);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d')!;

    // base paper
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);

    // hillshade + elevation tint (per pixel)
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const invS = 1 / WASH_SCALE;
    const sea = t.sea;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const x = px * invS;
        const y = py * invS;
        const e = 12;
        const hx = t.heightAt(x + e, y) - t.heightAt(x - e, y);
        const hy = t.heightAt(x, y + e) - t.heightAt(x, y - e);
        // light from NW (-1,-1) normalised
        const nl = (-hx - hy) / (Math.hypot(hx, hy) * Math.SQRT2 + 1e-6);
        const slope = Math.hypot(hx, hy) / (2 * e);
        let shade = 1 + nl * 0.18 - slope * 0.26;
        // cliff faces read darker — steep ground has exposed rock
        if (slope > 0.34) shade -= (slope - 0.34) * 0.55;
        // elevation: valleys slightly darker, high ground lighter
        const elev = t.heightAt(x, y);
        shade += (elev - 30) * 0.0022;
        // river valley mist
        const dr = t.distToPolyline(x, y, t.river);
        if (dr < 190) shade -= (1 - dr / 190) * 0.05;
        shade = clamp(shade, 0.7, 1.06);
        const i = (py * w + px) * 4;
        const base = 243;

        // ── the sea: cold, muted, deliberate blue ── the one
        // chromatic voice in a monochrome war. Depth graded from
        // the shore bands into the deep bay ──
        if (sea.isSea(x, y)) {
          const sd = sea.shoreDistAt(x, y);
          const dNorm = clamp(sd / 420, 0, 1);
          const ripple = Math.sin(x * 0.045 + y * 0.02) * 3 + Math.sin(x * 0.013 - y * 0.031) * 3;
          d[i] = clamp(133 - dNorm * 49 + ripple, 0, 255);
          d[i + 1] = clamp(148 - dNorm * 49 + ripple, 0, 255);
          d[i + 2] = clamp(153 - dNorm * 42 + ripple, 0, 255);
          d[i + 3] = 255;
          continue;
        }
        // the coastal band — sand or rock
        const mgx = (x / 16) | 0;
        const mgy = (y / 16) | 0;
        const mi = mgy * sea.mw + mgx;
        if (mi >= 0 && mi < sea.beachMask.length && sea.beachMask[mi]) {
          const sd = sea.shoreDistAt(x, y);
          const k = clamp(1 + sd / 34, 0, 1) * 0.85;
          d[i] = clamp(base * shade * (1 - k) + 212 * k, 0, 255);
          d[i + 1] = clamp((base - 2) * shade * (1 - k) + 202 * k, 0, 255);
          d[i + 2] = clamp((base - 6) * shade * (1 - k) + 176 * k, 0, 255);
          d[i + 3] = 255;
          continue;
        }
        if (mi >= 0 && mi < sea.cliffMask.length && sea.cliffMask[mi]) {
          shade -= 0.05;
        }
        d[i] = clamp(base * shade, 0, 255);
        d[i + 1] = clamp((base - 2) * shade, 0, 255);
        d[i + 2] = clamp((base - 6) * shade, 0, 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // forest under-canopy mass wash (soft)
    ctx.save();
    ctx.scale(WASH_SCALE, WASH_SCALE);
    const rng = new RNG((t.seed ^ 0x5eed) >>> 0);
    for (let i = 0; i < 3000; i++) {
      const x = rng.range(0, t.W);
      const y = rng.range(0, t.H);
      const f = t.forestDensity(x, y);
      if (f < 0.4) continue;
      const r = rng.range(40, 110);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(120,115,102,${0.05 + f * 0.09})`);
      g.addColorStop(1, 'rgba(120,115,102,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // rock outcrop speckle on the steep ridge flanks
    for (let i = 0; i < 1600; i++) {
      const x = rng.range(0, t.W);
      const y = rng.range(0, t.H);
      const s = t.slopeAt(x, y);
      if (s < 0.24) continue;
      const r = rng.range(6, 22);
      ctx.fillStyle = `rgba(104,99,88,${0.04 + (s - 0.24) * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * rng.range(0.5, 0.9), rng.range(0, Math.PI), 0, Math.PI * 2);
      ctx.fill();
    }

    // river band — the same cold water as the sea
    this.strokePoly(ctx, t.river, t.riverWidth + 18, '#a9b3b5');
    this.strokePoly(ctx, t.river, t.riverWidth + 4, '#8fa0a6');
    this.strokePoly(ctx, t.river, t.riverWidth, '#7e9097');
    this.strokePoly(ctx, t.river, t.riverWidth * 0.45, '#6f828b');
    ctx.restore();

    return cv;
  }

  private buildGrain(seed: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 256;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(256, 256);
    const rng = new RNG((seed ^ 0x600d) >>> 0);
    const d = img.data;
    for (let i = 0; i < 256 * 256; i++) {
      const v = 128 + (rng.next() - 0.5) * 190;
      const fib = rng.next() < 0.003 ? 40 : 0;
      d[i * 4] = v;
      d[i * 4 + 1] = v;
      d[i * 4 + 2] = v - fib;
      d[i * 4 + 3] = 26;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /** sparse organic paper stains — the sheet has history before the war */
  private buildStains(seed: number): HTMLCanvasElement {
    const t = this.terrain;
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 768;
    const ctx = cv.getContext('2d')!;
    ctx.scale(1024 / t.W, 768 / t.H);
    const rng = new RNG((seed ^ 0xBADA55) >>> 0);
    for (let i = 0; i < 46; i++) {
      const x = rng.range(0, t.W);
      const y = rng.range(0, t.H);
      const r = rng.range(24, 130);
      const n = rng.int(3, 6);
      ctx.fillStyle = `rgba(120,110,88,${rng.range(0.015, 0.05)})`;
      for (let b = 0; b < n; b++) {
        const a = rng.range(0, Math.PI * 2);
        const rr = r * rng.range(0.3, 0.8);
        ctx.beginPath();
        ctx.ellipse(
          x + Math.cos(a) * r * 0.4,
          y + Math.sin(a) * r * 0.4,
          rr,
          rr * rng.range(0.5, 0.9),
          rng.range(0, Math.PI),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
    return cv;
  }

  private strokePoly(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], width: number, color: string, dash?: number[]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  /** visibility mask: point in view, or adjacent to one that is */
  private visibleMask(pts: { x: number; y: number }[], cam: Camera, pad: number): boolean[] {
    const x0 = cam.viewX - pad;
    const x1 = cam.viewX + cam.viewW + pad;
    const y0 = cam.viewY - pad;
    const y1 = cam.viewY + cam.viewH + pad;
    const vis = new Array<boolean>(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      vis[i] = p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
    }
    const inc = new Array<boolean>(pts.length).fill(false);
    for (let i = 0; i < pts.length; i++) {
      if (vis[i] || (i > 0 && vis[i - 1]) || (i < pts.length - 1 && vis[i + 1])) inc[i] = true;
    }
    return inc;
  }

  /** stroke only the visible portion of a polyline */
  private strokePolyView(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], inc: boolean[], width: number, color: string, dash?: number[]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < pts.length; i++) {
      if (!inc[i]) {
        pen = false;
        continue;
      }
      if (!pen) {
        ctx.moveTo(pts[i].x, pts[i].y);
        pen = true;
      } else {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
    }
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  // ── per-frame world-space drawing ──────────────────────────

  /** wash + stains + scars + contours + grid */
  drawBase(ctx: CanvasRenderingContext2D, cam: Camera, scars: HTMLCanvasElement) {
    const t = this.terrain;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.wash, 0, 0, t.W, t.H);
    ctx.drawImage(this.stains, 0, 0, t.W, t.H);

    // contour lines
    if (t.contours) {
      const wMin = Math.max(1.1, 0.9 / cam.zoom);
      const wMaj = Math.max(2.2, 1.6 / cam.zoom);
      ctx.save();
      ctx.globalAlpha = 0.62;
      ctx.strokeStyle = '#a29d90';
      ctx.lineWidth = wMin;
      ctx.lineJoin = 'round';
      ctx.stroke(t.contours.minor);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.78;
      ctx.strokeStyle = '#847f71';
      ctx.lineWidth = wMaj;
      ctx.lineJoin = 'round';
      ctx.stroke(t.contours.major);
      ctx.restore();
    }

    // war scars layer — deepen the ink when viewed strategically
    ctx.drawImage(scars, 0, 0, t.W, t.H);
    if (cam.zoom < 0.55) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.drawImage(scars, 0, 0, t.W, t.H);
      ctx.restore();
    }

    // grid
    this.drawGrid(ctx, cam);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    const x0 = Math.max(0, Math.floor(cam.viewX / 512) * 512);
    const x1 = Math.min(t.W, cam.viewX + cam.viewW);
    const y0 = Math.max(0, Math.floor(cam.viewY / 512) * 512);
    const y1 = Math.min(t.H, cam.viewY + cam.viewH);
    ctx.save();
    ctx.strokeStyle = '#141210';
    ctx.lineWidth = Math.max(0.7, 0.5 / cam.zoom);
    for (let x = x0; x <= x1; x += 512) {
      const major = x % 1024 === 0;
      ctx.globalAlpha = major ? 0.16 : 0.075;
      ctx.beginPath();
      ctx.moveTo(x, Math.max(0, y0 - 512));
      ctx.lineTo(x, y1 + 512);
      ctx.stroke();
    }
    for (let y = y0; y <= y1; y += 512) {
      const major = y % 1024 === 0;
      ctx.globalAlpha = major ? 0.16 : 0.075;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, x0 - 512), y);
      ctx.lineTo(x1 + 512, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawFeatures(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    this.drawFields(ctx, cam);
    this.drawDryStream(ctx, cam);
    this.drawRailway(ctx, cam);
    this.drawRoads(ctx, cam);
    this.drawRiver(ctx, cam);
    this.drawFord(ctx, cam);
    this.drawBridges(ctx, cam);
    this.drawTrenches(ctx, cam);
    this.drawBuildings(ctx, cam.zoom, cam);
    this.drawRocks(ctx, cam);
    this.drawWalls(ctx, cam);
    this.drawBarriers(ctx, cam);
    this.drawTrees(ctx, cam);
    this.drawPowerLine(ctx, cam);
    this.drawSea(ctx, cam, this.timeNow);
    this.drawLabels(ctx, cam);
    this.drawSpotHeights(ctx, cam);
  }

  /** wall clock for water animation — set by the renderer each frame */
  timeNow = 0;

  // ── the living sea ──────────────────────────────────────

  /** swell texture, shoreline foam, cliff hatching, harbour works, buoys */
  drawSea(ctx: CanvasRenderingContext2D, cam: Camera, time: number) {
    const t = this.terrain;
    const sea = t.sea;
    const zoom = cam.zoom;
    // the sea's rough bounds on this sheet
    const x0 = Math.max(cam.viewX - 60, 2100);
    const y0 = Math.max(cam.viewY - 60, 1900);
    const x1 = Math.min(cam.viewX + cam.viewW + 60, t.W);
    const y1 = Math.min(cam.viewY + cam.viewH + 60, t.H);
    if (x1 <= x0 || y1 <= y0) return;

    // ── open-water swell: short comma strokes, drifting ──
    const stride = zoom < 0.3 ? 96 : 54;
    const swellA = -0.55;
    let count = 0;
    ctx.save();
    ctx.lineWidth = Math.max(1, 1.7);
    ctx.lineCap = 'round';
    ctx.beginPath();
    let darkPass = false;
    for (let pass = 0; pass < 2 && count < 380; pass++) {
      darkPass = pass === 1;
      ctx.strokeStyle = darkPass ? 'rgba(66,78,86,0.075)' : 'rgba(230,235,235,0.10)';
      for (let y = y0 + pass * (stride / 2); y < y1 && count < 380; y += stride) {
        for (let x = x0 + pass * (stride / 3); x < x1 && count < 380; x += stride) {
          const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
          const hx = h - Math.floor(h);
          const wx = x + (hx - 0.5) * stride * 0.8;
          const wy = y + (hx - 0.34) * stride * 0.6;
          if (!sea.isSea(wx, wy)) continue;
          if (sea.shoreDistAt(wx, wy) < 24) continue; // foam owns the margin
          const ph = time * 0.9 + hx * 6.28;
          if (Math.sin(ph) < (darkPass ? 0.1 : -0.05)) continue; // sparse field
          const len = stride * (0.3 + hx * 0.16);
          const cx = wx - Math.cos(swellA) * len * 0.5;
          const cy = wy - Math.sin(swellA) * len * 0.5;
          ctx.moveTo(cx, cy);
          ctx.quadraticCurveTo(
            cx + Math.cos(swellA) * len * 0.5,
            cy + Math.sin(swellA) * len * 0.5 + Math.sin(ph) * 2.6,
            wx + Math.cos(swellA) * len * 0.5,
            wy + Math.sin(swellA) * len * 0.5
          );
          count++;
        }
      }
    }
    ctx.stroke();
    ctx.restore();

    // ── the coastline itself: a sure dark edge, then breathing foam ──
    ctx.save();
    ctx.strokeStyle = 'rgba(56,62,66,0.55)';
    ctx.lineWidth = Math.max(1.4, 2 / Math.sqrt(zoom));
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.strokeShorePath(ctx, sea, x0, y0, x1, y1);
    ctx.stroke();
    // foam — an animated dashed seam just seaward
    ctx.strokeStyle = 'rgba(234,238,238,0.4)';
    ctx.lineWidth = Math.max(2.2, 3 / zoom);
    ctx.lineCap = 'round';
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -time * 7;
    ctx.beginPath();
    this.strokeShorePath(ctx, sea, x0, y0, x1, y1, 5.5);
    ctx.stroke();
    ctx.setLineDash([]);
    // a second, fainter surf line further out
    ctx.strokeStyle = 'rgba(234,238,238,0.18)';
    ctx.lineWidth = Math.max(1.4, 2 / zoom);
    ctx.lineDashOffset = -time * 5 + 4;
    ctx.setLineDash([6, 12]);
    ctx.beginPath();
    this.strokeShorePath(ctx, sea, x0, y0, x1, y1, 13);
    ctx.stroke();
    ctx.setLineDash([]);

    // cliff hatching — rock faces catch their own shadow
    if (zoom > 0.42) {
      ctx.strokeStyle = 'rgba(58,54,46,0.5)';
      ctx.lineWidth = Math.max(0.9, 1 / zoom);
      ctx.beginPath();
      for (let i = 0; i < sea.shore.length; i++) {
        const p = sea.shore[i];
        if (p.type !== 'CLIFF') continue;
        if (p.x < x0 - 20 || p.x > x1 + 20 || p.y < y0 - 20 || p.y > y1 + 20) continue;
        const q = sea.shore[(i + 1) % sea.shore.length];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        // seaward normal
        const sx = sea.isSea(p.x + nx * 10, p.y + ny * 10) ? 1 : -1;
        const tick = 5 + ((i * 37) % 4);
        ctx.moveTo(p.x + nx * 2 * sx, p.y + ny * 2 * sx);
        ctx.lineTo(p.x + nx * (2 + tick) * sx, p.y + ny * (2 + tick) * sx);
      }
      ctx.stroke();
    }
    ctx.restore();

    this.drawHarbour(ctx, cam, x0, y0, x1, y1);
  }

  /** the shoreline as one continuous path (optionally offset seaward) */
  private strokeShorePath(
    ctx: CanvasRenderingContext2D,
    sea: import('../world/sea').Sea,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    offset = 0
  ) {
    let pen = false;
    for (let i = 0; i < sea.shore.length; i++) {
      const p = sea.shore[i];
      const inV = p.x > x0 - 40 && p.x < x1 + 40 && p.y > y0 - 40 && p.y < y1 + 40;
      if (!inV) {
        pen = false;
        continue;
      }
      let px = p.x;
      let py = p.y;
      if (offset !== 0) {
        const q = sea.shore[(i + 1) % sea.shore.length];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const s = sea.isSea(p.x + nx * 8, p.y + ny * 8) ? 1 : -1;
        px += nx * offset * s;
        py += ny * offset * s;
      }
      if (!pen) {
        ctx.moveTo(px, py);
        pen = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
  }

  /** PORT VELIKY — piers, gantry cranes, breakwater, buoys */
  private drawHarbour(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ) {
    const sea = this.terrain.sea;
    const hb = sea.harbour;
    if (!hb) return;
    const zoom = cam.zoom;

    // breakwater — dressed stone armour against the swell
    ctx.save();
    ctx.strokeStyle = 'rgba(74,70,60,0.9)';
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hb.breakwater[0].x, hb.breakwater[0].y);
    for (let i = 1; i < hb.breakwater.length; i++) ctx.lineTo(hb.breakwater[i].x, hb.breakwater[i].y);
    ctx.stroke();
    // stone speckle along the crest
    ctx.fillStyle = 'rgba(150,144,130,0.8)';
    for (let i = 0; i < hb.breakwater.length - 1; i++) {
      const a = hb.breakwater[i];
      const b = hb.breakwater[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let s = 4; s < len; s += 7) {
        const px = a.x + ((b.x - a.x) * s) / len + Math.sin(s * 3.7) * 2.4;
        const py = a.y + ((b.y - a.y) * s) / len + Math.cos(s * 2.9) * 2.4;
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // piers — timber decks on pilings, crane rails at the head
    for (const p of hb.piers) {
      if (p.x < x0 - 200 || p.x > x1 + 200 || p.y < y0 - 200 || p.y > y1 + 200) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      // shadow in the water
      ctx.fillStyle = 'rgba(40,48,54,0.3)';
      ctx.fillRect(2, -p.w / 2 + 3, p.len, p.w);
      // deck
      ctx.fillStyle = '#5a5344';
      ctx.fillRect(0, -p.w / 2, p.len, p.w);
      ctx.strokeStyle = '#2e2a22';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(0, -p.w / 2, p.len, p.w);
      // plank seams
      if (zoom > 0.4) {
        ctx.strokeStyle = 'rgba(46,42,34,0.6)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let x = 4; x < p.len; x += 4.6) {
          ctx.moveTo(x, -p.w / 2 + 1);
          ctx.lineTo(x, p.w / 2 - 1);
        }
        ctx.stroke();
      }
      // pilings at the head
      ctx.fillStyle = '#332f26';
      for (const side of [1, -1]) {
        ctx.beginPath();
        ctx.arc(p.len - 3, side * (p.w / 2 - 2), 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // gantry cranes — legs, jib, hanging hook
    if (zoom > 0.3) {
      for (const c of hb.cranes) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.strokeStyle = '#2e2a22';
        ctx.lineWidth = 1.6;
        // portal legs
        ctx.beginPath();
        ctx.moveTo(-7, -5);
        ctx.lineTo(-7, 5);
        ctx.moveTo(7, -5);
        ctx.lineTo(7, 5);
        ctx.moveTo(-9, -5);
        ctx.lineTo(9, -5);
        ctx.moveTo(-9, 5);
        ctx.lineTo(9, 5);
        ctx.stroke();
        // jib out over the water
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-2, 0);
        ctx.lineTo(16, -3);
        ctx.stroke();
        // A-frame peak + fall line + hook
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-2, -4);
        ctx.lineTo(1, -9);
        ctx.lineTo(4, -4);
        ctx.moveTo(13, -2.6);
        ctx.lineTo(13, 6);
        ctx.stroke();
        ctx.fillStyle = '#2e2a22';
        ctx.beginPath();
        ctx.arc(13, 7, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // buoys — the channel in red and green (kept muted)
    for (const b of hb.buoys) {
      if (b.x < x0 - 30 || b.x > x1 + 30 || b.y < y0 - 30 || b.y > y1 + 30) continue;
      ctx.save();
      // gentle bob
      const bob = Math.sin(this.timeNow * 1.7 + b.x * 0.05) * 0.8;
      ctx.translate(b.x, b.y + bob);
      ctx.fillStyle = 'rgba(28,30,30,0.35)';
      ctx.beginPath();
      ctx.arc(2, 2.4, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c2a24';
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = b.kind === 'RED' ? '#8a4a3f' : '#5f6e4f';
      ctx.beginPath();
      ctx.arc(0, 0, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** dug positions — dark zigzag with a pale earth berm on the defender's side */
  private drawTrenches(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    if (cam.zoom < 0.32) {
      // strategic: a broken dark line — "there are dug positions here"
      ctx.save();
      ctx.strokeStyle = 'rgba(30,26,20,0.4)';
      ctx.lineWidth = Math.max(2.2, 2.6 / cam.zoom);
      ctx.setLineDash([7, 5]);
      for (const tr of t.trenches) {
        ctx.beginPath();
        ctx.moveTo(tr.pts[0].x, tr.pts[0].y);
        for (let i = 1; i < tr.pts.length; i++) ctx.lineTo(tr.pts[i].x, tr.pts[i].y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }
    for (const tr of t.trenches) {
      // berm — the spoil heap on the south side
      ctx.save();
      ctx.strokeStyle = 'rgba(196,190,174,0.9)';
      ctx.lineWidth = 5.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(tr.pts[0].x, tr.pts[0].y + 4.2);
      for (let i = 1; i < tr.pts.length; i++) ctx.lineTo(tr.pts[i].x, tr.pts[i].y + 4.2);
      ctx.stroke();
      ctx.restore();
      // the cut itself
      ctx.save();
      ctx.strokeStyle = 'rgba(28,24,18,0.88)';
      ctx.lineWidth = 3.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tr.pts[0].x, tr.pts[0].y);
      for (let i = 1; i < tr.pts.length; i++) ctx.lineTo(tr.pts[i].x, tr.pts[i].y);
      ctx.stroke();
      // duckboards — short ticks inside the trench
      if (cam.zoom > 0.9) {
        ctx.strokeStyle = 'rgba(90,84,72,0.55)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let i = 0; i < tr.pts.length - 1; i++) {
          const a = tr.pts[i];
          const b = tr.pts[i + 1];
          const segLen = Math.hypot(b.x - a.x, b.y - a.y);
          const dirA = Math.atan2(b.y - a.y, b.x - a.x);
          const nx = Math.cos(dirA + Math.PI / 2);
          const ny = Math.sin(dirA + Math.PI / 2);
          for (let s = 2; s < segLen; s += 5.4) {
            const x = a.x + (b.x - a.x) * (s / segLen);
            const y = a.y + (b.y - a.y) * (s / segLen);
            ctx.moveTo(x - nx * 1.2, y - ny * 1.2);
            ctx.lineTo(x + nx * 1.2, y + ny * 1.2);
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** dry stone walls — cover you can read at a glance. Breached
   *  sections collapse into a scatter of pale rubble stones. */
  private drawWalls(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    const thick = Math.max(1.8, 2.2 / Math.sqrt(cam.zoom));
    for (const w of t.walls) {
      if (w.x + w.len < cam.viewX - 60 || w.x - w.len > cam.viewX + cam.viewW + 60) continue;
      if (w.y + w.len < cam.viewY - 60 || w.y - w.len > cam.viewY + cam.viewH + 60) continue;
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.rot);
      const segs = w.segs ?? [];
      const n = segs.length || Math.max(3, Math.round(w.len / 9));
      const segLen = w.len / n;
      for (let i = 0; i < n; i++) {
        const lx = -w.len / 2 + segLen * (i + 0.5);
        const alive = !segs.length || segs[i].hp > 0;
        if (alive) {
          // shadow
          ctx.fillStyle = 'rgba(30,27,20,0.16)';
          ctx.fillRect(lx - segLen / 2 + 2, -thick / 2 + 2.4, segLen, thick);
          // stone body
          ctx.fillStyle = '#a8a294';
          ctx.fillRect(lx - segLen / 2, -thick / 2, segLen, thick);
          // cap stones
          ctx.fillStyle = '#c0baa9';
          const cn = Math.max(1, Math.round(segLen / 9));
          for (let c = 0; c < cn; c++) {
            const cx = lx - segLen / 2 + (c * segLen) / cn + 1;
            ctx.fillRect(cx, -thick / 2 + 0.4, segLen / cn - 2, thick * 0.4);
          }
          // copestones — the give-away profile of a field wall
          if (cam.zoom > 0.7) {
            ctx.fillStyle = '#8f897b';
            for (let c = 0; c < cn; c += 2) {
              const cx = lx - segLen / 2 + (c * segLen) / cn + 1;
              ctx.fillRect(cx + 1, -thick / 2 - 0.9, segLen / cn - 3, 1.1);
            }
          }
        } else if (cam.zoom > 0.45) {
          // a breach — stones tumbled and scattered
          const seedR = ((w.x * 13 + i * 7) % 97) / 97;
          for (let c = 0; c < 4; c++) {
            const a = seedR * Math.PI * 2 + c * 1.9;
            const rr = 1.2 + (c % 2) * 1.6;
            const px = lx + Math.cos(a) * (segLen * 0.3);
            const py = Math.sin(a) * 3.4;
            ctx.fillStyle = c % 2 ? 'rgba(150,144,130,0.8)' : 'rgba(120,114,100,0.7)';
            ctx.beginPath();
            ctx.ellipse(px, py, rr, rr * 0.7, a, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }
  }

  /** dragon's teeth — concrete anti-vehicle blocks */
  private drawBarriers(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    if (cam.zoom < 0.5) {
      // strategic: a dotted row of blocks
      ctx.fillStyle = 'rgba(60,56,48,0.75)';
      for (const b of t.barriers) {
        ctx.fillRect(b.x - 2.6, b.y - 2.6, 5.2, 5.2);
      }
      return;
    }
    for (const b of t.barriers) {
      const hp = b.hp ?? 100;
      if (hp <= 0) {
        // shattered concrete — a flattened stub that no longer blocks
        if (cam.zoom > 0.5) {
          ctx.fillStyle = 'rgba(120,114,100,0.55)';
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, 4.6, 3.4, b.rot, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(90,85,74,0.4)';
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
        continue;
      }
      if (b.x < cam.viewX - 30 || b.x > cam.viewX + cam.viewW + 30) continue;
      if (b.y < cam.viewY - 30 || b.y > cam.viewY + cam.viewH + 30) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      // ground shadow
      ctx.fillStyle = 'rgba(30,27,20,0.2)';
      ctx.beginPath();
      ctx.ellipse(2.4, 2.8, 5.2, 4.2, b.rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(b.rot);
      // pyramidal block seen from above: a square with an X brace
      const chipped = hp < 60;
      ctx.fillStyle = chipped ? '#a49e8e' : '#b5af9f';
      ctx.strokeStyle = '#57523f';
      ctx.lineWidth = Math.max(0.7, 0.8 / cam.zoom);
      ctx.beginPath();
      ctx.moveTo(-4, -3);
      ctx.lineTo(4, -3);
      ctx.lineTo(4, 3);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-4, -3);
      ctx.lineTo(4, 3);
      ctx.moveTo(4, -3);
      ctx.lineTo(-4, 3);
      ctx.stroke();
      if (chipped && cam.zoom > 0.7) {
        // spall cracks from near-misses
        ctx.strokeStyle = 'rgba(70,66,55,0.6)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(-2.4, -1.4);
        ctx.lineTo(0.6, 0.8);
        ctx.lineTo(-0.8, 2.6);
        ctx.stroke();
      }
      // apex mark
      ctx.fillStyle = '#8f897b';
      ctx.beginPath();
      ctx.arc(0, 0, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawFields(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    const pad = 120;
    for (const f of t.fields) {
      if (f.x + f.w < cam.viewX - pad || f.x - f.w > cam.viewX + cam.viewW + pad) continue;
      if (f.y + f.h < cam.viewY - pad || f.y - f.h > cam.viewY + cam.viewH + pad) continue;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.fillStyle = `rgba(148,141,124,${f.tone})`;
      ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
      // hedge boundary
      ctx.strokeStyle = 'rgba(96,90,76,0.3)';
      ctx.lineWidth = Math.max(1.4, 1.1 / cam.zoom);
      ctx.setLineDash([9, 6]);
      ctx.strokeRect(-f.w / 2, -f.h / 2, f.w, f.h);
      ctx.setLineDash([]);
      // cultivation lines
      if (cam.zoom > 0.5) {
        ctx.strokeStyle = 'rgba(110,104,88,0.14)';
        ctx.lineWidth = Math.max(0.8, 0.6 / cam.zoom);
        ctx.beginPath();
        for (let yy = -f.h / 2 + 9; yy < f.h / 2; yy += 9) {
          ctx.moveTo(-f.w / 2 + 4, yy);
          ctx.lineTo(f.w / 2 - 4, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** dry tributary — a ghost of a stream, dotted */
  private drawDryStream(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    const inc = this.visibleMask(t.dryStream, cam, 60);
    if (!inc.some(Boolean)) return;
    ctx.save();
    ctx.globalAlpha = 0.55;
    this.strokePolyView(ctx, t.dryStream, inc, 7, 'rgba(196,191,176,0.7)');
    this.strokePolyView(ctx, t.dryStream, inc, 1.1, 'rgba(120,114,100,0.55)', [3, 9]);
    ctx.restore();
  }

  private drawRailway(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    const zoom = cam.zoom;
    const inc = this.visibleMask(t.railway, cam, 80);
    if (!inc.some(Boolean)) return;
    // embankment
    this.strokePolyView(ctx, t.railway, inc, 13, 'rgba(214,209,196,0.8)');
    this.strokePolyView(ctx, t.railway, inc, 10, 'rgba(203,198,184,0.9)');
    // sleepers
    if (zoom > 0.35) {
      ctx.save();
      ctx.strokeStyle = 'rgba(112,106,92,0.62)';
      ctx.lineWidth = Math.max(1.4, 1.1 / zoom);
      ctx.beginPath();
      const stepM = 7.2;
      for (let i = 0; i < t.railway.length - 1; i++) {
        if (!inc[i] && !inc[i + 1]) continue;
        const a = t.railway[i];
        const b = t.railway[i + 1];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        const dirA = Math.atan2(b.y - a.y, b.x - a.x);
        const nx = Math.cos(dirA + Math.PI / 2);
        const ny = Math.sin(dirA + Math.PI / 2);
        for (let s = 0; s < segLen; s += stepM) {
          const x = a.x + (b.x - a.x) * (s / segLen);
          const y = a.y + (b.y - a.y) * (s / segLen);
          ctx.moveTo(x - nx * 4.4, y - ny * 4.4);
          ctx.lineTo(x + nx * 4.4, y + ny * 4.4);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
    // twin rails
    const nx = this.perpOffset(t.railway, 2.6);
    this.strokePolyView(ctx, nx.pos, inc, 1.4, 'rgba(64,60,50,0.85)');
    const nx2 = this.perpOffset(t.railway, -2.6);
    this.strokePolyView(ctx, nx2.pos, inc, 1.4, 'rgba(64,60,50,0.85)');
    // rail bridge
    for (const b of t.railBridges) {
      if (b.x < cam.viewX - 80 || b.x > cam.viewX + cam.viewW + 80) continue;
      if (b.y < cam.viewY - 80 || b.y > cam.viewY + cam.viewH + 80) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      ctx.fillStyle = '#bdb8a8';
      ctx.strokeStyle = '#3f3a31';
      ctx.lineWidth = 1.2;
      ctx.fillRect(-b.len / 2, -b.w / 2, b.len, b.w);
      ctx.strokeRect(-b.len / 2, -b.w / 2, b.len, b.w);
      // cross beams
      ctx.strokeStyle = 'rgba(80,75,66,0.6)';
      ctx.lineWidth = 0.9;
      for (let x = -b.len / 2 + 5; x < b.len / 2; x += 6.5) {
        ctx.beginPath();
        ctx.moveTo(x, -b.w / 2);
        ctx.lineTo(x, b.w / 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** offset a polyline perpendicular to itself */
  private perpOffset(pts: { x: number; y: number }[], off: number): { pos: { x: number; y: number }[] } {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      out.push({ x: pts[i].x + nx * off, y: pts[i].y + ny * off });
    }
    return { pos: out };
  }

  private drawRoads(ctx: CanvasRenderingContext2D, cam: Camera) {
    for (const r of this.terrain.roads) {
      const inc = this.visibleMask(r.pts, cam, 90);
      if (!inc.some(Boolean)) continue;
      if (r.major) {
        this.strokePolyView(ctx, r.pts, inc, 15, '#ddd8ca');
        this.strokePolyView(ctx, r.pts, inc, 12.4, '#d3cdbd');
        // wheel-worn twin tracks
        this.strokePolyView(ctx, r.pts, inc, 1.1, 'rgba(140,133,120,0.45)');
        // edges
        ctx.save();
        ctx.translate(0, -5.4);
        this.strokePolyView(ctx, r.pts, inc, 1.3, 'rgba(80,75,66,0.5)');
        ctx.restore();
        ctx.save();
        ctx.translate(0, 5.4);
        this.strokePolyView(ctx, r.pts, inc, 1.3, 'rgba(80,75,66,0.5)');
        ctx.restore();
      } else {
        this.strokePolyView(ctx, r.pts, inc, 8, 'rgba(224,220,209,0.55)');
        this.strokePolyView(ctx, r.pts, inc, 1.6, 'rgba(104,98,86,0.6)', [8, 12]);
      }
    }
  }

  private drawRiver(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    const inc = this.visibleMask(t.river, cam, 90);
    if (!inc.some(Boolean)) return;
    // banks — cool stone against the blue
    ctx.save();
    ctx.translate(0, -(t.riverWidth / 2 + 2));
    this.strokePolyView(ctx, t.river, inc, 1.5, 'rgba(88,92,94,0.75)');
    ctx.restore();
    ctx.save();
    ctx.translate(0, t.riverWidth / 2 + 2);
    this.strokePolyView(ctx, t.river, inc, 1.5, 'rgba(88,92,94,0.75)');
    ctx.restore();
    // flow lines — pale seams on living water
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(0, -6);
    this.strokePolyView(ctx, t.river, inc, 1.1, 'rgba(214,224,226,0.8)', [30, 46]);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.translate(0, 7);
    this.strokePolyView(ctx, t.river, inc, 1.1, 'rgba(214,224,226,0.7)', [22, 52]);
    ctx.restore();
  }

  /** the wade point — cobble bars crossing the water */
  private drawFord(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    if (!t.ford) return;
    const f = t.ford;
    const dir = t.polylineDirAt(f.x, f.y, t.river);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(dir);
    // submerged stone bars
    ctx.fillStyle = 'rgba(178,173,158,0.95)';
    for (let row = 0; row < 5; row++) {
      const y = -14 + row * 7;
      for (let i = 0; i < 4; i++) {
        const x = -16 + i * 11 + ((row % 2) * 5);
        ctx.beginPath();
        ctx.ellipse(x, y, 4.6, 2.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // track approaches on both banks
    ctx.strokeStyle = 'rgba(110,104,90,0.7)';
    ctx.lineWidth = Math.max(1.6, 1.3 / cam.zoom);
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(-42, 0);
    ctx.lineTo(-16, 0);
    ctx.moveTo(16, 0);
    ctx.lineTo(42, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawBridges(ctx: CanvasRenderingContext2D, cam: Camera) {
    for (const b of this.terrain.bridges) {
      if (b.x < cam.viewX - 80 || b.x > cam.viewX + cam.viewW + 80) continue;
      if (b.y < cam.viewY - 80 || b.y > cam.viewY + cam.viewH + 80) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      const L = b.len;
      const W = b.w;
      ctx.fillStyle = '#c8c3b4';
      ctx.strokeStyle = '#3f3a31';
      ctx.lineWidth = 1.4;
      ctx.fillRect(-L / 2, -W / 2, L, W);
      ctx.strokeRect(-L / 2, -W / 2, L, W);
      // planks
      ctx.strokeStyle = 'rgba(90,85,74,0.5)';
      ctx.lineWidth = 0.9;
      for (let x = -L / 2 + 4; x < L / 2; x += 4.4) {
        ctx.beginPath();
        ctx.moveTo(x, -W / 2 + 1);
        ctx.lineTo(x, W / 2 - 1);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawBuildings(ctx: CanvasRenderingContext2D, zoom: number, cam?: Camera) {
    const detail = zoom > 1.0;
    const vx0 = cam ? cam.viewX - 60 : -Infinity;
    const vx1 = cam ? cam.viewX + cam.viewW + 60 : Infinity;
    const vy0 = cam ? cam.viewY - 60 : -Infinity;
    const vy1 = cam ? cam.viewY + cam.viewH + 60 : Infinity;
    for (const b of this.terrain.buildings) {
      if (b.x < vx0 || b.x > vx1 || b.y < vy0 || b.y > vy1) continue;
      const stage = b.stage ?? 0;
      if (stage >= 3) continue; // collapsed — the rubble field draws in its place
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      // shadow
      ctx.fillStyle = 'rgba(30,27,20,0.13)';
      ctx.fillRect(-b.w / 2 + 3.4, -b.h / 2 + 4.2, b.w, b.h);
      // body — fire and blast darken the walls before they fall
      let fill = '#e6e3d8';
      if (b.kind === 'HQ_CORE') fill = '#dcd8ca';
      if (b.kind === 'BUNKER') fill = '#c9c4b5';
      if (b.kind === 'SHED') fill = '#e0dccd';
      if (b.kind === 'FACTORY_HALL') fill = '#d9d4c4';
      if (b.kind === 'FACTORY_HALL2') fill = '#ddd8c9';
      if (b.kind === 'DEPOT') fill = '#dcd7c8';
      if (b.kind === 'WAREHOUSE') fill = '#dad5c5';
      if (b.kind === 'FUEL_TANK') fill = '#d3cebe';
      if (stage === 1) fill = shade(fill, -0.1);
      if (stage === 2) fill = shade(fill, -0.24);
      ctx.fillStyle = fill;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.strokeStyle = b.kind === 'HQ_CORE' || b.kind.startsWith('FACTORY') ? '#2b2820' : '#524d42';
      ctx.lineWidth = b.kind === 'HQ_CORE' || b.kind.startsWith('FACTORY') ? 2 : 1.3;
      ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);

      // battle damage — soot, shell holes, a broken roofline
      if (stage >= 1 && b.kind !== 'MAST') {
        const seed = ((b.x * 31 + b.y * 17) % 89) / 89;
        ctx.save();
        ctx.globalAlpha = 0.55;
        // soot smears
        ctx.fillStyle = 'rgba(52,48,40,0.4)';
        for (let i = 0; i < 3; i++) {
          const sx = -b.w / 2 + b.w * ((seed * 3 + i * 0.37) % 1);
          const sy = -b.h / 2 + b.h * ((seed * 7 + i * 0.53) % 1);
          ctx.beginPath();
          ctx.ellipse(sx, sy, Math.min(b.w, b.h) * 0.16, Math.min(b.w, b.h) * 0.1, seed + i, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        if (stage >= 2 && zoom > 0.5) {
          // shell holes punched through the roof
          ctx.fillStyle = 'rgba(28,25,19,0.72)';
          const holes = 2 + Math.round(seed * 3);
          for (let i = 0; i < holes; i++) {
            const hx = -b.w / 2 + b.w * ((seed * 11 + i * 0.41) % 1);
            const hy = -b.h / 2 + b.h * ((seed * 5 + i * 0.67) % 1);
            ctx.beginPath();
            ctx.ellipse(hx, hy, Math.min(3.4, b.w * 0.12), Math.min(2.6, b.h * 0.12), seed * 3 + i, 0, Math.PI * 2);
            ctx.fill();
          }
          // a broken edge — the outline no longer closes
          ctx.strokeStyle = 'rgba(60,56,46,0.8)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          const ex = -b.w / 2 + b.w * (((seed * 13) % 0.7) + 0.1);
          ctx.moveTo(ex, -b.h / 2);
          ctx.lineTo(ex + b.w * 0.08, b.h / 2);
          ctx.stroke();
        }
      }

      if (b.kind === 'MAST') {
        // communications mast: lattice triangle + guy wires
        ctx.strokeStyle = '#37332b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-6, 6);
        ctx.lineTo(0, -14);
        ctx.lineTo(6, 6);
        ctx.stroke();
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let i = 1; i <= 3; i++) {
          const t = i / 4;
          ctx.moveTo(-6 + 6 * t, 6 - 20 * t);
          ctx.lineTo(6 - 6 * t, 6 - 20 * t);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -14, 2.6, 0, Math.PI * 2);
        ctx.stroke();
      } else if (b.kind === 'CHIMNEY') {
        // big industrial stack — ringed circle
        ctx.fillStyle = '#cfcabb';
        ctx.beginPath();
        ctx.arc(0, 0, b.w * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3a352c';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, b.w * 0.26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(40,36,28,0.5)';
        ctx.beginPath();
        ctx.arc(1.4, 1.8, b.w * 0.13, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 'STORAGE_TANK') {
        // cylindrical solvent tank with roof seam
        ctx.fillStyle = '#d3cebe';
        ctx.beginPath();
        ctx.arc(0, 0, b.w * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4a453b';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(90,85,74,0.7)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-b.w * 0.42, 0);
        ctx.lineTo(b.w * 0.42, 0);
        ctx.stroke();
        // shadow lobe
        ctx.fillStyle = 'rgba(30,27,20,0.14)';
        ctx.beginPath();
        ctx.arc(b.w * 0.18, b.w * 0.18, b.w * 0.34, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 'SILO') {
        ctx.fillStyle = '#dcd7c7';
        ctx.beginPath();
        ctx.arc(0, 0, b.w * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#524d42';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, b.w * 0.2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (b.kind === 'CHURCH') {
        // nave + tower — the town landmark
        ctx.fillStyle = '#e2dfd2';
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.strokeStyle = '#38332a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.fillStyle = '#d5d0c0';
        ctx.fillRect(b.w * 0.16, -b.h / 2 - 9, b.w * 0.42, 10);
        ctx.strokeRect(b.w * 0.16, -b.h / 2 - 9, b.w * 0.42, 10);
        if (detail) {
          // roof ridge + cross
          ctx.strokeStyle = 'rgba(70,65,55,0.6)';
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(-b.w / 2 + 2, 0);
          ctx.lineTo(b.w / 2 - 2, 0);
          ctx.stroke();
          ctx.strokeStyle = '#2b2820';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          const cx2 = b.w * 0.37;
          const cy2 = -b.h / 2 - 9;
          ctx.moveTo(cx2, cy2 - 4);
          ctx.lineTo(cx2, cy2 + 4);
          ctx.moveTo(cx2 - 2.6, cy2 - 1.4);
          ctx.lineTo(cx2 + 2.6, cy2 - 1.4);
          ctx.stroke();
        }
      } else if (b.kind === 'SUBSTATION') {
        ctx.fillStyle = '#d8d3c3';
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.strokeStyle = '#4a453b';
        ctx.lineWidth = 1.1;
        ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
        // transformer coils
        ctx.fillStyle = '#5a5448';
        for (const [ox, oy] of [[-0.22, -0.16], [0.22, -0.16], [-0.22, 0.2], [0.22, 0.2]] as const) {
          ctx.beginPath();
          ctx.arc(b.w * ox, b.h * oy, b.w * 0.11, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (b.kind === 'CHECKPOINT') {
        ctx.fillStyle = '#cfcabb';
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.strokeStyle = '#3a352c';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
        // barrier arm
        ctx.strokeStyle = '#2b2820';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(b.w * 1.4, -b.h * 0.9);
        ctx.stroke();
      } else if (b.kind.startsWith('FACTORY')) {
        // saw-tooth roof of a production hall
        ctx.save();
        ctx.beginPath();
        ctx.rect(-b.w / 2 + 1, -b.h / 2 + 1, b.w - 2, b.h - 2);
        ctx.clip();
        ctx.strokeStyle = 'rgba(88,82,70,0.75)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        const teeth = Math.max(3, Math.round(b.w / 9));
        const tw = b.w / teeth;
        for (let i = 0; i < teeth; i++) {
          const x0 = -b.w / 2 + i * tw;
          ctx.moveTo(x0, b.h / 2 - 1);
          ctx.lineTo(x0 + tw * 0.6, -b.h / 2 + 1);
          ctx.lineTo(x0 + tw, -b.h / 2 + 1);
          ctx.lineTo(x0 + tw, b.h / 2 - 1);
        }
        ctx.stroke();
        ctx.restore();
        if (detail) {
          // ventilator bumps along the ridge
          ctx.fillStyle = 'rgba(90,85,74,0.8)';
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(-b.w / 4 + (i * b.w) / 4, -b.h / 2 + 2.5, 1.1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (b.kind === 'WAREHOUSE') {
        // long goods shed — ribbed roof, loading doors on the seaward wall
        ctx.save();
        ctx.beginPath();
        ctx.rect(-b.w / 2 + 1, -b.h / 2 + 1, b.w - 2, b.h - 2);
        ctx.clip();
        ctx.strokeStyle = 'rgba(96,90,76,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const ribs = Math.max(4, Math.round(b.w / 5));
        for (let i = 1; i < ribs; i++) {
          const x0 = -b.w / 2 + (i * b.w) / ribs;
          ctx.moveTo(x0, -b.h / 2 + 1);
          ctx.lineTo(x0, b.h / 2 - 1);
        }
        ctx.stroke();
        // ridge
        ctx.strokeStyle = 'rgba(70,64,54,0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-b.w / 2 + 2, 0);
        ctx.lineTo(b.w / 2 - 2, 0);
        ctx.stroke();
        ctx.restore();
        if (detail) {
          // loading doors
          ctx.fillStyle = 'rgba(88,82,68,0.8)';
          for (const dx of [-b.w * 0.28, 0, b.w * 0.28]) {
            ctx.fillRect(dx - 2, b.h / 2 - 4, 4, 3.4);
          }
        }
      } else if (b.kind === 'FUEL_TANK') {
        // same family as the works tank farm
        ctx.fillStyle = '#d3cebe';
        ctx.beginPath();
        ctx.arc(0, 0, b.w * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4a453b';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(90,85,74,0.7)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-b.w * 0.42, 0);
        ctx.lineTo(b.w * 0.42, 0);
        ctx.stroke();
        ctx.fillStyle = 'rgba(30,27,20,0.14)';
        ctx.beginPath();
        ctx.arc(b.w * 0.18, b.w * 0.18, b.w * 0.34, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 'RUIN') {
        // a broken structure — partial walls, rubble, no roof
        ctx.save();
        ctx.fillStyle = 'rgba(30,27,20,0.12)';
        ctx.fillRect(-b.w / 2 + 3, -b.h / 2 + 3.6, b.w, b.h);
        // scorched floor
        ctx.fillStyle = 'rgba(150,144,130,0.5)';
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        // surviving wall fragments — jagged partial outline
        ctx.strokeStyle = '#3f3a30';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-b.w / 2, -b.h / 2);
        ctx.lineTo(b.w * 0.1, -b.h / 2);
        ctx.moveTo(b.w * 0.3, -b.h / 2);
        ctx.lineTo(b.w / 2, -b.h / 2);
        ctx.lineTo(b.w / 2, -b.h * 0.05);
        ctx.moveTo(b.w / 2, b.h * 0.18);
        ctx.lineTo(b.w / 2, b.h / 2);
        ctx.lineTo(b.w * 0.05, b.h / 2);
        ctx.moveTo(-b.w * 0.2, b.h / 2);
        ctx.lineTo(-b.w / 2, b.h / 2);
        ctx.lineTo(-b.w / 2, -b.h / 2);
        ctx.stroke();
        // internal collapse
        ctx.strokeStyle = 'rgba(96,90,76,0.7)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-b.w * 0.3, b.h * 0.1);
        ctx.lineTo(b.w * 0.15, -b.h * 0.2);
        ctx.moveTo(-b.w * 0.1, b.h * 0.3);
        ctx.lineTo(b.w * 0.3, b.h * 0.12);
        ctx.stroke();
        // debris
        ctx.fillStyle = 'rgba(70,64,52,0.7)';
        for (let i = 0; i < 6; i++) {
          const a = (i * 2.4) % (Math.PI * 2);
          const rr = Math.max(b.w, b.h) * (0.22 + (i % 3) * 0.08);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.7, 0.9 + (i % 3) * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (detail) {
        // roof hatching for houses / barns / sheds
        ctx.save();
        ctx.beginPath();
        ctx.rect(-b.w / 2 + 1, -b.h / 2 + 1, b.w - 2, b.h - 2);
        ctx.clip();
        ctx.strokeStyle = 'rgba(120,114,100,0.55)';
        ctx.lineWidth = 0.8;
        const step = Math.max(3.4, b.w / 5);
        ctx.beginPath();
        for (let x = -b.w / 2; x < b.w / 2; x += step) {
          ctx.moveTo(x, -b.h / 2);
          ctx.lineTo(x, b.h / 2);
        }
        ctx.stroke();
        if (b.kind === 'HQ_CORE') {
          // interior walls
          ctx.strokeStyle = '#4c473d';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(-b.w / 2, -2);
          ctx.lineTo(b.w / 2, -2);
          ctx.moveTo(2, -b.h / 2);
          ctx.lineTo(2, -2);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }

  private drawRocks(ctx: CanvasRenderingContext2D, cam: Camera) {
    const zoom = cam.zoom;
    const t = this.terrain;
    const pad = 40;
    for (const rk of t.rocks) {
      if (rk.x < cam.viewX - pad || rk.x > cam.viewX + cam.viewW + pad) continue;
      if (rk.y < cam.viewY - pad || rk.y > cam.viewY + cam.viewH + pad) continue;
      const r = rk.r;
      // shadow
      ctx.fillStyle = 'rgba(30,27,20,0.18)';
      ctx.beginPath();
      ctx.ellipse(rk.x + r * 0.5, rk.y + r * 0.55, r * 1.02, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      // rock body — faceted blob
      ctx.fillStyle = '#c9c4b3';
      ctx.strokeStyle = 'rgba(80,75,64,0.7)';
      ctx.lineWidth = Math.max(0.5, 0.5 / zoom);
      ctx.beginPath();
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2 + rk.seed * 6;
        const rr = r * (0.72 + 0.36 * Math.abs(Math.sin(i * 2.3 + rk.seed * 9)));
        const px = rk.x + Math.cos(a) * rr;
        const py = rk.y + Math.sin(a) * rr * 0.85;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (zoom > 1.6) {
        // crack
        ctx.strokeStyle = 'rgba(90,85,74,0.6)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(rk.x - r * 0.4, rk.y - r * 0.2);
        ctx.lineTo(rk.x + r * 0.2, rk.y + r * 0.3);
        ctx.stroke();
      }
    }
  }

  private drawTrees(ctx: CanvasRenderingContext2D, cam: Camera) {
    const zoom = cam.zoom;
    const t = this.terrain;
    const pad = 60;
    const x0 = Math.max(0, cam.viewX - pad);
    const y0 = Math.max(0, cam.viewY - pad);
    const x1 = Math.min(t.W, cam.viewX + cam.viewW + pad);
    const y1 = Math.min(t.H, cam.viewY + cam.viewH + pad);
    const trees = t.treesNear((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) * 0.72);
    const detail = zoom > 0.85;
    let drawn = 0;
    const cap = 1600;

    if (!detail) {
      // far view: solid ink dots (fallen timber no longer reads as mass)
      ctx.fillStyle = 'rgba(78,73,62,0.85)';
      for (const tr of trees) {
        if (tr.x < x0 || tr.x > x1 || tr.y < y0 || tr.y > y1) continue;
        if ((tr.state ?? 0) !== 0) continue;
        if (drawn++ > cap) break;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    for (const tr of trees) {
      if (tr.x < x0 || tr.x > x1 || tr.y < y0 || tr.y > y1) continue;
      if (drawn++ > cap) break;
      this.drawTree(ctx, tr, zoom);
    }
  }

  /** one tree — small local paths rasterize far faster than one giant path.
   *  A felled trunk lies where it fell; a splintered stump remembers the shell. */
  private drawTree(ctx: CanvasRenderingContext2D, tr: TreePoint, zoom: number) {
    const r = tr.r;
    const state = tr.state ?? 0;
    if (state === 1) {
      // felled — a prone trunk with a shrunken canopy at its tip
      const dir = tr.fallDir ?? 0;
      const len = r * 2.4;
      ctx.save();
      ctx.strokeStyle = 'rgba(58,54,44,0.85)';
      ctx.lineWidth = Math.max(1.4, 1.8 / Math.sqrt(zoom));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tr.x, tr.y);
      ctx.lineTo(tr.x + Math.cos(dir) * len, tr.y + Math.sin(dir) * len);
      ctx.stroke();
      if (zoom > 0.85) {
        ctx.fillStyle = 'rgba(66,61,51,0.55)';
        ctx.beginPath();
        ctx.ellipse(tr.x + Math.cos(dir) * len, tr.y + Math.sin(dir) * len, r * 0.5, r * 0.36, dir, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    if (state === 2) {
      // splintered stump — artillery was here
      ctx.fillStyle = 'rgba(70,66,55,0.9)';
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, Math.max(1.1, r * 0.22), 0, Math.PI * 2);
      ctx.fill();
      if (zoom > 0.85) {
        const dir = tr.fallDir ?? 0;
        ctx.strokeStyle = 'rgba(60,56,46,0.5)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let i = -1; i <= 1; i++) {
          const a = dir + i * 0.5;
          ctx.moveTo(tr.x, tr.y);
          ctx.lineTo(tr.x + Math.cos(a) * r * 0.55, tr.y + Math.sin(a) * r * 0.55);
        }
        ctx.stroke();
      }
      return;
    }
    const seed = tr.seed * Math.PI * 2;
    const blob = (cx: number, cy: number, rad: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      const n = 8;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2 + seed;
        const rr = rad * (0.72 + 0.38 * Math.abs(Math.sin(i * 2.7 + seed * 3)));
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.quadraticCurveTo(cx + Math.cos(a - 0.4) * rr * 1.1, cy + Math.sin(a - 0.4) * rr * 1.1, px, py);
      }
      ctx.closePath();
      ctx.fill();
    };
    // ground shadow (only when the canopy is large enough to matter)
    if (zoom > 1.1) blob(tr.x + r * 0.5, tr.y + r * 0.62, r * 0.96, 'rgba(30,27,20,0.16)');
    // canopy base
    blob(tr.x, tr.y, r, 'rgba(66,61,51,0.95)');
    // highlight lobe NW
    blob(tr.x - r * 0.28, tr.y - r * 0.3, r * 0.5, 'rgba(104,99,86,0.8)');
    if (zoom > 2.5) {
      // dry-brush texture strokes
      ctx.strokeStyle = 'rgba(50,46,38,0.5)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = seed + i * 2.1;
        ctx.moveTo(tr.x + Math.cos(a) * r * 0.2, tr.y + Math.sin(a) * r * 0.2);
        ctx.lineTo(tr.x + Math.cos(a) * r * 0.75, tr.y + Math.sin(a) * r * 0.75);
      }
      ctx.stroke();
    }
  }

  /** transmission pylons + catenary cables */
  private drawPowerLine(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    if (t.pylons.length < 2) return;
    // cables — three conductors with sag, drawn below the pylons
    ctx.save();
    ctx.strokeStyle = 'rgba(60,56,46,0.6)';
    ctx.lineWidth = Math.max(0.5, 0.45 / cam.zoom);
    for (let i = 0; i < t.pylons.length - 1; i++) {
      const a = t.pylons[i];
      const b = t.pylons[i + 1];
      for (let c = 0; c < 3; c++) {
        const off = (c - 1) * 3.2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * off;
        const ny = (dx / len) * off;
        const sag = len * 0.06;
        ctx.beginPath();
        ctx.moveTo(a.x + nx, a.y + ny - 9);
        ctx.quadraticCurveTo(
          (a.x + b.x) / 2 + nx,
          (a.y + b.y) / 2 + ny - 9 + sag,
          b.x + nx,
          b.y + ny - 9
        );
        ctx.stroke();
      }
    }
    ctx.restore();

    // pylons — lattice towers
    for (const p of t.pylons) {
      if (p.x < cam.viewX - 80 || p.x > cam.viewX + cam.viewW + 80) continue;
      if (p.y < cam.viewY - 80 || p.y > cam.viewY + cam.viewH + 80) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      // shadow
      ctx.fillStyle = 'rgba(30,27,20,0.15)';
      ctx.beginPath();
      ctx.ellipse(4, 5, 7, 4, 0.4, 0, Math.PI * 2);
      ctx.fill();
      // tower body — tapered lattice
      ctx.strokeStyle = '#37332b';
      ctx.lineWidth = Math.max(0.8, 0.8 / cam.zoom);
      ctx.beginPath();
      ctx.moveTo(-6.5, 7);
      ctx.lineTo(-1.6, -9);
      ctx.moveTo(6.5, 7);
      ctx.lineTo(1.6, -9);
      ctx.moveTo(-5, 2);
      ctx.lineTo(5, 2);
      ctx.moveTo(-3.4, -3.4);
      ctx.lineTo(3.4, -3.4);
      // cross arms
      ctx.moveTo(-9, -6.5);
      ctx.lineTo(9, -6.5);
      ctx.moveTo(-6, -9);
      ctx.lineTo(6, -9);
      ctx.stroke();
      if (cam.zoom > 1.4) {
        // X bracing
        ctx.lineWidth = Math.max(0.5, 0.5 / cam.zoom);
        ctx.beginPath();
        ctx.moveTo(-6.5, 7);
        ctx.lineTo(-3.4, -3.4);
        ctx.moveTo(6.5, 7);
        ctx.lineTo(3.4, -3.4);
        ctx.moveTo(-5, 2);
        ctx.lineTo(5, 7);
        ctx.moveTo(5, 2);
        ctx.lineTo(-5, 7);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawLabels(ctx: CanvasRenderingContext2D, cam: Camera) {
    if (cam.zoom < 0.22) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of this.terrain.labels) {
      if (l.x < cam.viewX - 120 || l.x > cam.viewX + cam.viewW + 120) continue;
      if (l.y < cam.viewY - 60 || l.y > cam.viewY + cam.viewH + 60) continue;
      const size = Math.min(l.size, 15 / cam.zoom + 6);
      ctx.font = `${l.bold ? '600' : 'italic 500'} ${size}px Georgia, "Times New Roman", serif`;
      ctx.fillStyle = 'rgba(46,42,34,0.66)';
      // paper halo for readability
      ctx.strokeStyle = 'rgba(243,241,234,0.85)';
      ctx.lineWidth = size * 0.22;
      ctx.strokeText(l.text, l.x, l.y);
      ctx.fillText(l.text, l.x, l.y);
    }
    ctx.restore();
  }

  private drawSpotHeights(ctx: CanvasRenderingContext2D, cam: Camera) {
    if (cam.zoom < 0.4) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of this.terrain.spotHeights) {
      if (s.x < cam.viewX - 60 || s.x > cam.viewX + cam.viewW + 60) continue;
      if (s.y < cam.viewY - 60 || s.y > cam.viewY + cam.viewH + 60) continue;
      const size = clamp(11 / cam.zoom + 4, 9, 18);
      ctx.font = `500 ${size}px ${'ui-monospace, monospace'}`;
      // small triangle mark
      ctx.fillStyle = 'rgba(50,46,38,0.75)';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - size * 0.42);
      ctx.lineTo(s.x + size * 0.36, s.y + size * 0.26);
      ctx.lineTo(s.x - size * 0.36, s.y + size * 0.26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(46,42,34,0.8)';
      ctx.fillText(`${s.h}`, s.x + size * 0.9, s.y);
    }
    ctx.restore();
  }

  /** map sheet furniture: border, neat lines, corner marks */
  drawFurniture(ctx: CanvasRenderingContext2D) {
    const t = this.terrain;
    ctx.save();
    ctx.strokeStyle = '#2a2620';
    ctx.lineWidth = 2.4;
    ctx.strokeRect(-8, -8, t.W + 16, t.H + 16);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;
    ctx.strokeRect(-30, -30, t.W + 60, t.H + 60);
    ctx.globalAlpha = 1;
    // corner registration crosses
    const corners = [
      [0, 0],
      [t.W, 0],
      [0, t.H],
      [t.W, t.H],
    ];
    ctx.lineWidth = 1.2;
    for (const [cx, cy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx - 26, cy);
      ctx.lineTo(cx + 26, cy);
      ctx.moveTo(cx, cy - 26);
      ctx.lineTo(cx, cy + 26);
      ctx.stroke();
    }
    // marginalia
    ctx.fillStyle = 'rgba(42,38,30,0.75)';
    ctx.textAlign = 'right';
    ctx.font = '600 22px Georgia, serif';
    ctx.fillText('SHEET 3368-IV · SERIES Z4E · SCALE 1:10 000', t.W - 40, t.H + 18);
    ctx.textAlign = 'left';
    ctx.font = '600 22px Georgia, serif';
    ctx.fillText('OPERATION CROSSWIND — THEATRE NORTH', 40, t.H + 18);
    ctx.textAlign = 'left';
    ctx.font = '500 19px Georgia, serif';
    ctx.fillText('GRID: 1000 m SQUARES · ELEVATION IN METRES', 40, -44);
    ctx.restore();
  }

  /** static minimap terrain, rendered once */
  renderMinimapBase(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const t = this.terrain;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.wash, 0, 0, w, h);
    ctx.save();
    ctx.scale(w / t.W, h / t.H);
    this.strokePoly(ctx, t.river, 42, '#7e9097');
    for (const r of t.roads) {
      this.strokePoly(ctx, r.pts, r.major ? 26 : 16, r.major ? 'rgba(70,64,54,0.55)' : 'rgba(90,84,72,0.45)');
    }
    this.strokePoly(ctx, t.railway, 14, 'rgba(90,84,72,0.5)');
    // buildings as tiny marks
    ctx.fillStyle = 'rgba(50,46,38,0.8)';
    for (const b of t.buildings) {
      ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
    }
    ctx.restore();
  }
}

/** darken a #rrggbb colour by k (-1..1) — blast grime on walls */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * (1 + k)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * (1 + k)));
  const b = Math.max(0, Math.min(255, (n & 255) * (1 + k)));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
