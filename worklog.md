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

---
Task ID: 4
Agent: main
Task: V1.6 — AIR DEFENSE + PROFESSIONAL UNIT ROSTER (major UI + combat expansion)

Work Log:
- AUDIT: found ground SPAA (TOR/PANTSIR) never fired — updateTargeting
  skipped ALL target acquisition for SPAA kind; enemy air defence was
  decorative. Naval SAM/CIWS worked via separate airTarget path.
- unitDefs.ts: UnitKind +INF; new friendly units RIFLE (infantry squad),
  VULCAN (M163A2 gun AA: rotary 20mm, lowOnly ceiling, fires on move),
  LINEBACKER (M6 SHORAD: Stingers on Bradley hull), NASAMS II (med SAM,
  emplace-to-fire), PATRIOT PAC-3 (theatre SAM, 3800m), F16C VIPER
  (fighter, canHitAir, AAM-only); enemy BUK TELAR (med SAM, HQ umbrella).
  New UnitDef.aa{radar,range,lock,lowOnly,emplace,regen} block on all
  SPAA. VULCAN tuned after live test: range 640→900, hp 42→50, dmg
  2.3→2.8 (standoff AGM at 780m was deleting it before it could fire).
- roster.ts (new): FRIEND_ROSTER — 16 unit-level RosterEntry catalog
  (branch/group/role/desc/armament/traits/firepower-armor-mobility-airDef
  notches/rangeM/movement/delivery) + BRANCH_GROUPS. Extends BattalionDef
  so the production queue machinery is unchanged.
- units.ts: updateAirDefense() — DETECT→TRACK→ENGAGE state machine for
  ground SPAA: radar-range acquisition from visibleTargets (skip
  parked STANDBY/REARM aircraft), trackT builds to aa.lock for a firing
  solution, gun systems fire led AUTO tracer bursts at predicted
  intercept (airLead, airAimQuality: track age/jink/range), missile
  systems fire SAMs with per-class evade (samEvade: banking target ×1.6,
  low-alt masking, PAC-3 ×0.55), emplace requirement blocks heavy SAMs
  while rolling, crew ammo regen from reserve. Aircraft lowAlt getter
  (runPhase!==ORBIT) = gun-AA ceiling. F16C: air-to-air attack runs
  (target filter prefers aircraft, AAM with evade), hunts enemy CAS.
  Naval SAM launch now passes maneuver-based evade too.
- projectiles.ts: fireSAM/fireNavalSAM/fireAGM accept evade param;
  MISSILE_AIR vs air targets gets the flare-evasion roll.
- vision.ts: AA radar (aa.radar) extends aircraft spotting range.
- unitDraw.ts: 7 new hand-authored silhouettes — RIFLE wedge of 5
  riflemen, VULCAN rotary-barrel cluster turret, LINEBACKER stinger pod
  on Bradley hull, NASAMS wheeled canister rack, PATRIOT big 4-tube
  erector trailer, BUK TELAR (4 rail missiles + scan radar), F16C
  (needle fuselage, cropped delta, single tail, wingtip AAMs).
- economy.ts: friendly purchases are now single units from FRIEND_ROSTER
  (queue cap FRIEND 6 / ENEMY 3); callsigns RIFLE/IRON/GUARD/SHIELD/
  SENTRY/VIPER + enemy DOME; enemy aiThink buys E_MSAM (BUK battery
  emplaces near HQ) when player air is active; BUK reinforcement spawns
  emplacing north; aircraft deliver to flight line with log line.
- scenario.ts: initial BUK at (3260,430) covering HQ approaches;
  briefing updated (SAM umbrella warning, R key, AD rings note);
  help overlay gains THE SKY section.
- renderer.ts: selected AA draws radar circle (dashed) + engagement
  envelope + radar lock line to tracked aircraft + track-progress arc.
