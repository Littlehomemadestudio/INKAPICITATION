#!/usr/bin/env python3
# V2.0 PART I-C — terrainRender.ts updates

P = '/home/z/my-project/src/game/render/terrainRender.ts'
s = open(P).read()

def rep(old, new, label, count=1):
    global s
    if old not in s:
        print(f"FAIL: {label}"); raise SystemExit(1)
    s = s.replace(old, new, count)
    print(f"ok: {label}")

# ── 1. wash hillshade via the 8 m grid (no per-pixel noise) ────
rep("""        const x = px * invS;
        const y = py * invS;
        const e = 12;
        const hx = t.heightAt(x + e, y) - t.heightAt(x - e, y);
        const hy = t.heightAt(x, y + e) - t.heightAt(x, y - e);""",
"""        const x = px * invS;
        const y = py * invS;
        const e = 12;
        const hx = t.heightAt8(x + e, y) - t.heightAt8(x - e, y);
        const hy = t.heightAt8(x, y + e) - t.heightAt8(x, y - e);""", "wash hillshade")

rep("""        // elevation: valleys slightly darker, high ground lighter
        const elev = t.heightAt(x, y);""",
"""        // elevation: valleys slightly darker, high ground lighter
        const elev = t.heightAt8(x, y);""", "wash elevation")

# ── 2. tiled contours in drawBase ──────────────────────────────
rep("""    // contour lines
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
    }""",
"""    // contour lines — tiled, only the visible kilometres are stroked;
    // at theatre zoom the minor interval drops out and only the bold
    // index contours remain, exactly like a real map sheet
    {
      const pad = 80;
      const vx0 = cam.viewX - pad;
      const vx1 = cam.viewX + cam.viewW + pad;
      const vy0 = cam.viewY - pad;
      const vy1 = cam.viewY + cam.viewH + pad;
      const showMinor = cam.zoom >= 0.16;
      const wMin = Math.max(1.1, 0.9 / cam.zoom);
      const wMaj = Math.max(2.2, 1.6 / cam.zoom);
      for (const tile of t.contourTiles) {
        if (tile.x0 > vx1 || tile.x0 + tile.size < vx0) continue;
        if (tile.y0 > vy1 || tile.y0 + tile.size < vy0) continue;
        if (showMinor) {
          ctx.save();
          ctx.globalAlpha = 0.62;
          ctx.strokeStyle = '#a29d90';
          ctx.lineWidth = wMin;
          ctx.lineJoin = 'round';
          ctx.stroke(tile.minor);
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = 0.78;
        ctx.strokeStyle = '#847f71';
        ctx.lineWidth = wMaj;
        ctx.lineJoin = 'round';
        ctx.stroke(tile.major);
        ctx.restore();
      }
    }""", "tiled contours")

# ── 3. sea bounds from the authored coast ──────────────────────
rep("""    // the sea's rough bounds on this sheet
    const x0 = Math.max(cam.viewX - 60, 2100);
    const y0 = Math.max(cam.viewY - 60, 1900);
    const x1 = Math.min(cam.viewX + cam.viewW + 60, t.W);
    const y1 = Math.min(cam.viewY + cam.viewH + 60, t.H);""",
"""    // the sea's rough bounds on this sheet — from the authored coast
    const x0 = Math.max(cam.viewX - 60, sea.bounds.x0);
    const y0 = Math.max(cam.viewY - 60, sea.bounds.y0);
    const x1 = Math.min(cam.viewX + cam.viewW + 60, sea.bounds.x1);
    const y1 = Math.min(cam.viewY + cam.viewH + 60, sea.bounds.y1);""", "sea bounds")

# ── 4. drawFeatures: runways + rail spurs ──────────────────────
rep("""  drawFeatures(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    this.drawFields(ctx, cam);
    this.drawDryStream(ctx, cam);
    this.drawRailway(ctx, cam);""",
"""  drawFeatures(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    this.drawFields(ctx, cam);
    this.drawDryStream(ctx, cam);
    this.drawRunways(ctx, cam);
    this.drawRailway(ctx, cam);""", "features order")

