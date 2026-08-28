#!/usr/bin/env python3
# V2.0 PART I-B — phase 4: tiled contours + height8 + hp table

P = '/home/z/my-project/src/game/world/terrain.ts'
s = open(P).read()

def replace(anchor_start, anchor_end, new, label):
    global s
    i = s.find(anchor_start)
    if i < 0:
        print(f"FAIL start anchor: {label}"); raise SystemExit(1)
    j = s.find(anchor_end, i)
    if j < 0:
        print(f"FAIL end anchor: {label}"); raise SystemExit(1)
    s = s[:i] + new + s[j:]
    print(f"ok: {label}")

# ── tiled contour extraction from the 8 m master grid ──────────
NEW_CONTOURS = r'''  private extractContours(): ContourTile[] {
    const step = 16; // metres between samples
    const TILE = 1024; // tile size in metres — only visible tiles stroke
    const nx = Math.floor(this.W / step) + 1;
    const ny = Math.floor(this.H / step) + 1;
    // sample the 8 m master grid (fast bilinear — no noise per sample)
    const heights = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        heights[j * nx + i] = this.heightAt8(i * step, j * step);
      }
    }
    const interval = 8;
    const majorEvery = 5;
    const tiles: ContourTile[] = [];
    const cols = Math.ceil(this.W / TILE);
    const rows = Math.ceil(this.H / TILE);

    const lerpPt = (x1: number, y1: number, x2: number, y2: number, h1: number, h2: number, level: number) => {
      const t = (level - h1) / (h2 - h1 || 1e-6);
      return { x: (x1 + (x2 - x1) * t) * step, y: (y1 + (y2 - y1) * t) * step };
    };

    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const tile: ContourTile = {
          x0: tx * TILE,
          y0: ty * TILE,
          size: TILE,
          minor: new Path2D(),
          major: new Path2D(),
        };
        const i0 = Math.max(0, Math.floor((tx * TILE) / step) - 1);
        const i1 = Math.min(nx - 1, Math.ceil(((tx + 1) * TILE) / step) + 1);
        const j0 = Math.max(0, Math.floor((ty * TILE) / step) - 1);
        const j1 = Math.min(ny - 1, Math.ceil(((ty + 1) * TILE) / step) + 1);
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) {
            const x = i * step;
            const y = j * step;
            const h00 = heights[j * nx + i];
            const h10 = heights[j * nx + i + 1];
            const h01 = heights[(j + 1) * nx + i];
            const h11 = heights[(j + 1) * nx + i + 1];
            const hMin = Math.min(h00, h10, h01, h11);
            const hMax = Math.max(h00, h10, h01, h11);
            const firstLevel = Math.ceil(hMin / interval) * interval;
            for (let level = firstLevel; level <= hMax; level += interval) {
              if (level <= 0) continue;
              const isMajor = Math.round(level / interval) % majorEvery === 0;
              const path = isMajor ? tile.major : tile.minor;
              // marching squares on cell corners
              let idx = 0;
              if (h00 >= level) idx |= 1;
              if (h10 >= level) idx |= 2;
              if (h11 >= level) idx |= 4;
              if (h01 >= level) idx |= 8;
              if (idx === 0 || idx === 15) continue;
              const top = () => lerpPt(i, j, i + 1, j, h00, h10, level);
              const right = () => lerpPt(i + 1, j, i + 1, j + 1, h10, h11, level);
              const bottom = () => lerpPt(i, j + 1, i + 1, j + 1, h01, h11, level);
              const left = () => lerpPt(i, j, i, j + 1, h00, h01, level);
              const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
                path.moveTo(a.x, a.y);
                path.lineTo(b.x, b.y);
              };
              switch (idx) {
                case 1:
                case 14:
                  seg(left(), top());
                  break;
                case 2:
                case 13:
                  seg(top(), right());
                  break;
                case 3:
                case 12:
                  seg(left(), right());
                  break;
                case 4:
                case 11:
                  seg(right(), bottom());
                  break;
                case 6:
                case 9:
                  seg(top(), bottom());
                  break;
                case 7:
                case 8:
                  seg(left(), bottom());
                  break;
                case 5:
                  seg(left(), top());
                  seg(right(), bottom());
                  break;
                case 10:
                  seg(top(), right());
                  seg(left(), bottom());
                  break;
                default:
                  break;
              }
            }
          }
        }
        tiles.push(tile);
      }
    }
    return tiles;
  }

  /** the 8 m master height field — one pass of heightAt, reused by the
   *  wash hillshade and the contour extractor */
  private buildHeight8() {
    const S = 8;
    this.h8w = Math.ceil(this.W / S) + 1;
    this.h8h = Math.ceil(this.H / S) + 1;
    this.height8 = new Float32Array(this.h8w * this.h8h);
    for (let j = 0; j < this.h8h; j++) {
      for (let i = 0; i < this.h8w; i++) {
        this.height8[j * this.h8w + i] = this.heightAt(i * S, j * S);
      }
    }
  }

  /** bilinear sample of the 8 m master height field */
  heightAt8(x: number, y: number): number {
    const gx = clamp(x / 8, 0, this.h8w - 1.001);
    const gy = clamp(y / 8, 0, this.h8h - 1.001);
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const h00 = this.height8[iy * this.h8w + ix];
    const h10 = this.height8[iy * this.h8w + ix + 1];
    const h01 = this.height8[(iy + 1) * this.h8w + ix];
    const h11 = this.height8[(iy + 1) * this.h8w + ix + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  }

'''

replace("  // ── contour extraction (marching squares) ──────────────────", "  // ── passability + A* ───────────────────────────────────────", NEW_CONTOURS, "contours+height8")

# ── hp table: new kinds ─────────────────────────────────────────
s = s.replace("""    case 'FUEL_TANK': return 85;""",
"""    case 'FUEL_TANK': return 85;
    case 'BLOCK': return 340;
    case 'HANGAR': return 260;
    case 'TOWER': return 160;""")

open(P, 'w').write(s)
print("terrain.ts phase 4 done", len(s))
