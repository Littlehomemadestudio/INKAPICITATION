'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · Multiplayer Battlefield (REAL ENGINE — FULL PARITY)
// This is the SAME game as single-player — same Game class, same
// Renderer, same TerrainRenderer, same unit drawing, same effects,
// same HUD (TopBar, BottomBar, CommsFeed, Arsenal), same arsenal,
// same battalion roster (FRIEND_BATTALIONS), same deploy panel.
//
// The ONLY difference: the simulation runs on the server, not the
// client. Commands are sent to the server; snapshots are applied
// via syncFromSnapshot(). Everything the player sees and touches is
// identical to single-player.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from '@/game/Game';
import type { HudSnapshot, AfterActionReport } from '@/game/core/types';
import { TopBar, BottomBar, CommsFeed, CursorModeChip } from '@/components/game/hud/HudBars';
import { EndOverlay } from '@/components/game/hud/Overlays';
import { Arsenal } from '@/components/game/hud/Arsenal';
import { useMultiplayer, connectionQuality } from '@/game/net/client/useMultiplayer';
import type { CommandPayload } from '@/game/net/protocol';
import { NetworkIndicator } from './NetworkIndicator';
import Link from 'next/link';

export function Battlefield() {
  const { state, sendCommand } = useMultiplayer();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [booting, setBooting] = useState(true);
  const [aarDismissed, setAarDismissed] = useState(false);
  const [aar, setAar] = useState<AfterActionReport | null>(null);
  const seed = state.latestSnapshot?.seed ?? 0;
  const snapshot = state.latestSnapshot;

  // Command emitter — passed to Game, called by InputSystem
  const onCommand = useCallback((payload: CommandPayload) => {
    sendCommand({ tick: 0, payload });
  }, [sendCommand]);

  // ── Create the real Game in client mode ──
  useEffect(() => {
    if (!canvasRef.current || !seed) return;
    let game: Game | null = null;
    let ro: ResizeObserver | null = null;
    let mmTimer = 0;

    const boot = window.setTimeout(() => {
      if (!canvasRef.current || !seed) return;
      game = new Game(canvasRef.current, (s) => setHud(s), seed, {
        mode: 'client',
        onCommand,
        myPlayerId: state.myPlayerId ?? undefined,
        myTeam: snapshot?.myTeam,
      });
      gameRef.current = game;
      setBooting(false);

      ro = new ResizeObserver(() => game?.resize());
      ro.observe(canvasRef.current);

      mmTimer = window.setInterval(() => {
        const mm = minimapRef.current;
        if (mm && gameRef.current) {
          const ctx = mm.getContext('2d');
          if (ctx) gameRef.current.renderer.drawMinimap(ctx, mm.width, mm.height, gameRef.current);
        }
      }, 160);
    }, 40);

    return () => {
      window.clearTimeout(boot);
      if (mmTimer) window.clearInterval(mmTimer);
      ro?.disconnect();
      game?.dispose();
      gameRef.current = null;
    };
  }, [seed]);

  // ── Sync snapshots into the Game ──
  useEffect(() => {
    const g = gameRef.current;
    if (!g || !snapshot) return;
    g.syncFromSnapshot(snapshot);
    // Focus camera on own units on first snapshot
    if (g.camera.x === 1700 && g.camera.y === 4700) {
      const myUnits = snapshot.units.filter(u => u.owner === snapshot.myPlayerId);
      if (myUnits.length > 0) {
        const cx = myUnits.reduce((a, u) => a + u.x, 0) / myUnits.length;
        const cy = myUnits.reduce((a, u) => a + u.y, 0) / myUnits.length;
        g.camera.focusOn(cx, cy, 0.3);
      }
    }
  }, [snapshot]);

  // ── Capture AAR when match ends ──
  useEffect(() => {
    if (hud?.result && gameRef.current) {
      setAar(gameRef.current.buildAAR());
    }
  }, [hud?.result]);

  const restart = useCallback(() => {
    setAarDismissed(false);
    setAar(null);
  }, []);

  const toggleSound = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.toggleSound();
  }, []);

  const quality = connectionQuality(state.ping, state.status);
  const result = hud?.result ?? null;
  const showEnd = !!result && !aarDismissed;

  return (
    <div className="ps-root fixed inset-0 bg-[#161513] overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: 'crosshair' }}
      />

      {/* boot screen */}
      {booting && (
        <div className="absolute inset-0 bg-[#161513] flex flex-col items-center justify-center gap-3">
          <div className="font-mono text-[11px] tracking-[0.45em] text-[#f3f1ea] ps-blink">
            PLOTTING THE THEATRE
          </div>
          <div className="font-mono text-[9px] tracking-[0.25em] text-[#5d584d]">
            SYNCHRONIZING WITH COMMAND AUTHORITY
          </div>
        </div>
      )}

      {/* frame lines */}
      <div className="pointer-events-none absolute inset-x-0 top-10 h-px bg-[#36322a]" />
      <div className="pointer-events-none absolute inset-x-0 h-px bg-[#36322a]" style={{ bottom: 'var(--ps-h-bottom)' }} />

      <TopBar
        hud={hud}
        soundOn={true}
        onToggleSound={toggleSound}
        onHelp={() => {}}
        onSpeed={(s) => gameRef.current?.setSpeed(s)}
        onPause={() => gameRef.current?.setPaused(!gameRef.current?.paused)}
      />

      {/* MP-specific top-right overlay: network status + exit.
          This is the ONLY thing added beyond the single-player HUD.
          It coexists with the real HUD — does not replace it. */}
      <div className="absolute top-2.5 right-3 z-30 flex items-center gap-3 pointer-events-auto">
        <NetworkIndicator quality={quality} ping={state.ping} status={state.status} />
        <button
          className="ps-btn"
          style={{ fontSize: 9, padding: '3px 8px' }}
          onClick={() => { window.location.href = '/'; }}
        >
          EXIT
        </button>
      </div>

      {/* The real BottomBar — includes the deploy panel with the
          full FRIEND_BATTALIONS roster, same as single-player.
          No MPDeployBar, no simplified roster. */}
      <BottomBar hud={hud} minimapRef={minimapRef} gameRef={gameRef} />

      <CommsFeed hud={hud} />
      <CursorModeChip hud={hud} />

      {/* The real Arsenal — same component as single-player, reads
          hud.battalions which is FRIEND_BATTALIONS in both modes. */}
      {!hud?.result && hud?.arsenalOpen && (
        <Arsenal hud={hud} gameRef={gameRef} />
      )}

      {/* paused veil */}
      {hud?.paused && !result && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 border border-[#36322a] bg-[#12110e] px-4 py-1.5">
          <span className="font-mono text-[10px] tracking-[0.3em] text-[#f3f1ea] ps-blink">
            SIMULATION PAUSED
          </span>
        </div>
      )}

      {showEnd && <EndOverlay result={result} aar={aar} onRestart={restart} onReview={() => setAarDismissed(true)} />}

      {aarDismissed && result && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 border border-[#36322a] bg-[#12110e] px-4 py-1.5 flex items-center gap-4">
          <span className="font-mono text-[10px] tracking-[0.25em] text-[#f3f1ea]">
            {result === 'VICTORY' ? 'OPERATION COMPLETE' : 'OPERATION FAILED'} — REVIEWING BATTLEFIELD
          </span>
          <Link href="/" className="ps-btn" style={{ textDecoration: 'none' }}>
            RETURN TO COMMAND
          </Link>
        </div>
      )}
    </div>
  );
}
