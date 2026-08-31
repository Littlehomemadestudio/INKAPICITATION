'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · COMMAND — opening the field manual
// The player's relationship with the battlefield: formations,
// positioning, cover, coordinated fire, held ground. Real
// controls lifted from the operation order (BRIEFING).
// ─────────────────────────────────────────────────────────────

import { BRIEFING } from '@/game/world/scenario';
import Reveal from './Reveal';

const ORDERS = [
  ['MOVE', 'pathfinding across live ground'],
  ['ATTACK-MOVE', 'engage on the way'],
  ['FIRE MISSION', 'observed artillery, corrected'],
  ['HOLD', 'dig in, keep the arc'],
  ['PATROL', 'cover a lane'],
  ['ASSAULT', 'push through the cover'],
];

export default function Command() {
  return (
    <section id="command" className="relative border-t border-[#d8d4c8] py-24 md:py-32">
      <div className="mx-auto max-w-[1440px] px-6 md:px-10">
        <div className="grid gap-14 lg:grid-cols-12">
          {/* left rail — the standing orders */}
          <Reveal className="lg:col-span-5">
            <p className="lp-kicker mb-4">02 · Command</p>
            <h2 className="lp-display text-[clamp(38px,4.6vw,64px)] font-medium leading-[1.04] text-[#17150f]">
              You command
              <br />
              formations,
              <br />
              <em className="text-[#575247]">not puppets.</em>
            </h2>
            <p className="mt-6 max-w-[420px] text-[14px] leading-relaxed text-[#4c473d]">
              Crews dive for cover when the fire comes and resume the
              mission when it slackens. High ground sees further. A
              bracketed arc marks the sheltered side of a covered hull.
              The side that sees first, shoots first.
            </p>
            <p className="lp-mono mt-8 max-w-[420px] text-[10px] leading-[2] tracking-[0.12em] text-[#6b6557]">
              {BRIEFING.hudNotes[0].toUpperCase()}
              <br />
              {BRIEFING.hudNotes[1].toUpperCase()}
              <br />
              {BRIEFING.hudNotes[2].toUpperCase()}
            </p>
          </Reveal>

          {/* right — the command map figure + order set */}
          <Reveal delay={140} className="lg:col-span-7">
            <CommandMap />
            {/* order chips — the actuators, one clean footprint */}
            <div className="mt-px grid grid-cols-2 border border-[#d8d4c8] md:grid-cols-3">
              {ORDERS.map(([k, v], i) => (
                <div
                  key={k}
                  className={`bg-[#f3f1ea] px-5 py-4 ${i % 3 !== 2 ? 'md:border-r md:border-[#d8d4c8]' : ''} ${i % 2 === 0 ? 'border-r border-[#d8d4c8] md:border-r-0' : ''} border-b border-[#d8d4c8] ${i >= ORDERS.length - 2 ? 'max-md:border-b-0' : ''} ${i >= ORDERS.length - 3 ? 'max-md:[&:nth-last-child(-n+2)]:border-b-0' : ''}`}
                >
                  <div className="lp-mono text-[10px] font-bold tracking-[0.24em] text-[#17150f]">{k}</div>
                  <div className="mt-1 text-[11.5px] text-[#6b6557]">{v}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// the command-map figure: cover ticks, sight ring, radar vs
// envelope — the game's ring language, drawn as SVG
function CommandMap() {
  const controls = BRIEFING.controls;
  return (
    <div className="lp-bracket relative border border-[#d8d4c8] bg-[#f3f1ea]">
      <div className="flex items-center justify-between border-b border-[#d8d4c8] px-5 py-2.5">
        <span className="lp-mono text-[9px] tracking-[0.3em] text-[#6b6557]">FIG. 2 — SECTOR 12, HOLDING UNDER FIRE</span>
        <span className="lp-mono text-[9px] tracking-[0.3em] text-[#6b6557]">1:20 000</span>
      </div>

      <div className="grid md:grid-cols-[1fr_190px]">
        {/* the figure */}
        <div className="relative overflow-hidden p-6">
          <svg aria-hidden className="w-full" viewBox="0 0 560 300">
            {/* ground hairlines */}
            <path d="M0 250 H560 M0 120 H560" stroke="#d8d4c8" strokeWidth="1" />
            {/* the covered hull: brackets + three cover ticks on the sheltered side */}
            <g transform="translate(150,200)">
              <circle r="74" fill="none" stroke="#c9c4b4" strokeWidth="1" />
              <circle r="46" fill="none" stroke="#8b8577" strokeWidth="1" strokeDasharray="4 6" />
              <path d="M-10 -8 h20 l6 4 v4 h-32 v-4 z" fill="#17150f" />
              <path d="M10 -6 l22 2" stroke="#17150f" strokeWidth="2.4" />
              <rect x="-22" y="-16" width="44" height="28" fill="none" stroke="#4c473d" strokeWidth="1.5" strokeDasharray="5 5" />
              <path d="M-30 -22 h14 M-30 -22 v9 M30 22 h-14 M30 22 v-9" stroke="#17150f" strokeWidth="2" />
              <path d="M-26 14 l0 5 M-21 14 l0 5 M-16 14 l0 5" stroke="#17150f" strokeWidth="1.6" />
              <text x="-64" y="46" fontSize="8" fill="#6b6557" fontFamily="monospace">SABRE 1-2 · IN COVER</text>
            </g>
            {/* the shell inbound from the north-east */}
            <g>
              <path d="M420 40 L214 168" stroke="#575247" strokeWidth="1.2" strokeDasharray="2 5" />
              <circle cx="420" cy="40" r="3" fill="#575247" />
              <text x="430" y="38" fontSize="8" fill="#6b6557" fontFamily="monospace">INBOUND</text>
            </g>
            {/* the radar / envelope pair on the air-defence battery */}
            <g transform="translate(420,190)">
              <circle r="70" fill="none" stroke="#8b8577" strokeWidth="1.2" strokeDasharray="3 6" />
              <circle r="46" fill="none" stroke="#54636f" strokeWidth="1.4" />
              <rect x="-7" y="-5" width="14" height="10" fill="#54636f" />
              <text x="-46" y="88" fontSize="8" fill="#54636f" fontFamily="monospace">RADAR ··· / ENVELOPE —</text>
            </g>
            {/* held sector hatch */}
            <g opacity="0.5">
              <rect x="300" y="236" width="120" height="44" fill="none" stroke="#6b6557" strokeWidth="1" />
              <path d="M300 236 l120 44 M420 236 l-120 44" stroke="#d8d4c8" strokeWidth="0.8" />
              <text x="318" y="262" fontSize="8" fill="#6b6557" fontFamily="monospace">SECTOR HELD</text>
            </g>
          </svg>
        </div>

        {/* the control column — verbatim from the operation order */}
        <div className="border-t border-[#d8d4c8] px-5 py-4 md:border-l md:border-t-0">
          <div className="lp-mono mb-3 text-[9px] tracking-[0.3em] text-[#6b6557]">CONTROLS</div>
          <ul className="space-y-2.5">
            {controls.map(([k, v]) => (
              <li key={k} className="flex items-baseline gap-2.5">
                <span className="lp-kbd lp-mono shrink-0">{k}</span>
                <span className="text-[10.5px] leading-snug text-[#6b6557]">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
