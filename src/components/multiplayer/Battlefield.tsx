'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · Multiplayer Battlefield
// Canvas renderer that draws streamed GameStateSnapshots.
// Includes: network interpolation, command input, HUD overlay.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMultiplayer } from '@/game/net/client/useMultiplayer';
import {
  GameStateSnapshot, UnitSnapshot, MP_UNIT_DEFS, MP_BATTALIONS,
  ClientCommand, CommandPayload, MP_MAPS, Team, NET,
} from '@/game/net/protocol';

// ── Interpolated unit state ──
interface InterpUnit {
  id: number;
  type: string;
  team: Team;
  owner: string;
  callsign: string;
  // Display position (interpolated)
  dx: number; dy: number;
  // Target position (latest snapshot)
  tx: number; ty: number;
  // Velocity estimate (for prediction)
  vx: number; vy: number;
  angle: number; turretAngle: number;
  hp: number; maxHp: number;
  ammo: number; maxAmmo: number;
  dead: boolean;
  orderType: string;
  airState?: string;
  sinking?: boolean;
  intel: string;
  suppression: number;
  damageFlash: number;
  lastUpdate: number;
}

export function Battlefield() {
  const { state, sendCommand } = useMultiplayer();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef({ x: 4000, y: 3000, zoom: 0.18, viewW: 1280, viewH: 720 });
  const interpUnitsRef = useRef<Map<number, InterpUnit>>(new Map());
  const selectionRef = useRef<Set<number>>(new Set());
  const cursorModeRef = useRef<'NORMAL' | 'ATTACK_MOVE' | 'FIRE_MISSION'>('NORMAL');
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const [selection, setSelection] = useState<UnitSnapshot[]>([]);
  const [cursorMode, setCursorMode] = useState<'NORMAL' | 'ATTACK_MOVE' | 'FIRE_MISSION'>('NORMAL');
  const [comms, setComms] = useState<{ text: string; level: string; id: number }[]>([]);
  const commsIdRef = useRef(1);
  const lastSnapshotTickRef = useRef(0);

  const snapshot = state.latestSnapshot;
  const mapDef = snapshot ? MP_MAPS[state.lobby?.config.map ?? 'COASTAL_THEATER'] : null;

  const addComm = useCallback((text: string, level: string = 'info') => {
    setComms(prev => [{ text, level, id: commsIdRef.current++ }, ...prev].slice(0, 6));
  }, []);

  // ── Render loop ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    let raf = 0;
    let lastT = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      cameraRef.current.viewW = rect.width;
      cameraRef.current.viewH = rect.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      // Interpolate units toward target
      const interpUnits = interpUnitsRef.current;
      for (const u of interpUnits.values()) {
        if (u.dead) continue;
        const lerp = NET.INTERP_ALPHA_SMOOTH;
        u.dx += (u.tx - u.dx) * lerp;
        u.dy += (u.ty - u.dy) * lerp;
      }

      // Render
      const cam = cameraRef.current;
      ctx.fillStyle = '#f3f1ea';
      ctx.fillRect(0, 0, cam.viewW, cam.viewH);

      // Draw world
      ctx.save();
      ctx.translate(cam.viewW / 2, cam.viewH / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      if (mapDef) {
        drawTerrain(ctx, mapDef);
        drawSectors(ctx, snapshot, mapDef);
      }

      // Draw units
      for (const u of interpUnits.values()) {
        drawUnit(ctx, u, snapshot?.myTeam);
      }

      // Draw projectiles
      if (snapshot) {
        for (const p of snapshot.projectiles) {
          ctx.fillStyle = p.team === snapshot.myTeam ? '#17150f' : '#5d584d';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
          // Trail
          ctx.strokeStyle = p.team === snapshot.myTeam ? 'rgba(23,21,15,0.3)' : 'rgba(93,88,77,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
          ctx.stroke();
        }
      }

      // Draw selection rings
      if (snapshot) {
        ctx.strokeStyle = '#17150f';
        ctx.lineWidth = 1.5 / cam.zoom;
        for (const id of selectionRef.current) {
          const u = interpUnits.get(id);
          if (!u || u.dead) continue;
          ctx.beginPath();
          ctx.arc(u.dx, u.dy, 14, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Draw drag selection box
      if (isDraggingRef.current && dragStartRef.current) {
        const start = screenToWorld(dragStartRef.current, cam);
        const end = screenToWorld(lastMouseRef.current, cam);
        ctx.strokeStyle = '#17150f';
        ctx.lineWidth = 1 / cam.zoom;
        ctx.setLineDash([4 / cam.zoom, 4 / cam.zoom]);
        ctx.strokeRect(
          Math.min(start.x, end.x), Math.min(start.y, end.y),
          Math.abs(end.x - start.x), Math.abs(end.y - start.y)
        );
        ctx.setLineDash([]);
      }

      ctx.restore();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [snapshot, mapDef]);

  // ── Snapshot processing — update interp targets ──────────
  useEffect(() => {
    if (!snapshot) return;
    if (snapshot.tick === lastSnapshotTickRef.current) return;
    lastSnapshotTickRef.current = snapshot.tick;

    const interpUnits = interpUnitsRef.current;
    const seen = new Set<number>();

    for (const su of snapshot.units) {
      seen.add(su.id);
      const existing = interpUnits.get(su.id);
      if (existing) {
        // Update target
        const dx = su.x - existing.tx;
        const dy = su.y - existing.ty;
        existing.tx = su.x;
        existing.ty = su.y;
        existing.vx = dx * NET.TICK_RATE;
        existing.vy = dy * NET.TICK_RATE;
        existing.angle = su.angle;
        existing.turretAngle = su.turretAngle;
        existing.hp = su.hp;
        existing.ammo = su.ammo;
        existing.dead = su.dead;
        existing.orderType = su.orderType;
        existing.airState = su.airState;
        existing.sinking = su.sinking;
        existing.intel = su.intel;
        existing.suppression = su.suppression;
        existing.damageFlash = su.damageFlash;
        existing.lastUpdate = Date.now();
      } else {
        // New unit
        interpUnits.set(su.id, {
          id: su.id, type: su.type, team: su.team, owner: su.owner, callsign: su.callsign,
          dx: su.x, dy: su.y, tx: su.x, ty: su.y, vx: 0, vy: 0,
          angle: su.angle, turretAngle: su.turretAngle,
          hp: su.hp, maxHp: su.maxHp, ammo: su.ammo, maxAmmo: su.maxAmmo,
          dead: su.dead, orderType: su.orderType, airState: su.airState,
          sinking: su.sinking, intel: su.intel,
          suppression: su.suppression, damageFlash: su.damageFlash,
          lastUpdate: Date.now(),
        });
      }
    }

    // Remove units no longer in snapshot (after grace period)
    for (const [id, u] of interpUnits) {
      if (!seen.has(id) && Date.now() - u.lastUpdate > 2000) {
        interpUnits.delete(id);
      }
    }

    // Update selection snapshot for HUD
    const selUnits: UnitSnapshot[] = [];
    for (const id of selectionRef.current) {
      const su = snapshot.units.find(u => u.id === id);
      if (su) selUnits.push(su);
    }
    setSelection(selUnits);
  }, [snapshot]);

  // ── Input handling ───────────────────────────────────────
  const lastMouseRef = useRef({ x: 0, y: 0 });

  const screenToWorld = (sx: number, sy: number, cam: typeof cameraRef.current) => {
    return {
      x: cam.x + (sx - cam.viewW / 2) / cam.zoom,
      y: cam.y + (sy - cam.viewH / 2) / cam.zoom,
    };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const cam = cameraRef.current;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    lastMouseRef.current = { x: sx, y: sy };

    if (e.button === 0) {
      // Left click — select or drag-select
      const world = screenToWorld(sx, sy, cam);
      const interpUnits = interpUnitsRef.current;

      // Find clickable unit (only own units)
      let clicked: InterpUnit | null = null;
      let bestD = 16 / cam.zoom;
      for (const u of interpUnits.values()) {
        if (u.dead) continue;
        if (u.owner !== state.profile?.playerId) continue;
        const d = Math.hypot(u.dx - world.x, u.dy - world.y);
        if (d < bestD) { bestD = d; clicked = u; }
      }

      if (clicked) {
        if (!e.shiftKey) selectionRef.current.clear();
        selectionRef.current.add(clicked.id);
        setSelection([...interpUnits.values()].filter(u => selectionRef.current.has(u.id))
          .map(u => ({
            id: u.id, type: u.type, owner: u.owner, team: u.team, callsign: u.callsign,
            x: u.tx, y: u.ty, angle: u.angle, turretAngle: u.turretAngle,
            hp: u.hp, maxHp: u.maxHp, ammo: u.ammo, maxAmmo: u.maxAmmo,
            dead: u.dead, orderType: u.orderType, intel: 'OWN' as any,
          })));
      } else {
        // Start drag selection
        dragStartRef.current = { x: sx, y: sy };
        isDraggingRef.current = true;
        if (!e.shiftKey) {
          selectionRef.current.clear();
          setSelection([]);
        }
      }
    } else if (e.button === 2) {
      // Right click — issue order
      e.preventDefault();
      issueOrderAt(sx, sy, e.shiftKey);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    lastMouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    // Pan camera with middle mouse or edge pan
    if (e.buttons === 4) {
      // middle mouse drag
    }
    // Edge pan
    const cam = cameraRef.current;
    const PAN_EDGE = 24;
    const PAN_SPEED = 800;
    if (lastMouseRef.current.x < PAN_EDGE) cam.x -= PAN_SPEED * 0.016 / cam.zoom;
    if (lastMouseRef.current.x > cam.viewW - PAN_EDGE) cam.x += PAN_SPEED * 0.016 / cam.zoom;
    if (lastMouseRef.current.y < PAN_EDGE) cam.y -= PAN_SPEED * 0.016 / cam.zoom;
    if (lastMouseRef.current.y > cam.viewH - PAN_EDGE) cam.y += PAN_SPEED * 0.016 / cam.zoom;
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (isDraggingRef.current && dragStartRef.current) {
      const cam = cameraRef.current;
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const end = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, cam);
      const start = screenToWorld(dragStartRef.current.x, dragStartRef.current.y, cam);
      const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y);

      const interpUnits = interpUnitsRef.current;
      for (const u of interpUnits.values()) {
        if (u.dead) continue;
        if (u.owner !== state.profile?.playerId) continue;
        if (u.dx >= minX && u.dx <= maxX && u.dy >= minY && u.dy <= maxY) {
          selectionRef.current.add(u.id);
        }
      }
      setSelection([...interpUnits.values()].filter(u => selectionRef.current.has(u.id))
        .map(u => ({
          id: u.id, type: u.type, owner: u.owner, team: u.team, callsign: u.callsign,
          x: u.tx, y: u.ty, angle: u.angle, turretAngle: u.turretAngle,
          hp: u.hp, maxHp: u.maxHp, ammo: u.ammo, maxAmmo: u.maxAmmo,
          dead: u.dead, orderType: u.orderType, intel: 'OWN' as any,
        })));
    }
    isDraggingRef.current = false;
    dragStartRef.current = null;
  };

  const issueOrderAt = (sx: number, sy: number, queue: boolean) => {
    const cam = cameraRef.current;
    const world = screenToWorld(sx, sy, cam);
    const interpUnits = interpUnitsRef.current;
    const unitIds = [...selectionRef.current];

    if (!unitIds.length) return;

    // Check if clicking on enemy unit → attack
    let target: InterpUnit | null = null;
    let bestD = 16 / cam.zoom;
    for (const u of interpUnits.values()) {
      if (u.dead) continue;
      if (u.team === state.latestSnapshot?.myTeam) continue;
      const d = Math.hypot(u.dx - world.x, u.dy - world.y);
      if (d < bestD) { bestD = d; target = u; }
    }

    let payload: CommandPayload;
    if (target) {
      payload = { kind: 'ATTACK', unitIds, targetId: target.id };
      addComm(`ATTACK ORDER — ${unitIds.length} UNITS`, 'info');
    } else if (cursorModeRef.current === 'FIRE_MISSION') {
      payload = { kind: 'FIRE_MISSION', unitIds, x: world.x, y: world.y };
      addComm(`FIRE MISSION — ${world.x.toFixed(0)},${world.y.toFixed(0)}`, 'alert');
    } else if (cursorModeRef.current === 'ATTACK_MOVE') {
      payload = { kind: 'ATTACK_MOVE', unitIds, x: world.x, y: world.y };
      addComm(`ATTACK-MOVE — ${world.x.toFixed(0)},${world.y.toFixed(0)}`, 'info');
    } else {
      payload = { kind: 'MOVE', unitIds, x: world.x, y: world.y };
      addComm(`MOVE ORDER — ${world.x.toFixed(0)},${world.y.toFixed(0)}`, 'info');
    }

    sendCommand({ tick: lastSnapshotTickRef.current, payload });
    setCursorMode('NORMAL');
    cursorModeRef.current = 'NORMAL';
  };

  const onWheel = (e: React.WheelEvent) => {
    const cam = cameraRef.current;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    cam.zoom = Math.max(0.05, Math.min(0.6, cam.zoom * factor));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'a' || e.key === 'A') {
      setCursorMode('ATTACK_MOVE');
      cursorModeRef.current = 'ATTACK_MOVE';
    } else if (e.key === 'f' || e.key === 'F') {
      setCursorMode('FIRE_MISSION');
      cursorModeRef.current = 'FIRE_MISSION';
    } else if (e.key === 's' || e.key === 'S') {
      sendCommand({ tick: lastSnapshotTickRef.current, payload: { kind: 'STOP', unitIds: [...selectionRef.current] } });
    } else if (e.key === 'h' || e.key === 'H') {
      sendCommand({ tick: lastSnapshotTickRef.current, payload: { kind: 'HOLD', unitIds: [...selectionRef.current] } });
    } else if (e.key === 'Escape') {
      setCursorMode('NORMAL');
      cursorModeRef.current = 'NORMAL';
      selectionRef.current.clear();
      setSelection([]);
    }
  };

  // ── Camera follow own units on first spawn ─────────────
  useEffect(() => {
    if (!snapshot) return;
    const myUnits = snapshot.units.filter(u => u.owner === snapshot.myPlayerId && !u.dead);
    if (myUnits.length > 0) {
      const cam = cameraRef.current;
      const cx = myUnits.reduce((a, u) => a + u.x, 0) / myUnits.length;
      const cy = myUnits.reduce((a, u) => a + u.y, 0) / myUnits.length;
      // Only snap on first spawn (when units list is fresh)
      if (cam.x === 4000 && cam.y === 3000) {
        cam.x = cx; cam.y = cy;
      }
    }
  }, [snapshot?.myPlayerId]);

  if (!snapshot || !mapDef) {
    return <div className="mp-card">NO SNAPSHOT</div>;
  }

  const myInk = snapshot.ink[snapshot.myTeam];
  const myIncome = snapshot.income[snapshot.myTeam];

  return (
    <div className="mp-battlefield" style={{ background: '#f3f1ea' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        tabIndex={0}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: cursorMode === 'NORMAL' ? 'crosshair' : 'target' }}
      />

      {/* Top HUD */}
      <div className="mp-hud-top">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="mp-hud-ink">
            <span className="mp-hud-ink-mark" />
            <span>{Math.floor(myInk)}</span>
            <span style={{ fontSize: 9, color: 'var(--ps-dim)', marginLeft: 4 }}>
              +{myIncome.toFixed(1)}/s
            </span>
          </div>
          <div style={{
            background: 'rgba(18, 17, 14, 0.85)',
            border: '1px solid var(--ps-line)',
            padding: '6px 12px',
            fontSize: 10,
            color: 'var(--ps-paper)',
            letterSpacing: '0.12em',
          }}>
            BLACK {snapshot.alivePerTeam.BLACK} · GRAY {snapshot.alivePerTeam.GRAY}
          </div>
          <div style={{
            background: 'rgba(18, 17, 14, 0.85)',
            border: '1px solid var(--ps-line)',
            padding: '6px 12px',
            fontSize: 10,
            color: 'var(--ps-paper)',
            letterSpacing: '0.12em',
          }}>
            {Math.floor(snapshot.time / 60)}:{String(Math.floor(snapshot.time % 60)).padStart(2, '0')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="mp-section-label" style={{ color: 'var(--ps-paper)' }}>
            {snapshot.myTeam} FORCES
          </span>
        </div>
      </div>

      {/* Comms feed */}
      <div className="mp-comms-feed">
        {comms.map(c => (
          <div key={c.id} className="mp-comms-line" data-lvl={c.level}>
            {c.text}
          </div>
        ))}
      </div>

      {/* Cursor mode chip */}
      {cursorMode !== 'NORMAL' && (
        <div style={{
          position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--ps-paper)', color: 'var(--ps-ink)',
          padding: '4px 12px', fontSize: 10, letterSpacing: '0.18em',
          zIndex: 11,
        }}>
          {cursorMode.replace('_', ' ')} — CLICK TARGET
        </div>
      )}

      {/* Bottom HUD — arsenal + selection */}
      <div className="mp-hud-bottom">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
          {/* Selection bar */}
          {selection.length > 0 && (
            <div className="mp-selection-bar" style={{ maxWidth: 560 }}>
              {selection.length} UNIT{selection.length > 1 ? 'S' : ''} SELECTED ·
              {' '}{selection.map(u => MP_UNIT_DEFS[u.type]?.shortName || u.type).slice(0, 6).join(' ')}
              {selection.length > 6 && ' …'}
            </div>
          )}
          {/* Arsenal */}
          <div className="mp-arsenal">
            {MP_BATTALIONS.map(b => (
              <button
                key={b.id}
                className="mp-arsenal-btn"
                disabled={myInk < b.cost}
                onClick={() => {
                  sendCommand({
                    tick: lastSnapshotTickRef.current,
                    payload: { kind: 'QUEUE_BATTALION', battalionId: b.id },
                  });
                  addComm(`${b.name} QUEUED — ${b.cost} INK`, 'economy');
                }}>
                <span className="mp-arsenal-name">{b.name}</span>
                <span className="mp-arsenal-cost">
                  <span className="mp-hud-ink-mark" style={{ width: 7, height: 8, display: 'inline-block', marginRight: 3 }} />
                  {b.cost}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Production queue */}
      {snapshot.productions.length > 0 && (
        <div style={{
          position: 'absolute', top: 56, right: 16,
          background: 'rgba(18, 17, 14, 0.85)',
          border: '1px solid var(--ps-line)',
          padding: 8, fontSize: 10, color: 'var(--ps-paper)',
          letterSpacing: '0.06em',
          minWidth: 180,
          zIndex: 10,
        }}>
          <div style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--ps-faint)', marginBottom: 6 }}>
            PRODUCTION
          </div>
          {snapshot.productions.map(p => (
            <div key={p.id} style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{p.name}</span>
                <span style={{ color: 'var(--ps-dim)' }}>{Math.ceil(p.remainingSec)}s</span>
              </div>
              <div className="ps-bar" style={{ marginTop: 2 }}>
                <i style={{ width: `${p.progress * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Match result banner */}
      {snapshot.result && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(18, 17, 14, 0.85)',
          zIndex: 50,
        }}>
          <div style={{ fontSize: 12, letterSpacing: '0.4em', color: 'var(--ps-dim)', marginBottom: 12 }}>
            OPERATION COMPLETE
          </div>
          <div style={{
            fontFamily: 'var(--font-display), Georgia, serif',
            fontSize: 48, color: 'var(--ps-paper)', fontWeight: 700,
          }}>
            {snapshot.result === 'BLACK_VICTORY' ? 'BLACK FORCES VICTORIOUS' :
             snapshot.result === 'GRAY_VICTORY' ? 'GRAY FORCES VICTORIOUS' :
             snapshot.result === 'DRAW' ? 'STALEMATE' : 'OPERATION ABORTED'}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, letterSpacing: '0.18em', color: 'var(--ps-dim)' }}>
            {snapshot.result.includes(snapshot.myTeam) ? 'YOUR FORCES PREVAIL' : 'YOUR FORCES ARE DEFEATED'}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Drawing helpers ─────────────────────────────────────────

function drawTerrain(ctx: CanvasRenderingContext2D, map: any) {
  // Simple grid + coastline effect
  ctx.fillStyle = '#f3f1ea';
  ctx.fillRect(0, 0, map.worldW, map.worldH);

  // Subtle terrain noise
  ctx.fillStyle = 'rgba(180, 175, 162, 0.18)';
  for (let x = 0; x < map.worldW; x += 200) {
    for (let y = 0; y < map.worldH; y += 200) {
      const h = (Math.sin(x * 0.013) * Math.cos(y * 0.011) + 1) / 2;
      if (h > 0.6) {
        ctx.beginPath();
        ctx.arc(x + 100, y + 100, 80, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Grid
  ctx.strokeStyle = 'rgba(180, 175, 162, 0.25)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= map.worldW; x += 500) {
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, map.worldH);
    ctx.stroke();
  }
  for (let y = 0; y <= map.worldH; y += 500) {
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(map.worldW, y);
    ctx.stroke();
  }

  // World border
  ctx.strokeStyle = '#5d584d';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, map.worldW, map.worldH);

  // Spawn markers
  ctx.fillStyle = 'rgba(26, 26, 26, 0.4)';
  ctx.beginPath();
  ctx.arc(map.blackSpawn.x, map.blackSpawn.y, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(107, 101, 90, 0.4)';
  ctx.beginPath();
  ctx.arc(map.graySpawn.x, map.graySpawn.y, 60, 0, Math.PI * 2);
  ctx.fill();
}

function drawSectors(ctx: CanvasRenderingContext2D, snapshot: GameStateSnapshot | null, map: any) {
  if (!snapshot) return;
  for (const s of snapshot.sectors) {
    const color =
      s.control === 'BLACK' ? 'rgba(26, 26, 26, 0.22)' :
      s.control === 'GRAY' ? 'rgba(107, 101, 90, 0.22)' :
      'rgba(140, 135, 122, 0.12)';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8d887b';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Capture progress
    if (s.capturing && s.captureProgress > 0) {
      ctx.strokeStyle = s.capturing === 'BLACK' ? '#1a1a1a' : '#6b655a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.captureProgress);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = '#403c33';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(s.name, s.x, s.y - 4);
    ctx.font = '9px monospace';
    ctx.fillText(s.control, s.x, s.y + 10);
  }
}

function drawUnit(ctx: CanvasRenderingContext2D, u: InterpUnit, myTeam?: Team) {
  if (u.dead && !u.sinking) return;
  const def = MP_UNIT_DEFS[u.type];
  const isOwn = u.intel === 'OWN';
  const isAllied = myTeam && u.team === myTeam;
  const isVisible = u.intel === 'OWN' || u.intel === 'DETECTED';

  if (u.intel === 'GHOST') {
    // Ghost — show faded silhouette at last known position
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = u.team === 'BLACK' ? '#1a1a1a' : '#6b655a';
    ctx.beginPath();
    ctx.arc(u.dx, u.dy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  const baseColor = u.team === 'BLACK' ? '#17150f' : '#5d584d';
  const strokeColor = u.team === 'BLACK' ? '#000' : '#403c33';

  ctx.save();
  ctx.translate(u.dx, u.dy);
  ctx.rotate(u.angle);

  // Body
  if (u.type === 'HQ') {
    // Square HQ marker
    ctx.fillStyle = baseColor;
    ctx.fillRect(-20, -20, 40, 40);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(-20, -20, 40, 40);
    // Cross
    ctx.strokeStyle = '#f3f1ea';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, 0); ctx.lineTo(12, 0);
    ctx.moveTo(0, -12); ctx.lineTo(0, 12);
    ctx.stroke();
  } else if (def?.isShip) {
    // Ship hull
    const L = def.length * 0.4;
    const W = def.width * 0.4;
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(L, 0);
    ctx.lineTo(L * 0.6, -W);
    ctx.lineTo(-L, -W);
    ctx.lineTo(-L, W);
    ctx.lineTo(L * 0.6, W);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Turret
    ctx.fillStyle = strokeColor;
    ctx.fillRect(-4, -3, 8, 6);
  } else if (def?.isAir) {
    // Aircraft triangle
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-8, -7);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-8, 7);
    ctx.closePath();
    ctx.fill();
  } else {
    // Ground vehicle rectangle
    const L = def?.length ?? 8;
    const W = def?.width ?? 4;
    ctx.fillStyle = baseColor;
    ctx.fillRect(-L / 2, -W / 2, L, W);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-L / 2, -W / 2, L, W);
    // Turret
    ctx.fillStyle = strokeColor;
    ctx.fillRect(-2, -2, 5, 4);
  }

  // Damage flash
  if (u.damageFlash > 0.1) {
    ctx.globalAlpha = u.damageFlash * 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // HP bar (above unit) — only for visible units
  if (isVisible && def && u.hp < u.maxHp) {
    const barW = Math.max(12, def.length * 0.4);
    const barH = 2;
    const bx = u.dx - barW / 2;
    const by = u.dy - (def.length * 0.4) - 8;
    ctx.fillStyle = '#d8d4c8';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = u.team === 'BLACK' ? '#17150f' : '#403c33';
    ctx.fillRect(bx, by, barW * (u.hp / u.maxHp), barH);
  }

  // Selected ring (drawn elsewhere)
}

function clockString(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
