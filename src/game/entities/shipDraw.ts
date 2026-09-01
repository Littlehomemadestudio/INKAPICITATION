// ─────────────────────────────────────────────────────────────
// PAPER STORM · warship silhouettes + weapon battery layout
// Hand-authored top-down profiles, local frame: bow +X, metres.
// Five classes, each a silhouette you can name at any zoom —
// the capital ship is a mountain of steel, not a scaled destroyer.
// detail: 0 = strategic silhouette, 1 = standard, 2 = close range
// ─────────────────────────────────────────────────────────────

import type { UnitType } from './unitDefs';
import type { DrawStyle } from './unitDraw';

// ── weapon battery definitions ───────────────────────────────

export interface MountDef {
  kind: 'GUN' | 'SSM' | 'SAM' | 'CIWS' | 'TORP';
  /** local hull position (m, +X bow) */
  x: number;
  y: number;
  /** gun calibre in mm — drives turret art, sound, splash scale */
  calibre?: number;
  barrels?: number;
  range: number;
  damage: number;
  reload: number;
  burst?: number;
  burstInterval?: number;
  turretRate?: number;
  ammo?: number;
  /** torpedo running speed (m/s) */
  speed?: number;
}

/** per-class battery layout — mirrors real-world design logic */
export const SHIP_CONFIGS: Partial<Record<UnitType, MountDef[]>> = {
  PATROL: [
    { kind: 'GUN', x: 9.0, y: 0, calibre: 25, barrels: 1, range: 430, damage: 3.4, reload: 2.6, burst: 6, burstInterval: 0.14, turretRate: 2.8 },
    { kind: 'TORP', x: -1.5, y: 3.2, range: 540, damage: 235, reload: 999, ammo: 1, speed: 47 },
    { kind: 'TORP', x: -1.5, y: -3.2, range: 540, damage: 235, reload: 999, ammo: 1, speed: 47 },
  ],
  FRIGATE: [
    { kind: 'GUN', x: 31, y: 0, calibre: 76, barrels: 1, range: 860, damage: 26, reload: 3.4, turretRate: 1.4 },
    { kind: 'SAM', x: -4, y: 0, range: 1050, damage: 34, reload: 3.5, ammo: 24 },
    { kind: 'CIWS', x: -35, y: 0, calibre: 30, range: 420, damage: 2.4, reload: 0.8, burst: 12, burstInterval: 0.055 },
  ],
  DESTROYER: [
    { kind: 'GUN', x: 45, y: 0, calibre: 130, barrels: 2, range: 1160, damage: 44, reload: 4.2, turretRate: 1.0 },
    { kind: 'SSM', x: 8, y: 0, range: 1500, damage: 92, reload: 9, ammo: 8 },
    { kind: 'SAM', x: -13, y: 0, range: 1000, damage: 30, reload: 3.2, ammo: 16 },
    { kind: 'CIWS', x: -53, y: 0, calibre: 30, range: 420, damage: 2.4, reload: 0.75, burst: 14, burstInterval: 0.05 },
  ],
  CRUISER: [
    { kind: 'GUN', x: 57, y: 0, calibre: 152, barrels: 2, range: 1460, damage: 54, reload: 5, turretRate: 0.7 },
    { kind: 'GUN', x: 35, y: 0, calibre: 152, barrels: 2, range: 1460, damage: 54, reload: 5, turretRate: 0.7 },
    { kind: 'SSM', x: -42, y: 0, range: 1550, damage: 95, reload: 8, ammo: 12 },
    { kind: 'SAM', x: -2, y: 0, range: 1150, damage: 32, reload: 3, ammo: 32 },
    { kind: 'CIWS', x: 42, y: 8, calibre: 30, range: 420, damage: 2.4, reload: 0.7, burst: 14, burstInterval: 0.05 },
    { kind: 'CIWS', x: -62, y: 0, calibre: 30, range: 420, damage: 2.4, reload: 0.7, burst: 14, burstInterval: 0.05 },
  ],
  BATTLESHIP: [
    { kind: 'GUN', x: 90, y: 0, calibre: 380, barrels: 3, range: 1650, damage: 100, reload: 6.8, turretRate: 0.35 },
    { kind: 'GUN', x: 63, y: 0, calibre: 380, barrels: 3, range: 1650, damage: 100, reload: 6.8, turretRate: 0.35 },
    { kind: 'GUN', x: -84, y: 0, calibre: 380, barrels: 3, range: 1650, damage: 100, reload: 6.8, turretRate: 0.35 },
    { kind: 'SSM', x: -12, y: 0, range: 1600, damage: 95, reload: 7.5, ammo: 16 },
    { kind: 'SAM', x: 32, y: 0, range: 1200, damage: 32, reload: 2.8, ammo: 40 },
    { kind: 'CIWS', x: 52, y: 9.5, calibre: 30, range: 440, damage: 2.4, reload: 0.7, burst: 16, burstInterval: 0.045 },
    { kind: 'CIWS', x: 52, y: -9.5, calibre: 30, range: 440, damage: 2.4, reload: 0.7, burst: 16, burstInterval: 0.045 },
    { kind: 'CIWS', x: -48, y: 9.5, calibre: 30, range: 440, damage: 2.4, reload: 0.7, burst: 16, burstInterval: 0.045 },
    { kind: 'CIWS', x: -48, y: -9.5, calibre: 30, range: 440, damage: 2.4, reload: 0.7, burst: 16, burstInterval: 0.045 },
  ],
};

