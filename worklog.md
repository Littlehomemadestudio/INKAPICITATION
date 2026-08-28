# PAPER STORM — Worklog

---
Task ID: 1
Agent: main
Task: V1.5 NAVAL WARFARE EXPANSION — architecture audit (spec §1: inspect before changes)

Work Log:
- Read every core system end-to-end: Game.ts (604), terrain.ts (1511), units.ts (1111),
  unitDefs.ts (198), projectiles.ts (571), effects.ts (958), renderer.ts (952),
  terrainRender.ts (1397), audio.ts (475), economy.ts (390), scenario.ts (187),
  ai.ts (278), vision.ts (180), input.ts (407), camera.ts (144), obstacles.ts (669 partial),
  HudBars.tsx (535), GameShell.tsx (160), globals.css (445)

Stage Summary — ARCHITECTURE FACTS (integration points for naval):
- World: 4096×3072m. Terrain hand-authored: river polyline (30m wide, isWater = dist<15),
  roads/railway/bridges/trenches/walls/barriers/77 buildings/~1950 trees/170 rocks.
  heightAt() = base fbm + gaussians (ridges/hills); losClear() samples hg grid (32m) + building mask.
  findPath: A* on 64m cost grid (water=-1 impassable, bridges=0.5, ford=3.6), string-pulled.
- Wash bitmap prerender at 0.25 px/m incl. river band; live vector features per frame.
- Unit: single class, ground + air branch (updateAir). Orders: MOVE/ATTACK/ATTACK_MOVE/STOP/
  HOLD/FIRE_MISSION/PATROL. Suppression + cover-seek. die() → effects + persistent wreck
  (effects.wrecks + obstacles.addWreck). NEXT_ID global.
- Projectiles: SHELL/AUTO flat + obstacle hit-scan; ARTY ballistic arc w/ whistle;
  MISSILE_AIR/SPAA guided. impact() → effects.spawnExplosion + applyDamage(splash falloff,
  aspect multipliers) + obstacles.damageAt. fireAGM hardcodes friend:true — MUST FIX for enemy air.
- Effects: explosions(ink blobs/streaks/flash)/smoke pool/debris/rings/flashes/craters/
  scars bitmap (permanent, 0.5px/m)/wrecks/rubble/pendingBlasts. SCAR canvas reused for water ink.
- Vision: symmetric visibleTargets every 0.15s; terrainLOS via losClear (islands will work free
  once they have height); intel GHOST/HIDDEN; factories always DETECTED.
- Economy: InkEconomy.update → sectors/factories capture + production queue (MAX 3).
  FRIEND_BATTALIONS + ENEMY_BATTALIONS rosters; spawnBattalion() spawns at friendlyEntry(240,2960)
  / enemyEntry(3440,60). aiThink() enemy purse. Ships count for sector capture (only isAir excluded).
- AI: EnemyCommander state machine SCREEN/DEFEND/COUNTERATTACK/ALARM + arty missions + factory response.
- Input: click/box select (friendOnly), RMB context orders, A/F modes, formationMove() grid offsets
  w/ spacingFor(u) — extend for ships. unitAt() picking radius fixed — extend for ship hulls.
- Renderer layers: paper→wash→scars→features→craters→rubble→sectors→assembly→objectives→
  factories→wrecks→units(ground→air)→projectiles→drawCore→orderMarkers→smoke→furniture→grain.
  scaleFor() minPx=15 stamp scaling. Minimap: minimapBase from renderMinimapBase + live dots.
- Audio: procedural one-shots (explosion/cannon/autocannon/artyFire/missileLaunch/whistle/uiTick),
  engine loops w/ doppler+pan (Map<id>), ambience wind + distant rumble. NO music system yet.
- HUD deck: MAP|FORMATION|DEPLOY|DETAIL|AIR, NO scrolling anywhere yet (air panel overflow-hidden,
  capped). CSS deck grid w/ breakpoints; detail hides <1240px. --ps-h-bottom:168/148px.
- Game loop: fixed dt via speed steps; hud snapshot 0.12s; window.__paperStorm exposed for tests.

DESIGN DECISIONS for V1.5:
- Sea = SE corner: coast polyline (2150,3120)→(2380,2900)→(2650,2680)→(2900,2480)→(3120,2320)→
  (3320,2220)[PORT VELIKY harbor]→(3560,2160)→(3800,2130)→(4110,2080), closed via SE map corner.
  River mouth becomes estuary (merges ~3300,2350). New module world/sea.ts: water mask (16m grid),
  signed shoreDist (chamfer), islands (big OSTROV ~3300,2720 170×110; islet 3860,2520 r60;
  shoal islet 2950,2980 r40), naval A* (navShore+navBlock grids, draft-gated), harbor data.
