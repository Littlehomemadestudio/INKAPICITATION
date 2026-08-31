'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · INK — the war's signature
// A slow, deliberate sequence: impact → spread → stain. The
// engine draws organic ink geometry (same generator family the
// hero uses), cycles through strikes, and under reduced motion
// settles into a finished stain.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { RNG } from '@/game/core/math';
import { BRIEFING } from '@/game/world/scenario';
import Reveal from './Reveal';

// strike sites on the canvas, in normalised units
const SITES: [number, number, number][] = [
  [0.24, 0.4, 0.16],
  [0.68, 0.62, 0.11],
  [0.47, 0.28, 0.07],
  [0.82, 0.3, 0.05],
];
const CYCLE = 9.5; // seconds between strikes

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.clearRect(0, 0, w, h);
  // faint chart furniture under the ink
  ctx.strokeStyle = 'rgba(139, 133, 119, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.9);
  ctx.lineTo(w * 0.92, h * 0.9);
  ctx.moveTo(w * 0.08, h * 0.12);
  ctx.lineTo(w * 0.08, h * 0.9);
  ctx.stroke();

  SITES.forEach(([nx, ny, nr], i) => {
    const elapsed = t - i * (CYCLE / SITES.length);
    if (elapsed < 0) return;
    const grow = Math.min(elapsed / 2.6, 1);
    // ink does not spread linearly — it bolts, then seeps
    const eased = 1 - Math.pow(1 - grow, 2.2);
    const r = nr * Math.min(w, h) * eased;
    const rng = new RNG(0x1a41 + i * 977);
    const cx = nx * w;
    const cy = ny * h;

    // the stain — feathered edge via layered alpha rings
    for (let layer = 3; layer >= 1; layer--) {
      ctx.globalAlpha = 0.16 * layer;
      inkPath(ctx, cx, cy, r * (1 + layer * 0.14), rng, 12);
      ctx.fillStyle = '#17150f';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    inkPath(ctx, cx, cy, r, rng, 12);
    ctx.fillStyle = '#17150f';
    ctx.fill();

    // splatter arrives at the moment of impact, stays forever
    if (elapsed > 0.15) {
      const n = 16;
      for (let k = 0; k < n; k++) {
        const a = rng.next() * Math.PI * 2;
        const d = r * (1.15 + rng.next() * 1.7);
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 1 + rng.next() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // annotation at the strike point — one coordinate line
    ctx.fillStyle = 'rgba(107, 101, 87, 0.9)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText(`GRID ${String(Math.round(cx)).padStart(4, '0')}-${String(Math.round(cy)).padStart(4, '0')}`, cx + r + 10, cy - r - 6);
  });
}

function inkPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rng: RNG,
  lobes: number
) {
  const pts: number[][] = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const rr = r * (0.5 + rng.next() * 0.85);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85]);
  }
  ctx.beginPath();
  ctx.moveTo((pts[0][0] + pts[pts.length - 1][0]) / 2, (pts[0][1] + pts[pts.length - 1][1]) / 2);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const n = pts[(i + 1) % pts.length];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2);
  }
  ctx.closePath();
}

export default function InkSection() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const paint = (t: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const bw = Math.round(w * dpr);
      const bh = Math.round(h * dpr);
      if (cv.width !== bw || cv.height !== bh) {
        cv.width = bw;
        cv.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // the sequence loops: four strikes, then the sheet is cleared
      drawFrame(ctx, w, h, (t * 0.35) % (CYCLE * 2));
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let running = false;
    const t0 = performance.now();
    const frame = () => {
      paint((performance.now() - t0) / 1000);
      if (running) raf = requestAnimationFrame(frame);
    };
    paint(0); // finished stains under reduced motion
    if (!reduced) {
      running = true;
      raf = requestAnimationFrame(frame);
    }

    const io = new IntersectionObserver(([e]) => {
      const want = e.isIntersecting && !reduced;
      if (want && !running) {
        running = true;
        raf = requestAnimationFrame(frame);
      } else if (!want && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    });
    io.observe(cv);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  return (
    <section id="ink" className="relative border-t border-[#d8d4c8] py-24 md:py-32">
      <div className="mx-auto max-w-[1440px] px-6 md:px-10">
        <div className="grid items-center gap-14 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <p className="lp-kicker mb-4">04 · Ink</p>
            <h2 className="lp-display text-[clamp(44px,5.6vw,84px)] font-medium leading-[1.0] text-[#17150f]">
              Battles
              <br />
              leave
              <br />
              <em>a mark.</em>
            </h2>
            <p className="mt-7 max-w-[400px] text-[14.5px] leading-relaxed text-[#4c473d]">
              Destroyed units, impacts and explosions leave black Ink
              across the pale battlefield. Ink is also the economy: a
              trickle from corps, a stream from held ground, a bounty on
              every enemy formation. One war, one currency.
            </p>
          </Reveal>

          <Reveal delay={140} className="lg:col-span-7">
            <div className="lp-bracket relative border border-[#d8d4c8] bg-[#f3f1ea]">
              <div className="flex items-center justify-between border-b border-[#d8d4c8] px-5 py-2.5">
                <span className="lp-mono text-[9px] tracking-[0.3em] text-[#6b6557]">FIG. 3 — INK DISPERSION, LIVE SHEET</span>
                <span className="lp-mono text-[9px] tracking-[0.3em] text-[#6b6557]">SCALE 1:20 000</span>
              </div>
              <canvas ref={ref} className="block h-[320px] w-full md:h-[400px]" aria-label="Black ink spreading across a pale chart" />
            </div>

            {/* the ledger — verbatim economy lines from the briefing */}
            <div className="mt-10">
              <div className="lp-mono mb-2 border-b border-[#b9b4a6] pb-1.5 text-[9px] tracking-[0.3em] text-[#6b6557]">
                THE INK LEDGER
              </div>
              {BRIEFING.economy.map(([k, v]) => (
                <div key={k} className="lp-ledger-row">
                  <span className="lp-mono text-[10px] tracking-[0.14em] text-[#17150f]">{k}</span>
                  <span className="text-[12.5px] text-[#4c473d]">{v}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
