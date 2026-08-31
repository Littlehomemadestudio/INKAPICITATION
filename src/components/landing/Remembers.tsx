'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · THE BATTLEFIELD REMEMBERS
// The quiet page after the action. Wrecks remain, smoke
// persists, craters scar the ground. Rendered dark — the ink
// side of the identity — with the game's own wreck styles.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { drawVehicle, WRECK_STYLE, FRIEND_STYLE } from '@/game/entities/unitDraw';
import { drawShip, createMountStates } from '@/game/entities/shipDraw';
import { RNG } from '@/game/core/math';
import Link from 'next/link';
import Reveal from './Reveal';

function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.clearRect(0, 0, w, h);
  const rng = new RNG(0x3368);
  const scale = w / 1200;
  ctx.save();
  ctx.scale(scale, scale);

  // ground — near-black paper, hairline horizon grid
  ctx.fillStyle = '#12110e';
  ctx.fillRect(0, 0, 1200, h / scale);

  // craters — soft rims, ink cores, permanent
  for (let i = 0; i < 14; i++) {
    const x = rng.range(40, 1160);
    const y = rng.range(60, 300);
    const r = rng.range(9, 26);
    ctx.fillStyle = 'rgba(60, 56, 47, 0.5)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0906';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // wrecks — tossed turrets, burned hulls, half-sunk ship
  const wrecks: [number, number, number][] = [
    [220, 210, 0.4],
    [340, 250, 2.2],
    [620, 230, 3.6],
    [760, 265, 1.4],
    [960, 220, 2.9],
  ];
  for (const [x, y, a] of wrecks) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    drawVehicle(ctx, { type: 'T90M', style: WRECK_STYLE, detail: 1, turretAngle: 0, radarAngle: 0, wreck: true, noTurret: true });
    ctx.restore();
  }
  // the bay remembers — a broken hull, listing
  ctx.save();
  ctx.translate(1090, 255);
  ctx.scale(0.8, 0.8);
  ctx.rotate(0.35);
  drawShip(ctx, { type: 'FRIGATE', style: WRECK_STYLE, detail: 1, mounts: createMountStates('FRIGATE'), listing: 0.7, wreck: true });
  ctx.restore();
  // one survivor, still fighting — black on the dark ground
  ctx.save();
  ctx.translate(500, 150);
  ctx.rotate(3.0);
  drawVehicle(ctx, { type: 'M1A2', style: FRIEND_STYLE, detail: 1, turretAngle: -0.5, radarAngle: 0 });
  ctx.restore();

  // persistent smoke — two columns, barely alive
  for (const sx of [230, 780]) {
    for (let p = 0; p < 3; p++) {
      const life = (t * 0.05 + p * 0.33 + sx) % 1;
      const x = sx + life * 50 + Math.sin(t * 0.3 + p + sx) * 6;
      const y = 200 - life * 150;
      const r = 12 + life * 26;
      const a = 0.1 * (1 - life);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(140, 133, 119, ${a})`);
      g.addColorStop(1, 'rgba(140, 133, 119, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  ctx.restore();
}

export default function Remembers() {
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
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, w, h, t);
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let running = false;
    const t0 = performance.now();
    const frame = () => {
      paint((performance.now() - t0) / 1000);
      if (running) raf = requestAnimationFrame(frame);
    };
    paint(0);
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
    <section className="lp-footer relative">
      <div className="relative">
        <canvas
          ref={ref}
          className="block h-[300px] w-full md:h-[380px]"
          aria-label="A dark, quiet battlefield: wrecks, craters and thin smoke under a black sky"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[#12110e]" />
      </div>

      <div className="mx-auto max-w-[1440px] px-6 pb-24 md:px-10">
        <Reveal>
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="lp-mono text-[10px] tracking-[0.34em] text-[#5d584d]">05 · THE BATTLEFIELD REMEMBERS</p>
              <h2 className="lp-display mt-5 text-[clamp(34px,4vw,56px)] font-medium leading-[1.06] text-[#f3f1ea]">
                Not everything explodes.
                <br />
                <em className="text-[#8d887b]">Some things stay.</em>
              </h2>
              <p className="mt-6 max-w-[520px] text-[14px] leading-relaxed text-[#8d887b]">
                Wrecks remain where they fell and become cover for the
                next assault. Smoke persists over the dead. Craters scar
                the ground for the rest of the battle. The sheet you end
                on is not the sheet you started on.
              </p>
            </div>
            <div className="flex items-end lg:col-span-5 lg:justify-end">
              <Link
                href="/play"
                className="lp-mono inline-flex items-center gap-3 border border-[#36322a] px-8 py-4 text-[11px] tracking-[0.3em] text-[#f3f1ea] no-underline transition-colors hover:border-[#8d887b] hover:bg-[#191713]"
              >
                TAKE THE SHEET →
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
