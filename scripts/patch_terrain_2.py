#!/usr/bin/env python3
# V2.0 PART I-B — phase 2: new generate() for terrain.ts

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

NEW_GENERATE = r'''  private generate() {
    const rng = new RNG((this.seed ^ 0xC0FFEE) >>> 0);

    // ── the river SEVERNAYA — the frontline of the theatre ────
    this.river = [
      { x: -60, y: 900 },
      { x: 600, y: 1150 },
      { x: 1400, y: 1550 },
      { x: 2300, y: 2050 },
      { x: 3100, y: 2600 },
      { x: 3700, y: 3050 },
      { x: 4000, y: 3450 },
      { x: 4260, y: 3900 },
      { x: 4380, y: 4210 },
    ];
    for (let i = 1; i < this.river.length - 1; i++) {
      const p = this.river[i];
      const a = rng.range(0, Math.PI * 2);
      p.x += Math.cos(a) * rng.range(24, 70);
      p.y += Math.sin(a) * rng.range(24, 70);
    }

    // ford on the southern reach — the wade crossing
    this.ford = { x: 3350 + rng.range(-30, 30), y: 2790 + rng.range(-30, 30) };

    // dry tributary — the ghost of a stream off the north ridge
    this.dryStream = [
      { x: 900, y: 620 },
      { x: 1250, y: 900 },
      { x: 1600, y: 1250 },
      { x: 1950, y: 1650 },
      { x: 2150, y: 1950 },
    ];

    // ── the road network — every road leads somewhere ────────────
    // MSR VEGA — the N-S spine: staging area -> the city -> the plateau -> HQ
    const msr: Vec2[] = [
      { x: 1300, y: 5620 },
      { x: 1750, y: 5050 },
      { x: 2150, y: 4400 },
      { x: 2900, y: 4100 },
      { x: 3600, y: 3850 },
      { x: 4055, y: 3535 }, // CENTRAL BRIDGE
      { x: 4200, y: 3100 },
      { x: 4350, y: 2500 },
      { x: 4700, y: 2050 },
      { x: 5400, y: 1900 },
      { x: 6100, y: 1700 },
      { x: 6550, y: 1450 }, // airfield gate
      { x: 6950, y: 1050 },
      { x: 7150, y: 600 },
      { x: 7300, y: -40 },
    ];
    // HWY 14 — the northern E-W belt, crossing at the NORTH BRIDGE
    const hwy14: Vec2[] = [
      { x: -40, y: 2600 },
      { x: 700, y: 2350 },
      { x: 1200, y: 1950 },
      { x: 1450, y: 1560 }, // NORTH BRIDGE
      { x: 1900, y: 1300 },
      { x: 2600, y: 1000 }, // MOLot 9
      { x: 3500, y: 950 },
      { x: 4500, y: 1000 },
      { x: 5500, y: 1150 },
      { x: 6300, y: 1250 },
      { x: 7300, y: 1200 },
      { x: 8230, y: 1150 },
    ];
    // WEST ROAD — the second crossing: ZAVOD WEST -> WEST BRIDGE -> the north
    const westRoad: Vec2[] = [
      { x: 1500, y: 3800 },
      { x: 2100, y: 3300 }, // ZAVOD WEST
      { x: 2500, y: 2190 }, // WEST BRIDGE
      { x: 2700, y: 1600 },
      { x: 2750, y: 1080 }, // HWY junction
    ];
    // the city streets — NOVY GOROD on both banks of the mouth
    const citySouth: Vec2[] = [
      { x: 3600, y: 3850 }, // MSR junction
      { x: 3800, y: 3950 },
      { x: 4050, y: 4050 },
      { x: 4300, y: 3980 },
      { x: 4470, y: 4180 }, // the waterfront
    ];
    const cityNorth: Vec2[] = [
      { x: 4055, y: 3535 }, // CENTRAL BRIDGE
      { x: 3900, y: 3250 },
      { x: 3600, y: 3100 }, // the old town
      { x: 3300, y: 2900 },
      { x: 3050, y: 2650 },
    ];
    const cityEast: Vec2[] = [
      { x: 3900, y: 3250 },
      { x: 4200, y: 3250 },
      { x: 4450, y: 3350 }, // east suburb
      { x: 4650, y: 3600 },
    ];
    // LITTORAL ROAD — the whole coast: marsh -> beaches -> bay -> port -> headland
    const littoral: Vec2[] = [
      { x: -40, y: 5250 },
      { x: 600, y: 5100 },
      { x: 1200, y: 4850 }, // the fishing village
      { x: 1800, y: 4600 },
      { x: 2400, y: 4350 },
      { x: 2900, y: 4100 }, // MSR junction
      { x: 3300, y: 4400 },
      { x: 3750, y: 4560 },
      { x: 4100, y: 4320 },
      { x: 4500, y: 4240 }, // PORT AZURE gate
      { x: 4900, y: 4300 },
      { x: 5400, y: 4450 },
      { x: 6000, y: 4380 }, // COASTAL SAM SITE
      { x: 6600, y: 4620 },
      { x: 7400, y: 4800 },
      { x: 8230, y: 4900 },
    ];
    // EASTERN ROAD — EASTWORKS up to the airfield gate
    const eastRoad: Vec2[] = [
      { x: 5900, y: 2050 },
      { x: 6200, y: 1750 },
      { x: 6550, y: 1450 },
    ];
    // the airfield perimeter loop
    const airfieldLoop: Vec2[] = [
      { x: 6550, y: 1450 },
      { x: 6650, y: 1150 },
      { x: 6900, y: 980 },
      { x: 7080, y: 1230 },
      { x: 6950, y: 1520 },
      { x: 6650, y: 1600 },
    ];
    // farm lanes of the south-west belt
    const farmLane1: Vec2[] = [
      { x: 1900, y: 4300 },
      { x: 2500, y: 4550 },
      { x: 3000, y: 4700 },
    ];
    const farmLane2: Vec2[] = [
      { x: 2150, y: 4400 },
      { x: 2000, y: 4800 },
      { x: 1900, y: 5200 },
    ];
    // FORD TRACK — the wade crossing between MSR and the north country
    const fordTrack: Vec2[] = [
      { x: 3600, y: 3850 },
      { x: 3450, y: 3200 },
      { x: 3350, y: 2790 }, // THE FORD
      { x: 3170, y: 2350 },
      { x: 3100, y: 2250 },
    ];
    const allRoads = [msr, hwy14, westRoad, citySouth, cityNorth, cityEast, littoral, eastRoad, airfieldLoop, farmLane1, farmLane2, fordTrack];
    for (const pts of allRoads) {
      for (let i = 1; i < pts.length - 1; i++) {
        pts[i].x += rng.range(-26, 26);
        pts[i].y += rng.range(-22, 22);
      }
    }
    this.roads = [
      { pts: msr, major: true, name: 'MSR VEGA' },
      { pts: hwy14, major: true, name: 'HWY 14' },
      { pts: westRoad, major: false, name: 'WEST ROAD' },
      { pts: citySouth, major: false, name: 'CITY SOUTH' },
      { pts: cityNorth, major: false, name: 'CITY NORTH' },
      { pts: cityEast, major: false, name: 'CITY EAST' },
      { pts: littoral, major: false, name: 'LITTORAL ROAD' },
      { pts: eastRoad, major: false, name: 'EASTERN ROAD' },
      { pts: airfieldLoop, major: false, name: 'AIRFIELD LOOP' },
      { pts: farmLane1, major: false, name: 'FARM LANE' },
      { pts: farmLane2, major: false, name: 'FARM LANE' },
      { pts: fordTrack, major: false, name: 'FORD TRACK' },
    ];

    // ── railway: the northern mainline + the port freight spur ──
    this.railway = [
      { x: -60, y: 1000 },
      { x: 900, y: 950 },
      { x: 1800, y: 1000 },
      { x: 2600, y: 980 }, // MOLot siding
      { x: 3500, y: 1050 },
      { x: 4500, y: 1200 },
      { x: 5300, y: 1500 },
      { x: 5900, y: 2050 }, // EASTWORKS siding
      { x: 6300, y: 2450 },
      { x: 6900, y: 2900 },
      { x: 7600, y: 3300 },
      { x: 8230, y: 3550 },
    ];
    for (let i = 1; i < this.railway.length - 1; i++) {
      this.railway[i].x += rng.range(-22, 22);
      this.railway[i].y += rng.range(-16, 16);
    }
    this.railSpurs = [
      [
        { x: 6300, y: 2450 },
        { x: 5700, y: 3000 },
        { x: 5100, y: 3700 },
        { x: 4950, y: 4250 }, // PORT AZURE freight yard
      ],
    ];

    // ── bridges where the roads cross the river ──────────────
    this.bridges = [];
    const addBridge = (rx: number, ry: number, major = false) => {
      const dir = this.polylineDirAt(rx, ry, this.river);
      this.bridges.push({
        x: rx,
        y: ry,
        angle: dir + Math.PI / 2,
        len: this.riverWidth + 52,
        w: major ? 24 : 19,
      });
    };
    addBridge(1450, 1560, true); // NORTH BRIDGE — HWY 14
    addBridge(2500, 2190); // WEST BRIDGE
    addBridge(4055, 3535, true); // CENTRAL BRIDGE — MSR, the city

    // ── the city, the works, the airfield, the HQ ─────────────
    this.buildCity(rng);
    this.buildAirfield(6680, 1250, rng);

    // ── ink works — serious military-industrial works ────────
    this.factories = [
      { id: 'MOLOT9', name: 'MOLot 9', x: 2600, y: 950 },
      { id: 'ZAVODW', name: 'ZAVOD WEST', x: 2100, y: 3300 },
      { id: 'ZAVODE', name: 'ZAVOD EAST', x: 5900, y: 2100 },
      { id: 'AZURER', name: 'AZURE REFINERY', x: 4950, y: 4080 },
    ];
    this.buildFactory(this.factories[0], rng, 0.9); // north rail works
    this.buildFactory(this.factories[1], rng, 1.0); // the western complex
    this.buildFactory(this.factories[2], rng, 1.3); // the main combine
    this.buildFactory(this.factories[3], rng, 0.85); // the coastal refinery

    // enemy HQ compound — on the KRAKEN plateau
    this.buildHQ(7150, 600, rng);

    // ── PORT AZURE — the harbour is a place, not a decal ─────
    if (this.sea.harbour) {
      const hb = this.sea.harbour;
      for (const wh of hb.warehouses) {
        this.buildings.push({ x: wh.x, y: wh.y, w: wh.w, h: wh.h, rot: wh.rot, kind: 'WAREHOUSE' });
      }
      for (const tk of hb.tanks) {
        this.buildings.push({ x: tk.x, y: tk.y, w: 13, h: 13, rot: 0, kind: 'FUEL_TANK' });
      }
      // harbour master + checkpoint on the gate
      this.buildings.push({ x: 4540, y: 4195, w: 12, h: 9, rot: 0.2, kind: 'SHED' });
      this.buildings.push({ x: 4600, y: 4175, w: 10, h: 6, rot: -0.2, kind: 'CHECKPOINT' });
    }

    // checkpoints at the central bridge approaches
    this.buildings.push({ x: 4010, y: 3470, w: 10, h: 6, rot: 1.2, kind: 'CHECKPOINT' });
    this.buildings.push({ x: 4095, y: 3600, w: 7, h: 5, rot: 0.4, kind: 'BUNKER' });

    // ── villages and farmsteads — lived-in ground ───────────
    this.buildTown(1550, 3850, rng, -0.5); // WESTWOOD
    this.buildTown(1150, 4880, rng, -0.15); // the fishing village
    this.buildTown(3550, 990, rng, 0.1); // SEVERNOYE, on the north road
    const farms: [number, number][] = [
      [1000, 2900],
      [2900, 4600],
      [1850, 5050],
      [5050, 3600],
      [2600, 4700],
      [900, 4500],
      [3400, 1750],
      [3100, 2250],
    ];
    for (const [fx, fy] of farms) {
      this.buildFarm(fx + rng.range(-30, 30), fy + rng.range(-30, 30), rng);
    }

    // ── power corridor: EASTWORKS substation -> the HQ ────────
    this.powerLine = [
      { x: 5900, y: 2050 },
      { x: 6300, y: 1750 },
      { x: 6600, y: 1450 },
      { x: 6950, y: 1050 },
      { x: 7150, y: 600 },
    ];
    this.pylons = this.powerLine.map((p) => ({ ...p }));

    // ── field fortifications — the defensive landscape ───────
    this.buildFortifications(rng);

    // ── pre-war ruins — the war was here before you ───────────
    const ruins: [number, number, number][] = [
      [3720, 3820, 24], [3800, 3900, 18], [4180, 3870, 20],
      [4300, 3920, 15], [3950, 3760, 16], [2830, 2300, 18],
      [5700, 2050, 22], [2350, 3250, 16],
    ];
    for (const [rx, ry, rw] of ruins) {
      this.buildings.push({ x: rx, y: ry, w: rw, h: rw * 0.7, rot: rng.range(-0.4, 0.4), kind: 'RUIN' });
    }

    // ── rocks — boulder fields on the steep ground ─────────
    this.rocks = [];
    for (let i = 0; i < 5200; i++) {
      const x = rng.range(60, this.W - 60);
      const y = rng.range(60, this.H - 60);
      const s = this.slopeAt(x, y);
      if (s < 0.105 || s > 0.4) continue;
      if (this.isWater(x, y) || this.forestDensity(x, y) > 0.6) continue;
      if (this.roadFactor(x, y) > 0.05 || this.railFactor(x, y) > 0.1) continue;
      if (this.buildingAt(x, y, 30)) continue;
      if (rng.chance(0.3)) {
        // a small boulder cluster, not a lone pebble — stones
        // never interpenetrate; the gaps between them are real
        const rockFits = (rx: number, ry: number, rr: number) => {
          for (const rk of this.rocks) {
            if (dist(rk.x, rk.y, rx, ry) < rk.r + rr + 2.2) return false;
          }
          return true;
        };
        const nRocks = rng.int(1, 3);
        for (let r = 0; r < nRocks; r++) {
          const rx = x + rng.range(-11, 11);
          const ry = y + rng.range(-11, 11);
          const rr = rng.range(1.8, 5.2);
          if (!rockFits(rx, ry, rr)) continue;
          this.rocks.push({ x: rx, y: ry, r: rr, seed: rng.next() });
        }
      }
      if (this.rocks.length > 420) break;
    }

    // ── trees — forest masses + planted treelines ────────────
    this.trees = [];
    const step = 34;
    for (let y = step; y < this.H; y += step) {
      for (let x = step; x < this.W; x += step) {
        const jx = x + rng.range(-13, 13);
        const jy = y + rng.range(-13, 13);
        if (this.forestDensity(jx, jy) < 0.42) continue;
        if (this.isWater(jx, jy) || this.bridgeAt(jx, jy, 70)) continue;
        if (this.distToPolyline(jx, jy, this.river) < this.riverWidth * 0.5 + 34) continue;
        if (this.roadFactor(jx, jy) > 0.08 || this.railFactor(jx, jy) > 0.15) continue;
        if (this.slopeAt(jx, jy) > 0.2) continue;
        if (this.buildingAt(jx, jy, 34)) continue;
        if (this.trenchDist(jx, jy) < 14) continue;
        if (this.wallNear(jx, jy, 8)) continue;
        if (this.onRunway(jx, jy, 26)) continue;
        this.trees.push({ x: jx, y: jy, r: rng.range(6.5, 12.5), seed: rng.next() });
      }
    }

    // ── agricultural parcels — patchwork on the flatter ground ──
    this.fields = [];
    const fieldTones = [0.04, 0.08, 0.115, 0.06];
    let toneI = 0;
    for (let cy = 200; cy < this.H - 150; cy += 205) {
      for (let cx = 180; cx < this.W - 150; cx += 265) {
        const fx = cx + rng.range(-52, 52);
        const fy = cy + rng.range(-46, 46);
        const fw = rng.range(150, 235);
        const fh = rng.range(105, 165);
        if (this.slopeAt(fx, fy) > 0.085) continue;
        if (this.forestDensity(fx, fy) > 0.3) continue;
        if (this.distToPolyline(fx, fy, this.river) < 90) continue;
        if (this.sea.shoreDistAt(fx, fy) > -60) continue; // the sea takes no farmland
        if (this.railFactor(fx, fy) > 0.05) continue;
        if (this.buildingAt(fx, fy, Math.max(fw, fh) * 0.7 + 30)) continue;
        if (this.onRunway(fx, fy, Math.max(fw, fh) * 0.6)) continue;
        let nearRoad = false;
        for (const r of this.roads) {
          if (this.distToPolyline(fx, fy, r.pts) < Math.max(fw, fh) * 0.42) nearRoad = true;
        }
        if (nearRoad) continue;
        this.fields.push({
          x: fx,
          y: fy,
          w: fw,
          h: fh,
          rot: (Math.round(rng.range(-1, 1)) * Math.PI) / 2 + rng.range(-0.06, 0.06),
          tone: fieldTones[toneI++ % fieldTones.length],
        });
      }
    }

    // planted treelines along selected field boundaries — the
    // man-made structure of the farmland reads instantly
    for (const f of this.fields) {
      if (!rng.chance(0.42)) continue;
      const cos = Math.cos(f.rot);
      const sin = Math.sin(f.rot);
      const edge = rng.chance(0.5) ? 1 : -1;
      for (let t = -0.44; t <= 0.44; t += 30 / Math.max(f.w, 120)) {
        const lx = t * f.w;
        const ly = edge * (f.h / 2 + 13);
        const wx = f.x + lx * cos - ly * sin;
        const wy = f.y + lx * sin + ly * cos;
        if (this.isWater(wx, wy) || this.roadFactor(wx, wy) > 0.1) continue;
        if (this.buildingAt(wx, wy, 24)) continue;
        this.trees.push({ x: wx, y: wy, r: rng.range(5, 8), seed: rng.next() });
      }
    }

    // city park trees — a pair of green squares in the grid
    for (const pk of [
      { x: 3850, y: 3980, r: 46 },
      { x: 4300, y: 3180, r: 38 },
    ]) {
      for (let i = 0; i < 14; i++) {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(0, pk.r);
        const tx = pk.x + Math.cos(a) * d;
        const ty = pk.y + Math.sin(a) * d;
        if (this.isWater(tx, ty) || this.buildingAt(tx, ty, 12)) continue;
        this.trees.push({ x: tx, y: ty, r: rng.range(5.5, 9), seed: rng.next() });
      }
    }

    for (const t of this.trees) {
      const key = this.treeKey(t.x, t.y);
      let arr = this.treeGrid.get(key);
      if (!arr) {
        arr = [];
        this.treeGrid.set(key, arr);
      }
      arr.push(t);
    }

    // building spatial hash
    for (const b of this.buildings) {
      const key = Math.floor(b.x / 128) * 100000 + Math.floor(b.y / 128);
      let arr = this.bldGrid.get(key);
      if (!arr) {
        arr = [];
        this.bldGrid.set(key, arr);
      }
      arr.push(b);
    }

    // ── structural integrity — buildings are matter, not decals ──
    for (const b of this.buildings) {
      b.hpMax = buildingHpFor(b.kind);
      b.hp = b.hpMax;
      b.stage = b.kind === 'RUIN' ? 1 : 0;
    }

    // ── labels & spot heights — the named theatre ────────────
    this.labels = [
      { x: 4800, y: 1800, text: 'HILL 204', size: 34, bold: true },
      { x: 3900, y: 3250, text: 'NOVY GOROD', size: 26, bold: true },
      { x: 4230, y: 3900, text: 'CENTRAL BRIDGE', size: 16 },
      { x: 1450, y: 1480, text: 'NORTH BRIDGE', size: 15 },
      { x: 2500, y: 2110, text: 'WEST BRIDGE', size: 15 },
      { x: 7150, y: 900, text: 'OBJ KRAKEN', size: 22, bold: true },
      { x: 3900, y: 3400, text: 'OBJ ECHO', size: 20, bold: true },
      { x: 4800, y: 1950, text: 'OBJ FOXTROT', size: 20, bold: true },
      { x: 6650, y: 1600, text: 'OBJ GOLF', size: 20, bold: true },
      { x: 1350, y: 850, text: 'NORTH RIDGE', size: 24 },
      { x: 3050, y: 1180, text: 'HILL 163', size: 17 },
      { x: 2600, y: 850, text: 'MOLot 9', size: 18, bold: true },
      { x: 2100, y: 3150, text: 'ZAVOD WEST', size: 18, bold: true },
      { x: 5900, y: 1950, text: 'ZAVOD EAST', size: 20, bold: true },
      { x: 4950, y: 3980, text: 'AZURE REFINERY', size: 16, bold: true },
      { x: 4800, y: 4520, text: 'PORT AZURE', size: 22, bold: true },
      { x: 4900, y: 4700, text: 'HARBOR DISTRICT', size: 15 },
      { x: 4800, y: 5050, text: 'AZURE BAY', size: 26, bold: true },
      { x: 6900, y: 5350, text: 'OSTROV VOLNY', size: 16 },
      { x: 5600, y: 5520, text: 'KAMEN', size: 13 },
      { x: 5550, y: 4600, text: 'THE NARROWS', size: 14 },
      { x: 7700, y: 5700, text: 'APPROACHES', size: 15 },
      { x: 5900, y: 4270, text: 'COASTAL SAM SITE', size: 13 },
      { x: 6600, y: 1120, text: 'EASTERN AIRFIELD', size: 17, bold: true },
      { x: 7150, y: 380, text: 'KRAKEN PLATEAU', size: 16 },
      { x: 1550, y: 3760, text: 'WESTWOOD', size: 16 },
      { x: 1150, y: 4790, text: 'RYBAKOVKA', size: 14 },
      { x: 3550, y: 900, text: 'SEVERNOYE', size: 14 },
      { x: 2200, y: 4400, text: 'SOUTH FARMS', size: 20 },
      { x: 3350, y: 2900, text: 'THE FORD', size: 14 },
      { x: 1650, y: 1600, text: 'SEVERNAYA VALLEY', size: 15 },
      { x: 1000, y: 1600, text: 'NORTH RIDGE FOREST', size: 17 },
      { x: 5200, y: 980, text: 'RAIL LINE', size: 13 },
      { x: 700, y: 5150, text: 'THE MARSHES', size: 15 },
    ];
    this.hillPeak = { x: 4800, y: 1800 };
    this.hillHeight = this.heightAt(4800, 1800);

    this.spotHeights = [
      { x: 4800, y: 1800, h: Math.round(this.heightAt(4800, 1800)) },
      { x: 1150, y: 760, h: Math.round(this.heightAt(1150, 760)) },
      { x: 3050, y: 1300, h: Math.round(this.heightAt(3050, 1300)) },
      { x: 2200, y: 4400, h: Math.round(this.heightAt(2200, 4400)) },
      { x: 7150, y: 600, h: Math.round(this.heightAt(7150, 600)) },
      { x: 4700, y: 2700, h: Math.round(this.heightAt(4700, 2700)) },
      { x: 3400, y: 4600, h: Math.round(this.heightAt(3400, 4600)) },
      { x: 6900, y: 5350, h: Math.round(this.heightAt(6900, 5350)) },
    ];

    // pathfinding grid
    this.buildCostGrid();

    // LOS height grid
    this.buildHeightGrid();

    // master 8 m height field — the wash and contours read from this
    this.buildHeight8();

    // contour extraction, tiled per kilometre
    this.contourTiles = this.extractContours();
  }

'''

replace("  private generate() {", "  /** the deliberate defensive works", NEW_GENERATE, "generate()")

open(P, 'w').write(s)
print("terrain.ts phase 2 done", len(s))