# add drawRunways + rail spurs method before drawRailway
rep("""  private drawRailway(ctx: CanvasRenderingContext2D, cam: Camera) {""",
"""/** airfield paving — pale concrete slabs with centreline + threshold */
  private drawRunways(ctx: CanvasRenderingContext2D, cam: Camera) {
    const t = this.terrain;
    if (!t.runways.length) return;
    for (const rw of t.runways) {
      if (rw.x + rw.len < cam.viewX - 80 || rw.x - rw.len > cam.viewX + cam.viewW + 80) continue;
      if (rw.y + rw.len < cam.viewY - 80 || rw.y - rw.len > cam.viewY + cam.viewH + 80) continue;
      ctx.save();
      ctx.translate(rw.x, rw.y);
      ctx.rotate(rw.angle);
      if (rw.kind === 'RUNWAY') {
        // graded shoulders
        ctx.fillStyle = 'rgba(206,201,188,0.7)';
        ctx.fillRect(-rw.len / 2 - 8, -rw.w / 2 - 8, rw.len + 16, rw.w + 16);
        // the slab
        ctx.fillStyle = '#d9d5c6';
        ctx.fillRect(-rw.len / 2, -rw.w / 2, rw.len, rw.w);
        ctx.strokeStyle = 'rgba(74,69,58,0.85)';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-rw.len / 2, -rw.w / 2, rw.len, rw.w);
        // centreline dashes
        ctx.strokeStyle = 'rgba(96,91,78,0.8)';
        ctx.lineWidth = Math.max(1, 1.1);
        ctx.setLineDash([18, 14]);
        ctx.beginPath();
        ctx.moveTo(-rw.len / 2 + 18, 0);
        ctx.lineTo(rw.len / 2 - 18, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        // threshold bars
        ctx.fillStyle = 'rgba(70,66,55,0.85)';
        for (const side of [-1, 1]) {
          for (let i = -2; i <= 2; i++) {
            ctx.fillRect(side * (rw.len / 2 - 16) + (side < 0 ? -6 : 0), i * (rw.w / 6) - 1.6, 10, 3.2);
          }
        }
        // runway numbers, facing the landing pilot
        if (cam.zoom > 0.35) {
          ctx.fillStyle = 'rgba(60,56,46,0.9)';
          ctx.font = '600 13px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.save();
          ctx.translate(rw.len / 2 - 34, 0);
          ctx.rotate(Math.PI / 2);
          ctx.fillText('09', 0, 0);
          ctx.restore();
          ctx.save();
          ctx.translate(-rw.len / 2 + 34, 0);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText('27', 0, 0);
          ctx.restore();
        }
      } else if (rw.kind === 'TAXI') {
        ctx.fillStyle = '#d5d1c1';
        ctx.fillRect(-rw.len / 2, -rw.w / 2, rw.len, rw.w);
        ctx.strokeStyle = 'rgba(90,85,72,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-rw.len / 2, -rw.w / 2, rw.len, rw.w);
      } else {
        // apron — a wide pale slab with joint lines
        ctx.fillStyle = 'rgba(216,212,199,0.92)';
        ctx.fillRect(-rw.len / 2, -rw.w / 2, rw.len, rw.w);
        ctx.strokeStyle = 'rgba(90,85,72,0.55)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let x = -rw.len / 2; x <= rw.len / 2; x += 14) {
          ctx.moveTo(x, -rw.w / 2);
          ctx.lineTo(x, rw.w / 2);
        }
        for (let y = -rw.w / 2; y <= rw.w / 2; y += 14) {
          ctx.moveTo(-rw.len / 2, y);
          ctx.lineTo(rw.len / 2, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawRailway(ctx: CanvasRenderingContext2D, cam: Camera) {""", "drawRunways")

