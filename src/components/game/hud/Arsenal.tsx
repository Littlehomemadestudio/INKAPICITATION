'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · the ARSENAL — order of battle
// The player's arsenal interface: branch tabs, grouped roster,
// recognition plates, real armament readouts, ink economics.
// Field manual meets command console. [R] opens and closes.
// ─────────────────────────────────────────────────────────────

import { useRef, useState, useEffect } from 'react';
import type { RefObject } from 'react';
import type { HudSnapshot } from '@/game/core/types';
import type { Game } from '@/game/Game';
import type { RosterEntry, Branch } from '@/game/entities/roster';
import { BRANCH_GROUPS } from '@/game/entities/roster';
import { UnitGlyph } from './UnitGlyph';

// remembered between openings — the commander returns to the
// last shelf of the arsenal they were browsing
let lastBranch: Branch = 'GROUND';
const lastSel: Partial<Record<Branch, string>> = {};

const BRANCHES: { id: Branch; label: string; sub: string }[] = [
  { id: 'GROUND', label: 'GROUND', sub: 'INF · ARMOR · GUNS · AD' },
  { id: 'AIR', label: 'AIR', sub: 'FIGHTER · ATTACK' },
  { id: 'NAVAL', label: 'NAVAL', sub: 'PT · ESCORT · CAPITAL' },
];

