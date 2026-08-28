'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · the command deck
// Top strip: operation status + ink ledger.
// Bottom: ONE docked grid — MAP · FORMATION · DEPLOY · DETAIL ·
// AIR. Comms traffic rides the battlefield itself (top-left),
// the way every staff map worth reading works.
// No scrollbars anywhere: the deck reflows, it never scrolls.
// Verified 1366×768 · 1440×900 · 1920×1080.
// ─────────────────────────────────────────────────────────────

import type { RefObject } from 'react';
import { useState } from 'react';
import type { HudSnapshot, LogEntry, BattalionDef } from '@/game/core/types';
import type { Game } from '@/game/Game';
import { fmtClock } from '@/game/Game';
import type { Branch } from '@/game/entities/roster';
import { UnitGlyph } from './UnitGlyph';

interface TopBarProps {
  hud: HudSnapshot | null;
  soundOn: boolean;
  onToggleSound: () => void;
  onHelp: () => void;
  onSpeed: (s: number) => void;
  onPause: () => void;
}

export function TopBar({ hud, soundOn, onToggleSound, onHelp, onSpeed, onPause }: TopBarProps) {
  const ink = hud?.ink ?? 0;
  const income = hud?.income ?? 0;
  const sectorsHeld = hud?.sectorsHeld ?? 0;
  const sectorsTotal = hud?.sectorsTotal ?? 7;
  const state =
    hud?.result === 'VICTORY' ? 'COMPLETE' : hud?.result === 'DEFEAT' ? 'FAILED' : hud?.paused ? 'PAUSED' : 'EXECUTING';
  return (
    <div className="ps-topbar absolute top-0 inset-x-0 h-10 bg-[#12110e] border-b border-[#36322a] flex items-stretch">
      {/* wordmark */}
      <div className="flex items-center gap-3 pl-4 pr-3 border-r border-[#242119] shrink-0">
        <span className="text-[13px] font-bold tracking-[0.34em] text-[#f3f1ea]">PAPER STORM</span>
        <span className="ps-subtle font-mono text-[9px] tracking-[0.2em] text-[#5d584d] pt-px">OPERATION CROSSWIND</span>
      </div>

      {/* clock + phase */}
      <div className="flex items-center gap-2.5 px-3 border-r border-[#242119] shrink-0">
        <span className="font-mono text-[11px] text-[#d9d6cc] tabular-nums">T+{fmtClock(hud?.missionTime ?? 0)}</span>
        <span
          className={`font-mono text-[9px] tracking-[0.16em] px-1.5 py-[2px] border ${
            hud?.paused && !hud?.result
              ? 'text-[#f3f1ea] border-[#4a453a] bg-[#191713] ps-blink'
              : 'text-[#8d887b] border-[#36322a]'
          }`}
        >
          {state}
        </span>
      </div>

      {/* the ink ledger */}
      <div className="flex items-center gap-2.5 px-3 border-r border-[#242119] shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="ps-ink-mark" aria-hidden />
          <span
            className="font-mono text-[13px] font-semibold text-[#f3f1ea] tabular-nums"
            title="INK — your authority to sustain the operation"
          >
            {ink}
          </span>
          <span className="font-mono text-[8px] tracking-[0.2em] text-[#5d584d] pt-[3px]">INK</span>
        </div>
        <span className="font-mono text-[10px] text-[#8d887b] tabular-nums" title="base + sectors + ink works">
          +{income.toFixed(1)}/S
        </span>
        <span
          className="font-mono text-[9px] tracking-[0.12em] px-2 py-[3px] border text-[#d9d6cc] border-[#36322a]"
          title="sectors held"
        >
          GROUND {sectorsHeld}/{sectorsTotal}
        </span>
      </div>

      {/* objectives — may truncate, never push the controls */}
      <div className="flex-1 min-w-0 flex items-center gap-2 px-3 overflow-hidden">
        {(hud?.objectives ?? []).map((o, i) => (
          <div
            key={o.id}
            className={`ps-obj-chip ${i > 0 ? 'ps-obj-extra' : ''} font-mono text-[9px] tracking-[0.14em] px-2 py-1 border ${
              o.status === 'SECURED'
                ? 'bg-[#f3f1ea] text-[#12110e] border-[#f3f1ea]'
                : 'text-[#8d887b] border-[#36322a]'
            } ${o.primary && o.status !== 'SECURED' ? 'border-dashed' : ''}`}
          >
            {o.name} — {o.status}
          </div>
        ))}
        <span className="font-mono text-[9px] tracking-[0.12em] text-[#5d584d] ml-auto pl-2 shrink-0" title="enemy combat units alive">
          OPFOR {hud?.enemyStrength ?? 0}
        </span>
      </div>

      {/* sim controls — pinned right, always reachable */}
      <div className="flex items-center gap-1.5 pl-2 pr-3 border-l border-[#242119] shrink-0">
        <button className="ps-btn" onClick={onPause} title="Space">
          {hud?.paused ? 'RESUME' : 'PAUSE'}
        </button>
        <div className="flex">
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              className={`ps-btn rounded-none border-r-0 last:border-r ${hud?.speed === s && !hud?.paused ? 'ps-active' : ''}`}
              onClick={() => onSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
        <button className="ps-btn" onClick={onToggleSound}>
          {soundOn ? 'SND ON' : 'SND OFF'}
        </button>
        <button className="ps-btn" onClick={onHelp}>
          HELP
        </button>
      </div>
    </div>
  );
}

// ── comms feed — rides the battlefield, top-left ─────────────

export function CommsFeed({ hud }: { hud: HudSnapshot | null }) {
  const entries = (hud?.log ?? []).slice(0, 8);
  if (!entries.length) return null;
  return (
    <div className="ps-comms pointer-events-none absolute left-2.5 top-[50px] z-10 flex flex-col gap-[2px] max-w-[380px]">
      {entries.map((l, i) => (
        <div
          key={l.id}
          data-level={l.level}
          className="ps-comms-line ps-logline flex gap-2 font-mono text-[9px] leading-[1.4]"
          style={{ opacity: Math.max(0.28, 1 - i * 0.1) }}
        >
          <span className="text-[#5d584d] shrink-0 tabular-nums">{fmtClock(l.time)}</span>
          <span
            className={
              l.level === 'contact' || l.level === 'alert' || l.level === 'objective' || l.level === 'economy'
                ? 'text-[#f3f1ea]'
                : 'text-[#a8a396]'
            }
          >
            {l.text}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── cursor mode chip — what the next click will do ───────────

export function CursorModeChip({ hud }: { hud: HudSnapshot | null }) {
  const m = hud?.cursorMode;
  if (!m || m === 'NORMAL' || hud?.result) return null;
  return (
    <div className="absolute top-[50px] left-1/2 -translate-x-1/2 z-10 pointer-events-none">
      <div className="border border-[#f3f1ea] bg-[#12110e] px-3 py-1 font-mono text-[9px] tracking-[0.22em] text-[#f3f1ea] ps-blink">
        {m === 'ATTACK_MOVE' ? 'ATTACK MOVE ARMED — CLICK DESTINATION' : 'FIRE MISSION ARMED — CLICK TARGET GRID'}
        <span className="text-[#5d584d] ml-2 tracking-[0.1em]">[ESC] CANCEL</span>
      </div>
    </div>
  );
}

// ── bottom: the docked command deck ──────────────────────────

interface BottomBarProps {
  hud: HudSnapshot | null;
  minimapRef: RefObject<HTMLCanvasElement | null>;
  gameRef: RefObject<Game | null>;
}

export function BottomBar({ hud, minimapRef, gameRef }: BottomBarProps) {
  const onMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const g = gameRef.current;
    const mm = minimapRef.current;
    if (!g || !mm) return;
    const rect = mm.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    g.camera.focusOn(fx * g.terrain.W, fy * g.terrain.H);
    g.audio.uiTick();
  };

  return (
    <div className="ps-bottombar absolute bottom-0 inset-x-0 bg-[#12110e]">
      <div className="ps-deck">
        {/* ── MAP ── */}
        <div className="ps-panel ps-panel-map flex flex-col min-h-0">
          <div className="ps-header">
            <span>TACTICAL MAP</span>
            <span className="text-[#8d887b]">3368-IV</span>
          </div>
          <div className="relative flex-1 min-h-0 p-2 flex items-center justify-center">
            <canvas
              ref={minimapRef}
              width={200}
              height={116}
              className="ps-minimap cursor-crosshair w-full h-auto"
              onMouseDown={onMinimapClick}
            />
            <div className="absolute top-3 right-3 font-mono text-[8px] text-[#5d584d] tracking-widest">N ↑</div>
          </div>
        </div>

        {/* ── FORMATION + ORDERS ── */}
        <div className="ps-panel ps-selection-panel flex flex-col min-h-0">
          <div className="ps-header">
            <span>FORMATION</span>
            <span className={hud?.selectionCount ? 'text-[#d9d6cc]' : ''}>
              {hud?.selectionCount ? `${hud.selectionCount} UNIT(S)` : 'NO SELECTION'}
            </span>
          </div>
          <SelectionBody hud={hud} />
          <div className="ps-orders grid grid-cols-4 gap-1 px-2 py-1.5 border-t border-[#242119]">
            <button
              className="ps-btn"
              disabled={!hud?.selectionCount}
              onClick={() => gameRef.current?.input.commandAttackMove()}
              title="Attack-move — fights anything met on the way [A]"
            >
              A · ATK
            </button>
            <button
              className="ps-btn"
              disabled={!hud?.selectionCount}
              onClick={() => gameRef.current?.input.commandStop()}
              title="Halt in place [S]"
            >
              S · STOP
            </button>
            <button
              className="ps-btn"
              disabled={!hud?.selectionCount}
              onClick={() => gameRef.current?.input.commandHold()}
              title="Hold ground — seek nearby cover, don't move [H]"
            >
              H · HOLD
            </button>
            <button
              className="ps-btn"
              disabled={!hud?.selectionLines.some((l) => l.kind === 'SPG')}
              onClick={() => gameRef.current?.input.commandFireMission()}
              title="Artillery fire mission — click target grid [F]"
            >
              F · FIRE
            </button>
          </div>
        </div>

        {/* ── DEPLOY — the ink becomes force ── */}
        <div className="ps-panel ps-panel-deploy flex flex-col min-h-0">
          <div className="ps-header">
            <span>DEPLOY · ASSEMBLY ALPHA</span>
            <button
              className="ps-ars-open"
              onClick={() => gameRef.current?.toggleArsenal(true)}
              title="Order of battle — full arsenal [R]"
            >
              ARSENAL [R]
            </button>
          </div>
          <DeployBody hud={hud} gameRef={gameRef} />
        </div>

        {/* ── UNIT DETAIL ── */}
        <div className="ps-panel ps-panel-detail flex flex-col min-h-0">
          <div className="ps-header">
            <span>UNIT DETAIL</span>
            <span className="text-[#d9d6cc]">{hud?.detailUnit ? hud.detailUnit.callsign : '—'}</span>
          </div>
          <DetailBody hud={hud} />
        </div>

        {/* ── OPERATIONS: AIR | NAVAL — two lists, two independent scrolls ── */}
        <div className="ps-panel ps-ops-panel flex flex-col min-h-0">
          <div className="ps-header">
            <span>OPERATIONS</span>
            <span className="text-[#8d887b]">AIR · SEA</span>
          </div>
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 flex flex-col border-r border-[#242119]">
              <div className="font-mono text-[8px] tracking-[0.2em] text-[#5d584d] px-2 pt-1 pb-[2px] border-b border-[#1d1b16]">AIR OPS</div>
              <AirBody hud={hud} gameRef={gameRef} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="font-mono text-[8px] tracking-[0.2em] text-[#5d584d] px-2 pt-1 pb-[2px] border-b border-[#1d1b16]">NAVAL OPS</div>
              <NavyBody hud={hud} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── deployment panel — the quick shelf of the arsenal ────────
// Three branches, remembered. One click buys; [R] opens the
// full order of battle for inspection before spending ink.

let lastQuickBranch: Branch = 'GROUND';
const QUICK_LABEL: Record<Branch, string> = { GROUND: 'GROUND', AIR: 'AIR', NAVAL: 'FLEET' };

function DeployBody({ hud, gameRef }: { hud: HudSnapshot | null; gameRef: RefObject<Game | null> }) {
  const [tab, setTab] = useState<Branch>(lastQuickBranch);
  const ink = hud?.ink ?? 0;
  const battalions = (hud?.battalions ?? []).filter((b) => b.branch === tab);
  const production = hud?.production ?? [];
  const p0 = production[0];
  const queueFull = production.length >= 6;
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* GROUND / AIR / FLEET — one war, three mediums */}
      <div className="flex shrink-0 border-b border-[#242119]">
        {(['GROUND', 'AIR', 'NAVAL'] as Branch[]).map((t) => (
          <button
            key={t}
            className={`ps-tab flex-1 font-mono text-[9px] tracking-[0.2em] py-[3px] ${tab === t ? 'ps-tab-on' : ''}`}
            onClick={() => {
              setTab(t);
              lastQuickBranch = t;
              const g = gameRef.current;
              if (g) g.audio.uiTick();
            }}
          >
            {QUICK_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="ps-scroll flex-1 min-h-0 overflow-y-auto">
        <div className="ps-quick-grid grid gap-1 p-1.5 content-start">
          {battalions.map((b) => (
            <QuickButton key={b.id} b={b} gameRef={gameRef} ink={ink} queueFull={queueFull} />
          ))}
          {!battalions.length && (
            <span className="font-mono text-[8.5px] text-[#5d584d] tracking-[0.14em] px-1 py-1.5">NOTHING AVAILABLE</span>
          )}
        </div>
      </div>
      <div className="border-t border-[#242119] px-2 h-[24px] shrink-0 flex items-center gap-2 overflow-hidden">
        {!p0 ? (
          <span className="font-mono text-[8.5px] text-[#5d584d] tracking-[0.14em] truncate">NO FORMATIONS IN PRODUCTION</span>
        ) : (
          <>
            <span className="font-mono text-[8.5px] text-[#d9d6cc] min-w-0 truncate shrink">{p0.name}</span>
            <div className="ps-bar flex-1 min-w-[40px]" style={{ height: 4 }}>
              <i style={{ width: `${Math.round(p0.progress * 100)}%` }} />
            </div>
            <span className="font-mono text-[8.5px] text-[#8d887b] tabular-nums shrink-0">{Math.ceil(p0.remaining)}s</span>
            {production.length > 1 && (
              <span className="font-mono text-[8.5px] text-[#5d584d] shrink-0">+{production.length - 1}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function QuickButton({
  b,
  gameRef,
  ink,
  queueFull,
}: {
  b: import('@/game/entities/roster').RosterEntry & { available: boolean };
  gameRef: RefObject<Game | null>;
  ink: number;
  queueFull: boolean;
}) {
  const affordable = b.available && !queueFull;
  return (
    <button
      className={`ps-quick-btn ${affordable ? '' : 'ps-deploy-off'}`}
      onClick={() => gameRef.current?.queueBattalion(b.id)}
      title={`${b.name} — ${b.role} · INK ${b.cost}`}
      disabled={!affordable}
    >
      <span className="ps-quick-glyph shrink-0">
        <UnitGlyph type={b.type} w={34} h={19} skin="panel" />
      </span>
      <span className="flex flex-col items-start min-w-0 flex-1">
        <span className="font-mono text-[9px] tracking-[0.05em] text-[#d9d6cc] truncate leading-[1.25]">{b.short}</span>
        <span className="font-mono text-[7px] tracking-[0.1em] text-[#5d584d] truncate leading-[1.2]">{b.role}</span>
      </span>
      <span className={`font-mono text-[10px] tabular-nums shrink-0 ${ink >= b.cost && !queueFull ? 'text-[#f3f1ea]' : 'text-[#6b655a]'}`}>
        {b.cost}
      </span>
    </button>
  );
}

// ── air panel ─────────────────────────────────────────────────

function AirBody({ hud, gameRef }: { hud: HudSnapshot | null; gameRef: RefObject<Game | null> }) {
  const air = hud?.air ?? [];
  return (
    <div className="ps-scroll flex-1 min-h-0 p-1.5 flex flex-col gap-1.5 overflow-y-auto">
      {air.map((a) => (
        <div key={a.callsign} className="border border-[#242119] px-2 py-1 shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-[#d9d6cc]">{a.callsign}</span>
            <span
              className={`font-mono text-[8px] tracking-[0.12em] ${
                a.state === 'DOWN' ? 'text-[#f3f1ea] ps-blink' : a.state === 'READY' ? 'text-[#d9d6cc]' : 'text-[#8d887b]'
              }`}
            >
              {a.state}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-[3px]">
            <span className="font-mono text-[8px] text-[#5d584d] w-8">MSL</span>
            <div className="flex gap-[2px]">
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className="w-[7px] h-[8px] border border-[#36322a]"
                  style={{ background: i < a.missiles ? '#d9d6cc' : 'transparent' }}
                />
              ))}
            </div>
            <span className="font-mono text-[8px] text-[#5d584d] ml-auto">{a.hp}HP</span>
          </div>
          {a.state === 'READY' && (
            <button
              className="ps-btn w-full mt-1.5"
              title="Launch an attack run at the current camera centre"
              onClick={() => {
                const g = gameRef.current;
                if (!g) return;
                const u = g.units.find((x) => x.callsign === a.callsign);
                if (u) g.input.launchAircraft(u.id, { x: g.camera.x, y: g.camera.y });
              }}
            >
              LAUNCH
            </button>
          )}
        </div>
      ))}
      {!air.length && <span className="font-mono text-[9px] text-[#5d584d]">NO AIR ASSETS</span>}
    </div>
  );
}

function NavyBody({ hud }: { hud: HudSnapshot | null }) {
  const navy = hud?.navy ?? [];
  return (
    <div className="ps-scroll flex-1 min-h-0 p-1.5 flex flex-col gap-1.5 overflow-y-auto">
      {navy.map((n) => {
        const dying = n.state === 'SINKING' || n.state === 'LOST';
        return (
          <div key={n.callsign} className={`border px-2 py-1 shrink-0 ${dying ? 'border-[#4a453a]' : 'border-[#242119]'}`}>
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-[10px] text-[#d9d6cc] truncate">{n.callsign}</span>
              <span className="font-mono text-[8px] text-[#5d584d] tracking-[0.08em] shrink-0">{n.cls}</span>
            </div>
            <div className="flex items-center justify-between mt-[2px]">
              <span
                className={`font-mono text-[8px] tracking-[0.12em] truncate ${
                  dying ? 'text-[#f3f1ea] ps-blink' : n.state === 'UNDERWAY' || n.state.startsWith('ENGAG') || n.state === 'TORPEDO RUN' ? 'text-[#d9d6cc]' : 'text-[#8d887b]'
                }`}
              >
                {n.state}
              </span>
              <span className="font-mono text-[8px] text-[#5d584d] tabular-nums shrink-0">
                {n.hp}/{n.hpMax}HP
              </span>
            </div>
            <div className="ps-bar mt-[3px]" style={{ height: 3 }}>
              <i style={{ width: `${(n.hp / n.hpMax) * 100}%` }} />
            </div>
            <div className="flex items-center gap-2 mt-[3px] font-mono text-[8px] text-[#5d584d]">
              <span title="main battery rounds">GUN {n.guns}</span>
              {n.ssm > 0 && <span title="surface-to-surface missiles">SSM {n.ssm}</span>}
              {n.torps > 0 && <span title="torpedoes">TORP {n.torps}</span>}
            </div>
          </div>
        );
      })}
      {!navy.length && (
        <span className="font-mono text-[9px] text-[#5d584d] leading-[1.7]">
          NO NAVAL ASSETS
          <br />
          <span className="text-[#6b655a]">DEPLOY HULLS — FLEET TAB</span>
        </span>
      )}
    </div>
  );
}

// ── selection rows ────────────────────────────────────────────

function SelectionBody({ hud }: { hud: HudSnapshot | null }) {
  if (!hud?.selectionCount) {
    return (
      <div className="flex-1 min-h-0 px-3 py-2 overflow-hidden">
        <p className="font-mono text-[9px] leading-[1.75] text-[#5d584d]">
          LMB — SELECT · DRAG — BOX SELECT
          <br />
          RMB — MOVE / ATTACK / PATROL
          <br />
          GROUND PAYS INK. WORKS PAY MORE.
          <br />
          ZAVOD 3 IS UNCLAIMED — TAKE IT.
        </p>
      </div>
    );
  }
  const lines = hud.selectionLines.slice(0, 4);
  return (
    <div className="ps-sel-rows flex-1 min-h-0 overflow-hidden p-1.5 flex flex-col gap-[2px]">
      {lines.map((l) => (
        <div key={l.callsign} className="flex items-center gap-1.5 px-1 h-[19px]">
          <span className="font-mono text-[9.5px] text-[#d9d6cc] w-[74px] shrink-0 truncate">{l.callsign}</span>
          <span className="font-mono text-[8px] text-[#5d584d] w-[26px] shrink-0">{l.kind}</span>
          <span
            className={`font-mono text-[8px] flex-1 min-w-0 truncate ${
              l.activity === 'PINNED' ? 'text-[#f3f1ea] ps-blink' : l.activity === 'SUPPRESSED' ? 'text-[#f3f1ea]' : 'text-[#8d887b]'
            }`}
          >
            {l.activity}
          </span>
          <div className="flex flex-col gap-[2px] w-[44px] shrink-0">
            <MicroBar value={l.hp} max={l.hpMax} />
            {l.suppression > 0.25 && <MicroBar value={1 - l.suppression} max={1} stress />}
          </div>
          <AmmoCell value={l.ammo} max={l.ammoMax} />
        </div>
      ))}
      {hud.selectionCount > 4 && (
        <span className="font-mono text-[8px] text-[#5d584d] px-1">+{hud.selectionCount - 4} MORE…</span>
      )}
    </div>
  );
}

// ── unit detail ───────────────────────────────────────────────

function DetailBody({ hud }: { hud: HudSnapshot | null }) {
  const d = hud?.detailUnit;
  const ex = hud?.detailExtra;
  if (!d || !ex) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center px-4">
        <p className="font-mono text-[9px] tracking-[0.16em] text-[#5d584d] text-center leading-[1.9]">
          SELECT A SINGLE UNIT
          <br />
          FOR FULL DETAIL
        </p>
      </div>
    );
  }
  const rows: [string, string][] = [
    ['STATUS', d.activity],
    ['WEAPON', ex.weapon],
    ['RANGE', `${ex.range} m`],
    ['SPEED', `${ex.speedKph} km/h`],
    ['VISION', `${ex.vision} m`],
    ['ARMOUR', ex.armor],
    ['COVER', ex.cover],
  ];
  const sup = d.suppression ?? 0;
  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      <div className="ps-detail-left w-[170px] border-r border-[#242119] p-2 flex flex-col gap-1 shrink-0">
        <span className="font-mono text-[11px] text-[#f3f1ea] truncate">{d.callsign}</span>
        <span className="font-mono text-[8.5px] text-[#8d887b] leading-snug truncate">{d.typeName}</span>
        <div className="mt-auto flex flex-col gap-1">
          <StatLine label="INTEGRITY" value={d.hp} max={d.hpMax} text={`${d.hp}/${d.hpMax}`} />
          <StatLine
            label="AMMUNITION"
            value={d.ammo}
            max={d.ammoMax}
            text={d.ammoMax > 100 ? `${d.ammo}` : `${d.ammo}/${d.ammoMax}`}
          />
          {sup > 0.15 && (
            <StatLine
              label="SUPPRESSION"
              value={1 - sup}
              max={1}
              text={sup > 0.85 ? 'PINNED' : `${Math.round(sup * 100)}%`}
            />
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0 p-2 grid grid-cols-2 gap-x-3 gap-y-[5px] content-start">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col min-w-0">
            <span className="font-mono text-[8px] tracking-[0.14em] text-[#5d584d] truncate">{k}</span>
            <span className="font-mono text-[10px] text-[#d9d6cc] truncate">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatLine({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  return (
    <div>
      <div className="flex justify-between mb-[3px]">
        <span className="font-mono text-[8px] tracking-[0.14em] text-[#5d584d]">{label}</span>
        <span className="font-mono text-[9px] text-[#d9d6cc] tabular-nums">{text}</span>
      </div>
      <div className={`ps-bar ${value / max < 0.3 ? 'ps-low' : ''}`}>
        <i style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}

function MicroBar({ value, max, stress }: { value: number; max: number; stress?: boolean }) {
  return (
    <div className="ps-bar" style={{ height: stress ? 2 : 3, opacity: stress ? 0.9 : 1 }}>
      <i style={{ width: `${(value / max) * 100}%`, background: stress ? '#8d887b' : undefined }} />
    </div>
  );
}

function AmmoCell({ value, max }: { value: number; max: number }) {
  return (
    <span className="font-mono text-[8.5px] text-[#8d887b] text-right w-[38px] shrink-0 tabular-nums">
      {max > 100 ? value : `${value}/${max}`}
    </span>
  );
}
