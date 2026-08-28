#!/usr/bin/env python3
# V2.0 PART I-D — economy/Game/vision/units hardcoded updates

def rep_file(path, pairs):
    s = open(path).read()
    for old, new, label in pairs:
        if old not in s:
            print(f"FAIL {path}: {label}"); raise SystemExit(1)
        s = s.replace(old, new, 1)
        print(f"ok {path}: {label}")
    open(path, 'w').write(s)

# ── economy.ts ──────────────────────────────────────────────────
rep_file('/home/z/my-project/src/game/systems/economy.ts', [
    ("""  /** where friendly reinforcements march in from */
  friendlyEntry = { x: 240, y: 2960 };
  friendlyAssembly = { x: 640, y: 2520 };
  /** where enemy reinforcements arrive */
  enemyEntry = { x: 3440, y: 60 };
  enemyRally = { x: 3480, y: 560 };""",
     """  /** where friendly reinforcements march in from */
  friendlyEntry = { x: 1300, y: 5560 };
  friendlyAssembly = { x: 1950, y: 4550 };
  /** where enemy reinforcements arrive */
  enemyEntry = { x: 7600, y: 150 };
  enemyRally = { x: 7050, y: 900 };""", "entries"),
    ("""const ENEMY_UNIT_CAP = 16;""",
     """const ENEMY_UNIT_CAP = 24;""", "enemy cap"),
    ("""            u.launchAir({ x: 3500, y: 2500 });""",
     """            u.launchAir({ x: 5000, y: 3200 });""", "enemy air station"),
    ("""          if (spec.type === 'BUK') {
            const berth = { x: 3230 + this.rngRange(0, 160), y: 420 + this.rngRange(0, 140) };""",
     """          if (spec.type === 'BUK') {
            const berth = { x: 6900 + this.rngRange(0, 160), y: 420 + this.rngRange(0, 140) };""", "BUK berth"),
])

# ── Game.ts ─────────────────────────────────────────────────────
rep_file('/home/z/my-project/src/game/Game.ts', [
    ("""    this.camera = new Camera(4096, 3072);""",
     """    this.camera = new Camera(this.terrain.W, this.terrain.H);""", "camera ctor"),
    ("""    this.resize();
    this.camera.focusOn(980, 2260, 0.46);""",
     """    this.resize();
    this.camera.focusOn(1700, 4700, 0.42);""", "initial focus"),
    ("""    this.economy.friendlyEntry = { x: 240, y: 2960 };
    this.economy.friendlyAssembly = { x: 640, y: 2520 };
    this.economy.enemyEntry = { x: 3440, y: 60 };
    this.economy.enemyRally = { x: 3480, y: 560 };""",
     """    this.economy.friendlyEntry = { x: 1300, y: 5560 };
    this.economy.friendlyAssembly = { x: 1950, y: 4550 };
    this.economy.enemyEntry = { x: 7600, y: 150 };
    this.economy.enemyRally = { x: 7050, y: 900 };""", "loadScenario entries"),
    ("""    this.camera.focusOn(980, 2260, 0.46);
    this.log(`NEW SHEET — OPERATION CROSSWIND RESTARTED`, 'objective');""",
     """    this.camera.focusOn(1700, 4700, 0.42);
    this.log(`NEW SHEET — OPERATION CROSSWIND RESTARTED`, 'objective');""", "restart focus"),
    ("""    this.log(`OPERATION CROSSWIND — TASK FORCE SABRE DEPLOYED`, 'objective');
    this.log(`BASE INK 260 · SECTORS AND WORKS PAY — READ THE DEPLOY PANEL`, 'economy');
    this.log(`ZAVOD 3 LIES ABANDONED SOUTH OF THE RIVER — OCCUPY IT`, 'info');
    this.log(`VELIKIY BAY PAYS INK — HULLS ARRIVE FROM THE APPROACHES, SE`, 'info');""",
     """    this.log(`OPERATION CROSSWIND — TASK FORCE SABRE DEPLOYED`, 'objective');
    this.log(`BASE INK 280 · SECTORS AND WORKS PAY — READ THE DEPLOY PANEL`, 'economy');
    this.log(`ZAVOD WEST LIES ABANDONED ON THE WEST ROAD — OCCUPY IT EARLY`, 'info');
    this.log(`AZURE BAY PAYS INK — HULLS ARRIVE FROM THE SOUTHERN APPROACHES`, 'info');
    this.log(`THE THEATRE IS WIDE — USE THE MINIMAP AND THE SPEED CONTROLS`, 'info');""", "startMission logs"),
])

# ── vision.ts — exploration grid sized from the terrain ─────────
rep_file('/home/z/my-project/src/game/systems/vision.ts', [
    ("""      const cx = Math.floor(f.x / (4096 / this.cols));
      const cy = Math.floor(f.y / (3072 / this.rows));""",
     """      const cx = Math.floor(f.x / (ctx.terrain.W / this.cols));
      const cy = Math.floor(f.y / (ctx.terrain.H / this.rows));""", "vision grid dims"),
])

# ── units.ts — air exits + patrol default ───────────────────────
rep_file('/home/z/my-project/src/game/entities/units.ts', [
    ("""        const home = this.faction === 'FRIEND'
          ? { x: -600, y: 3300 }
          : { x: 4300, y: -300 };""",
     """        const home = this.faction === 'FRIEND'
          ? { x: -600, y: 5400 }
          : { x: 7800, y: -400 };""", "air RTB exits"),
    ("""  patrol: Vec2 = { x: 2048, y: 1536 };""",
     """  patrol: Vec2 = { x: 0, y: 0 };""", "patrol default"),
])

# patrol default needs the world — set it in the constructor after def assignment
s = open('/home/z/my-project/src/game/entities/units.ts').read()
old_ctor = """    this.rng = new RNG((seedBase + this.id * 7919) >>> 0);
    if (this.def.isAir) {
      this.airState = 'STANDBY';
    }"""
new_ctor = """    this.rng = new RNG((seedBase + this.id * 7919) >>> 0);
    if (this.def.isAir) {
      this.airState = 'STANDBY';
      this.patrol = { x, y };
    }"""
if old_ctor not in s:
    print("FAIL units.ts: ctor patrol"); raise SystemExit(1)
s = s.replace(old_ctor, new_ctor, 1)
print("ok units.ts: ctor patrol")
open('/home/z/my-project/src/game/entities/units.ts', 'w').write(s)

print("ALL DONE")