# rail spurs drawn with the mainline
rep("""    const inc = this.visibleMask(t.railway, cam, 80);
    if (!inc.some(Boolean)) return;""",
"""    const inc = this.visibleMask(t.railway, cam, 80);
    if (!inc.some(Boolean)) return;
    // freight spurs — same engineering, lighter treatment
    for (const spur of t.railSpurs) {
      const si = this.visibleMask(spur, cam, 80);
      if (!si.some(Boolean)) continue;
      this.strokePolyView(ctx, spur, si, 9, 'rgba(208,203,189,0.7)');
      this.strokePolyView(ctx, spur, si, 1.2, 'rgba(70,66,56,0.7)', [10, 12]);
    }""", "rail spurs")

# ── 5. labels readable at theatre zoom ─────────────────────────
rep("""  private drawLabels(ctx: CanvasRenderingContext2D, cam: Camera) {
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
  }""",
"""  private drawLabels(ctx: CanvasRenderingContext2D, cam: Camera) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of this.terrain.labels) {
      if (l.x < cam.viewX - 160 || l.x > cam.viewX + cam.viewW + 160) continue;
      if (l.y < cam.viewY - 80 || l.y > cam.viewY + cam.viewH + 80) continue;
      // world-metric type that shrinks toward a legible floor — the
      // sheet stays annotated from theatre zoom down to the street
      const size = clamp(l.size * cam.zoom, 8.5, l.size);
      if (size < 8.5) continue;
      ctx.font = `${l.bold ? '600' : 'italic 500'} ${size}px Georgia, "Times New Roman", serif`;
      ctx.fillStyle = 'rgba(46,42,34,0.66)';
      // paper halo for readability
      ctx.strokeStyle = 'rgba(243,241,234,0.85)';
      ctx.lineWidth = size * 0.22;
      ctx.strokeText(l.text, l.x, l.y);
      ctx.fillText(l.text, l.x, l.y);
    }
    ctx.restore();
  }""", "labels")

rep("""  private drawSpotHeights(ctx: CanvasRenderingContext2D, cam: Camera) {
    if (cam.zoom < 0.4) return;""",
"""  private drawSpotHeights(ctx: CanvasRenderingContext2D, cam: Camera) {
    if (cam.zoom < 0.22) return;""", "spot heights gate")

# ── 6. new building art: BLOCK / HANGAR / TOWER ───────────────
rep("""      let fill = '#e6e3d8';
      if (b.kind === 'HQ_CORE') fill = '#dcd8ca';""",
"""      let fill = '#e6e3d8';
      if (b.kind === 'BLOCK') fill = '#ded9ca';
      if (b.kind === 'HANGAR') fill = '#d9d4c4';
      if (b.kind === 'TOWER') fill = '#d4cfc0';
      if (b.kind === 'HQ_CORE') fill = '#dcd8ca';""", "building fills")

