import Link from 'next/link';
import HeroBattlefield from './HeroBattlefield';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · hero — the first screen IS the theatre
// ─────────────────────────────────────────────────────────────

export default function Hero() {
  return (
    <section className="relative h-[100svh] min-h-[640px] overflow-hidden">
      <HeroBattlefield />
      <div className="lp-grain pointer-events-none absolute inset-0 opacity-60" />

      {/* frame instrumentation — sparse, meaningful */}
      <div className="pointer-events-none absolute inset-6 hidden md:block">
        <div className="absolute left-0 top-0 h-4 w-px bg-[#8b8577]" />
        <div className="absolute left-0 top-0 h-px w-4 bg-[#8b8577]" />
        <div className="absolute bottom-0 right-0 h-4 w-px bg-[#8b8577]" />
        <div className="absolute bottom-0 right-0 h-px w-4 bg-[#8b8577]" />
        <span className="lp-mono absolute left-5 top-0 text-[9px] tracking-[0.24em] text-[#6b6557]">
          47°12′N · 33°40′E
        </span>
        <span className="lp-mono absolute bottom-0 right-5 text-[9px] tracking-[0.24em] text-[#6b6557]">
          SHEET 3368-IV · SERIES Z4E · 1:20 000
        </span>
      </div>

      {/* the composition: the battlefield reads around the title */}
      <div className="absolute inset-0 flex items-end">
        <div className="mx-auto w-full max-w-[1440px] px-6 pb-20 md:px-10 md:pb-24">
          <div className="max-w-[620px]">
            <p className="lp-kicker mb-5">Operation Crosswind · Task Force Sabre</p>
            <h1 className="lp-display text-[clamp(64px,10vw,148px)] font-medium leading-[0.92] tracking-[-0.015em] text-[#17150f]">
              Paper
              <br />
              Storm
            </h1>
            <p className="mt-6 max-w-[440px] text-[15px] leading-relaxed text-[#403c33]">
              Land, air and sea on one sheet of paper. A monochrome
              combined-arms war where every victory and every loss is paid
              for in ink — and every battle leaves a mark.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/play" className="lp-cta">
                PLAY NOW
                <span aria-hidden className="lp-cta-arrow">→</span>
              </Link>
              <a href="#theater" className="lp-cta-ghost">
                EXPLORE THE THEATER
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* sector labels — pinned to real map features */}
      <span className="lp-mono pointer-events-none absolute left-[24%] top-[58%] hidden text-[9px] tracking-[0.3em] text-[#575247] lg:block">
        NOVY GOROD
      </span>
      <span className="lp-mono pointer-events-none absolute bottom-[16%] left-[30%] hidden text-[9px] tracking-[0.3em] text-[#e5e3da] lg:block">
        AZURE BAY
      </span>

      {/* scroll cue */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 md:block">
        <span className="lp-mono text-[9px] tracking-[0.4em] text-[#6b6557]">DESCEND INTO THE SHEET ▾</span>
      </div>
    </section>
  );
}
