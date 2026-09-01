'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · THE THEATER — land, air, sea as one war
// An asymmetric chart: the land column carries the composition,
// the air runs as a vector band, the sea holds the bottom edge.
// ─────────────────────────────────────────────────────────────

import { UnitGlyph } from '@/components/game/hud/UnitGlyph';
import Reveal from './Reveal';

export default function Theater() {
  return (
    <section id="theater" className="relative border-t border-[#d8d4c8] py-24 md:py-32">
      <div className="mx-auto max-w-[1440px] px-6 md:px-10">
        <Reveal>
          <p className="lp-kicker mb-4">01 · The Theater</p>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="lp-display max-w-[560px] text-[clamp(38px,4.6vw,64px)] font-medium leading-[1.04] text-[#17150f]">
              One battlefield.
              <br />
              <em className="text-[#575247]">Three domains.</em>
            </h2>
            <p className="lp-mono max-w-[300px] text-[10px] leading-[1.9] tracking-[0.14em] text-[#6b6557]">
              THE SHEET IS 8 × 6 KM. THE RIVER SEVERNAYA IS THE FRONT
              LINE. THE BAY PAYS INK. THE SKY IS CONTESTED GROUND.
            </p>
          </div>
        </Reveal>

        {/* asymmetric chart — 7/5 split, deliberately unequal */}
        <Reveal delay={120} className="mt-14">
          <div className="grid gap-px border border-[#d8d4c8] bg-[#d8d4c8] md:grid-cols-12">
            {/* LAND — the heavy column */}
            <div className="lp-grain relative col-span-12 bg-[#f3f1ea] p-8 md:col-span-7 md:p-10">
              <span className="lp-mono absolute right-5 top-5 text-[9px] tracking-[0.3em] text-[#6b6557]">
                GRID 1560-0480
              </span>
              <div className="lp-mono text-[11px] tracking-[0.4em] text-[#17150f]">LAND</div>
              <p className="mt-3 max-w-[420px] text-[13.5px] leading-relaxed text-[#4c473d]">
                Armour finds its own way or dies trying. Trees have trunks,
                walls stop shells, wrecks shelter the next assault. The
                ground is matter, not a picture.
              </p>
              <div className="mt-8 flex items-end gap-1.5">
                {(['M1A2', 'M1A2', 'M2A3', 'M109A7', 'M1127'] as const).map((t, i) => (
                  <div key={i} className="lp-glyph" style={{ transform: `translateY(${i % 2 === 0 ? 0 : 6}px)` }}>
                    <UnitGlyph type={t} w={92} h={44} skin="plate" />
                  </div>
                ))}
              </div>
              <div className="lp-mono mt-6 flex gap-6 text-[9px] tracking-[0.2em] text-[#6b6557]">
                <span>ARMOUR</span>
                <span>MECH</span>
                <span>GUNS</span>
                <span>RECON</span>
              </div>
              {/* contour fragment */}
              <svg aria-hidden className="pointer-events-none absolute -right-6 bottom-6 opacity-70" width="180" height="120" viewBox="0 0 180 120">
                {[70, 54, 38, 22].map((r, i) => (
                  <ellipse
                    key={r}
                    cx="120"
                    cy="70"
                    rx={r + 24}
                    ry={r}
                    fill="none"
                    stroke="#c9c4b4"
                    strokeWidth="1.3"
                    transform={`rotate(${8 + i * 3} 120 70)`}
                  />
                ))}
                <text x="116" y="74" fontSize="8" fill="#8b8577" fontFamily="monospace">204</text>
              </svg>
            </div>

            {/* AIR — the vector band */}
            <div className="col-span-12 bg-[#f3f1ea] p-8 md:col-span-5 md:p-10">
              <div className="flex items-start justify-between">
                <div className="lp-mono text-[11px] tracking-[0.4em] text-[#17150f]">AIR</div>
                <span className="lp-mono text-[9px] tracking-[0.2em] text-[#6b6557]">ALT LOW — ORBIT</span>
              </div>
              <p className="mt-3 max-w-[360px] text-[13.5px] leading-relaxed text-[#4c473d]">
                Gun defences reach the deck; missiles reach the orbit.
                Aircraft strike in committed passes, then egress. The duel
                is radar, track, release.
              </p>
              <div className="relative mt-8">
                {/* the flight vector */}
                <svg aria-hidden className="w-full" height="64" viewBox="0 0 400 64">
                  <path d="M8 46 C 110 40, 240 18, 392 14" fill="none" stroke="#8b8577" strokeWidth="1.3" strokeDasharray="6 7" />
                  <path d="M392 14 l-10 -4 m10 4 l-11 5" fill="none" stroke="#8b8577" strokeWidth="1.3" />
                  <circle cx="120" cy="35" r="2.4" fill="#17150f" />
                  <circle cx="238" cy="24" r="2.4" fill="#17150f" />
                  <text x="108" y="56" fontSize="8" fill="#6b6557" fontFamily="monospace">SABRE FLIGHT</text>
                </svg>
                <div className="mt-2 flex items-center gap-5">
                  <div className="lp-glyph"><UnitGlyph type="F16C" w={86} h={40} skin="plate" /></div>
                  <div className="lp-glyph"><UnitGlyph type="A10C" w={86} h={40} skin="plate" /></div>
                </div>
              </div>
            </div>

            {/* SEA — the bottom edge */}
            <div className="col-span-12 border-t border-[#d8d4c8] bg-[#e9e7df] p-8 md:col-span-12 md:px-10 md:py-8">
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div className="flex items-center gap-8">
                  <div className="lp-mono text-[11px] tracking-[0.4em] text-[#17150f]">SEA</div>
                  <div className="lp-glyph"><UnitGlyph type="DESTROYER" w={220} h={54} skin="plate" /></div>
                  <div className="lp-glyph hidden sm:block"><UnitGlyph type="FRIGATE" w={170} h={44} skin="plate" /></div>
                  <div className="lp-glyph hidden lg:block"><UnitGlyph type="PATROL" w={92} h={34} skin="plate" /></div>
                </div>
                <div className="lp-mono flex flex-wrap gap-x-8 gap-y-2 text-[9px] tracking-[0.2em] text-[#6b6557]">
                  <span>SURFACE COMBAT</span>
                  <span>NAVAL GUNFIRE</span>
                  <span>FLEET DEFENCE</span>
                  <span className="text-[#54636f]">THE ONE COLOUR IN THE WAR</span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
