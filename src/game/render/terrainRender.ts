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

    // river band
    this.strokePoly(ctx, t.river, t.riverWidth + 16, '#dcd8ca');
    this.strokePoly(ctx, t.river, t.riverWidth, '#d2cebe');
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
    this.drawBuildings(ctx, cam.zoom, cam);
    this.drawRocks(ctx, cam);
    this.drawTrees(ctx, cam);
    this.drawPowerLine(ctx, cam);
    this.drawLabels(ctx, cam);
    this.drawSpotHeights(ctx, cam);
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
    // banks
    ctx.save();
    ctx.translate(0, -(t.riverWidth / 2 + 2));
    this.strokePolyView(ctx, t.river, inc, 1.5, 'rgba(96,91,80,0.75)');
    ctx.restore();
    ctx.save();
    ctx.translate(0, t.riverWidth / 2 + 2);
    this.strokePolyView(ctx, t.river, inc, 1.5, 'rgba(96,91,80,0.75)');
    ctx.restore();
    // flow lines
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(0, -6);
    this.strokePolyView(ctx, t.river, inc, 1.1, 'rgba(190,185,171,0.8)', [30, 46]);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.translate(0, 7);
    this.strokePolyView(ctx, t.river, inc, 1.1, 'rgba(190,185,171,0.7)', [22, 52]);
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
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      // shadow
      ctx.fillStyle = 'rgba(30,27,20,0.13)';
      ctx.fillRect(-b.w / 2 + 3.4, -b.h / 2 + 4.2, b.w, b.h);
      // body
      let fill = '#e6e3d8';
      if (b.kind === 'HQ_CORE') fill = '#dcd8ca';
      if (b.kind === 'BUNKER') fill = '#c9c4b5';
      if (b.kind === 'SHED') fill = '#e0dccd';
      if (b.kind === 'FACTORY_HALL') fill = '#d9d4c4';
      if (b.kind === 'FACTORY_HALL2') fill = '#ddd8c9';
      if (b.kind === 'DEPOT') fill = '#dcd7c8';
      ctx.fillStyle = fill;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.strokeStyle = b.kind === 'HQ_CORE' || b.kind.startsWith('FACTORY') ? '#2b2820' : '#524d42';
      ctx.lineWidth = b.kind === 'HQ_CORE' || b.kind.startsWith('FACTORY') ? 2 : 1.3;
      ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);

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
      // far view: solid ink dots
      ctx.fillStyle = 'rgba(78,73,62,0.85)';
      for (const tr of trees) {
        if (tr.x < x0 || tr.x > x1 || tr.y < y0 || tr.y > y1) continue;
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

  /** one tree — small local paths rasterize far faster than one giant path */
  private drawTree(ctx: CanvasRenderingContext2D, tr: TreePoint, zoom: number) {
    const r = tr.r;
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
    this.strokePoly(ctx, t.river, 42, '#c9c5b6');
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
