#!/usr/bin/env python3
"""Rewrite resolve() with depth-sorted multi-pass relaxation."""

PATH = '/home/z/my-project/src/game/systems/obstacles.ts'
with open(PATH, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# resolve() spans from its doc comment (line ~356) to the line before avoidSteer's doc (line ~418)
# locate precisely
start = None
end = None
for i, l in enumerate(lines):
    if 'Resolve a vehicle against the physical world using its EXACT' in l and start is None:
        start = i - 1  # include the opening /** line
    if start is not None and 'lookahead avoidance — three probes' in l:
        end = i - 2    # back up over the blank line and closing */ line
        break
assert start is not None and end is not None, (start, end)
# verify boundaries
assert lines[start].strip().startswith('/**'), lines[start]
assert lines[end].strip() == '}', lines[end]

NEW = '''  /**
   * Resolve a vehicle against the physical world using its EXACT
   * hull — an oriented box, not a proxy circle. The nose stops
   * where the nose is; corners don't clip; glancing contact
   * slides. Stacked matter (boulder pockets, wall corners)
   * resolves deepest-penetration-first over relaxation passes.
   * Heavy tracked vehicles push through trees and dry-stone
   * walls — visibly, destructively.
   */
  resolve(u: { x: number; y: number; angle: number; speedNow: number; def: { kind: string; length: number; width: number } }, dt: number, ctx: SimContext): CollisionResult {
    const res: CollisionResult = { slow: 1, crushed: false };
    const hl = u.def.length * 0.5;
    const hw = u.def.width * 0.5;
    const ca = Math.cos(u.angle);
    const sa = Math.sin(u.angle);
    const reach = Math.hypot(hl, hw);
    const heavy = u.def.kind === 'MBT' || u.def.kind === 'IFV' || u.def.kind === 'SPG' || u.def.kind === 'SPAA';
    const obs = this.near(u.x, u.y, reach + 30);

    for (let pass = 0; pass < 3; pass++) {
      // crush checks (pass 0 only) use the true bow position —
      // timber falls when the hull actually reaches it
      if (pass === 0) {
        const noseX = u.x + ca * hl;
        const noseY = u.y + sa * hl;
        for (const o of obs) {
          if (!o.alive) continue;
          if (this.obstacleDist(o, noseX, noseY).d >= 0) continue;
          // tracked armour meets woodland — the tree loses
          if (o.kind === 'TREE' && heavy && u.speedNow > 2.2) {
            this.fellTree(o, u.angle, ctx, 'crush');
            res.crushed = true;
            res.slow = Math.min(res.slow, 0.86);
          } else if (o.kind === 'WALL' && heavy && u.speedNow > 3.5) {
            // a tank can bull through a dry-stone wall — stone by stone
            this.damageObstacle(o, 90 * Math.min(1, dt * 6), 'SHELL', ctx);
            res.slow = Math.min(res.slow, 0.8);
          }
        }
      }

      // exact hull tests: OBB vs circle / OBB vs OBB
      const pens: Array<{ o: Obstacle; nx: number; ny: number; depth: number }> = [];
      for (const o of obs) {
        if (!o.alive) continue;
        let mtv: { nx: number; ny: number; depth: number } | null = null;
        if (o.hw > 0) {
          mtv = this.obbObbMTV(u.x, u.y, u.angle, hl, hw, o.x, o.y, o.rot, o.hw, o.hh);
        } else {
          mtv = this.obbCircleMTV(u.x, u.y, ca, sa, hl, hw, o.x, o.y, o.r);
        }
        if (mtv && mtv.depth > 0) pens.push({ o, nx: mtv.nx, ny: mtv.ny, depth: mtv.depth });
      }
      if (!pens.length) break;

      // deepest penetration first — the relaxation converges
      pens.sort((a, b) => b.depth - a.depth);
      for (const p of pens) {
        if (!p.o.alive) continue;
        const push = Math.min(p.depth, 6) + 0.05;
        u.x += p.nx * push;
        u.y += p.ny * push;
        // friction against the surface — head-on stops, glancing slides
        const into = ca * p.nx + sa * p.ny; // -1 = square into it
        res.slow = Math.min(res.slow, 1 + into * 0.5);
        u.speedNow *= 0.98;
      }
    }
    return res;
  }
'''

out = lines[:start] + [NEW] + lines[end + 1:]
with open(PATH, 'w', encoding='utf-8') as f:
    f.writelines(out)
print('resolve() rewritten with relaxation')