/** live state of one weapon mount */
export interface MountState {
  def: MountDef;
  /** current turret angle relative to hull (rad) */
  angle: number;
  reload: number;
  burstLeft: number;
  burstT: number;
  ammo: number;
  recoil: number;
}

export function createMountStates(type: UnitType): MountState[] {
  const defs = SHIP_CONFIGS[type] ?? [];
  return defs.map((def) => ({
    def,
    angle: 0,
    reload: def.reload * (0.4 + Math.random() * 0.6),
    burstLeft: 0,
    burstT: 0,
    ammo: def.ammo ?? 9999,
    recoil: 0,
  }));
}

/** world-space position of a mount */
export function mountWorld(u: { x: number; y: number; angle: number }, m: MountState): { x: number; y: number; angle: number } {
  const c = Math.cos(u.angle);
  const s = Math.sin(u.angle);
  return {
    x: u.x + c * m.def.x - s * m.def.y,
    y: u.y + s * m.def.x + c * m.def.y,
    angle: u.angle + m.angle,
  };
}

// ── drawing ──────────────────────────────────────────────────

export interface ShipDrawOpts {
  type: UnitType;
  style: DrawStyle;
  detail: number;
  /** live turret angles relative to hull */
  mounts?: MountState[];
  /** 0..1 hull list during sinking */
  listing?: number;
  wreck?: boolean;
}

