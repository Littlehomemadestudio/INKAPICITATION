// PAPER STORM · building footprint overlap audit (proper OBB SAT)
(() => {
  const t = window.__paperStorm.terrain;
  const bs = t.buildings;
  function obbOverlap(a, b) {
    const ca1 = Math.cos(a.rot), sa1 = Math.sin(a.rot);
    const ca2 = Math.cos(b.rot), sa2 = Math.sin(b.rot);
    const dx = b.x - a.x, dy = b.y - a.y;
    const axes = [[ca1, sa1], [-sa1, ca1], [ca2, sa2], [-sa2, ca2]];
    const fwA = [ca1, sa1], lfA = [-sa1, ca1], fwB = [ca2, sa2], lfB = [-sa2, ca2];
    let minOv = Infinity;
    for (const [ux, uy] of axes) {
      const dist = dx * ux + dy * uy;
      const rA = (a.w / 2) * Math.abs(fwA[0] * ux + fwA[1] * uy) + (a.h / 2) * Math.abs(lfA[0] * ux + lfA[1] * uy);
      const rB = (b.w / 2) * Math.abs(fwB[0] * ux + fwB[1] * uy) + (b.h / 2) * Math.abs(lfB[0] * ux + lfB[1] * uy);
      const ov = rA + rB - Math.abs(dist);
      if (ov <= 0) return 0;
      minOv = Math.min(minOv, ov);
    }
    return minOv;
  }
  const pairs = [];
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      // quick AABB reject first
      const a = bs[i], b = bs[j];
      if (Math.abs(a.x - b.x) > (a.w + b.w) / 2 + 2) continue;
      if (Math.abs(a.y - b.y) > (a.h + b.h) / 2 + 2) continue;
      const ov = obbOverlap(a, b);
      if (ov > 0.5) pairs.push({ ov: +ov.toFixed(1), a: [Math.round(a.x), Math.round(a.y), a.kind], b: [Math.round(b.x), Math.round(b.y), b.kind] });
    }
  }
  pairs.sort((p, q) => q.ov - p.ov);
  return JSON.stringify({ totalBuildings: bs.length, realOverlaps: pairs.length, worst: pairs.slice(0, 6) }, null, 1);
})()
