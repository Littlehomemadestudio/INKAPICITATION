// ─────────────────────────────────────────────────────────────
// PAPER STORM · terrain rendering
// Pre-rendered hillshade wash + live vector overlays (contours,
// roads, river, buildings, trees, grid, map furniture).
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
        let shade = 1 + nl * 0.16 - slope * 0.22;
        // elevation: valleys slightly darker, high ground lighter
        const elev = t.heightAt(x, y);
        shade += (elev - 30) * 0.0022;
        // river valley mist
        const dr = t.distToPolyline(x, y, t.river);
        if (dr < 190) shade -= (1 - dr / 190) * 0.05;
        shade = clamp(shade, 0.72, 1.06);
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
    for (let i = 0; i < 2600; i++) {
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
    this.drawRoads(ctx);
    this.drawRiver(ctx);
    this.drawBridges(ctx);
    this.drawBuildings(ctx, cam.zoom);
    this.drawTrees(ctx, cam);
    this.drawLabels(ctx, cam);
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

  private drawRoads(ctx: CanvasRenderingContext2D) {
    for (const r of this.terrain.roads) {
      if (r.major) {
        this.strokePoly(ctx, r.pts, 15, '#ddd8ca');
        this.strokePoly(ctx, r.pts, 12.4, '#d3cdbd');
        // wheel-worn twin tracks
        this.strokePoly(ctx, r.pts, 1.1, 'rgba(140,133,120,0.45)');
        // edges
        ctx.save();
        ctx.translate(0, -5.4);
        this.strokePoly(ctx, r.pts, 1.3, 'rgba(80,75,66,0.5)');
        ctx.restore();
        ctx.save();
        ctx.translate(0, 5.4);
        this.strokePoly(ctx, r.pts, 1.3, 'rgba(80,75,66,0.5)');
        ctx.restore();
      } else {
        this.strokePoly(ctx, r.pts, 8, 'rgba(224,220,209,0.55)');
        this.strokePoly(ctx, r.pts, 1.6, 'rgba(104,98,86,0.6)', [8, 12]);
      }
    }
  }

  private drawRiver(ctx: CanvasRenderingContext2D) {
    const t = this.terrain;
    // banks
    ctx.save();
    ctx.translate(0, -(t.riverWidth / 2 + 2));
    this.strokePoly(ctx, t.river, 1.5, 'rgba(96,91,80,0.75)');
    ctx.restore();
    ctx.save();
    ctx.translate(0, t.riverWidth / 2 + 2);
    this.strokePoly(ctx, t.river, 1.5, 'rgba(96,91,80,0.75)');
    ctx.restore();
    // flow lines
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(0, -6);
    this.strokePoly(ctx, t.river, 1.1, 'rgba(190,185,171,0.8)', [30, 46]);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.translate(0, 7);
    this.strokePoly(ctx, t.river, 1.1, 'rgba(190,185,171,0.7)', [22, 52]);
    ctx.restore();
  }

  private drawBridges(ctx: CanvasRenderingContext2D) {
    for (const b of this.terrain.bridges) {
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

  private drawBuildings(ctx: CanvasRenderingContext2D, zoom: number) {
    const detail = zoom > 1.0;
    for (const b of this.terrain.buildings) {
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
      ctx.fillStyle = fill;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.strokeStyle = b.kind === 'HQ_CORE' ? '#2b2820' : '#524d42';
      ctx.lineWidth = b.kind === 'HQ_CORE' ? 2 : 1.3;
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
      } else if (detail) {
        // roof hatching
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
    const cap = 1500;
    for (const tr of trees) {
      if (tr.x < x0 || tr.x > x1 || tr.y < y0 || tr.y > y1) continue;
      if (drawn++ > cap) break;
      this.drawTree(ctx, tr, detail, zoom);
    }
  }

  private drawTree(ctx: CanvasRenderingContext2D, tr: TreePoint, detail: boolean, zoom: number) {
    const r = tr.r;
    if (!detail) {
      ctx.fillStyle = 'rgba(78,73,62,0.85)';
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const seed = tr.seed * Math.PI * 2;
    // canopy: irregular 8-point blob
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
    // shadow
    blob(tr.x + r * 0.5, tr.y + r * 0.62, r * 0.96, 'rgba(30,27,20,0.16)');
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

  private drawLabels(ctx: CanvasRenderingContext2D, cam: Camera) {
    if (cam.zoom < 0.22) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of this.terrain.labels) {
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
    // buildings as tiny marks
    ctx.fillStyle = 'rgba(50,46,38,0.8)';
    for (const b of t.buildings) {
      ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
    }
    ctx.restore();
  }
}
