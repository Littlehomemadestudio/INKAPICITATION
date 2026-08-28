'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · unit recognition plates
// Roster silhouettes rendered with the SAME hand-authored art
// as the battlefield — drawVehicle / drawShip on a canvas chip.
// 'plate'  → dark stamp on paper (the detail card, field-manual
//            recognition-silhouette style)
// 'panel'  → light stamp on the dark command panel
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import type { UnitType } from '@/game/entities/unitDefs';
import { UNIT_DEFS, isNavalType } from '@/game/entities/unitDefs';
import { drawVehicle, type DrawStyle } from '@/game/entities/unitDraw';
import { drawShip, createMountStates } from '@/game/entities/shipDraw';

const PLATE_STYLE: DrawStyle = {
  // dark ink on paper — the recognition card
  body: '#17150f',
  track: '#2b271e',
  wheel: '#4c473d',
  detail: '#57524766',
  accent: '#6b655a',
  dark: '#0a0906',
};

const PANEL_STYLE: DrawStyle = {
  // light steel on the dark panel
  body: '#c9c5b8',
  track: '#8d887b',
  wheel: '#5d584d',
  detail: '#3a352c',
  accent: '#a8a396',
  dark: '#26231c',
};

export type GlyphSkin = 'plate' | 'panel';

export function drawUnitGlyph(
  ctx: CanvasRenderingContext2D,
  type: UnitType,
  w: number,
  h: number,
  skin: GlyphSkin
) {
  const def = UNIT_DEFS[type];
  if (!def) return;
  const style = skin === 'plate' ? PLATE_STYLE : PANEL_STYLE;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  // fit with margin: barrels and wings overhang the hull box
  const halfLen = def.length * (isNavalType(type) ? 0.56 : 0.88);
  const halfWid = def.width * (def.isAir ? 0.62 : 0.7) + (isNavalType(type) ? 0 : 0.9);
  const scale = Math.min((w * 0.44) / halfLen, (h * 0.42) / halfWid);
  ctx.scale(scale, scale);
  if (isNavalType(type)) {
    drawShip(ctx, {
      type,
      style,
      detail: 2,
      mounts: createMountStates(type),
    });
  } else {
    drawVehicle(ctx, {
      type,
      style,
      detail: 2,
      turretAngle: 0,
      radarAngle: 0.6,
      missiles: def.isAir ? def.ammo : undefined,
    });
  }
  ctx.restore();
}

export function UnitGlyph({
  type,
  w,
  h,
  skin = 'panel',
}: {
  type: UnitType;
  w: number;
  h: number;
  skin?: GlyphSkin;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawUnitGlyph(ctx, type, w, h, skin);
  }, [type, w, h, skin]);
  return <canvas ref={ref} style={{ width: w, height: h }} aria-hidden />;
}