- heightAt: water mask cells → 0 (flat sea floor); islands keep gaussian heights → LOS block +
  contours. Coast noise wobble ±22m. Beach segments (SW stretch) vs cliff (harbor headland).
- 5 ship classes via mounts system (per-mount reload/angle/turret pos): PT(26m torps+25mm),
  FF(98m 76mm+SAM), DD(135m 130mm+SSM+CIWS), CG(170m 2×152+SSM+SAM), BB VELIKIY (240m,
  3×triple 380mm + SSM + CIWS — the BIG BOI). Enemy SU-25 attack aircraft (prefers ships) added
  for air-naval interaction; fireAGM faction fix.
- Naval units: domain 'SEA', forward-only movement w/ inertia/turn radius, stand-off engagement,
  staged sinking + persistent wreck (navBlock stamp + oil slick scar), wakes (persistent fading
  canvas) + bow foam, water-column impacts (plume/droplets/rings/mist/ink) in effects.
- Economy: +5 friendly naval battalions (90/220/380/650/1500 ink), naval spawn at sea entry
  (4050,2980)→anchorage(3720,2830); enemy PT×2 at harbor start + sea sector VELIKIY BAY.
- UI: DEPLOY panel LAND/SEA tabs (each list independently scrollable); AIR panel converted to
  OPS rail with AIR+NAVAL columns, both independently scrollable; deck widths retuned for 1366px.
- Audio: navalGun (calibre-scaled heavy boom, distance lowpass), bigSplash, torpedo, ocean swell
  ambience near coast, ship engine loops for large hulls, procedural MusicEngine
  (intensity 0-4 slew + stingers: fleet contact / capital arrives / capital sunk / victory).

---
Task ID: 2
Agent: main
Task: V1.5 NAVAL WARFARE — implementation + live testing

Work Log:
- Built world/sea.ts: coast ring (closed polygon bug fixed — SE corner closure), wobble
  subdivision, 3 islands, water mask 16m (256×193), signed chamfer shoreDist (seed
  inversion bug fixed), beach/cliff masks, naval A* grid 64m with navShore min-of-corners
  + navBlock (piers/breakwater/wrecks), findSeaPath + string-pull, sea entry/anchorage.
- terrain.ts: sea integration (isWater, heightAt islands + flat sea floor, findSeaPath
  delegate), PORT VELIKY buildings (WAREHOUSE/FUEL_TANK kinds + hp), littoral roads,
  sea labels, fields avoid shore, farm moved off coast.
- unitDefs: PATROL/FRIGATE/DESTROYER/CRUISER/BATTLESHIP (domain SEA, draft, accel,
  standoff, mounts) + SU25K enemy CAS. kinds/NAVAL, projectiles NAVAL_SHELL|SSM|TORPEDO.
- shipDraw.ts: 5 hand-authored silhouettes (26-238m), SHIP_CONFIGS mount layout (per-
  class GUN/SSM/SAM/CIWS/TORP), turret art by calibre, VLS grids, BB pagoda+9 rifles,
  wreck variant.
- units.ts: naval branch — forward-only movement with inertia/rudder-with-way-on,
  shoal probing + give-way separation + grounding guard + re-path, stand-off doctrine
  (hold gunnery band, broadside), warship-first targeting + independent airTarget,
  per-mount firing (turrets lead, torpedoes need run alignment, CIWS bursts), area
  shore-fire vs ordered structures w/o LOS, wake/bow-wave emission, damage smoke,
  STAGED SINKING (blasts → fires → listing → persistent shipWreck + oil slick +
  navBlock + capitalDown stinger). Naval armour table. Air: faction-correct RTB/REARM/
  launch (enemy exits NE), SU25K ship-bias targeting, fireAGM/SAM faction fix.
- projectiles.ts: fireNavalShell (low arc, calibre dispersion, muzzle wash, navalGun
  audio), fireSSM (sea-skimmer), fireTorpedo (armed fish, foam seam, hull-hit test),
  fireNavalSAM; impact() splits water vs land — water: plume columns + rings + spray
  + ink contamination; NAVAL_SHELL obstacle damage by calibre.
- effects.ts: WaterSplash lifecycle (rewritten after VLM feedback: taller whiter
  columns, motion streaks, 6-spike crown, thick rings, late ink), wake canvas
  (persistent fading foam), bow wave, torpedo wake, oil slick stamp, shipWrecks,
  wake fade tick, sinking-hull smoke.
