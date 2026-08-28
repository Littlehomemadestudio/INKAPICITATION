// PAPER STORM · collision accuracy audit v2 (rotated-box distance math)
(() => {
  const g = window.__paperStorm;
  const ob = g.obstacles;
  const t = g.terrain;
  const stubCtx = {
    effects: { spawnExplosion() {}, spawnDust() {}, spawnSmoke() {}, addRubble() {}, scheduleBlasts() {} },
    audio: { autocannon() {} },
    log() {},
    time: 0,
    terrain: t,
  };

  // distance from a point to a rotated box surface (0 = on it)
  function distToBox(px, py, b) {
    const ca = Math.cos(-b.rot), sa = Math.sin(-b.rot);
    const lx = (px - b.x) * ca - (py - b.y) * sa;
    const ly = (px - b.x) * sa + (py - b.y) * ca;
    const dx = Math.max(Math.abs(lx) - b.w / 2, 0);
    const dy = Math.max(Math.abs(ly) - b.h / 2, 0);
    return Math.hypot(dx, dy);
  }

  // independent SAT overlap between a unit hull (OBB) and a building (OBB)
  function overlapBox(u, b) {
    const hl = u.def.length / 2, hw = u.def.width / 2;
    const ca1 = Math.cos(u.angle), sa1 = Math.sin(u.angle);
    const ca2 = Math.cos(b.rot), sa2 = Math.sin(b.rot);
    const dx = b.x - u.x, dy = b.y - u.y;
    const axes = [[ca1, sa1], [-sa1, ca1], [ca2, sa2], [-sa2, ca2]];
    const fwA = [ca1, sa1], lfA = [-sa1, ca1];
    const fwB = [ca2, sa2], lfB = [-sa2, ca2];
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

  const mbt = { def: { kind: 'MBT', length: 7.9, width: 3.7 } };
  const fails = [];

  // TEST 1 — teleport-inside escape at 16 angles × 3 depths × several buildings
  const blds = t.buildings.filter((x) => x.w >= 12 && x.stage === 0).slice(0, 6);
  let escapeTests = 0;
  for (const b of blds) {
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      for (const rr of [0, 4, 9]) {
        const u = { ...mbt, x: b.x + Math.cos(ang) * rr, y: b.y + Math.sin(ang) * rr, angle: ang * 1.7, speedNow: 4 };
        for (let s = 0; s < 14; s++) ob.resolve(u, 1 / 60, stubCtx);
        escapeTests++;
        const ov = overlapBox(u, b);
        if (ov > 0.05) fails.push({ test: `escape r${rr}`, ov: ov.toFixed(2) });
      }
    }
  }

  // TEST 2 — nose-accurate approach: drive at the wall, apply slow like the engine
  const b = blds[0];
  const dir = Math.PI * 0.25;
  const stop = { ...mbt, x: b.x - Math.cos(dir) * 40, y: b.y - Math.sin(dir) * 40, angle: dir, speedNow: 8 };
  let steps = 0;
  while (steps < 600) {
    stop.speedNow = Math.min(10, stop.speedNow + 0.5);
    const px0 = stop.x, py0 = stop.y;
    stop.x += Math.cos(stop.angle) * stop.speedNow * (1 / 60);
    stop.y += Math.sin(stop.angle) * stop.speedNow * (1 / 60);
    const hit = ob.resolve(stop, 1 / 60, stubCtx);
    if (hit.slow < 1) stop.speedNow *= hit.slow;
    steps++;
    if (steps > 60 && stop.speedNow < 1.2) break;
  }
  const noseX = stop.x + Math.cos(stop.angle) * (mbt.def.length / 2);
  const noseY = stop.y + Math.sin(stop.angle) * (mbt.def.length / 2);
  const noseGap = distToBox(noseX, noseY, b);
  const centerGap = distToBox(stop.x, stop.y, b);
  const finalOverlap = overlapBox(stop, b);

  // TEST 3 — glancing slide along a long wall
  const wall = t.walls.find((w) => w.len > 100);
  let slideRatio = -1;
  if (wall) {
    const px = wall.x - Math.sin(wall.rot) * 6;
    const py = wall.y + Math.cos(wall.rot) * 6;
    const u = { ...mbt, x: px, y: py, angle: wall.rot, speedNow: 9 };
    for (let s = 0; s < 120; s++) {
      u.x += Math.cos(u.angle) * u.speedNow * (1 / 60);
      u.y += Math.sin(u.angle) * u.speedNow * (1 / 60);
      const hit = ob.resolve(u, 1 / 60, stubCtx);
      if (hit.slow < 1) u.speedNow *= hit.slow;
    }
    slideRatio = u.speedNow / 9;
  }

  // TEST 4 — projectile raycast onto the building face (rotated distance)
  const fx = b.x - 120, fy = b.y - 120;
  const hit = ob.firstHit(fx, fy, b.x + 60, b.y + 60);
  let rayOk = false;
  let rayInfo = null;
  if (hit) {
    const edgeDist = distToBox(hit.x, hit.y, b);
    rayOk = edgeDist < 1.2 && hit.o.kind === 'BUILDING';
    rayInfo = { edgeDist: edgeDist.toFixed(2), kind: hit.o.kind };
  }
  const miss = ob.firstHit(b.x - 200, b.y + 60, b.x + 200, b.y + 60);

  // TEST 5 — tank vs boulder (circle) corner clip check
  const rock = t.rocks.find((r) => r.r >= 4);
  let rockOk = null;
  if (rock) {
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const u = { ...mbt, x: rock.x + Math.cos(ang) * 2, y: rock.y + Math.sin(ang) * 2, angle: ang * 2.3, speedNow: 0.1 };
      for (let s = 0; s < 14; s++) ob.resolve(u, 1 / 60, stubCtx);
      // exact hull-vs-circle clearance
      const ca = Math.cos(u.angle), sa = Math.sin(u.angle);
      const dx = rock.x - u.x, dy = rock.y - u.y;
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      const qx = Math.max(Math.abs(lx) - mbt.def.length / 2, 0);
      const qy = Math.max(Math.abs(ly) - mbt.def.width / 2, 0);
      const gap = rock.r * 0.92 - Math.hypot(qx, qy); // >0 means overlap
      worst = Math.max(worst, gap);
    }
    rockOk = worst;
  }

  return JSON.stringify({
    escapeTests,
    escapeFailures: fails,
    nose: { gap: noseGap.toFixed(2), centerGap: centerGap.toFixed(2), overlap: finalOverlap.toFixed(2), stopsAtWall: noseGap < 1.5 && finalOverlap <= 0 },
    oldProxyStopRadius: (mbt.def.length * 0.34).toFixed(2),
    slideRatio: slideRatio >= 0 ? slideRatio.toFixed(2) : 'no wall',
    ray: { ok: rayOk, info: rayInfo, cleanMiss: miss === null },
    rockWorstOverlap: rockOk === null ? 'no rock' : rockOk.toFixed(2),
  }, null, 1);
})()
