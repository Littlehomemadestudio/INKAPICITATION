#!/usr/bin/env python3
# V2.0 PART I-B — phase 3: fortifications + city/airfield builders + contours

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

# ── fortifications ─────────────────────────────────────────────
NEW_FORT = r'''  private buildFortifications(rng: RNG) {
    this.trenches = [];
    this.walls = [];
    this.barriers = [];

    const zigzag = (cx: number, cy: number, len: number, baseAng: number, n: number): Trench => {
      // a dug position: alternating legs of a fire trench
      const pts: Vec2[] = [];
      const legLen = len / n;
      let x = cx - (Math.cos(baseAng) * len) / 2;
      let y = cy - (Math.sin(baseAng) * len) / 2;
      pts.push({ x, y });
      for (let i = 0; i < n; i++) {
        const a = baseAng + (i % 2 === 0 ? 0.55 : -0.55);
        x += Math.cos(a) * legLen;
        y += Math.sin(a) * legLen;
        pts.push({ x: x + rng.range(-3, 3), y: y + rng.range(-3, 3) });
      }
      return { pts };
    };

    // PL ECHO defensive line — the city bridgehead, faces south across the river
    this.trenches.push(zigzag(3990, 3400, 240, Math.PI * 0.04, 7));
    this.trenches.push(zigzag(3760, 3300, 170, Math.PI * 0.3, 5));
    this.trenches.push(zigzag(4280, 3420, 160, Math.PI * 0.85, 5));
    // PL FOXTROT — two positions on the hill shoulders
    this.trenches.push(zigzag(4680, 1700, 190, Math.PI * 0.82, 6));
    this.trenches.push(zigzag(4980, 1980, 140, Math.PI * 0.7, 4));
    // WEST BRIDGE bridgehead — faces the player's side
    this.trenches.push(zigzag(2560, 2080, 150, Math.PI * 0.05, 5));
    // HQ perimeter — south face
    this.trenches.push(zigzag(7120, 820, 260, Math.PI * 0.06, 8));
    // EASTWORKS perimeter — west face
    this.trenches.push(zigzag(5620, 2100, 180, Math.PI * 0.64, 6));
    // airfield perimeter — west face
    this.trenches.push(zigzag(6380, 1420, 200, Math.PI * 0.6, 6));
    // the port's landward face
    this.trenches.push(zigzag(4750, 4150, 170, Math.PI * 0.1, 5));
    // MOLot 9 perimeter — south face
    this.trenches.push(zigzag(2580, 1060, 160, Math.PI * 0.12, 5));

    // stone walls — field boundaries that double as cover
    const wallSpots: [number, number, number, number][] = [
      // south-bank city approaches — the close fight
      [3660, 3720, 150, 0.3],
      [3820, 3660, 120, -0.1],
      [4180, 3700, 140, 0.08],
      [4320, 3800, 110, 0.5],
      // the ford country
      [3220, 2650, 140, 0.25],
      [3480, 2900, 120, -0.2],
      // west road approach
      [2320, 2350, 130, 0.4],
      [2650, 1900, 120, 0.35],
      // hill 204 approaches
      [4300, 1550, 150, 0.55],
      [4500, 1300, 120, 0.6],
      [5250, 1550, 130, 0.75],
      // eastworks approaches
      [5550, 1950, 140, 0.5],
      [5700, 2350, 120, 0.3],
      // south farms belt
      [2050, 4600, 160, 0.02],
      [2350, 4750, 130, -0.15],
      [2750, 4450, 120, 0.3],
      [1950, 4150, 140, 0.2],
      // the west farmland
      [1250, 3200, 150, 0.1],
      [1650, 3000, 120, -0.25],
      // littoral ground near the bay
      [3200, 4250, 130, 0.35],
      [3600, 4450, 120, 0.1],
      // north bridge approach
      [1350, 1400, 130, 0.45],
    ];
    for (const [x, y, len, rot] of wallSpots) {
      const wl = len * rng.range(0.85, 1.1);
      const w: StoneWall = { x: x + rng.range(-8, 8), y: y + rng.range(-8, 8), len: wl, rot: rot + rng.range(-0.06, 0.06) };
      // each wall is a chain of stone segments with its own strength
      const nSeg = Math.max(3, Math.round(wl / 16));
      w.segs = [];
      for (let i = 0; i < nSeg; i++) w.segs.push({ hp: Math.round(rng.range(70, 110)) });
      this.walls.push(w);
    }

    // dragon's teeth — anti-vehicle obstacles at the choke points
    const barrierFields: [number, number, number][] = [
      [4010, 3440, 8],  // central bridge north approach
      [4110, 3640, 6],  // central bridge south approach
      [1490, 1490, 6],  // north bridge
      [2540, 2110, 6],  // west bridge
      [3380, 2720, 6],  // the ford
      [6400, 1480, 7],  // airfield west gate
      [7040, 760, 8],   // HQ south entrance
      [5660, 2070, 6],  // eastworks west gate
      [4620, 4210, 5],  // port gate
    ];
    for (const [bx, by, n] of barrierFields) {
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(0, 26);
        this.barriers.push({ x: bx + Math.cos(a) * d, y: by + Math.sin(a) * d, rot: rng.range(0, Math.PI), hp: 100 });
      }
    }
  }

'''

