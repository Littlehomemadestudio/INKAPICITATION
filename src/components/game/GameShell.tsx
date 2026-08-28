'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · shell
// Mounts the canvas, wires the HUD, owns overlay flow.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from '@/game/Game';
import type { AfterActionReport, HudSnapshot } from '@/game/core/types';
import { TopBar, BottomBar } from './hud/HudBars';
import { BriefingOverlay, EndOverlay, HelpOverlay } from './hud/Overlays';

export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [briefingOpen, setBriefingOpen] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [aarDismissed, setAarDismissed] = useState(false);
  const [seed, setSeed] = useState(0);
  const [aar, setAar] = useState<AfterActionReport | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Game(canvasRef.current, (s) => setHud(s));
    gameRef.current = game;
    setSeed(game.seed);
    if (typeof window !== 'undefined') {
      (window as unknown as { __paperStorm?: Game }).__paperStorm = game;
    }

    const ro = new ResizeObserver(() => game.resize());
    ro.observe(canvasRef.current);

    const mmTimer = window.setInterval(() => {
      const mm = minimapRef.current;
      if (mm && gameRef.current) {
        const ctx = mm.getContext('2d');
        if (ctx) gameRef.current.renderer.drawMinimap(ctx, mm.width, mm.height, gameRef.current);
      }
    }, 160);

    return () => {
      window.clearInterval(mmTimer);
      ro.disconnect();
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  // global hotkeys for pause / speed / sound
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g || !g.running || g.result) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        g.setPaused(!g.paused);
      } else if (k === '1') g.setSpeed(1);
      else if (k === '2') g.setSpeed(2);
      else if (k === '3') g.setSpeed(4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // capture the after-action report once the mission ends
  useEffect(() => {
    if (hud?.result && gameRef.current) {
      setAar(gameRef.current.buildAAR());
    }
  }, [hud?.result]);

  const commence = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.audio.ensureStarted();
    g.audio.uiTick();
    g.startMission();
    setBriefingOpen(false);
  }, []);

  const restart = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.restart();
    setSeed(g.seed);
    setAarDismissed(false);
    setAar(null);
    setBriefingOpen(false);
  }, []);

  const toggleSound = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setSoundOn(g.toggleSound());
  }, []);

  const result = hud?.result ?? null;
  const showEnd = !!result && !briefingOpen && !aarDismissed;
  return (
    <div className="ps-root fixed inset-0 bg-[#161513] overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: 'crosshair' }}
      />

      {/* frame lines */}
      <div className="pointer-events-none absolute inset-x-0 top-10 h-px bg-[#36322a]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-[150px] h-px bg-[#36322a]" />

      <TopBar
        hud={hud}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onHelp={() => setHelpOpen(true)}
        onSpeed={(s) => gameRef.current?.setSpeed(s)}
        onPause={() => gameRef.current?.setPaused(!gameRef.current?.paused)}
      />

      <BottomBar hud={hud} minimapRef={minimapRef} gameRef={gameRef} onLogHover={() => {}} />

      {/* paused veil */}
      {hud?.paused && !result && !briefingOpen && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 border border-[#36322a] bg-[#12110e] px-4 py-1.5">
          <span className="font-mono text-[10px] tracking-[0.3em] text-[#f3f1ea] ps-blink">
            SIMULATION PAUSED
          </span>
          <span className="font-mono text-[9px] tracking-[0.15em] text-[#5d584d] ml-3">[SPACE] RESUME</span>
        </div>
      )}

      {showEnd && <EndOverlay result={result} aar={aar} onRestart={restart} onReview={() => setAarDismissed(true)} />}

      {aarDismissed && result && !briefingOpen && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 border border-[#36322a] bg-[#12110e] px-4 py-1.5 flex items-center gap-4">
          <span className="font-mono text-[10px] tracking-[0.25em] text-[#f3f1ea]">
            {result === 'VICTORY' ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED'} — REVIEWING BATTLEFIELD
          </span>
          <button className="ps-btn" onClick={restart}>
            REDEPLOY · NEW SHEET
          </button>
        </div>
      )}

      {briefingOpen && <BriefingOverlay seed={seed} onCommence={commence} />}

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
