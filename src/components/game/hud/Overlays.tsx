'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · overlays
// Briefing (operation order), after-action report, help.
// ─────────────────────────────────────────────────────────────

import type { AfterActionReport } from '@/game/core/types';
import { BRIEFING } from '@/game/world/scenario';
import { fmtClock } from '@/game/Game';

export function BriefingOverlay({
  seed,
  onCommence,
}: {
  seed: number;
  onCommence: () => void;
}) {
  const b = BRIEFING;
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto ps-paper-doc">
      {/* paper grain + fibre texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(rgba(60,52,38,0.07) 1px, transparent 1px), radial-gradient(rgba(60,52,38,0.045) 1px, transparent 1px), radial-gradient(rgba(120,105,80,0.05) 1px, transparent 1px)',
          backgroundSize: '6px 6px, 11px 11px, 23px 23px',
          backgroundPosition: '0 0, 4px 5px, 9px 13px',
        }}
      />
      {/* margin rules like a field document */}
      <div className="absolute inset-y-0 left-[52px] w-px bg-[#c9c4b4] pointer-events-none" />
      <div className="absolute inset-y-0 right-[52px] w-px bg-[#c9c4b4] pointer-events-none" />
      <div className="relative max-w-3xl mx-auto px-10 py-14">
        {/* header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.3em] text-[#6b6557] mb-3">{b.sheet}</div>
            <h1 className="text-5xl font-extrabold tracking-[0.08em] text-[#17150f] leading-none">PAPER STORM</h1>
            <div className="font-mono text-[11px] tracking-[0.24em] text-[#403c33] mt-3">OPERATION CROSSWIND — TASK FORCE SABRE</div>
          </div>
          <CompassRose />
        </div>

        <hr className="ps-rule my-8" />

        <div className="grid grid-cols-[120px_1fr] gap-6 mb-7">
          <SectionLabel>SITUATION</SectionLabel>
          <div className="space-y-3">
            {b.situation.map((p, i) => (
              <p key={i} className="text-[13px] leading-relaxed text-[#26231c] max-w-[640px]">
                {p}
              </p>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-6 mb-7">
          <SectionLabel>MISSION</SectionLabel>
          <div className="border-l border-[#8b8577] pl-4">
            <p className="text-[13.5px] leading-relaxed font-medium text-[#17150f] max-w-[640px] tracking-wide">{b.mission}</p>
          </div>
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-6 mb-7">
          <SectionLabel>EXECUTION</SectionLabel>
          <div className="space-y-3">
            {b.execution.map((p, i) => (
              <div key={i} className="flex gap-3 max-w-[640px] border-b border-[#e5e1d3] pb-2.5 last:border-b-0">
                <span className="font-mono text-[10px] tracking-[0.1em] text-[#f3f1ea] bg-[#17150f] shrink-0 h-[18px] px-[6px] flex items-center">PH{i + 1}</span>
                <p className="text-[13px] leading-relaxed text-[#26231c]">{p}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-6 mb-7">
          <SectionLabel>INK &amp; GROUND</SectionLabel>
          <div className="max-w-[640px]">
            <p className="text-[12.5px] leading-relaxed text-[#26231c] mb-3.5">
              Ink is your authority to sustain and expand this operation. It is not gathered from the ground like ore —
              it is what flows to a force that holds ground worth holding. Read the ledger in the top bar; spend it in
              the DEPLOY panel. Battalions muster at ASSEMBLY ALPHA in the south-west and march in — they never
              appear in the middle of a fight.
            </p>
            <table className="text-[12px] w-full">
              <tbody>
                {b.economy.map(([k, v]) => (
                  <tr key={k} className="border-b border-[#ddd9cd]">
                    <td className="py-[4px] pr-4 font-mono text-[10.5px] text-[#17150f] whitespace-nowrap w-[150px]">{k}</td>
                    <td className="py-[4px] text-[#4c473d]">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-6 mb-7">
          <SectionLabel>TASK ORG</SectionLabel>
          <table className="text-[12px] max-w-[640px] w-full">
            <tbody>
              {b.forces.map(([cs, type]) => (
                <tr key={cs} className="border-b border-[#ddd9cd]">
                  <td className="py-[5px] pr-4 font-mono text-[11px] text-[#17150f] whitespace-nowrap">{cs}</td>
                  <td className="py-[5px] text-[#4c473d]">{type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-6 mb-10">
          <SectionLabel>CONTROLS</SectionLabel>
          <div className="grid grid-cols-2 gap-x-10 gap-y-[6px] max-w-[640px]">
            {b.controls.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2.5">
                <span className="ps-kbd">{k}</span>
                <span className="text-[11.5px] text-[#4c473d]">{v}</span>
              </div>
            ))}
          </div>
          {b.hudNotes?.length ? (
            <div className="col-start-2 mt-4 border-l-2 border-[#17150f] pl-4">
              {b.hudNotes.map((n) => (
                <p key={n} className="font-mono text-[9.5px] tracking-[0.08em] text-[#6b6557] leading-[1.9]">
                  {n}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <hr className="ps-rule mb-8" />

        <div className="flex items-center justify-between">
          <div className="font-mono text-[9px] tracking-[0.18em] text-[#6b6557]">
            SHEET NO. {String(seed % 100000).padStart(5, '0')} · NEW SHEET ON REDEPLOY
          </div>
          <button
            onClick={onCommence}
            className="bg-[#17150f] text-[#f3f1ea] font-mono text-[12px] tracking-[0.28em] px-10 py-3.5 rounded-[2px] hover:bg-[#26231c] transition-colors"
          >
            COMMENCE OPERATION →
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.28em] text-[#6b6557] pt-1 relative">
      <span className="border-b-2 border-[#17150f] pb-1">{children}</span>
    </div>
  );
}

function CompassRose() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" className="shrink-0 opacity-80">
      <circle cx="52" cy="52" r="48" fill="none" stroke="#17150f" strokeWidth="1" />
      <circle cx="52" cy="52" r="40" fill="none" stroke="#17150f" strokeWidth="0.5" />
      <circle cx="52" cy="52" r="30" fill="none" stroke="#6b6557" strokeWidth="0.5" strokeDasharray="2 3" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line
          key={a}
          x1="52"
          y1="4"
          x2="52"
          y2={a % 90 === 0 ? '14' : '10'}
          stroke="#17150f"
          strokeWidth={a % 90 === 0 ? 1.4 : 0.8}
          transform={`rotate(${a} 52 52)`}
        />
      ))}
      <path d="M52 18 L58 52 L52 46 L46 52 Z" fill="#17150f" />
      <text x="52" y="68" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#17150f" letterSpacing="2">
        N
      </text>
    </svg>
  );
}

// ── end / AAR ────────────────────────────────────────────────

export function EndOverlay({
  result,
  aar,
  onRestart,
  onReview,
}: {
  result: 'VICTORY' | 'DEFEAT';
  aar: AfterActionReport | null;
  onRestart: () => void;
  onReview: () => void;
}) {
  if (!aar) return null;
  const victory = result === 'VICTORY';
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'rgba(12,11,9,0.86)' }}>
      <div className="ps-paper-doc w-[680px] max-h-[86vh] overflow-y-auto ps-scroll">
        <div className="px-10 py-9">
          <div className="font-mono text-[10px] tracking-[0.3em] text-[#6b6557] mb-3">AFTER-ACTION REPORT · {aar.result === 'VICTORY' ? 'EXTRACT' : 'SITREP'}</div>
          <h2 className="text-4xl font-extrabold tracking-[0.06em] text-[#17150f] leading-none">
            {victory ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED'}
          </h2>
          <div className="font-mono text-[10px] tracking-[0.2em] text-[#403c33] mt-2.5">
            OPERATION CROSSWIND · DURATION T+{fmtClock(aar.time)}
          </div>

          <hr className="ps-rule my-7" />

          <div className="grid grid-cols-4 gap-6 mb-7">
            <Stat label="ENEMY DESTROYED" value={String(aar.killsByType.reduce((a, b) => a + b.n, 0))} />
            <Stat label="FRIENDLY LOST" value={String(aar.lossesByType.reduce((a, b) => a + b.n, 0))} />
            <Stat label="ROUNDS FIRED" value={String(aar.roundsFired)} />
            <Stat label="OBJECTIVES" value={`${aar.objectivesSecured}/${aar.objectivesTotal}`} />
          </div>

          <div className="grid grid-cols-4 gap-6 mb-7">
            <Stat label="INK EARNED" value={String(aar.inkEarned)} />
            <Stat label="INK SPENT" value={String(aar.inkSpent)} />
            <Stat label="BATTALIONS RAISED" value={String(aar.battalionsDeployed)} />
            <Stat label="INK WORKS HELD" value={`${aar.factoriesHeld}/${aar.factoriesTotal}`} />
          </div>

          <div className="grid grid-cols-2 gap-8 mb-9">
            <div>
              <div className="font-mono text-[9px] tracking-[0.24em] text-[#6b6557] mb-2 border-b border-[#ddd9cd] pb-1">
                ENEMY LOSSES IN DETAIL
              </div>
              {aar.killsByType.length ? (
                aar.killsByType.map((k) => (
                  <div key={k.label} className="flex justify-between font-mono text-[10.5px] py-[3px] border-b border-[#e8e4d8]">
                    <span className="text-[#26231c]">{k.label}</span>
                    <span className="text-[#17150f]">{k.n}</span>
                  </div>
                ))
              ) : (
                <div className="font-mono text-[10px] text-[#6b6557]">NONE</div>
              )}
            </div>
            <div>
              <div className="font-mono text-[9px] tracking-[0.24em] text-[#6b6557] mb-2 border-b border-[#ddd9cd] pb-1">
                FRIENDLY LOSSES IN DETAIL
              </div>
              {aar.lossesByType.length ? (
                aar.lossesByType.map((k) => (
                  <div key={k.label} className="flex justify-between font-mono text-[10.5px] py-[3px] border-b border-[#e8e4d8]">
                    <span className="text-[#26231c]">{k.label}</span>
                    <span className="text-[#17150f]">{k.n}</span>
                  </div>
                ))
              ) : (
                <div className="font-mono text-[10px] text-[#6b6557]">NONE</div>
              )}
            </div>
          </div>

          <hr className="ps-rule my-7" />

          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] tracking-[0.18em] text-[#6b6557]">
              THE SHEET REMEMBERS EVERYTHING
            </span>
            <div className="flex gap-2.5">
              <button
                onClick={onReview}
                className="border border-[#17150f] text-[#17150f] font-mono text-[11px] tracking-[0.22em] px-7 py-3 rounded-[2px] hover:bg-[#e9e6da] transition-colors"
              >
                REVIEW BATTLEFIELD
              </button>
              <button
                onClick={onRestart}
                className="bg-[#17150f] text-[#f3f1ea] font-mono text-[11px] tracking-[0.22em] px-7 py-3 rounded-[2px] hover:bg-[#26231c] transition-colors"
              >
                REDEPLOY · NEW SHEET
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[8.5px] tracking-[0.2em] text-[#6b6557] mb-1.5">{label}</div>
      <div className="text-3xl font-extrabold text-[#17150f] leading-none">{value}</div>
    </div>
  );
}

// ── help ─────────────────────────────────────────────────────

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const b = BRIEFING;
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center"
      style={{ background: 'rgba(12,11,9,0.72)' }}
      onClick={onClose}
    >
      <div className="ps-paper-doc w-[560px] px-9 py-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="font-mono text-[9px] tracking-[0.3em] text-[#6b6557] mb-1.5">FIELD REFERENCE</div>
            <h3 className="text-2xl font-extrabold tracking-[0.05em] text-[#17150f]">COMMAND CONTROLS</h3>
          </div>
          <CompassRose />
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-[7px] mb-7">
          {b.controls.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2.5">
              <span className="ps-kbd">{k}</span>
              <span className="text-[11.5px] text-[#4c473d]">{v}</span>
            </div>
          ))}
        </div>
        <hr className="ps-rule mb-6" />
        <div className="font-mono text-[9px] tracking-[0.24em] text-[#6b6557] mb-2 border-b border-[#ddd9cd] pb-1">
          THE TACTICAL SHEET
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-[5px] mb-6">
          <p className="text-[11.5px] leading-relaxed text-[#4c473d] col-span-2">
            The ground fights with you or against you. Reconnaissance reveals the enemy; forests conceal; ridgelines,
            buildings and ruins block observation and fire — nothing shoots through a wall it cannot see over. Stone
            walls, boulders, wrecks and trench lines shelter whoever holds them, from the direction they face. Hits on
            flanks and rear hurt far more than frontal ones. Suppressed units lose their nerve — accuracy, sight and
            speed degrade until the fire lifts. Artillery scatters: observed targets are hammered, blind fire wastes
            shells, and anything moving can slip the bracket. Attack aircraft strike in committed passes, then egress.
          </p>
          <p className="text-[11.5px] leading-relaxed text-[#4c473d] col-span-2">
            The battlefield is matter. Trees have trunks — tanks crush them flat, guns splinter them, light vehicles
            must steer between them. Boulders and buildings stop movement dead, and shells break what stands: walls
            breach stone by stone, roofs cave in, collapsed structures open new sightlines and leave rubble that still
            hides a hull. A selected unit in cover carries three ticks on its sheltered side. Crews under fire dive for
            the nearest solid cover — the right side of it, facing the shooter — and resume their mission when the fire
            slackens. Order an assault and they push through instead.
          </p>
        </div>
        <div className="font-mono text-[9px] tracking-[0.24em] text-[#6b6557] mb-2 border-b border-[#ddd9cd] pb-1">
          THE INK LEDGER
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-[5px] mb-6">
          <p className="text-[11.5px] leading-relaxed text-[#4c473d] col-span-2">
            A thin trickle of ink arrives from corps no matter how badly things go — you are never out of the fight
            while you can still take ground. Held sectors and captured ink works pay far more. Destroyed enemy
            formations yield their worth in ink; the enemy earns the same from your losses. An ink works can be
            captured intact — or burned to deny it. Both are legitimate decisions.
          </p>
          {b.economy.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2.5">
              <span className="font-mono text-[9.5px] text-[#17150f] whitespace-nowrap">{k}</span>
              <span className="text-[10.5px] text-[#4c473d]">{v}</span>
            </div>
          ))}
        </div>
        <div className="font-mono text-[9px] tracking-[0.24em] text-[#6b6557] mb-2 border-b border-[#ddd9cd] pb-1">
          THE SKY
        </div>
        <p className="text-[11.5px] leading-relaxed text-[#4c473d] mb-6">
          Air defence is a duel, not a switch. A battery must first see an aircraft on its radar, hold the track for a
          firing solution, and only then launch — and the aircraft answers with flares and hard turns. Gun AA reaches
          only aircraft committed to attack runs; missiles reach the orbit. Heavy SAMs must emplace before they fire,
          so placement is the decision: a battery behind the frontline guards everything inside its ring. The rings are
          drawn on the ground when you select a system — the dashed circle is the radar, the hard circle the envelope.
          The Viper fighter hunts enemy aircraft; the enemy's Buk hunts yours.
        </p>
        <p className="text-[12px] leading-relaxed text-[#4c473d] mb-6">
          Ammunition is finite — spend it like a professional. Order artillery directly onto an observed enemy for
          corrected fire; order it onto empty ground and you will dig craters for nothing. Keep scouts forward: the
          side that sees first, shoots first.
        </p>
        <button
          onClick={onClose}
          className="bg-[#17150f] text-[#f3f1ea] font-mono text-[11px] tracking-[0.26em] px-8 py-3 rounded-[2px] hover:bg-[#26231c] transition-colors w-full"
        >
          RETURN TO OPERATIONS
        </button>
      </div>
    </div>
  );
}