- terrainRender.ts: wash paints depth-graded muted blue (133,148,153→84,99,111) +
  ripple + sand band + cliff darkening; river repainted blue; drawSea live pass
  (animated swell strokes 2-pass, coast edge + 2 foam surf lines + cliff hatching,
  PORT VELIKY piers/cranes/breakwater/buoys); WAREHOUSE/FUEL_TANK building art;
  minimap river blue.
- renderer.ts: ship pass (water shadow, listing, mounts, selection rings, hp bar,
  hover), shipWrecks layer, wakes under fleet, water columns above hulls, fleet
  anchorage marker, minimap ship glyphs + wrecks, ground loop skips ships.
- economy.ts: 5 naval battalions (90/220/380/650/1500), naval spawn at sea entry →
  anchorage berths, enemy E_AIR/E_PT with harbor sorties, aiThink fleet response
  with queued-aware caps, ship callsigns.
- scenario.ts: 2 enemy PTs at piers, SU25K standby, VELIKIY BAY sector (+2.4 ink/s),
  briefing naval paragraphs/phases, BAY/PORT anchors.
- ai.ts: navalResponse (PT sortie at spotted hulls, shore battery fire on fleet)
  with dt-fixed alarm timers (was per-frame decay).
- audio.ts: navalGun (distance-lowpassed, calibre-weighted), bigSplash (plunge+wash+
  sub), shipBreaking (steel groan), ship engines, ocean swell bed (camera proximity),
  MusicEngine (pad/tension/heartbeat/timpani layers 0-4 slew, stingers contact/
  capital/capitalDown/victory/defeat, capitalDown ducks 9s).
- Game.ts: ship engine loops, ocean proximity, updateMusic (intensity from fire
  picture, BB arrival stinger + log, fleet contact stinger), HUD navy lines + naval
  detail labels, endMission stingers, friendly-only AIR panel fix.
- input.ts: ship-scale picking radius, fleet formation berths (pull-to-water),
  ships bypass arty filter on attack orders.
- HudBars/globals.css: DEPLOY GROUND/FLEET tabs + scrollable list; OPERATIONS panel
  AIR+NAVAL columns each independently scrollable; deck grid retuned (ops 326px+);
  verified 1366×768 no clipping.

FIXED during testing: sea ring closure (eastern bay not water), chamfer seed
inversion (shoreDist all zero), fuel tank in water, alarm per-frame decay, AI
purchase caps ignoring queue, air panel showing enemy aircraft, island moved north
(south channel now passes BB draft 96), wreck nav-block radius tightened,
water columns rewritten (VLM 2/10 → 9/10).

TESTED LIVE (agent-browser + VLM):
- briefing ✓ · strategic bay (muted blue, island, coast) ✓ · harbor detail ✓
- BB tactical detail (pagoda, turrets, wake) ✓ · water columns 9/8/7/9/9 ✓
- bombardment of ZAVOD 7 (muzzle flash, land impacts, splashes) ✓
- naval battle: 8 enemy PT + 8 SU25 killed by fleet AA + guns; 15 wrecks ✓
- island circumnavigation both channels (BB draft verified) ✓ · formation berths ✓
- BB torpedo sinking (14.8s staged, listing+fires+smoke, persistent wreck,
  music duck) ✓ · ground war regression (PL ECHO destroyed) ✓ · 1366 UI ✓
- perf: land == bay == 25fps in headless (30fps rAF cap of SwiftShader; not the sea)

Stage Summary:
- V1.5 core complete and live-verified. Remaining: final polish pass + hero shots.

---
Task ID: 3
Agent: main
Task: V1.5 final verification + polish sign-off

Work Log:
- Scroll isolation verified: naval ops list scrollable (534px content / 128px view),
  wheel over list does NOT zoom the map. Deploy FLEET tab lists 5 hulls, scrollable.
- 1440×900 + 1366×768 + 1920×1080 UI verified by VLM — all panels docked, no clipping.
- Final theater hero shot: VLM cohesion 9/10 — one war across land and sea, ships,
  bombardment, persistent wreck stains, unified ink language.
- Fresh boot verified: briefing → commence → 38 units, 8 sectors, 2 enemy hulls,
  zero console errors.
- Performance: land == bay ≈ 25fps in SwiftShader headless (30fps rAF cap) —
  the sea layer costs nothing measurable over the baseline.

Stage Summary:
- V1.5 NAVAL WARFARE shipped and verified end-to-end: sea, coast, harbor, islands,
  5-class fleet with BIG BOI capital ship, torpedoes/SSM/CIWS/SAM, water columns,
  wakes, staged sinkings, persistent wrecks, naval AI, enemy CAS, sea sector
  economy, dynamic music, naval audio, LAND/FLEET deploy tabs, AIR|NAVAL ops
  rail with independent scrolling. ONE WAR. ONE ECONOMY. ONE INK SYSTEM.
