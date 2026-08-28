'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · HUD bars
// Top: operation status + ink ledger. Bottom: minimap, formation,
// deployment, unit detail, air ops, comms.
// ─────────────────────────────────────────────────────────────

import type { RefObject } from 'react';
import type { HudSnapshot, LogEntry, BattalionDef } from '@/game/core/types';
import type { Game } from '@/game/Game';
import { fmtClock } from '@/game/Game';

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
  return (
    <div className="ps-topbar absolute top-0 inset-x-0 h-10 bg-[#12110e] border-b border-[#36322a] flex items-stretch">
      {/* wordmark */}
      <div className="ps-top-cell flex items-center gap-3 px-4 border-r border-[#242119]">
        <span className="text-[13px] font-bold tracking-[0.34em] text-[#f3f1ea]">PAPER STORM</span>
        <span className="ps-subtle font-mono text-[9px] tracking-[0.2em] text-[#5d584d] pt-px">OPERATION CROSSWIND</span>
      </div>

      {/* clock + phase */}
      <div className="ps-top-cell flex items-center gap-3 px-4 border-r border-[#242119]">
        <span className="font-mono text-[11px] text-[#d9d6cc]">T+{fmtClock(hud?.missionTime ?? 0)}</span>
        <span className="ps-subtle font-mono text-[9px] tracking-[0.18em] text-[#5d584d]">
          {hud?.result === 'VICTORY' ? 'COMPLETE' : hud?.result === 'DEFEAT' ? 'FAILED' : hud?.paused ? 'PAUSED' : 'EXECUTING'}
        </span>
      </div>

      {/* the ink ledger */}
      <div className="flex items-center gap-3 px-4 border-r border-[#242119]">
        <div className="flex items-center gap-1.5">
          <span className="ps-ink-mark" aria-hidden />
          <span className="font-mono text-[13px] font-semibold text-[#f3f1ea] tabular-nums" title="INK — your authority to sustain the operation">
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

      {/* objectives */}
      <div className="ps-top-cell ps-obj-row flex-1 flex items-center gap-2 px-4 overflow-hidden">
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
        <span className="font-mono text-[9px] tracking-[0.12em] text-[#5d584d] ml-auto pr-1" title="enemy combat units alive">
          OPFOR {hud?.enemyStrength ?? 0}
        </span>
      </div>

      {/* sim controls */}
      <div className="ps-top-cell ps-controls flex items-center gap-1.5 px-3 border-l border-[#242119]">
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

// ── bottom ───────────────────────────────────────────────────

interface BottomBarProps {
  hud: HudSnapshot | null;
  minimapRef: RefObject<HTMLCanvasElement | null>;
  gameRef: RefObject<Game | null>;
  onLogHover: () => void;
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
    <div className="ps-bottombar absolute bottom-0 inset-x-0 h-[150px] bg-[#12110e] border-t border-[#36322a] flex items-stretch gap-0 overflow-x-auto ps-scroll-x">
      {/* minimap */}
      <div className="ps-panel ps-panel-map border-t-0 border-l-0 border-b-0 border-r flex flex-col shrink-0">
        <div className="ps-header">
          <span>MAP · 1:10 000</span>
          <span className="text-[#8d887b]">3368-IV</span>
        </div>
        <div className="relative flex-1 p-2 min-h-0">
          <canvas
            ref={minimapRef}
            width={194}
            height={112}
            className="ps-minimap cursor-crosshair w-full h-auto"
            onMouseDown={onMinimapClick}
          />
          <div className="absolute top-3 right-3 font-mono text-[8px] text-[#5d584d] tracking-widest">N ↑</div>
        </div>
      </div>

      {/* selection / formation */}
      <div className="ps-panel ps-selection-panel ps-panel-form border-t-0 border-b-0 border-r flex flex-col shrink-0">
        <div className="ps-header">
          <span>FORMATION</span>
          <span>{hud?.selectionCount ? `${hud.selectionCount} UNIT(S)` : 'NO SELECTION'}</span>
        </div>
        <SelectionBody hud={hud} />
        <div className="ps-cmd-row flex gap-1.5 px-2 py-1.5 border-t border-[#242119]">
          <button
            className="ps-btn"
            disabled={!hud?.selectionCount}
            onClick={() => gameRef.current?.input.commandAttackMove()}
          >
            A · ATK
          </button>
          <button
            className="ps-btn"
            disabled={!hud?.selectionCount}
            onClick={() => gameRef.current?.input.commandStop()}
          >
            S · STOP
          </button>
          <button
            className="ps-btn"
            disabled={!hud?.selectionCount}
            onClick={() => gameRef.current?.input.commandHold()}
          >
            H · HOLD
          </button>
          <button
            className="ps-btn"
            disabled={!hud?.selectionLines.some((l) => l.kind === 'SPG')}
            onClick={() => gameRef.current?.input.commandFireMission()}
          >
            F · FIRE
          </button>
        </div>
      </div>

      {/* deployment — the ink becomes force */}
      <div className="ps-panel ps-panel-deploy border-t-0 border-b-0 border-r flex flex-col shrink-0">
        <div className="ps-header">
          <span>DEPLOY · ASSEMBLY ALPHA</span>
          <span className="text-[#8d887b]">{hud?.ink ?? 0} INK</span>
        </div>
        <DeployBody hud={hud} gameRef={gameRef} />
      </div>

      {/* unit detail */}
      <div className="ps-panel ps-panel-detail border-t-0 border-b-0 border-r flex-1 min-w-0 flex flex-col">
        <div className="ps-header">
          <span>UNIT DETAIL</span>
          <span>{hud?.detailUnit ? hud.detailUnit.callsign : '—'}</span>
        </div>
        <DetailBody hud={hud} />
      </div>

      {/* air operations */}
      <div className="ps-panel ps-air-panel ps-panel-air border-t-0 border-b-0 border-r flex flex-col shrink-0">
        <div className="ps-header">
          <span>AIR OPS</span>
          <span>CAS</span>
        </div>
        <div className="flex-1 p-2 flex flex-col gap-1.5 overflow-hidden">
          {(hud?.air ?? []).map((a) => (
            <div key={a.callsign} className="border border-[#242119] px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-[#d9d6cc]">{a.callsign}</span>
                <span
                  className={`font-mono text-[8px] tracking-[0.12em] ${
                    a.state === 'DOWN' ? 'text-[#f3f1ea] ps-blink' : 'text-[#8d887b]'
                  }`}
                >
                  {a.state}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
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
          {!hud?.air.length && <span className="font-mono text-[9px] text-[#5d584d]">NO AIR ASSETS</span>}
        </div>
      </div>

      {/* comms log */}
      <div className="ps-panel ps-log-panel ps-panel-log border-t-0 border-b-0 border-l-0 flex flex-col shrink-0">
        <div className="ps-header">
          <span>COMMS · TRAFFIC</span>
          <span>REC</span>
        </div>
        <div className="flex-1 overflow-y-auto ps-scroll p-1.5 flex flex-col gap-[3px]">
          {(hud?.log ?? []).map((l) => (
            <LogLine key={l.id} entry={l} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── deployment panel ──────────────────────────────────────────

function DeployBody({ hud, gameRef }: { hud: HudSnapshot | null; gameRef: RefObject<Game | null> }) {
  const battalions = hud?.battalions ?? [];
  const production = hud?.production ?? [];
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="grid grid-cols-2 gap-1 p-1.5">
        {battalions.map((b) => (
          <DeployButton key={b.id} b={b} gameRef={gameRef} ink={hud?.ink ?? 0} />
        ))}
      </div>
      <div className="mt-auto border-t border-[#242119] px-2 py-1.5 flex flex-col gap-1 min-h-[46px]">
        {production.length === 0 ? (
          <span className="font-mono text-[8.5px] text-[#5d584d] tracking-[0.14em]">
            NO FORMATIONS IN PRODUCTION
          </span>
        ) : (
          production.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="font-mono text-[8.5px] text-[#d9d6cc] w-[120px] truncate">{p.name}</span>
              <div className="ps-bar flex-1" style={{ height: 4 }}>
                <i style={{ width: `${Math.round(p.progress * 100)}%` }} />
              </div>
              <span className="font-mono text-[8.5px] text-[#8d887b] w-[34px] text-right tabular-nums">
                {Math.ceil(p.remaining)}s
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DeployButton({ b, gameRef, ink }: { b: BattalionDef & { available: boolean }; gameRef: RefObject<Game | null>; ink: number }) {
  const affordable = b.available;
  return (
    <button
      className={`ps-deploy-btn ${affordable ? '' : 'ps-deploy-off'}`}
      onClick={() => gameRef.current?.queueBattalion(b.id)}
      title={b.desc}
      disabled={!affordable}
    >
      <span className="font-mono text-[9px] tracking-[0.06em] text-[#d9d6cc] truncate">{b.name}</span>
      <span className="flex items-center gap-1.5 mt-[3px]">
        <span className="flex gap-[2px]">
          {b.kinds.slice(0, 4).map((k, i) => (
            <span key={i} className="ps-kind-chip" data-k={k}>
              {k}
            </span>
          ))}
        </span>
        <span
          className={`font-mono text-[9.5px] ml-auto tabular-nums ${ink >= b.cost ? 'text-[#f3f1ea]' : 'text-[#6b655a'}`}
        >
          {b.cost}
        </span>
      </span>
    </button>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const strong =
    entry.level === 'contact' || entry.level === 'alert' || entry.level === 'objective' || entry.level === 'economy';
  return (
    <div
      className={`ps-logline flex gap-2 px-1 py-[2px] font-mono text-[9px] leading-[1.35] ${
        entry.level === 'alert' ? 'border-l-2 border-[#f3f1ea] bg-[#191713]' : ''
      } ${entry.level === 'economy' ? 'border-l-2 border-[#8d887b]' : ''}`}
    >
      <span className="text-[#5d584d] shrink-0">{fmtClock(entry.time)}</span>
      <span className={strong ? 'text-[#f3f1ea]' : 'text-[#8d887b]'}>{entry.text}</span>
    </div>
  );
}

function SelectionBody({ hud }: { hud: HudSnapshot | null }) {
  if (!hud?.selectionCount) {
    return (
      <div className="flex-1 p-3">
        <p className="font-mono text-[9px] leading-relaxed text-[#5d584d]">
          LMB — SELECT · DRAG — BOX SELECT
          <br />RMB — MOVE / ATTACK / PATROL
          <br />
          GROUND PAYS INK. WORKS PAY MORE.
          <br />
          ZAVOD 3 IS UNCLAIMED — TAKE IT.
        </p>
      </div>
    );
  }
  const lines = hud.selectionLines.slice(0, 5);
  return (
    <div className="flex-1 overflow-y-auto ps-scroll p-1.5 flex flex-col gap-[2px]">
      {lines.map((l) => (
        <div key={l.callsign} className="grid grid-cols-[70px_34px_1fr_46px_44px] items-center gap-1 px-1 h-[19px]">
          <span className="font-mono text-[9.5px] text-[#d9d6cc] truncate">{l.callsign}</span>
          <span className="font-mono text-[8px] text-[#5d584d]">{l.kind}</span>
          <span
            className={`font-mono text-[8px] truncate ${
              l.activity === 'PINNED' ? 'text-[#f3f1ea] ps-blink' : l.activity === 'SUPPRESSED' ? 'text-[#f3f1ea]' : 'text-[#8d887b]'
            }`}
          >
            {l.activity}
          </span>
          <div className="flex flex-col gap-[2px]">
            <MicroBar value={l.hp} max={l.hpMax} />
            {l.suppression > 0.25 && <MicroBar value={1 - l.suppression} max={1} stress />}
          </div>
          <AmmoCell value={l.ammo} max={l.ammoMax} />
        </div>
      ))}
      {hud.selectionCount > 5 && (
        <span className="font-mono text-[8px] text-[#5d584d] px-1">+{hud.selectionCount - 5} MORE…</span>
      )}
    </div>
  );
}

function DetailBody({ hud }: { hud: HudSnapshot | null }) {
  const d = hud?.detailUnit;
  const ex = hud?.detailExtra;
  if (!d || !ex) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-mono text-[9px] text-[#5d584d] tracking-[0.2em]">SELECT A SINGLE UNIT FOR DETAIL</span>
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
  const sup = hud?.detailUnit?.suppression ?? 0;
  return (
    <div className="flex-1 min-h-0 flex">
      <div className="ps-detail-left w-[190px] border-r border-[#242119] p-2 flex flex-col gap-1">
        <span className="font-mono text-[11px] text-[#f3f1ea]">{d.callsign}</span>
        <span className="font-mono text-[8.5px] text-[#8d887b] leading-snug">{d.typeName}</span>
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
      <div className="flex-1 p-2 grid grid-cols-2 gap-x-3 gap-y-[5px] content-start">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <span className="font-mono text-[8px] tracking-[0.14em] text-[#5d584d]">{k}</span>
            <span className="font-mono text-[10px] text-[#d9d6cc]">{v}</span>
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
        <span className="font-mono text-[9px] text-[#d9d6cc]">{text}</span>
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
    <span className="font-mono text-[8.5px] text-[#8d887b] text-right">
      {max > 100 ? value : `${value}/${max}`}
    </span>
  );
}
