#!/usr/bin/env python3
# V2.0 PART I-B — rebuild terrain.ts into the AZURE COAST theater (8192x6144)
import re, sys

P = '/home/z/my-project/src/game/world/terrain.ts'
s = open(P).read()
orig_len = len(s)

def replace(anchor_start, anchor_end, new, label):
    global s
    i = s.find(anchor_start)
    if i < 0:
        print(f"FAIL start anchor: {label}"); sys.exit(1)
    j = s.find(anchor_end, i)
    if j < 0:
        print(f"FAIL end anchor: {label}"); sys.exit(1)
    s = s[:i] + new + s[j:]
    print(f"ok: {label}")

# ── 1. building kinds ──────────────────────────────────────────
s = s.replace("  | 'WAREHOUSE'\n  | 'FUEL_TANK';",
"""  | 'WAREHOUSE'
  | 'FUEL_TANK'
  | 'BLOCK'
  | 'HANGAR'
  | 'TOWER';""")

# ── 2. world size + contour tiles + runways fields ────────────
s = s.replace("  readonly W = 4096;\n  readonly H = 3072;",
              "  readonly W = 8192;\n  readonly H = 6144;")

s = s.replace("""  contours: ContourSet | null = null;""",
"""  /** contour lines, tiled 1 km — only visible tiles are stroked */
  contourTiles: ContourTile[] = [];
  /** airfield paving — runways, taxiways, aprons */
  runways: { x: number; y: number; angle: number; len: number; w: number; kind: 'RUNWAY' | 'TAXI' | 'APRON' }[] = [];
  /** rail freight spurs drawn like the mainline */
  railSpurs: Vec2[][] = [];
  /** 8 m master height field — drives the wash hillshade + contours */
  height8!: Float32Array;
  h8w = 0;
  h8h = 0;""")

# ContourSet interface → ContourTile
s = s.replace("""export interface ContourSet {
  minor: Path2D;
  major: Path2D;
}""",
"""export interface ContourTile {
  x0: number;
  y0: number;
  size: number;
  minor: Path2D;
  major: Path2D;
}""")

# ── 3. heightAt — the new relief ───────────────────────────────
replace("  heightAt(x: number, y: number): number {",
        "  slopeAt(x: number, y: number): number {",
"""  heightAt(x: number, y: number): number {
    let h = this.baseNoise.fbm(x / 2100, y / 2100, 5) * 30 - 7;
    h += this.detailNoise.fbm(x / 380, y / 380, 3) * 5 - 1.5;

    // NORTH RIDGE — the mountainous spine of the north-west: five
    // overlapping crests running NE along the top of the sheet
    h += this.gaussEl(x, y, 700, 520, 620, 380, 62);
    h += this.gaussEl(x, y, 1150, 760, 660, 400, 88);
    h += this.gaussEl(x, y, 1650, 1050, 620, 420, 74);
    h += this.gaussEl(x, y, 2150, 1350, 560, 380, 48);
    h += this.gaussEl(x, y, 2600, 1650, 460, 320, 26);

    // HILL 204 — the dominant landform of the centre-east
    h += this.gauss(x, y, 4800, 1800, 720, 76);
    h += this.gaussEl(x, y, 5350, 2150, 380, 300, 18); // SE shoulder
    h += this.gaussEl(x, y, 4350, 1500, 340, 260, 16); // NW shoulder

    // HILL 163 — detached knoll north of the river, west side
    h += this.gauss(x, y, 3050, 1300, 380, 30);

    // the central ridge screening the city's northern approach
    h += this.gaussEl(x, y, 4700, 2700, 520, 300, 22);

    // southern rolling rise screening the player's staging belt
    h += this.gauss(x, y, 2200, 4400, 560, 18);
    h += this.gaussEl(x, y, 3400, 4600, 420, 300, 14); // bay-west knoll
    // eastern rolling ground above the headland
    h += this.gaussEl(x, y, 6800, 3500, 700, 460, 14);

    // KRAKEN PLATEAU — the north-east table the enemy HQ stands on
    const nx = clamp(x / this.W, 0, 1);
    const ny = 1 - clamp(y / this.H, 0, 1);
    h += smooth01(nx * 0.62 + ny * 0.62 - 0.18) * 34;

    // river valley carve
    const dRiver = this.distToPolyline(x, y, this.river);
    if (dRiver < 230) {
      const t = 1 - dRiver / 230;
      h -= smooth01(t) * 13;
    }
    // islands rise out of the sea — real ground for LOS and contours
    for (const isl of this.sea.islands) {
      h += this.gaussEl(x, y, isl.x, isl.y, isl.rx * 1.35, isl.ry * 1.35, isl.height);
    }
    // the sea floor is flat: the water surface carries the depth story
    if (this.sea.isSea(x, y)) return 0;
    return Math.max(0, h);
  }

""", "heightAt")

# ── 4. forestDensity — new belts ───────────────────────────────
replace("  forestDensity(x: number, y: number): number {",
        "  // ── generation ─────────────────────────────────────────────",
"""  forestDensity(x: number, y: number): number {
    const n = this.forestNoise.fbm(x / 560, y / 560, 4);
    // the NORTH RIDGE carries the mountain forest; the valley slopes
    // grow brush toward the river
    const west = 1 - x / this.W;
    const north = 1 - y / this.H;
    const bias = -0.085 * (west + north) * 0.9 + 0.02 * (y / this.H);
    // woodland pockets on HILL 204's shoulders
    const dHill = Math.hypot((x - 4900) / 950, (y - 1750) / 750);
    const hillBias = clamp(0.5 - dHill, 0, 0.5) * 0.4;
    const v = (n - 0.6 + bias + hillBias) * 4.2;
    return clamp(v, 0, 1) * 1.6;
  }

""", "forestDensity")

open(P, 'w').write(s)
print("terrain.ts phase 1 done", len(s))
