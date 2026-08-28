// PAPER STORM · collision relaxation debug — why do escapes fail?
(() => {
  const g = window.__paperStorm;
  const ob = g.obstacles;
  const t = g.terrain;
  const ctx = {
    effects: { spawnExplosion() {}, spawnDust() {}, spawnSmoke() {}, addRubble() {}, scheduleBlasts() {} },
    audio: { autocannon() {} },
    log() {},
    time: 0,
    terrain: t,
  };

  function overlap(u, b) {
    const hl = u.def.length / 2, hw = u.def.width / 2;
    const ca1 = Math.cos(u.angle), sa1 = Math.sin(u.angle);
    const ca2 = Math.cos(b.rot), sa2 = Math.sin(b.rot);
    const dx = b.x - u.x, dy = b.y - u.y;
    const axes = [[ca1, sa1], [-sa1, ca1], [ca2, sa2], [-sa2, ca2]];
    const fwA = [ca1, sa1], lfA = [-sa1, ca1], fwB = [ca2, sa2], lfB = [-sa2, ca2];
    let minOv = Infinity;
    for (const [ux, uy] of axes) {
      const dist = dx * ux + dy * uy;
      const rA = hl * Math.abs(fwA[0] * ux + fwA[1] * uy) + hw * Math.abs(lfA[0] * ux + lfA[1] * uy);
      const rB = (b.w / 2) * Math.abs(fwB[0] * ux + fwB[1] * uy) + (b.h / 2) * Math.abs(lfB[0] * ux + lfB[1] * uy);
      const ov = rA + rB - Math.abs(dist);
      if (ov <= 0) return 0;
      minOv = Math.min(minOv, ov);
    }
    return minOv;
  }

  const blds = t.buildings.filter((x) => x.w >= 12 && x.stage === 0).slice(0, 6);
  const mbt = { def: { kind: 'MBT', length: 7.9, width: 3.7 } };
  const report = [];
  for (let bi = 0; bi < blds.length; bi++) {
    const b = blds[bi];
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      for (const rr of [0, 4]) {
        const u = { ...mbt, x: b.x + Math.cos(ang) * rr, y: b.y + Math.sin(ang) * rr, angle: ang * 1.7, speedNow: 4 };
        for (let s = 0; s < 14; s++) ob.resolve(u, 1 / 60, ctx);
        const ov = overlap(u, b);
        if (ov > 0.05) {
          const near = [];
          for (const o of ob.near(u.x, u.y, 40)) {
            if (o.alive) near.push({ kind: o.kind, x: Math.round(o.x), y: Math.round(o.y), r: Math.round(o.r) });
          }
          report.push({
            bi, ang: ang.toFixed(2), rr, ov: ov.toFixed(2),
            pos: [Math.round(u.x), Math.round(u.y)],
            bld: [Math.round(b.x), Math.round(b.y)],
            near: near.slice(0, 8),
          });
        }
      }
    }
  }
  return JSON.stringify({ failures: report.length, sample: report.slice(0, 4) }, null, 1);
})()
