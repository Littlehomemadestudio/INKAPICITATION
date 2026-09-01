'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · Multiplayer Battlefield (REAL ENGINE)
// Uses the actual Game class, Renderer, TerrainRenderer, unit
// drawing functions, effects, and HUD — identical to single-player.
// The only difference: sim runs on the server, client syncs snapshots.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from '@/game/Game';
import type { HudSnapshot, AfterActionReport } from '@/game/core/types';
import { TopBar, BottomBar, CommsFeed, CursorModeChip } from '@/components/game/hud/HudBars';
import { EndOverlay } from '@/components/game/hud/Overlays';
import { Arsenal } from '@/components/game/hud/Arsenal';
import { useMultiplayer, connectionQuality } from '@/game/net/client/useMultiplayer';
import { MP_BATTALIONS, CommandPayload } from '@/game/net/protocol';
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
  }, [snapshot, gameRef.current]);

  // ── Capture AAR when match ends ──
  useEffect(() => {
    if (hud?.result && gameRef.current) {
      setAar(gameRef.current.buildAAR());
    }
  }, [hud?.result]);

  const restart = useCallback(() => {
    // In MP, "restart" means return to lobby
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

      {/* MP-specific top-right overlay: network status + leave */}
      <div className="absolute top-2.5 right-3 z-30 flex items-center gap-3 pointer-events-auto">
        <NetworkIndicator quality={quality} ping={state.ping} status={state.status} />
        <button
          className="ps-btn"
          style={{ fontSize: 9, padding: '3px 8px' }}
          onClick={() => {
            // Leave match — go back to landing
            window.location.href = '/';
          }}
        >
          EXIT
        </button>
      </div>

      <BottomBar hud={hud} minimapRef={minimapRef} gameRef={gameRef} />

      <CommsFeed hud={hud} />
      <CursorModeChip hud={hud} />

      {/* arsenal — uses the real Arsenal component */}
      {!hud?.result && hud?.arsenalOpen && (
        <Arsenal hud={hud} gameRef={gameRef} />
      )}

      {/* MP battalion deploy bar — replaces the SP deploy panel with MP roster */}
      {!booting && !hud?.result && hud?.running && (
        <MPDeployBar hud={hud} gameRef={gameRef} />
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

// ── MP Deploy Bar ───────────────────────────────────────────
// Replaces the single-player deploy panel with the MP battalion roster.
// Uses the same visual language as the SP arsenal.

import { useRef as useReactRef, type MutableRefObject } from 'react';
import type { Game } from '@/game/Game';

function MPDeployBar({ hud, gameRef }: {
  hud: HudSnapshot | null;
  gameRef: MutableRefObject<Game | null>;
}) {
  const ink = hud?.ink ?? 0;
  const scrollRef = useReactRef<HTMLDivElement | null>(null);

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-auto"
      style={{ bottom: 'calc(var(--ps-h-bottom) + 8px)' }}
    >
      <div
        ref={scrollRef}
        className="flex gap-1 bg-[#12110e] border border-[#36322a] p-1.5 ps-scroll overflow-x-auto"
        style={{ maxWidth: '70vw' }}
      >
        {MP_BATTALIONS.map(b => {
          const affordable = ink >= b.cost;
          return (
            <button
              key={b.id}
              className="ps-deploy-btn"
              disabled={!affordable}
              onClick={() => gameRef.current?.queueBattalion(b.id)}
              style={{ minWidth: 92 }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] tracking-[0.08em] text-[#d9d6cc]" style={{ textTransform: 'uppercase' }}>
                  {b.name}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span
                  aria-hidden
                  className="inline-block"
                  style={{
                    width: 7, height: 8,
                    background: '#f3f1ea',
                    clipPath: 'polygon(50% 0%, 100% 62%, 78% 100%, 22% 100%, 0% 62%)',
                    opacity: affordable ? 1 : 0.3,
                  }}
                />
                <span className="font-mono text-[9px] text-[#8d887b]">{b.cost}</span>
                <span className="ml-auto ps-kind-chip" data-k={b.branch === 'AIR' ? 'AIR' : b.branch === 'NAVAL' ? 'SEA' : 'GROUND'}>
                  {b.branch === 'AIR' ? 'AIR' : b.branch === 'NAVAL' ? 'SEA' : 'GRD'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