function poly(ctx: CanvasRenderingContext2D, pts: number[][]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function mirrorPoly(pts: number[][]): number[][] {
  // given the port-side half outline bow→stern, close it to starboard
  const out = pts.slice();
  for (let i = pts.length - 2; i >= 1; i--) out.push([pts[i][0], -pts[i][1]]);
  return out;
}

const HULLS: Record<string, number[][]> = {
  PATROL: mirrorPoly([[13.5, 0], [12.4, 1.7], [9.5, 2.7], [3, 3.3], [-8, 3.3], [-12.2, 2.9], [-13.5, 1.9]]),
  FRIGATE: mirrorPoly([[48, 0], [45, 2.6], [40, 4.4], [30, 5.6], [5, 6.5], [-32, 6.5], [-44, 6.0], [-48, 4.6]]),
  DESTROYER: mirrorPoly([[67, 0], [63.5, 3.0], [56, 5.2], [42, 6.9], [10, 8.2], [-40, 8.2], [-58, 7.6], [-67, 5.8]]),
  CRUISER: mirrorPoly([[86, 0], [82, 3.4], [73, 6.0], [58, 7.9], [20, 9.5], [-48, 9.5], [-72, 8.8], [-86, 6.6]]),
  BATTLESHIP: mirrorPoly([[119, 0], [114, 4.6], [104, 8.4], [88, 12.0], [60, 15.2], [10, 16.5], [-70, 16.5], [-100, 15.4], [-114, 12.6], [-119, 9.2]]),
};

/** a rotating gun turret sized by calibre */
function drawTurret(ctx: CanvasRenderingContext2D, s: DrawStyle, d: number, cal: number, barrels: number, recoil: number, detail: number) {
  const scale = cal / 100;
  const turretLen = 3.6 * scale + 2.2;
  const turretWid = 2.6 * scale + 1.6;
  const barrelLen = (4.4 * scale + 3.2) * (cal >= 300 ? 1.15 : 1);
  const bw = Math.max(0.5, cal / 90);
  ctx.save();
  ctx.translate(-recoil * Math.min(2, cal / 100), 0);
  // barrels
  ctx.fillStyle = s.dark;
  const spread = barrels > 1 ? bw * 1.15 : 0;
  for (let b = 0; b < barrels; b++) {
    const oy = (b - (barrels - 1) / 2) * spread;
    ctx.fillRect(turretLen * 0.4, oy - bw / 2, barrelLen, bw);
    if (cal >= 120 && detail >= 1) {
      // thermal sleeve
      ctx.fillStyle = s.wheel;
      ctx.fillRect(turretLen * 0.4 + barrelLen * 0.42, oy - bw * 0.75, barrelLen * 0.22, bw * 1.5);
      ctx.fillStyle = s.dark;
    }
  }
  // turret house
  ctx.fillStyle = s.body;
  if (cal >= 200) {
    // big-gun turret: angular house, three guns
    poly(ctx, [
      [turretLen * 0.55, 0], [turretLen * 0.28, -turretWid * 0.62], [-turretLen * 0.5, -turretWid * 0.5],
      [-turretLen * 0.62, 0], [-turretLen * 0.5, turretWid * 0.5], [turretLen * 0.28, turretWid * 0.62],
    ]);
  } else {
    poly(ctx, [
      [turretLen * 0.5, 0], [turretLen * 0.2, -turretWid * 0.6], [-turretLen * 0.45, -turretWid * 0.55],
      [-turretLen * 0.55, 0], [-turretLen * 0.45, turretWid * 0.55], [turretLen * 0.2, turretWid * 0.6],
    ]);
  }
  ctx.fill();
  if (detail >= 1) {
    ctx.strokeStyle = s.detail;
    ctx.lineWidth = Math.max(0.18, cal / 400);
    ctx.stroke();
    // rangefinder ears on big turrets
    if (cal >= 152 && detail >= 2) {
      ctx.fillStyle = s.wheel;
      ctx.fillRect(-turretLen * 0.42, -turretWid * 0.72, turretLen * 0.2, turretWid * 0.2);
      ctx.fillRect(-turretLen * 0.42, turretWid * 0.52, turretLen * 0.2, turretWid * 0.2);
    }
  }
  ctx.restore();
}

function drawVLS(ctx: CanvasRenderingContext2D, s: DrawStyle, w: number, h: number, cols: number, rows: number, detail: number) {
  ctx.fillStyle = s.wheel;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  if (detail >= 1) {
    ctx.strokeStyle = s.dark;
    ctx.lineWidth = 0.32;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    const cw = w / cols;
    const ch = h / rows;
    ctx.beginPath();
    for (let c = 1; c < cols; c++) {
      ctx.moveTo(-w / 2 + c * cw, -h / 2);
      ctx.lineTo(-w / 2 + c * cw, h / 2);
    }
    for (let r = 1; r < rows; r++) {
      ctx.moveTo(-w / 2, -h / 2 + r * ch);
      ctx.lineTo(w / 2, -h / 2 + r * ch);
    }
    ctx.stroke();
  }
}

function drawCIWS(ctx: CanvasRenderingContext2D, s: DrawStyle, detail: number) {
  // radar-directed gatling on a small barbette
  ctx.fillStyle = s.wheel;
  ctx.beginPath();
  ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = s.dark;
  ctx.beginPath();
  ctx.arc(0.3, 0, 1.0, 0, Math.PI * 2);
  ctx.fill();
  if (detail >= 1) {
    ctx.fillRect(0.9, -0.55, 2.4, 0.42);
    ctx.fillRect(0.9, 0.13, 2.4, 0.42);
    // radar dish
    ctx.strokeStyle = s.detail;
    ctx.lineWidth = 0.28;
    ctx.beginPath();
    ctx.arc(-1.15, 0, 0.7, -1.2, 1.2);
    ctx.stroke();
  }
}

function drawTorpTube(ctx: CanvasRenderingContext2D, s: DrawStyle, detail: number) {
  // twin tubes angled outboard
  ctx.save();
  ctx.rotate(0.28);
  ctx.fillStyle = s.dark;
  ctx.fillRect(-2.6, -0.55, 5.2, 1.1);
  ctx.fillStyle = s.wheel;
  ctx.beginPath();
  ctx.arc(2.4, 0, 0.62, 0, Math.PI * 2);
  ctx.fill();
  if (detail >= 1) {
    ctx.strokeStyle = s.detail;
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    ctx.moveTo(-1.4, -0.55);
    ctx.lineTo(-1.4, 0.55);
    ctx.moveTo(0.6, -0.55);
    ctx.lineTo(0.6, 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawShip(ctx: CanvasRenderingContext2D, o: ShipDrawOpts) {
  const s = o.style;
  const d = o.detail;
  const hull = HULLS[o.type];

  // listing: the beam squashes toward the flooded side
  const list = o.listing ?? 0;
  if (list > 0) {
    ctx.scale(1, 1 - list * 0.32);
  }

  // hull
  ctx.fillStyle = s.track;
  poly(ctx, hull);
  ctx.fill();
  // deck plate inset
  ctx.fillStyle = o.wreck ? '#1c1914' : s.body;
  poly(ctx, hull.map((p) => [p[0] * 0.965, p[1] * 0.88]));
  ctx.fill();

  switch (o.type) {
    case 'PATROL': {
      // low deckhouse aft + nav mast + gun fore + tubes midships
      ctx.fillStyle = s.body;
      poly(ctx, [[-6.5, -1.8], [2.5, -1.8], [2.5, 1.8], [-6.5, 1.8]]);
      ctx.fill();
      ctx.fillStyle = s.dark;
      ctx.fillRect(-5.2, -1.1, 3.4, 2.2); // cabin block
      if (d >= 1) {
        ctx.strokeStyle = s.detail;
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        ctx.moveTo(-1, 0);
        ctx.lineTo(-1, -3.0); // radar mast
        ctx.stroke();
        ctx.fillStyle = s.wheel;
        ctx.beginPath();
        ctx.arc(-1, -3.0, 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'FRIGATE': {
      // superstructure block + mast + hangar + helipad
      ctx.fillStyle = s.body;
      poly(ctx, [[18, -4.6], [12, -5.2], [-22, -5.2], [-22, 5.2], [12, 5.2], [18, 4.6]]);
      ctx.fill();
      ctx.fillStyle = s.dark;
      ctx.fillRect(8, -2.6, 10, 5.2); // bridge block
      ctx.fillRect(-20, -3.4, 9, 6.8); // hangar
      if (d >= 1) {
        // mast + air search radar panel
        ctx.strokeStyle = s.detail;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();
        ctx.fillStyle = s.wheel;
        ctx.fillRect(6.4, -2.0, 2.2, 4.0);
        ctx.strokeStyle = s.dark;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.arc(6.4, 0, 2.0, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        // VLS field amidships
        drawVLS(ctx, s, 7, 5.5, 2, 4, d);
        ctx.save();
        ctx.translate(-4, 0);
        drawVLS(ctx, s, 6, 5, 2, 3, d); // SAM cells
        ctx.restore();
      }
      if (d >= 2) {
        // helipad markings
        ctx.strokeStyle = s.wheel;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.arc(-38, 0, 3.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-40.4, 0);
        ctx.lineTo(-35.6, 0);
        ctx.moveTo(-38, -2.4);
        ctx.lineTo(-38, 2.4);
        ctx.stroke();
      }
      break;
    }
    case 'DESTROYER': {
      // tall deckhouse, enclosed pyramid mast, twin funnels, aft flight deck
      ctx.fillStyle = s.body;
      poly(ctx, [[30, -5.8], [22, -6.6], [-34, -6.6], [-34, 6.6], [22, 6.6], [30, 5.8]]);
      ctx.fill();
      ctx.fillStyle = s.dark;
      ctx.fillRect(16, -3.2, 16, 6.4); // bridge
      ctx.fillRect(-6, -2.4, 9, 4.8); // funnel I
      ctx.fillRect(-16, -2.8, 8, 5.6); // funnel II
      if (d >= 1) {
        // enclosed pyramid mast — the modern silhouette
        poly(ctx, [[10, -1.6], [13, -3.4], [17, -3.4], [19, 0], [17, 3.4], [13, 3.4], [10, 1.6]]);
        ctx.fillStyle = s.wheel;
        ctx.fill();
        ctx.fillStyle = s.dark;
        // fore VLS field (8×2)
        ctx.save();
        ctx.translate(36, 0);
        drawVLS(ctx, s, 12, 8.4, 4, 2, d);
        ctx.restore();
        // SSM canisters amidships (angled)
        ctx.save();
        ctx.translate(2, 0);
        ctx.rotate(0.12);
        ctx.fillStyle = s.wheel;
        ctx.fillRect(-7, -3.2, 14, 2.4);
        ctx.fillRect(-7, 0.8, 14, 2.4);
        ctx.strokeStyle = s.dark;
        ctx.lineWidth = 0.3;
        ctx.strokeRect(-7, -3.2, 14, 2.4);
        ctx.strokeRect(-7, 0.8, 14, 2.4);
        ctx.restore();
      }
      if (d >= 2) {
        ctx.strokeStyle = s.wheel;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.arc(-52, 0, 4.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-54.8, 0);
        ctx.lineTo(-49.2, 0);
        ctx.moveTo(-52, -2.8);
        ctx.lineTo(-52, 2.8);
        ctx.stroke();
      }
      break;
    }
    case 'CRUISER': {
      // big slab-sided superstructure, two funnels, aft VLS farm
      ctx.fillStyle = s.body;
      poly(ctx, [[34, -6.6], [24, -7.6], [-40, -7.6], [-40, 7.6], [24, 7.6], [34, 6.6]]);
      ctx.fill();
      ctx.fillStyle = s.dark;
      ctx.fillRect(14, -4.4, 18, 8.8); // bridge complex
      ctx.fillRect(-14, -3.0, 10, 6.0); // funnel I
      ctx.fillRect(-27, -3.4, 9, 6.8); // funnel II
      if (d >= 1) {
        // big radar mast
        ctx.fillStyle = s.wheel;
        poly(ctx, [[6, -2.0], [9, -4.4], [13, -4.4], [15, 0], [13, 4.4], [9, 4.4], [6, 2.0]]);
        ctx.fill();
        ctx.fillStyle = s.dark;
        ctx.fillRect(-1, -1.2, 2.4, 2.4); // rotodome base
        ctx.strokeStyle = s.wheel;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
        ctx.stroke();
        // secondary mounts port+starboard
        for (const side of [1, -1]) {
          ctx.save();
          ctx.translate(20, side * 6.8);
          drawTurret(ctx, s, d, 57, 2, 0, d);
          ctx.restore();
        }
        // aft VLS farm
        ctx.save();
        ctx.translate(-48, 0);
        drawVLS(ctx, s, 14, 9.6, 4, 3, d);
        ctx.restore();
      }
      if (d >= 2) {
        ctx.strokeStyle = s.wheel;
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.arc(-70, 0, 4.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'BATTLESHIP': {
      // THE BIG BOI — pagoda tower, two funnels, secondary battery,
      // armoured citadel belt visible in the hull shading
      ctx.fillStyle = s.body;
      poly(ctx, [[42, -12.4], [28, -13.6], [-34, -13.6], [-34, 13.6], [28, 13.6], [42, 12.4]]);
      ctx.fill();
      ctx.fillStyle = s.dark;
      // pagoda fore tower — stepped like a mountain
      ctx.fillRect(24, -7.5, 18, 15);
      ctx.fillStyle = s.body;
      ctx.fillRect(30, -5.0, 12, 10);
      ctx.fillStyle = s.wheel;
      ctx.fillRect(34, -2.6, 8, 5.2);
      // aft tower
      ctx.fillStyle = s.dark;
      ctx.fillRect(-46, -6.0, 14, 12);
      // funnels
      ctx.fillStyle = s.dark;
      ctx.fillRect(-8, -4.2, 11, 8.4);
      ctx.fillRect(-22, -4.8, 10, 9.6);
      if (d >= 1) {
        // main mast tripod between tower and funnel
        ctx.strokeStyle = s.detail;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(18, -5);
        ctx.lineTo(21, 0);
        ctx.lineTo(18, 5);
        ctx.stroke();
        ctx.fillStyle = s.wheel;
        ctx.fillRect(19.5, -2.0, 3.2, 4.0);
        // secondary 130mm twins ×4 along the shoulders
        for (const [sx, sy] of [[38, 11.5], [38, -11.5], [-38, 11.5], [-38, -11.5]] as const) {
          ctx.save();
          ctx.translate(sx, sy);
          drawTurret(ctx, s, d, 130, 2, 0, d);
          ctx.restore();
        }
        // midship VLS field
        ctx.save();
        ctx.translate(-4, 0);
        drawVLS(ctx, s, 16, 10.5, 4, 3, d);
        ctx.restore();
      }
      if (d >= 2) {
        // deck planking — a hundred metres of timber underfoot
        ctx.strokeStyle = 'rgba(90,85,72,0.35)';
        ctx.lineWidth = 0.28;
        ctx.beginPath();
        for (let x = -80; x <= 60; x += 3.4) {
          ctx.moveTo(x, -12.5);
          ctx.lineTo(x, 12.5);
        }
        ctx.stroke();
        // anchor chain plates at the bow
        ctx.strokeStyle = s.wheel;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(112, -6);
        ctx.lineTo(118, -3.4);
        ctx.moveTo(112, 6);
        ctx.lineTo(118, 3.4);
        ctx.stroke();
        // aft helipad
        ctx.strokeStyle = s.wheel;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(-102, 0, 5.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }

  // rotating mounts — drawn last, above the deck
  if (o.mounts && !o.wreck) {
    for (const m of o.mounts) {
      ctx.save();
      ctx.translate(m.def.x, m.def.y);
      switch (m.def.kind) {
        case 'GUN':
          ctx.rotate(m.angle);
          drawTurret(ctx, s, d, m.def.calibre ?? 76, m.def.barrels ?? 1, m.recoil, d);
          break;
        case 'CIWS':
          ctx.rotate(m.angle);
          drawCIWS(ctx, s, d);
          break;
        case 'TORP':
          drawTorpTube(ctx, s, d);
          break;
        case 'SSM':
        case 'SAM':
          // canisters / cells are part of the deck layout above
          break;
      }
      ctx.restore();
    }
  }

  // wreck scorching
  if (o.wreck) {
    ctx.fillStyle = 'rgba(8,6,4,0.5)';
    poly(ctx, hull.map((p) => [p[0] * 0.7, p[1] * 0.7]));
    ctx.fill();
    ctx.strokeStyle = 'rgba(12,10,7,0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-HULLS[o.type][0][0] * 0.5, -HULLS[o.type][0][1] - 2);
    ctx.lineTo(0, 2);
    ctx.lineTo(HULLS[o.type][0][0] * 0.4, -1);
    ctx.stroke();
  }
}

/** a sunk hull — broken, burned, half under. The bay remembers. */
export function drawShipWreck(ctx: CanvasRenderingContext2D, o: ShipDrawOpts) {
  drawShip(ctx, { ...o, wreck: true });
}
