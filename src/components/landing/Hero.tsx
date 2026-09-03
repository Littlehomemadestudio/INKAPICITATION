'use client';

import Link from 'next/link';
import HeroBattlefield from './HeroBattlefield';

// ─────────────────────────────────────────────────────────────
// OPERATION PAPERSTORM · Hero — full-screen command interface
// The landing page IS the battlefield. No navigation chrome,
// no marketing sections. One screen. One action: PLAY.
// ─────────────────────────────────────────────────────────────

export default function Hero() {
  return (
    <section className="relative h-[100svh] w-full overflow-hidden">
      {/* Full-viewport interactive battlefield */}
      <HeroBattlefield />
      
      {/* Subtle paper grain overlay */}
      <div className="lp-grain pointer-events-none absolute inset-0 opacity-50" />

      {/* Top-left: Operation designation + status */}
      <div className="pointer-events-none absolute left-4 top-4 md:left-6 md:top-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="lp-mono text-[clamp(18px,2.5vw,28px)] font-bold tracking-[0.28em] text-[#17150f]">
            OPERATION PAPERSTORM
          </h1>
          <div className="flex items-center gap-3">
            <span className="lp-mono flex items-center gap-2 text-[9px] tracking-[0.2em] text-[#6b6557]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#17150f] opacity-20"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#17150f]"></span>
              </span>
              ONLINE
            </span>
            <span className="lp-mono text-[9px] tracking-[0.2em] text-[#6b6557]">·</span>
            <span className="lp-mono text-[9px] tracking-[0.2em] text-[#6b6557]">REGION: CENTRAL</span>
          </div>
        </div>
      </div>

      {/* Top-right: Micro info */}
      <div className="pointer-events-none absolute right-4 top-4 hidden flex-col items-end gap-1 md:flex">
        <span className="lp-mono text-[9px] tracking-[0.2em] text-[#6b6557]">V 1.0.4</span>
        <span className="lp-mono text-[9px] tracking-[0.2em] text-[#6b6557]">BUILD 3368</span>
      </div>

      {/* Bottom-left: Primary command interface */}
      <div className="absolute bottom-8 left-0 right-0 md:bottom-12">
        <div className="mx-auto flex max-w-[1440px] flex-col items-start px-6 md:px-10">
          <div className="max-w-[520px]">
            <p className="lp-kicker mb-4">COMBINED ARMS REAL-TIME STRATEGY</p>
            <h2 className="lp-display text-[clamp(48px,8vw,110px)] font-medium leading-[0.92] tracking-[-0.01em] text-[#17150f]">
              COMMAND
              <br />
              THE STORM
            </h2>
            <p className="mt-5 max-w-[400px] text-[14px] leading-relaxed text-[#4c473d]">
              Land, air, and sea forces on a single tactical sheet. 
              Every unit paid for in ink. Every battle leaves a mark.
            </p>
            
            {/* Primary action: PLAY */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/play" className="lp-cta">
                PLAY
                <span aria-hidden className="lp-cta-arrow">→</span>
              </Link>
              <Link href="/play?mode=multiplayer" className="lp-cta-ghost">
                MULTIPLAYER
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom-right: Sector labels tied to battlefield features */}
      <span className="lp-mono pointer-events-none absolute bottom-6 right-6 hidden text-[8px] tracking-[0.28em] text-[#6b6557] lg:block">
        SECTOR NOVY GOROD · AZURE BAY
      </span>
    </section>
  );
}