- UI: Arsenal.tsx (new) — ORDER OF BATTLE console [R]: branch tabs
  GROUND/AIR/NAVAL, grouped roster rows with UnitGlyph silhouettes,
  paper recognition plate + stat notches + ARMAMENT + CHARACTERISTICS +
  DELIVERY + ink cost + DEPLOY (disabled states: INSUFFICIENT INK
  current/required, QUEUE FULL, ORDERED flash). UnitGlyph.tsx (new)
  reuses battlefield drawVehicle/drawShip for roster art (plate/panel
  skins). HudBars DeployBody → 3-branch quick-deploy (one-click buy,
  remembered tab) + ARSENAL [R] header button. Game.arsenalOpen +
  input R/ESC handling; CSS in globals.css (field-manual aesthetic,
  no glass/glow/radius).
- Game.ts: queueBattalion over catalog ids, arsenalOpen in HUD,
  detail weapon labels for all new systems.

FIXED during testing: stale Turbopack CSS chunk (needs dev restart +
rm -rf .next when styles change), EMPLACING activity masked by
ENGAGING, gun-AA standoff-kill weakness, parked-aircraft SAM sniping,
double-click deploy race in automated tests (humans fine — React
flushes between clicks).

TESTED LIVE (agent-browser + VLM):
- fresh boot, zero console errors; arsenal console 9.5/10 (VLM),
  air/naval branch consistency 10/10, AA silhouettes 9/10 at both
  zoom levels, frozen SAM engagement frame 8/10, theater gate PASS
  (one-war 8.5, cohesion 9.0).
- combat: PATRIOT killed CAS (3-missile engagement); layered AD
  (2×VULCAN + LINEBACKER) drove off 2 CAS RTB damaged, zero friendly
  losses; VULCAN 9-round tracer bursts during dives; F-16 AAM kill of
  CAS then shot down chasing it into SHORAD umbrella (tactical
  interaction, not auto-kill); BUK shot down A-10 during its RTB;
  enemy standby CAS now sorties when the fleet is spotted; NASAMS
  expended 6 rounds + crew reload logs.
- full roster: all 16 unit types purchased, produced and alive
  (verified by type census); queue cap 6 respected.
- resolutions: 1366×768 (console lifts clear of deck: bottom 606 <
  deck top 620), 1440×900, 1920×1080 — no clipping/overflow.
- perf: 40fps headless with 48 units + full AD park + fleet underway.

Stage Summary:
- V1.6 shipped: four-doctrine air defence (gun/SHORAD/med/long with
  real detect→track→engage, evasion, emplacement, ammo logistics),
  enemy BUK umbrella + standby CAS sorties, F-16 air superiority,
  rifle squads, and the ARSENAL order-of-battle console + quick-deploy
  — 16-unit arsenal, unit-level ink economics, recognition plates,
  real armament terminology. One war, one economy, one interface.

---
Task ID: 5
Agent: main
Task: V2.0 MAJOR PRODUCTION PASS — THEATER MAP + TACTICAL AI + AAA LANDING PAGE (audit)

Work Log:
- Re-read all core systems: terrain.ts, sea.ts, ai.ts, economy.ts, scenario.ts,
  Game.ts, camera.ts, unitDefs.ts, terrainRender.ts (full), units.ts (API),
  renderer markers, vision grid, GameShell.
- Constraint noted from fullstack-dev skill: only `/` route is user-visible →
  landing page and game will SHARE `/` (landing mounts GameShell on PLAY NOW).

Stage Summary — PLAN:
- PART I: world 4096×3072 → 8192×6144. New geography: river SEVERNAYA NW→bay
  estuary (frontline), NOVY GOROD port city at the river mouth w/ CENTRAL
  BRIDGE, NORTH+WEST bridges, FORD; AZURE BAY (big northward dent) w/ PORT
  AZURE harbor + refinery; headland peninsula (COASTAL SAM SITE); open SE sea
  w/ OSTROV VOLNY big island + KAMEN + shoal; NORTH RIDGE mountains NW; HILL
  204 center-east; EASTERN PLATEAU w/ KRAKEN HQ + EASTERN AIRFIELD (runway,
  hangars, tower — new landmark); MOLot 9 / ZAVOD WEST (neutral) / ZAVOD EAST /
  AZURE REFINERY works; road hierarchy MSR VEGA + HWY 14 + littoral + city
  grid + farm lanes + ford track; rail mainline + port spur; ~14 sectors;
  4 objectives (ECHO city, FOXTROT hill, GOLF airfield, KRAKEN HQ primary).
