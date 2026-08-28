#!/usr/bin/env python3
"""Fix town/farm building placement: real road frontage spread + overlap rejection."""

PATH = '/home/z/my-project/src/game/world/terrain.ts'
with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

# ── 1. locate buildTown body ────────────────────────────────
town_start = src.index('  private buildTown(cx: number, cy: number, rng: RNG) {')
farm_start = src.index('  private buildFarm(cx: number, cy: number, rng: RNG) {')
factory_marker = '/** an ink works: halls, chimney, tank farm, depot'
factory_start = src.index(factory_marker)

NEW_TOWN_FARM = '''  /** true if a w×h footprint at (x,y,rot) keeps `margin` m clear of every standing building */
  private buildingFits(x: number, y: number, w: number, h: number, rot: number, margin = 4): boolean {
    const reach = Math.hypot(w, h) / 2;
    for (const b of this.buildings) {
      const br = Math.hypot(b.w, b.h) / 2;
      if (Math.abs(b.x - x) > reach + br + margin || Math.abs(b.y - y) > reach + br + margin) continue;
      // rotated-box SAT — minimum separation across the four axes
      const ca1 = Math.cos(rot), sa1 = Math.sin(rot);
      const ca2 = Math.cos(b.rot), sa2 = Math.sin(b.rot);
      const dx = b.x - x, dy = b.y - y;
      const axes: Array<[number, number]> = [[ca1, sa1], [-sa1, ca1], [ca2, sa2], [-sa2, ca2]];
      let minSep = Infinity;
      for (const [ux, uy] of axes) {
        const dist = dx * ux + dy * uy;
        const rA = (w / 2) * Math.abs(ca1 * ux + sa1 * uy) + (h / 2) * Math.abs(-sa1 * ux + ca1 * uy);
        const rB = (b.w / 2) * Math.abs(ca2 * ux + sa2 * uy) + (b.h / 2) * Math.abs(-sa2 * ux + ca2 * uy);
        minSep = Math.min(minSep, rA + rB - Math.abs(dist));
      }
      if (minSep > -margin) return false;
    }
    return true;
  }

  private buildTown(cx: number, cy: number, rng: RNG) {
    // buildings string along both roads — a real crossroads town
    const along = (
      dx: number,
      dy: number,
      n: number,
      side: number,
      kinds: BuildingKind[]
    ) => {
      const span = 210; // metres of road frontage the lots share
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1);
        const kind = kinds[i % kinds.length];
        const w = kind === 'BARN' ? rng.range(26, 32) : rng.range(15, 22);
        const h = kind === 'BARN' ? rng.range(14, 17) : rng.range(11, 15);
        // try a few setbacks — a lot that doesn't fit is left empty
        let placed = false;
        for (let attempt = 0; attempt < 3 && !placed; attempt++) {
          const set = 52 + attempt * 16 + rng.range(-6, 6);
          const bx = cx + dx * (t - 0.5) * span + -dy * side * set;
          const by = cy + dy * (t - 0.5) * span + dx * side * set;
          if (this.isWater(bx, by) || this.roadFactor(bx, by) > 0.1) continue;
          const rot = Math.atan2(dy, dx) + rng.range(-0.12, 0.12);
          if (!this.buildingFits(bx, by, w, h, rot)) continue;
          this.buildings.push({ x: bx, y: by, w, h, rot, kind });
          placed = true;
        }
      }
    };
    along(1, -0.36, 4, 1, ['HOUSE', 'HOUSE', 'BARN', 'HOUSE']); // along MSR north
    along(1, -0.36, 3, -1, ['HOUSE', 'SHED', 'HOUSE']);
    along(1, 0.12, 3, 1, ['HOUSE', 'HOUSE', 'SHED']); // along HWY west
    along(1, 0.12, 2, -1, ['HOUSE', 'BARN']);
    along(0.94, 0.34, 3, 1, ['HOUSE', 'HOUSE', 'BARN']); // along HWY east
    along(0.94, 0.34, 2, -1, ['SHED', 'HOUSE']);
    // church — the town landmark, near the bridge
    if (this.buildingFits(2236, 1782, 13, 22, 0.28)) {
      this.buildings.push({ x: 2236, y: 1782, w: 13, h: 22, rot: 0.28, kind: 'CHURCH' });
    }
  }

  private buildFarm(cx: number, cy: number, rng: RNG) {
    const spots: [number, number][] = [
      [-58, -40], [44, -66], [-86, 44], [62, 58], [-8, 96],
    ];
    const kinds: BuildingKind[] = ['HOUSE', 'BARN', 'SHED', 'SILO', 'BARN'];
    for (let i = 0; i < 5; i++) {
      const s = spots[i % spots.length];
      const bx = cx + s[0] + rng.range(-14, 14);
      const by = cy + s[1] + rng.range(-14, 14);
      if (this.isWater(bx, by) || this.roadFactor(bx, by) > 0.1) continue;
      const kind = kinds[i % kinds.length];
      let w: number;
      let h: number;
      if (kind === 'BARN') { w = rng.range(26, 32); h = rng.range(14, 17); }
      else if (kind === 'SILO') { w = rng.range(8, 10); h = rng.range(8, 10); }
      else if (kind === 'SHED') { w = rng.range(12, 16); h = rng.range(9, 12); }
      else { w = rng.range(15, 20); h = rng.range(11, 14); }
      const rot = rng.range(-0.25, 0.25) + (rng.chance(0.5) ? 0 : Math.PI / 2);
      if (!this.buildingFits(bx, by, w, h, rot)) continue;
      this.buildings.push({ x: bx, y: by, w, h, rot, kind });
    }
  }

'''

src = src[:town_start] + NEW_TOWN_FARM + src[factory_start:]

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print('town/farm placement fixed')