rep("""      } else if (b.kind === 'RUIN') {""",
"""      } else if (b.kind === 'BLOCK') {
        // apartment slab — a heavy roof with stairwell cores, courtyard
        // seams and chimney stacks. The city reads by weight.
        ctx.save();
        ctx.beginPath();
        ctx.rect(-b.w / 2 + 1, -b.h / 2 + 1, b.w - 2, b.h - 2);
        ctx.clip();
        // roof field
        ctx.fillStyle = 'rgba(120,114,100,0.28)';
        ctx.fillRect(-b.w / 2 + 2, -b.h / 2 + 2, b.w - 4, b.h - 4);
        // stairwell cores — two pale blocks
        ctx.fillStyle = 'rgba(240,238,229,0.95)';
        const cw = Math.min(6, b.w * 0.16);
        ctx.fillRect(-b.w / 2 + b.w * 0.22 - cw / 2, -b.h / 2 + 2.4, cw, b.h - 4.8);
        ctx.fillRect(b.w / 2 - b.w * 0.22 - cw / 2, -b.h / 2 + 2.4, cw, b.h - 4.8);
        // chimney stacks on the long axis
        ctx.fillStyle = 'rgba(70,66,55,0.8)';
        for (const cx3 of [-b.w * 0.34, 0, b.w * 0.34]) {
          ctx.fillRect(cx3 - 1.1, -b.h / 2 + 2.2, 2.2, 2.6);
        }
        ctx.restore();
        if (zoom > 0.75) {
          // courtyard seam — the entrance side
          ctx.strokeStyle = 'rgba(88,83,72,0.65)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-b.w / 2 + 3, b.h * 0.18);
          ctx.lineTo(b.w / 2 - 3, b.h * 0.18);
          ctx.stroke();
        }
      } else if (b.kind === 'HANGAR') {
        // arched aircraft shed — ribbed vault, big doors on the apron side
        ctx.save();
        ctx.beginPath();
        ctx.rect(-b.w / 2 + 1, -b.h / 2 + 1, b.w - 2, b.h - 2);
        ctx.clip();
        ctx.strokeStyle = 'rgba(96,90,76,0.8)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        const ribs = Math.max(5, Math.round(b.w / 7));
        for (let i = 1; i < ribs; i++) {
          const x0 = -b.w / 2 + (i * b.w) / ribs;
          ctx.moveTo(x0, -b.h / 2 + 1);
          ctx.lineTo(x0, b.h / 2 - 1);
        }
        ctx.stroke();
        // the vault ridge
        ctx.strokeStyle = 'rgba(64,60,50,0.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-b.w / 2 + 2, 0);
        ctx.lineTo(b.w / 2 - 2, 0);
        ctx.stroke();
        ctx.restore();
        // the big sliding doors — pale mouth on the south face
        ctx.fillStyle = 'rgba(238,236,227,0.9)';
        ctx.fillRect(-b.w * 0.18, b.h / 2 - 1, b.w * 0.36, 3);
        ctx.strokeStyle = 'rgba(70,66,55,0.8)';
        ctx.lineWidth = 0.9;
        ctx.strokeRect(-b.w * 0.18, b.h / 2 - 1, b.w * 0.36, 3);
      } else if (b.kind === 'TOWER') {
        // airfield control tower — a cab on a shaft
        ctx.fillStyle = '#cbc6b6';
        ctx.beginPath();
        ctx.arc(0, 0, b.w * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4a453b';
        ctx.lineWidth = 1.3;
        ctx.stroke();
        // the cab — glass ring with the windscreens drawn as spokes
        ctx.fillStyle = '#b9b4a3';
        ctx.beginPath();
        ctx.arc(0, 0, b.w * 0.52, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(52,48,40,0.75)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.moveTo(Math.cos(a) * b.w * 0.3, Math.sin(a) * b.w * 0.3);
          ctx.lineTo(Math.cos(a) * b.w * 0.52, Math.sin(a) * b.w * 0.52);
        }
        ctx.stroke();
        if (detail) {
          // the radar feed mast above the cab
          ctx.strokeStyle = '#37332b';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(0, -b.w * 0.52);
          ctx.lineTo(0, -b.w * 0.95);
          ctx.moveTo(-2.4, -b.w * 0.95);
          ctx.lineTo(2.4, -b.w * 0.95);
          ctx.stroke();
        }
      } else if (b.kind === 'RUIN') {""", "new building art")

# ── 7. map furniture text ──────────────────────────────────────
rep("""    ctx.fillText('SHEET 3368-IV · SERIES Z4E · SCALE 1:10 000', t.W - 40, t.H + 18);""",
"""    ctx.fillText('SHEET 3368-IV · SERIES Z4E · SCALE 1:20 000', t.W - 40, t.H + 18);""", "sheet scale")

rep("""    ctx.fillText('OPERATION CROSSWIND — THEATRE NORTH', 40, t.H + 18);""",
"""    ctx.fillText('OPERATION CROSSWIND — AZURE COAST THEATRE', 40, t.H + 18);""", "sheet title")

open(P, 'w').write(s)
print("terrainRender.ts done", len(s))