export function Arsenal({ hud, gameRef }: { hud: HudSnapshot | null; gameRef: RefObject<Game | null> }) {
  const roster = hud?.battalions ?? [];
  const ink = hud?.ink ?? 0;
  const queueN = hud?.production.length ?? 0;

  const [branch, setBranch] = useState<Branch>(lastBranch);
  const [selId, setSelId] = useState<string | null>(lastSel[lastBranch] ?? null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashT = useRef<number>(0);

  useEffect(() => {
    if (flash && Date.now() - flashT.current > 1400) setFlash(null);
  }, [flash, hud]);

  const entries = roster.filter((r) => r.branch === branch);
  const groups = BRANCH_GROUPS[branch];
  const sel: RosterEntry | undefined =
    entries.find((r) => r.id === selId) ?? entries[0];

  const select = (id: string, branchOf: Branch) => {
    setSelId(id);
    lastSel[branchOf] = id;
    gameRef.current?.audio.uiTick();
  };

  const switchBranch = (b: Branch) => {
    setBranch(b);
    lastBranch = b;
    const first = roster.find((r) => r.branch === b);
    setSelId(lastSel[b] ?? first?.id ?? null);
    gameRef.current?.audio.uiTick();
  };

  const deploy = (entry: RosterEntry) => {
    const g = gameRef.current;
    if (!g) return;
    const ok = g.queueBattalion(entry.id);
    if (ok) {
      flashT.current = Date.now();
      setFlash(entry.id);
    }
  };

  const affordable = sel ? ink >= sel.cost : false;
  const queueFull = queueN >= 6;

  return (
    <div className="ps-arsenal-backdrop" onMouseDown={(e) => e.button === 0 && gameRef.current?.toggleArsenal(false)}>
      <div
        className="ps-arsenal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Order of battle"
      >
        {/* ── header ── */}
        <div className="ps-ars-head">
          <div className="flex items-center gap-3 min-w-0">
            <span className="ps-ars-title">ORDER OF BATTLE</span>
            <span className="font-mono text-[8px] tracking-[0.18em] text-[#5d584d] truncate">TASK FORCE SABRE · ARSENAL</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="ps-ars-ink">
              <span className="ps-ink-mark" aria-hidden />
              {ink}
              <i>INK</i>
            </span>
            <span className="font-mono text-[9px] text-[#8d887b] tabular-nums tracking-[0.1em]">
              QUEUE {queueN}/6
            </span>
            <button className="ps-btn" onClick={() => gameRef.current?.toggleArsenal(false)}>
              [R] CLOSE
            </button>
          </div>
        </div>

        {/* ── branch tabs ── */}
        <div className="ps-ars-tabs">
          {BRANCHES.map((b) => (
            <button
              key={b.id}
              className={`ps-ars-tab ${branch === b.id ? 'ps-ars-tab-on' : ''}`}
              onClick={() => switchBranch(b.id)}
            >
              <span className="ps-ars-tab-label">{b.label}</span>
              <span className="ps-ars-tab-sub">{b.sub}</span>
            </button>
          ))}
        </div>

        {/* ── body: roster | detail ── */}
        <div className="ps-ars-body">
          {/* left: the roster, grouped — only this column scrolls */}
          <div className="ps-ars-list ps-scroll">
            {groups.map((g) => {
              const rows = entries.filter((r) => r.group === g);
              if (!rows.length) return null;
              return (
                <div key={g} className="mb-1">
                  <div className="ps-ars-group">{g}</div>
                  {rows.map((r) => {
                    const isSel = sel?.id === r.id;
                    const canBuy = ink >= r.cost && !queueFull;
                    return (
                      <button
                        key={r.id}
                        className={`ps-ars-row ${isSel ? 'ps-ars-row-on' : ''}`}
                        onClick={() => (isSel ? deploy(r) : select(r.id, branch))}
                        title={isSel ? 'click again to deploy' : r.role}
                      >
                        <span className="ps-ars-row-glyph">
                          <UnitGlyph type={r.type} w={52} h={26} skin="panel" />
                        </span>
                        <span className="ps-ars-row-text min-w-0">
                          <span className="ps-ars-row-name">{r.short}</span>
                          <span className="ps-ars-row-role">{r.role}</span>
                        </span>
                        <span className={`ps-ars-row-cost ${canBuy ? '' : 'ps-cost-dim'}`}>{r.cost}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {!entries.length && (
              <div className="font-mono text-[9px] text-[#5d584d] px-2 py-3 tracking-[0.14em]">NOTHING AVAILABLE</div>
            )}
          </div>

          {/* right: the selected unit */}
          {sel ? (
            <div className="ps-ars-detail ps-scroll">
              {/* identity */}
              <div className="ps-ars-id">
                <div className="min-w-0">
                  <div className="ps-ars-name">{sel.name}</div>
                  <div className="ps-ars-class">{sel.role}</div>
                </div>
                <div className="ps-ars-costblock">
                  <span className="ps-ars-cost-label">INK</span>
                  <span className={`ps-ars-cost ${ink >= sel.cost ? '' : 'ps-cost-dim'}`}>{sel.cost}</span>
                </div>
              </div>

              {/* recognition plate + stats */}
              <div className="ps-ars-mid">
                <div className="ps-ars-plate">
                  <UnitGlyph type={sel.type} w={190} h={104} skin="plate" />
                  <span className="ps-ars-plate-cap">{sel.short}</span>
                </div>
                <div className="ps-ars-stats">
                  <StatNotches label="FIREPOWER" v={sel.firepower} />
                  <StatNotches label="ARMOR" v={sel.armor} />
                  <StatNotches label="MOBILITY" v={sel.mobility} />
                  <StatNotches label="AIR DEF" v={sel.airDef} />
                  <div className="ps-ars-stat">
                    <span className="ps-ars-stat-k">RANGE</span>
                    <span className="ps-ars-stat-v">{sel.rangeM >= 1000 ? `${(sel.rangeM / 1000).toFixed(1)} KM` : `${sel.rangeM} M`}</span>
                  </div>
                  <div className="ps-ars-stat">
                    <span className="ps-ars-stat-k">MOVEMENT</span>
                    <span className="ps-ars-stat-v">{sel.movement}</span>
                  </div>
                </div>
              </div>

              {/* role */}
              <p className="ps-ars-desc">{sel.desc}</p>

              {/* armament + traits */}
              <div className="ps-ars-cols">
                <div className="min-w-0">
                  <div className="ps-ars-subhead">ARMAMENT</div>
                  <ul className="ps-ars-arm">
                    {sel.armament.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
                <div className="min-w-0">
                  <div className="ps-ars-subhead">CHARACTERISTICS</div>
                  <div className="ps-ars-traits">
                    {sel.traits.map((t) => (
                      <span key={t} className="ps-ars-trait">{t}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* delivery + commit */}
              <div className="ps-ars-foot">
                <div className="ps-ars-delivery">
                  <span className="ps-ars-stat-k">DELIVERY</span>
                  <span className="ps-ars-stat-v">{sel.delivery}</span>
                  <span className="ps-ars-stat-v ps-ars-muster">MUSTER {sel.buildTime}s</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {flash === sel.id ? (
                    <span className="ps-ars-ordered ps-blink">ORDERED — IN PRODUCTION</span>
                  ) : queueFull ? (
                    <span className="font-mono text-[8px] tracking-[0.14em] text-[#8d887b] text-right leading-[1.5]">
                      PRODUCTION QUEUE FULL
                      <br />
                      {queueN}/6 FORMATIONS
                    </span>
                  ) : !affordable ? (
                    <span className="font-mono text-[8px] tracking-[0.14em] text-[#8d887b] text-right leading-[1.5]">
                      INSUFFICIENT INK
                      <br />
                      {ink} / {sel.cost} REQUIRED
                    </span>
                  ) : null}
                  <button
                    className="ps-ars-deploy"
                    disabled={!affordable || queueFull}
                    onClick={() => deploy(sel)}
                  >
                    DEPLOY
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="ps-ars-detail flex items-center justify-center">
              <span className="font-mono text-[9px] text-[#5d584d] tracking-[0.18em]">SELECT A UNIT</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatNotches({ label, v }: { label: string; v: number }) {
  return (
    <div className="ps-ars-stat">
      <span className="ps-ars-stat-k">{label}</span>
      <span className="ps-notches" aria-label={`${label} ${v} of 5`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className={i < v ? 'ps-notch-on' : ''} />
        ))}
      </span>
    </div>
  );
}
