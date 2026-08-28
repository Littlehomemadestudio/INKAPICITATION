(() => {
  const g = window.__paperStorm;
  const ctx = g.simCtx();
  const t = g.terrain;
  const out = [];

  // ── A. findCoverSpot returns the PROTECTED side of a wall ──
  // find a wall with open ground on both sides
  let bestWall = null;
  for (const w of t.walls) {
    if (!w.segs || w.segs.some(s => s.hp <= 0)) continue;
    // test point 30m north of wall centre; threat 400m north
    const threat = { x: w.x, y: w.y - 400 };
    const spot = g.obstacles ? null : null;
    void spot;
    bestWall = w;
    break;
  }
  if (bestWall) {
    const w = bestWall;
    const threat = { x: w.x, y: w.y - 400 };
    // use the units.ts cover module via the exposed game context: emulate by
    // calling through a friendly unit's internals is awkward; instead verify
    // the geometry via wallSegmentAlive on both sides
    const southY = w.y + 10;
    const northY = w.y - 10;
    out.push('wall cover geometry: south-of-wall segAlive=' + t.wallSegmentAlive(w, w.x, southY) +
      ' north-of-wall segAlive=' + t.wallSegmentAlive(w, w.x, northY));
  }

  // ── B. under-fire cover seeking with mission resume ─────────
  const tank = g.units.find(u => u.faction === 'FRIEND' && u.def.kind === 'MBT' && !u.dead);
  const shooter = g.units.find(u => u.faction === 'ENEMY' && !u.dead && u.def.kind === 'MBT');
  if (tank && shooter) {
    // park the tank in the open near PL ECHO walls, moving on a mission
    tank.x = 2200; tank.y = 1900; tank.path = [];
    tank.orderMove({ x: 2600, y: 1500 }, ctx);
    tank.suppression = 0.6;
    tank.lastAttacker = shooter;
    tank.lastAttackedT = ctx.time;
    shooter.x = 2200; shooter.y = 900; // fire comes from the north
    // step the sim forward
    for (let i = 0; i < 240; i++) {
      tank.update(0.05, ctx);
    }
    const diverting = !!tank.coverDivert || !!tank.coverPos;
    const movedTowardCover = Math.hypot(tank.x - 2200, tank.y - 1900) > 5;
    out.push('under-fire: diverting=' + diverting + ' movedFromOrigin=' + (movedTowardCover ? "yes" : "no") +
      ' pos=(' + tank.x.toFixed(0) + ',' + tank.y.toFixed(0) + ')');
    // let the fire slacken — suppression decays 0.065/s
    tank.lastAttackedT = -999;
    for (let i = 0; i < 400; i++) {
      tank.update(0.05, ctx);
    }
    out.push('after slack: coverDivert=' + (tank.coverDivert ? 'SET' : 'cleared') +
      ' order=' + tank.order.type + ' hasPath=' + (tank.path.length > 0) +
      ' dest=(' + (tank.dest ? tank.dest.x.toFixed(0) + ',' + tank.dest.y.toFixed(0) : 'none') + ')');
  }

  // ── C. tanks crush trees when driving through woodland ──────
  const forest = t.trees.find(tr => (tr.state ?? 0) === 0 && t.forestDensity(tr.x, tr.y) > 0.5);
  if (forest && tank) {
    const before = t.trees.filter(tr => (tr.state ?? 0) !== 0).length;
    tank.x = forest.x - 60; tank.y = forest.y;
    tank.angle = 0; tank.suppression = 0;
    tank.orderMove({ x: forest.x + 80, y: forest.y }, ctx);
    for (let i = 0; i < 600; i++) {
      tank.update(0.05, ctx);
    }
    const after = t.trees.filter(tr => (tr.state ?? 0) !== 0).length;
    out.push('tree crush: felled ' + (after - before) + ' trunks driving east, tankDist=' +
      Math.abs(tank.x - (forest.x + 80)).toFixed(0) + 'm from goal');
  }

  // ── D. light vehicle cannot crush — steers around ───────────
  const scout = g.units.find(u => u.faction === 'FRIEND' && u.def.kind === 'REC' && !u.dead);
  if (scout) {
    const forest2 = t.trees.find(tr => (tr.state ?? 0) === 0 && t.forestDensity(tr.x, tr.y) > 0.5);
    if (forest2) {
      const beforeS = t.trees.filter(tr => (tr.state ?? 0) !== 0).length;
      scout.x = forest2.x - 60; scout.y = forest2.y;
      scout.angle = 0; scout.suppression = 0;
      scout.orderMove({ x: forest2.x + 80, y: forest2.y }, ctx);
      for (let i = 0; i < 600; i++) {
        scout.update(0.05, ctx);
      }
      const afterS = t.trees.filter(tr => (tr.state ?? 0) !== 0).length;
      out.push('scout: felled ' + (afterS - beforeS) + ' (expect 0 — wheels do not fell timber)');
    }
  }

  return out.join(' || ');
})()