- Perf plan: single cached height grid (8m) driving wash hillshade + contours
  (tiled Path2D, zoom-gated minor contours), road-dist field cache for
  generation, boot screen while world generates.
- PART II: ai.ts → ai/ package: intel.ts (contacts w/ confidence decay from
  enemy visibleTargets — no cheating), groups (ECHO/FOXTROT/WEST/NORTH/EAST/
  HQ/PORT/FLEET), strategic layer (front threat assessment, HOLD/REINFORCE/
  COUNTERATTACK/WITHDRAW ops, ink purchasing by need), tactical layer (route
  choice via bridge waypoints scored by danger, arty pre-bombardment, AA
  umbrella emplacement, retreat/regroup/retry cycles, recon probes, naval
  wolfpack + damaged-withdraw). Story logs on every op transition.
- PART III: landing page at `/` (hero canvas anim over real screenshot, THE
  WAR/LAND/AIR/SEA/INK/BATTLEFIELD/COMMAND sections, real screenshots from
  agent-browser captures into public/shots/, editorial mono-blue language),
  PLAY NOW mounts GameShell, EXIT THEATER returns to landing.

---
Task ID: 6
Agent: main
Task: V2.0 PART I + II — THEATER MAP + TACTICAL AI (implementation)

Work Log:
- sea.ts: re-authored coast (south ocean + AZURE BAY northward dent,
  estuary at bay head, headland peninsula w/ cliff tip), PORT AZURE
  harbor (piers/breakwater/buoys/warehouses/crates), islands (OSTROV
  VOLNY 600x400, KAMEN, west shoal), sea ring closure via south
  margin, sea.bounds for renderer culling, entry (8000,5900) +
  anchorage (7050,5650). [bug hunt: Edit tool false-negatives +
  VELIKY/VELIKIY grep typo cost an hour — verified via python disk
  read-back]
- terrain.ts: 8192x6144. New relief: NORTH RIDGE 5-crest mountains
  (~120m), HILL 204 (76m), HILL 163, central ridge, KRAKEN plateau
  ramp, valley carve 230m. River SEVERNAYA NW→estuary w/ NORTH/
  WEST/CENTRAL bridges + FORD; 12 roads (MSR VEGA spine, HWY 14,
  west/city/east/littoral/airfield loop/lanes/ford track), rail
  mainline + PORT spur. buildCity (NOVY GOROD: BLOCK apartments S
  bank, old town+church N bank, east suburb), buildAirfield (runway
  560m w/ numbers 09/27 + taxi + aprons + HANGARs + TOWER), 4 works
  (MOLot 9 / ZAVOD WEST neutral / ZAVOD EAST / AZURE REFINERY),
  3 villages + VOSTOK/VOSTOCHNY east enrichment, 8 farms, trenches
  at 9 positions, 22 walls, 9 barrier fields, power corridor, ~35
  labels, 8 spot heights, 157 buildings, ~1955 trees (34m step),
  420 rocks. PERF: 8m master height grid (heightAt8) drives wash
  hillshade + tiled 1km contours (ContourTile[]), minor contours
  gated below zoom 0.16, labels world-metric w/ 8.5px floor.
- terrainRender.ts: wash via heightAt8 (no per-pixel noise), tiled
  contour stroking, sea bounds from coast, drawRunways (slab/
  centerline/thresholds/09-27 numbers), rail spur rendering,
  BLOCK/HANGAR/TOWER art (stairwell cores, ribbed vaults, radar
  cab), furniture 1:20 000 + AZURE COAST THEATRE.
