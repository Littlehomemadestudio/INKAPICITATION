// ─────────────────────────────────────────────────────────────
// PAPER STORM · unit silhouettes
// Hand-authored top-down vehicle profiles. Local frame: nose +X.
// detail: 0 = strategic silhouette, 1 = standard, 2 = close range
// ─────────────────────────────────────────────────────────────

import type { UnitType } from './unitDefs';

export interface DrawStyle {
  body: string;
  track: string;
  wheel: string;
  detail: string;
  accent: string;
  dark: string;
}

export const FRIEND_STYLE: DrawStyle = {
  body: '#1b1813',
  track: '#100e0a',
  wheel: '#3f3b31',
  detail: '#4c473d',
  accent: '#77725f',
  dark: '#0a0906',
};

export const ENEMY_STYLE: DrawStyle = {
  body: '#59544a',
  track: '#443f36',
  wheel: '#6e685b',
  detail: '#7d7768',
  accent: '#98917f',
  dark: '#332f27',
};

export const WRECK_STYLE: DrawStyle = {
  body: '#232019',
  track: '#1a1712',
  wheel: '#2b2720',
  detail: '#35312a',
  accent: '#3c382f',
  dark: '#15130e',
};

// ── helpers ──────────────────────────────────────────────────

function poly(ctx: CanvasRenderingContext2D, pts: number[][]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function trackAssembly(ctx: CanvasRenderingContext2D, s: DrawStyle, halfLen: number, innerY: number, outerY: number, wheels: number, detail: number) {
  for (const side of [1, -1]) {
    ctx.fillStyle = s.track;
    ctx.fillRect(-halfLen, side > 0 ? innerY : -outerY, halfLen * 2, outerY - innerY);
    if (detail >= 1) {
      ctx.fillStyle = s.wheel;
      const n = wheels;
      const spacing = (halfLen * 1.82) / (n - 1);
      for (let i = 0; i < n; i++) {
        const x = -halfLen * 0.91 + i * spacing;
        ctx.beginPath();
        ctx.arc(x, side * (innerY + outerY) / 2, (outerY - innerY) * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function wheelSet(ctx: CanvasRenderingContext2D, s: DrawStyle, xs: number[], y: number, r: number, detail: number) {
  for (const side of [1, -1]) {
    for (const x of xs) {
      ctx.fillStyle = s.track;
      ctx.beginPath();
      ctx.arc(x, side * y, r, 0, Math.PI * 2);
      ctx.fill();
      if (detail >= 1) {
        ctx.fillStyle = s.wheel;
        ctx.beginPath();
        ctx.arc(x, side * y, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function barrel(ctx: CanvasRenderingContext2D, s: DrawStyle, x0: number, len: number, w0: number, w1: number, muzzle: boolean) {
  poly(ctx, [
    [x0, -w0 / 2],
    [x0 + len, -w1 / 2],
    [x0 + len, w1 / 2],
    [x0, w0 / 2],
  ]);
  ctx.fill();
  if (muzzle) {
    ctx.fillRect(x0 + len - 0.5, -w1 * 0.85, 0.55, w1 * 1.7);
  }
}

// ── main entry ───────────────────────────────────────────────

export interface VehicleDrawOpts {
  type: UnitType;
  style: DrawStyle;
  detail: number;
  /** turret rotation relative to hull */
  turretAngle: number;
  /** rotating radar angle (SPAA) */
  radarAngle: number;
  /** visible missile stations (aircraft) */
  missiles?: number;
  /** recoil offset along barrel */
  recoil?: number;
  wreck?: boolean;
  /** wrecks: turret was tossed */
  noTurret?: boolean;
}

export function drawVehicle(ctx: CanvasRenderingContext2D, o: VehicleDrawOpts) {
  const s = o.style;
  const d = o.detail;
  ctx.fillStyle = s.body;
  ctx.strokeStyle = s.detail;
  ctx.lineWidth = 0.16;

  switch (o.type) {
    case 'M1A2':
      trackAssembly(ctx, s, 3.72, 1.06, 1.86, 7, d);
      poly(ctx, [
        [3.85, -1.1], [3.85, 1.1], [2.4, 1.14], [-3.55, 1.14], [-3.85, 0.62],
        [-3.85, -0.62], [-3.55, -1.14], [2.4, -1.14],
      ]);
      ctx.fill();
      if (d >= 1) {
        // engine deck louvers
        ctx.strokeStyle = s.detail;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          ctx.moveTo(-3.5 + i * 0.42, -0.9);
          ctx.lineTo(-3.5 + i * 0.42, 0.9);
        }
        ctx.stroke();
      }
      // turret
      if (!o.noTurret) {
      ctx.save();
      ctx.translate(0.25, 0);
      ctx.rotate(o.turretAngle);
      ctx.translate(-(o.recoil ?? 0), 0);
      ctx.fillStyle = s.body;
      poly(ctx, [
        [1.75, 0], [1.2, -0.72], [0.2, -1.02], [-1.35, -1.02], [-1.68, -0.5],
        [-1.68, 0.5], [-1.35, 1.02], [0.2, 1.02], [1.2, 0.72],
      ]);
      ctx.fill();
      // mantlet + barrel
      ctx.fillStyle = s.dark;
      ctx.fillRect(1.35, -0.27, 0.55, 0.54);
      barrel(ctx, s, 1.8, 4.3, 0.3, 0.22, true);
      if (d >= 1) {
        ctx.fillStyle = s.wheel;
        ctx.beginPath();
        ctx.arc(-0.35, 0.38, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = s.detail;
        ctx.beginPath();
        ctx.arc(-0.35, 0.38, 0.3, 0, Math.PI * 2);
        ctx.stroke();
        // bustle rack
        ctx.strokeStyle = s.detail;
        ctx.lineWidth = 0.09;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          ctx.moveTo(-1.45, -0.85 + i * 0.85);
          ctx.lineTo(-1.95, -0.85 + i * 0.85);
        }
        ctx.stroke();
        // roof MG
        ctx.strokeStyle = s.accent;
        ctx.lineWidth = 0.1;
        ctx.beginPath();
        ctx.moveTo(0.45, -0.45);
        ctx.lineTo(1.35, -0.45);
        ctx.stroke();
      }
      ctx.restore();
      }
      break;

    case 'T90M':
      trackAssembly(ctx, s, 3.28, 1.02, 1.76, 6, d);
      ctx.fillStyle = s.body;
      poly(ctx, [
        [3.42, 0], [3.28, -0.62], [2.7, -1.08], [-3.1, -1.08], [-3.42, -0.6],
        [-3.42, 0.6], [-3.1, 1.08], [2.7, 1.08], [3.28, 0.62],
      ]);
      ctx.fill();
      if (d >= 1) {
        ctx.strokeStyle = s.detail;
        ctx.lineWidth = 0.12;
        ctx.beginPath();
        ctx.moveTo(-2.7, -0.7);
        ctx.lineTo(-2.7, 0.7);
        ctx.stroke();
      }
      if (!o.noTurret) {
      ctx.save();
      ctx.translate(-0.15, 0);
      ctx.rotate(o.turretAngle);
      ctx.translate(-(o.recoil ?? 0), 0);
      // round dome turret
      ctx.fillStyle = s.body;
      ctx.beginPath();
      ctx.ellipse(-0.1, 0, 1.24, 1.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.dark;
      ctx.fillRect(0.95, -0.24, 0.5, 0.48);
      barrel(ctx, s, 1.35, 4.1, 0.26, 0.18, true);
      if (d >= 1) {
        // thermal sleeve rings
        ctx.fillStyle = s.wheel;
        for (const rx of [2.1, 3.0, 3.9]) {
          ctx.fillRect(rx, -0.17, 0.34, 0.34);
        }
        // ERA blocks on turret front
        ctx.fillStyle = s.detail;
        for (let i = -2; i <= 2; i++) {
          ctx.fillRect(0.55, i * 0.34 - 0.12, 0.3, 0.24);
        }
        // commander cupola
        ctx.fillStyle = s.wheel;
        ctx.beginPath();
        ctx.arc(-0.4, 0.3, 0.26, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      }
      break;

    case 'M2A3':
      trackAssembly(ctx, s, 3.05, 0.96, 1.62, 6, d);
      ctx.fillStyle = s.body;
      poly(ctx, [
        [3.2, -0.98], [3.2, 0.98], [-2.9, 0.98], [-3.2, 0.6], [-3.2, -0.6], [-2.9, -0.98],
      ]);
      ctx.fill();
      if (d >= 1) {
        // rear ramp lines
        ctx.strokeStyle = s.detail;
        ctx.lineWidth = 0.1;
        ctx.beginPath();
        ctx.moveTo(-2.75, -0.7);
        ctx.lineTo(-2.75, 0.7);
        ctx.moveTo(-2.45, -0.7);
        ctx.lineTo(-2.45, 0.7);
        ctx.stroke();
      }
      if (!o.noTurret) {
      ctx.save();
      ctx.translate(0.55, 0);
      ctx.rotate(o.turretAngle);
      ctx.translate(-(o.recoil ?? 0), 0);
      ctx.fillStyle = s.body;
      poly(ctx, [
        [1.05, 0], [0.6, -0.6], [-0.75, -0.72], [-1.0, -0.35], [-1.0, 0.35], [-0.75, 0.72], [0.6, 0.6],
      ]);
      ctx.fill();
      ctx.fillStyle = s.dark;
      barrel(ctx, s, 0.9, 2.35, 0.16, 0.12, false);
      if (d >= 1) {
        // TOW launcher box
        ctx.fillStyle = s.wheel;
        ctx.fillRect(-0.5, 0.32, 0.85, 0.5);
        ctx.strokeStyle = s.detail;
        ctx.lineWidth = 0.07;
        ctx.strokeRect(-0.5, 0.32, 0.85, 0.5);
      }
      ctx.restore();
      }
      break;

    case 'BMP3':
      trackAssembly(ctx, s, 3.1, 0.98, 1.66, 6, d);
      ctx.fillStyle = s.body;
      // boat bow hull
      poly(ctx, [
        [3.35, 0], [2.6, -0.7], [1.4, -1.02], [-3.0, -1.02], [-3.35, -0.6],
        [-3.35, 0.6], [-3.0, 1.02], [1.4, 1.02], [2.6, 0.7],
      ]);
      ctx.fill();
      if (!o.noTurret) {
      ctx.save();
      ctx.translate(-0.35, 0);
      ctx.rotate(o.turretAngle);
      ctx.translate(-(o.recoil ?? 0), 0);
      ctx.fillStyle = s.body;
      poly(ctx, [
        [0.95, 0], [0.55, -0.55], [-0.55, -0.62], [-0.8, 0], [-0.55, 0.62], [0.55, 0.55],
      ]);
      ctx.fill();
      ctx.fillStyle = s.dark;
      // 100mm main + coax 30mm
      barrel(ctx, s, 0.8, 3.3, 0.22, 0.16, false);
      ctx.fillStyle = s.wheel;
      barrel(ctx, s, 0.8, 1.9, 0.12, 0.09, false);
      if (d >= 1) {
        ctx.fillStyle = s.detail;
        ctx.fillRect(-0.4, -0.2, 0.35, 0.4);
      }
      ctx.restore();
      }
      break;

    case 'M109A7':
      trackAssembly(ctx, s, 4.15, 1.02, 1.72, 7, d);
      ctx.fillStyle = s.body;
      poly(ctx, [
        [4.2, -1.0], [4.2, 1.0], [-3.9, 1.0], [-4.2, 0.55], [-4.2, -0.55], [-3.9, -1.0],
      ]);
      ctx.fill();
      if (!o.noTurret) {
      ctx.save();
      ctx.translate(-0.45, 0);
      ctx.rotate(o.turretAngle);
      ctx.translate(-(o.recoil ?? 0), 0);
      ctx.fillStyle = s.body;
      poly(ctx, [
        [1.9, -0.9], [1.9, 0.9], [0.9, 1.5], [-1.7, 1.5], [-2.0, 0.8], [-2.0, -0.8], [-1.7, -1.5], [0.9, -1.5],
      ]);
      ctx.fill();
      // spade
      ctx.fillStyle = s.dark;
      ctx.fillRect(-2.5, -0.7, 0.55, 1.4);
      // long elevated barrel
      barrel(ctx, s, 1.7, 5.3, 0.34, 0.22, true);
      if (d >= 1) {
        // elevation chevron at barrel base
        ctx.strokeStyle = s.accent;
        ctx.lineWidth = 0.14;
        ctx.beginPath();
        ctx.moveTo(1.5, -0.5);
        ctx.lineTo(1.95, 0);
        ctx.lineTo(1.5, 0.5);
        ctx.stroke();
        ctx.fillStyle = s.wheel;
        ctx.beginPath();
        ctx.arc(-0.6, 0.4, 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      }
      break;

    case '2S19':
      trackAssembly(ctx, s, 4.05, 1.0, 1.72, 7, d);
      ctx.fillStyle = s.body;
      poly(ctx, [
        [4.1, -0.98], [4.1, 0.98], [-3.8, 0.98], [-4.1, 0.5], [-4.1, -0.5], [-3.8, -0.98],
      ]);
      ctx.fill();
      if (!o.noTurret) {
      ctx.save();
      ctx.translate(-0.4, 0);
      ctx.rotate(o.turretAngle);
      ctx.translate(-(o.recoil ?? 0), 0);
      ctx.fillStyle = s.body;
      ctx.beginPath();
      ctx.ellipse(-0.15, 0, 1.85, 1.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.dark;
      ctx.fillRect(-2.2, -0.55, 0.5, 1.1);
      barrel(ctx, s, 1.55, 5.5, 0.32, 0.2, true);
      if (d >= 1) {
        ctx.fillStyle = s.wheel;
        ctx.beginPath();
        ctx.arc(-0.5, -0.5, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      }
      break;

    case 'M1127':
      wheelSet(ctx, s, [-2.45, -0.85, 0.75, 2.35], 1.28, 0.56, d);
      ctx.fillStyle = s.body;
      poly(ctx, [
        [3.3, -0.72], [3.45, 0], [3.3, 0.72], [-3.15, 0.95], [-3.45, 0.55],
        [-3.45, -0.55], [-3.15, -0.95],
      ]);
      ctx.fill();
      if (d >= 1) {
        ctx.strokeStyle = s.detail;
        ctx.lineWidth = 0.09;
        ctx.beginPath();
        ctx.moveTo(-1.6, -0.8);
        ctx.lineTo(-1.6, 0.8);
        ctx.moveTo(0.4, -0.85);
        ctx.lineTo(0.4, 0.85);
        ctx.stroke();
      }
      // RWS
      if (!o.noTurret) {
      ctx.save();
      ctx.translate(1.15, 0);
      ctx.rotate(o.turretAngle);
      ctx.fillStyle = s.wheel;
      ctx.beginPath();
      ctx.arc(0, 0, 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.dark;
      barrel(ctx, s, 0.3, 1.15, 0.12, 0.09, false);
      ctx.restore();
      }
      if (d >= 2) {
        // sensor mast
        ctx.fillStyle = s.detail;
        ctx.beginPath();
        ctx.arc(-2.3, 0, 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'BTR82A':
      wheelSet(ctx, s, [-2.7, -1.0, 0.7, 2.4], 1.26, 0.56, d);
      ctx.fillStyle = s.body;
      poly(ctx, [
        [3.6, 0], [2.9, -0.62], [1.6, -0.95], [-3.4, -0.95], [-3.7, -0.5],
        [-3.7, 0.5], [-3.4, 0.95], [1.6, 0.95], [2.9, 0.62],
      ]);
      ctx.fill();
      if (!o.noTurret) {
      ctx.save();
      ctx.translate(0.2, 0);
      ctx.rotate(o.turretAngle);
      ctx.fillStyle = s.body;
      ctx.beginPath();
      ctx.arc(0, 0, 0.58, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.dark;
      barrel(ctx, s, 0.45, 1.75, 0.14, 0.1, false);
      if (d >= 1) {
        ctx.fillStyle = s.wheel;
        ctx.beginPath();
        ctx.arc(-0.12, 0.14, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      }
      break;

    case 'TOR':
      trackAssembly(ctx, s, 3.3, 1.0, 1.72, 6, d);
      ctx.fillStyle = s.body;
      poly(ctx, [
        [3.4, -1.02], [3.4, 1.02], [-3.2, 1.02], [-3.4, 0.6], [-3.4, -0.6], [-3.2, -1.02],
      ]);
      ctx.fill();
      ctx.save();
      ctx.translate(-0.1, 0);
      ctx.rotate(o.turretAngle);
      // big flat radar box — the signature silhouette
      ctx.fillStyle = s.body;
      ctx.fillRect(-1.7, -1.55, 3.4, 3.1);
      ctx.strokeStyle = s.dark;
      ctx.lineWidth = 0.12;
      ctx.strokeRect(-1.7, -1.55, 3.4, 3.1);
      if (d >= 1) {
        // X-bracing
        ctx.strokeStyle = s.detail;
        ctx.lineWidth = 0.09;
        ctx.beginPath();
        ctx.moveTo(-1.55, -1.4);
        ctx.lineTo(1.55, 1.4);
        ctx.moveTo(1.55, -1.4);
        ctx.lineTo(-1.55, 1.4);
        ctx.stroke();
        // rotating scan bar
        ctx.rotate(o.radarAngle);
        ctx.strokeStyle = s.accent;
        ctx.lineWidth = 0.16;
        ctx.beginPath();
        ctx.moveTo(-1.3, 0);
        ctx.lineTo(1.3, 0);
        ctx.stroke();
        ctx.fillStyle = s.wheel;
        ctx.beginPath();
        ctx.arc(0, 0, 0.26, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;

    case 'PANTSIR':
      wheelSet(ctx, s, [-2.9, -1.25, 1.15, 2.6], 1.3, 0.55, d);
      // truck hull
      ctx.fillStyle = s.body;
      ctx.fillRect(-3.9, -1.05, 7.8, 2.1);
      // cab
      ctx.fillStyle = s.dark;
      poly(ctx, [
        [3.9, -1.0], [3.9, 1.0], [2.6, 1.0], [2.6, -1.0],
      ]);
      ctx.fill();
      if (d >= 1) {
        ctx.strokeStyle = s.detail;
        ctx.lineWidth = 0.09;
        ctx.beginPath();
        ctx.moveTo(3.6, -0.8);
        ctx.lineTo(3.6, 0.8);
        ctx.stroke();
      }
      // missile module
      ctx.save();
      ctx.translate(-0.9, 0);
      ctx.rotate(o.turretAngle);
      ctx.fillStyle = s.body;
      ctx.fillRect(-1.3, -1.25, 2.6, 2.5);
      ctx.strokeStyle = s.dark;
      ctx.lineWidth = 0.1;
      ctx.strokeRect(-1.3, -1.25, 2.6, 2.5);
      // 2×2 tube clusters either side
      ctx.fillStyle = s.dark;
      for (const side of [1, -1]) {
        for (let i = 0; i < 2; i++) {
          ctx.fillRect(-0.55 + i * 0.75, side > 0 ? 0.18 : -0.62, 0.6, 0.44);
          ctx.fillRect(-0.55 + i * 0.75, side > 0 ? 0.68 : -1.12, 0.6, 0.44);
        }
      }
      if (d >= 1) {
        // radar face front
        ctx.fillStyle = s.wheel;
        ctx.fillRect(1.1, -0.5, 0.35, 1.0);
      }
      ctx.restore();
      break;

    case 'A10C': {
      const wing = (side: 1 | -1) => {
        poly(ctx, [
          [0.2, side * 0.95], [-1.4, side * 6.9], [-3.3, side * 6.9], [-2.35, side * 0.95],
        ]);
        ctx.fill();
      };
      // fuselage
      poly(ctx, [
        [8.75, 0], [7.7, -0.55], [2.0, -0.78], [-6.2, -0.72], [-8.3, -0.5], [-8.3, 0.5], [-6.2, 0.72], [2.0, 0.78], [7.7, 0.55],
      ]);
      ctx.fill();
      // wings
      ctx.fillStyle = s.body;
      wing(1);
      wing(-1);
      // engine nacelles — signature twin pods
      for (const side of [1, -1]) {
        ctx.fillStyle = s.dark;
        ctx.beginPath();
        ctx.ellipse(-5.0, side * 1.62, 2.1, 1.02, 0, 0, Math.PI * 2);
        ctx.fill();
        if (d >= 1) {
          ctx.fillStyle = s.body;
          ctx.beginPath();
          ctx.ellipse(-5.6, side * 1.62, 0.85, 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = s.wheel;
          ctx.beginPath();
          ctx.ellipse(-4.15, side * 1.62, 0.42, 0.42, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // twin tails
      ctx.fillStyle = s.body;
      for (const side of [1, -1]) {
        poly(ctx, [
          [-6.6, side * 0.6], [-7.9, side * 2.1], [-8.5, side * 2.1], [-8.0, side * 0.55],
        ]);
        ctx.fill();
      }
      // GAU-8 chin gun
      ctx.fillStyle = s.dark;
      ctx.fillRect(8.1, -0.09, 2.2, 0.18);
      // cockpit
      if (d >= 1) {
        ctx.fillStyle = s.wheel;
        poly(ctx, [
          [6.1, -0.3], [4.9, -0.36], [4.9, 0.36], [6.1, 0.3],
        ]);
        ctx.fill();
      }
      // ordnance stations: draw remaining missiles under wings
      if (d >= 1 && o.missiles !== undefined) {
        ctx.fillStyle = s.dark;
        const stations = 6;
        for (let i = 0; i < stations; i++) {
          if (i >= o.missiles) break;
          const t = i / stations;
          const wx = 0.2 - t * 2.6;
          const wy = 1.6 + t * 4.2;
          for (const side of [1, -1]) {
            ctx.fillRect(wx, side * wy - 0.1, 1.3, 0.2);
          }
        }
      }
      break;
    }

    case 'HQ':
      // HQ is a terrain building; unit draws its tactical ring only
      ctx.strokeStyle = s.detail;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(-17, -13, 34, 26);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-17, -13);
      ctx.lineTo(-17 - 3, -13 - 3);
      ctx.moveTo(17, -13);
      ctx.lineTo(17 + 3, -13 - 3);
      ctx.moveTo(17, 13);
      ctx.lineTo(17 + 3, 13 + 3);
      ctx.moveTo(-17, 13);
      ctx.lineTo(-17 - 3, 13 + 3);
      ctx.stroke();
      break;
  }

  // wreck scorch overlay
  if (o.wreck) {
    ctx.fillStyle = 'rgba(10,8,5,0.55)';
    const jags = [
      [[1.5, -0.6], [2.6, -1.4], [2.2, -0.2]],
      [[-1.0, 0.7], [-2.2, 1.5], [-0.4, 1.3]],
      [[0.2, 0.5], [1.4, 1.6], [-0.8, 1.2]],
    ];
    for (const j of jags) {
      poly(ctx, j);
      ctx.fill();
    }
  }
}

/** soft blob shadow beneath a vehicle */
export function drawUnitShadow(ctx: CanvasRenderingContext2D, o: VehicleDrawOpts, len: number, wid: number) {
  ctx.save();
  ctx.translate(2.2, 2.8);
  ctx.rotate(o.turretAngle * 0); // shadow follows hull only
  ctx.fillStyle = 'rgba(25,22,16,0.16)';
  ctx.beginPath();
  ctx.ellipse(0, 0, len * 0.52, wid * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** selection brackets — elegant corner marks, no neon */
export function drawSelectionBrackets(ctx: CanvasRenderingContext2D, size: number, gap: number, lineWidth: number, color: string) {
  const s = size + gap;
  const l = size * 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    ctx.moveTo(sx * s - sx * l, sy * s);
    ctx.lineTo(sx * s, sy * s);
    ctx.lineTo(sx * s, sy * s - sy * l);
  }
  ctx.stroke();
}