replace("  private buildFortifications(rng: RNG) {", "  // ── settlement builders ────────────────────────────────────", NEW_FORT, "fortifications")

# ── town (generic) + city + airfield builders ──────────────────
NEW_BUILDERS = r'''  /** a crossroads town — buildings string along two road axes */
  private buildTown(cx: number, cy: number, rng: RNG, axis: number) {
    const along = (
      dx: number,
      dy: number,
      n: number,
      side: number,
      kinds: BuildingKind[]
    ) => {
      const span = 230; // metres of road frontage the lots share
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
    const ca = Math.cos(axis);
    const sa = Math.sin(axis);
    along(ca, sa, 4, 1, ['HOUSE', 'HOUSE', 'BARN', 'HOUSE']);
    along(ca, sa, 3, -1, ['HOUSE', 'SHED', 'HOUSE']);
    along(-sa, ca, 3, 1, ['HOUSE', 'HOUSE', 'SHED']);
    along(-sa, ca, 2, -1, ['SHED', 'BARN']);
  }

  /** NOVY GOROD — the port city at the river mouth. Apartment
   *  blocks on the south bank, old town + church on the north,
   *  depots in the east suburb. A real fight space. */
  private buildCity(rng: RNG) {
    const axis = -0.2; // the grid runs with the river's lower reach
    const cos = Math.cos(axis);
    const sin = Math.sin(axis);
    const place = (bx: number, by: number, w: number, h: number, rot: number, kind: BuildingKind) => {
      if (this.isWater(bx, by)) return;
      if (this.distToPolyline(bx, by, this.river) < 64) return; // keep off the banks
      if (this.roadFactor(bx, by) > 0.12) return;
      if (!this.buildingFits(bx, by, w, h, rot)) return;
      this.buildings.push({ x: bx, y: by, w, h, rot, kind });
    };
    const gridToWorld = (gx: number, gy: number, bx: number, by: number): { x: number; y: number } => ({
      x: bx + gx * cos - gy * sin,
      y: by + gx * sin + gy * cos,
    });

    // ── south bank — the new city: apartment slabs in a loose grid ──
    const southBase = { x: 3980, y: 3870 };
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const gx = (col - 1.5) * 118 + rng.range(-10, 10);
        const gy = row * 92 + rng.range(-8, 8);
        const p = gridToWorld(gx, gy, southBase.x, southBase.y);
        const w = rng.range(30, 40);
        const h = rng.range(15, 19);
        place(p.x, p.y, w, h, axis + Math.PI / 2 + rng.range(-0.08, 0.08), 'BLOCK');
      }
    }
    // shops and sheds along the waterfront road
    for (let i = 0; i < 4; i++) {
      const p = gridToWorld(-230 + i * 120, -70 + rng.range(-10, 10), southBase.x, southBase.y);
      place(p.x, p.y, rng.range(16, 24), rng.range(12, 15), axis + rng.range(-0.1, 0.1), i % 2 ? 'HOUSE' : 'SHED');
    }

    // ── north bank — the old town: dense small houses + the church ──
    const northBase = { x: 3760, y: 3160 };
    const ring: [number, number][] = [
      [-120, -70], [-30, -95], [70, -85], [130, -30], [145, 50],
      [80, 95], [-10, 105], [-105, 80], [-150, 10], [-60, 10], [40, 25], [-15, -45],
    ];
    for (const [gx, gy] of ring) {
      const p = gridToWorld(gx + rng.range(-8, 8), gy + rng.range(-8, 8), northBase.x, northBase.y);
      place(p.x, p.y, rng.range(13, 19), rng.range(11, 15), axis + rng.range(-0.2, 0.2), 'HOUSE');
    }
    // the church — the old town's landmark, on the knoll by the bridge
    const church = gridToWorld(190, -60, northBase.x, northBase.y);
    place(church.x, church.y, 14, 24, axis + 0.25, 'CHURCH');

    // ── east suburb — depots, substation, workshops ──
    const eastBase = { x: 4380, y: 3290 };
    const eastSpots: [number, number, BuildingKind][] = [
      [-60, -40, 'DEPOT'], [40, -60, 'WAREHOUSE'], [110, 10, 'SHED'],
      [-30, 70, 'HOUSE'], [60, 80, 'HOUSE'], [-130, 30, 'SUBSTATION'],
    ];
    for (const [gx, gy, kind] of eastSpots) {
      const p = gridToWorld(gx, gy, eastBase.x, eastBase.y);
      const w = kind === 'WAREHOUSE' ? 34 : kind === 'DEPOT' ? 26 : rng.range(14, 20);
      const h = kind === 'WAREHOUSE' ? 17 : kind === 'DEPOT' ? 14 : rng.range(11, 14);
      place(p.x, p.y, w, h, axis + rng.range(-0.12, 0.12), kind);
    }
  }

  /** the EASTERN AIRFIELD — runway, taxiway, aprons, hangars, tower */
  private buildAirfield(cx: number, cy: number, rng: RNG) {
    const ang = 0.16; // runway heading, roughly E-W
    this.runways = [
      { x: cx, y: cy, angle: ang, len: 560, w: 44, kind: 'RUNWAY' },
      { x: cx - 10, y: cy + 78, angle: ang, len: 470, w: 14, kind: 'TAXI' },
      { x: cx - 180, y: cy + 78, angle: ang, len: 130, w: 56, kind: 'APRON' },
      { x: cx + 130, y: cy + 78, angle: ang, len: 110, w: 56, kind: 'APRON' },
    ];
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const at = (fx: number, fy: number): { x: number; y: number } => ({
      x: cx + fx * cos - fy * sin,
      y: cy + fx * sin + fy * cos,
    });
    // hangars on the north edge of the dispersal
    for (const [fx, fy] of [[-250, 118], [-160, 118], [-70, 118]] as const) {
      const p = at(fx + rng.range(-6, 6), fy);
      this.buildings.push({ x: p.x, y: p.y, w: 38, h: 26, rot: ang + rng.range(-0.05, 0.05), kind: 'HANGAR' });
    }
    // the control tower between the aprons
    const tower = at(30, 108);
    this.buildings.push({ x: tower.x, y: tower.y, w: 13, h: 13, rot: ang, kind: 'TOWER' });
    // fuel farm + depot behind the hangars
    for (const [fx, fy] of [[-230, 165], [-205, 175]] as const) {
      const p = at(fx, fy);
      this.buildings.push({ x: p.x, y: p.y, w: 12, h: 12, rot: 0, kind: 'FUEL_TANK' });
    }
    const depot = at(-110, 170);
    this.buildings.push({ x: depot.x, y: depot.y, w: 24, h: 13, rot: ang, kind: 'DEPOT' });
  }

  /** is (x, y) on airfield paving? (clearance in metres) */
  onRunway(x: number, y: number, r: number): boolean {
    for (const rw of this.runways) {
      const c = Math.cos(-rw.angle);
      const s = Math.sin(-rw.angle);
      const dx = x - rw.x;
      const dy = y - rw.y;
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      if (Math.abs(lx) < rw.len / 2 + r && Math.abs(ly) < rw.w / 2 + r) return true;
    }
    return false;
  }

'''

replace("  private buildTown(cx: number, cy: number, rng: RNG) {", "  private buildFarm(cx: number, cy: number, rng: RNG) {", NEW_BUILDERS, "builders")

open(P, 'w').write(s)
print("terrain.ts phase 3 done", len(s))
