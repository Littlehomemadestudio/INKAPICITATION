'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · landing nav — paper strip, hairline, ink mark
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';

const LINKS: [string, string][] = [
  ['THEATER', '#theater'],
  ['COMMAND', '#command'],
  ['ARSENAL', '#arsenal'],
  ['INK', '#ink'],
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`lp-nav fixed inset-x-0 top-0 z-40 ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-3.5 md:px-10">
        <Link href="/" className="flex items-center gap-3 no-underline">
          {/* the ink reserve mark — same glyph the HUD uses */}
          <span
            aria-hidden
            className="inline-block"
            style={{
              width: 11,
              height: 13,
              background: '#17150f',
              clipPath: 'polygon(50% 0%, 100% 62%, 78% 100%, 22% 100%, 0% 62%)',
            }}
          />
          <span className="lp-mono text-[12px] font-bold tracking-[0.34em] text-[#17150f]">
            PAPER&nbsp;STORM
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="lp-mono text-[10px] tracking-[0.28em] text-[#6b6557] no-underline transition-colors hover:text-[#17150f]"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/play?mode=multiplayer"
            className="lp-mono border border-[#17150f] px-4 py-2 text-[10px] tracking-[0.3em] text-[#17150f] no-underline transition-colors hover:bg-[#17150f] hover:text-[#f3f1ea]"
          >
            MULTIPLAYER
          </Link>
          <Link
            href="/play"
            className="lp-mono border border-[#17150f] bg-[#17150f] px-5 py-2 text-[10px] tracking-[0.3em] text-[#f3f1ea] no-underline transition-colors hover:bg-[#2c2820]"
          >
            PLAY NOW
          </Link>
        </div>
      </div>
    </header>
  );
}