- scenario.ts: full rewrite — 12 friendly (incl RIFLE 1 + IRON 1
  VULCAN start) vs 44 enemy in 8 named groups; 14 sectors; 4
  objectives (ECHO city, FOXTROT hill, GOLF airfield, KRAKEN HQ);
  anchors incl bridges/rallies/staging; briefing rewritten for the
  new geography.
- economy/Game/vision/units: new entries/assembly/rally, ENEMY_UNIT_
  CAP 16→46 (exported), camera from terrain dims + minZoom 0.05
  floor (full-theater view), focusOn staging, boot screen in
  GameShell (PLOTTING THE THEATRE), vision grid from terrain dims,
  air RTB exits, patrol default = spawn pos.
- AI REBUILD (systems/ai/): intel.ts — IntelSystem: contacts from
  enemy visibleTargets only, confidence decay 45s, strengthNear,
  bestCluster, armoredMass. index.ts — EnemyCommander 3 layers:
  8 BattleGroups (proximity init + reinforcement adoption to
  hottest), STRATEGIC (6s): HQ alarm, factory-loss retake plans,
  lost-home-sector retakes (homeSectors snapshot — never retakes
  ground he never held), neutral-works land grab at start (WEST
  group races player to ZAVOD WEST), recon probes toward blind
  frontiers. TACTICAL (2.2s): HOLD (hold ground w/ emplaced SAM),
  ATTACK (route choice scoring 4 crossings by distance+danger,
  arty prep volley, SHORAD rolls with spearhead, CAS launch, real
  victory check = target flag AND boots on objective, anchor
  advance + dig in on win), WITHDRAW at <42% strength, REGROUP 50s
  → reformed return to line. Artillery: confirmed clusters only,
  counter-battery displacement, shore fire vs fleet. Unit survival
  (hp<30% falls to rally), naval: wolfpack sorties on SPOTTED hulls
  only, damaged hulls retire at 40%, CAS hunts fleet. spendInk:
  needs-based (MSAM vs air, AD, CAS vs armor mass, PT vs fleet,
  recon/arty/tank) + counterstroke hoarding, respects unit cap.
- Dev infra: dev server via scripts/dev-daemon.py double-fork
  (tool-spawned procs are killed between calls).

TESTED LIVE (agent-browser + VLM):
- boot: PLOTTING THEATRE screen → briefing → 55 units, zero errors
- staging view 9/10 · city 9/10 (blocks+church+trenches+ruins+enemy
  dug in) · airfield 9/10 (runway numbers, hangars, SU-25s parked)
  · bay 7/10 · theater 8/10 "coherent large military theater"
- pathfinding staging→central bridge 3 waypoints; scout engaged in
  city fight en route
- AI stories verified: WESTWORKS ASSAULT BROKEN—WITHDRAWING; ENEMY
  MOVES TO RETAKE; HQ RESERVE TOOK THE GROUND BACK AND DIGGING IN;
  CLAW launches vs armor mass; ENEMY REINFORCEMENTS—TANK PLATOON;
  recon probes dying on mission; unit-level WITHDRAWING UNDER
  PRESSURE; naval: SORTIEING + SHORE BATTERIES FIRING → both my
  hulls SUNK by 3-PT wolfpack + shore guns; fleet hidden until
  spotted (intel-honest)
- fixed during test: false counterattack victory (any enemy sector
  near obj), opening CAS wipe of undefended staging (player now
  starts with VULCAN; CAS only for real strokes), SOUTH FARMS flip
  by lone recon (sector covers staging now; probes are passive
  moves), unit cap 24 < starting force (bought nothing all game)
- perf: 47fps @1x / ~20fps @4x headless SwiftShader with 68-73
  units (V1.5 parity: land==sea==theater; real browsers HW-render)

Stage Summary:
- PART I + II shipped and live-verified. Theater: 8x6km, named
  geography, city/airfield/port landmarks, road hierarchy, tiled
  contours, boot screen. AI: intel-driven 3-layer commander with
  retreat/regroup/counterattack cycles and combined-arms answers.
  NEXT: PART III landing page + screenshots.
