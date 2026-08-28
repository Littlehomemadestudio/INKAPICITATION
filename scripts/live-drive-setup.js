// PAPER STORM · live drive test via the REAL input pipeline
(() => {
  const g = window.__paperStorm;
  const t = g.terrain;
  const ob = g.obstacles;
  const input = g.input;

  const u = g.units.find((x) => x.faction === 'FRIEND' && !x.dead && !x.isAir && x.def.kind === 'MBT');
  if (!u) return 'no MBT';

  // densest boulder field
  let best = { n: 0, x: 0, y: 0 };
  for (let cx = 200; cx < t.W - 200; cx += 200) {
    for (let cy = 200; cy < t.H - 200; cy += 200) {
      let n = 0;
      for (const rk of t.rocks) if (Math.hypot(rk.x - cx, rk.y - cy) < 130 && rk.r >= 3) n++;
      if (n > best.n) best = { n, x: cx, y: cy };
    }
  }
  if (best.n < 3) return 'no boulder field on this seed';

  const ang = Math.PI * 0.7;
  const R = 240;
  const startX = best.x + Math.cos(ang) * R;
  const startY = best.y + Math.sin(ang) * R;
  const destX = best.x - Math.cos(ang) * R;
  const destY = best.y - Math.sin(ang) * R;

  // teleport the tank to the field edge, clear orders
  u.x = startX; u.y = startY; u.speedNow = 0;
  u.path = []; u.dest = null; u.coverDivert = null;
  // move camera between start and dest
  g.camera.focusOn((startX + destX) / 2, (startY + destY) / 2);
  // select + right-click move through the field
  input.selection.length = 0;
  input.selection.push(u);
  const s = g.camera.worldToScreen(destX, destY);
  input.mouseX = s.x; input.mouseY = s.y;
  input.handleRightClick();
  g.setPaused(false);

  // overlap sampler
  window.__hullSampler = () => {
    const hl = u.def.length / 2, hw = u.def.width / 2;
    const ca = Math.cos(u.angle), sa = Math.sin(u.angle);
    let maxOv = 0; let worstKind = '';
    for (const o of ob.near(u.x, u.y, 40)) {
      if (!o.alive) continue;
      let ov = 0;
      if (o.hw > 0) {
        const ca2 = Math.cos(o.rot), sa2 = Math.sin(o.rot);
        const dx = o.x - u.x, dy = o.y - u.y;
        const axes = [[ca, sa], [-sa, ca], [ca2, sa2], [-sa2, ca2]];
        let minOv = Infinity;
        for (const [ux, uy] of axes) {
          const dist = dx * ux + dy * uy;
          const rA = hl * Math.abs(ca * ux + sa * uy) + hw * Math.abs(-sa * ux + ca * uy);
          const rB = o.hw * Math.abs(ca2 * ux + sa2 * uy) + o.hh * Math.abs(-sa2 * ux + ca2 * uy);
          const o2 = rA + rB - Math.abs(dist);
          if (o2 <= 0) { minOv = 0; break; }
          minOv = Math.min(minOv, o2);
        }
        ov = minOv;
      } else {
        const dx = o.x - u.x, dy = o.y - u.y;
        const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
        const qx = Math.max(Math.abs(lx) - hl, 0), qy = Math.max(Math.abs(ly) - hw, 0);
        ov = Math.max(0, o.r - Math.hypot(qx, qy));
      }
      if (ov > maxOv) { maxOv = ov; worstKind = o.kind; }
    }
    return { maxOv, worstKind };
  };
  window.__driveTest = { unit: u, dest: { x: destX, y: destY }, best };
  return JSON.stringify({
    unit: u.callsign,
    fieldRocks: best.n,
    start: [Math.round(startX), Math.round(startY)],
    dest: [Math.round(destX), Math.round(destY)],
    ordered: !!u.dest || u.path.length > 0,
  });
})()
