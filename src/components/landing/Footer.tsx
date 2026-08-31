import Link from 'next/link';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · footer — the colophon strip
// ─────────────────────────────────────────────────────────────

export default function Footer() {
  return (
    <footer className="border-t border-[#36322a] bg-[#12110e] text-[#d9d6cc]">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-6 px-6 py-8 md:px-10">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block"
            style={{
              width: 10,
              height: 12,
              background: '#f3f1ea',
              clipPath: 'polygon(50% 0%, 100% 62%, 78% 100%, 22% 100%, 0% 62%)',
            }}
          />
          <span className="lp-mono text-[11px] font-bold tracking-[0.34em]">PAPER STORM</span>
          <span className="lp-mono text-[9px] tracking-[0.24em] text-[#5d584d]">— OPERATION CROSSWIND</span>
        </div>
        <div className="lp-mono flex flex-wrap items-center gap-8 text-[9px] tracking-[0.24em] text-[#8d887b]">
          <span>SHEET 3368-IV</span>
          <span>AZURE COAST · 8 × 6 KM</span>
          <a href="#theater" className="no-underline transition-colors hover:text-[#f3f1ea]">TOP OF THE SHEET ↑</a>
          <Link href="/play" className="no-underline transition-colors hover:text-[#f3f1ea]">
            PLAY NOW
          </Link>
        </div>
      </div>
    </footer>
  );
}
