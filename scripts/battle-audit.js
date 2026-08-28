// PAPER STORM · full battle stress audit — physics + performance
(() => {
  const g = window.__paperStorm;
  const ob = g.obstacles;
  const t = g.terrain;

  // hull overlap sampler for ANY unit
  function hullOverlap(u) {
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
  }

  // order everyone forward into contact — force a real fight
  const enemies = g.units.filter((u) => u.faction === 'ENEMY' && !u.dead);
  const friends = g.units.filter((u) => u.faction === 'FRIEND' && !u.dead && !u.isAir);
  const tgt = enemies.length ? enemies[Math.floor(enemies.length / 2)] : { x: t.W / 2, y: t.H / 2 };
  g.input.selection.length = 0;
  for (const u of friends) g.input.selection.push(u);
  const s = g.camera.worldToScreen(tgt.x, tgt.y);
  g.input.mouseX = s.x; g.input.mouseY = s.y;
  g.input.handleRightClick();
  g.setPaused(false);

  // performance probe
  window.__battleAudit = {
    hullOverlap,
    t0: performance.now(),
    frames: 0,
    fps: [],
    worstUnit: { ov: 0, cs: '', kind: '' },
  };
  let last = performance.now();
  function tick() {
    const a = window.__battleAudit;
    const now = performance.now();
    a.frames++;
    if (now - last >= 500) {
      a.fps.push(Math.round((a.frames * 1000) / (now - a.t0)));
      a.frames = 0; a.t0 = now; last = now;
    }
    for (const u of g.units) {
      if (u.dead || u.isAir || u.def.kind === 'HQ') continue;
      const { maxOv, worstKind } = hullOverlap(u);
      if (maxOv > a.worstUnit.ov) a.worstUnit = { ov: +maxOv.toFixed(2), cs: u.callsign, kind: worstKind };
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return JSON.stringify({ friendsOrdered: friends.length, target: [Math.round(tgt.x), Math.round(tgt.y)] });
})()
