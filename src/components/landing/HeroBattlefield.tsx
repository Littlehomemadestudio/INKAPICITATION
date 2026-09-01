'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · landing hero — the theatre itself
// A hand-composed top-down battlefield illustration rendered on
// canvas with the SAME art primitives the game ships with
// (drawVehicle / drawShip + FRIEND / ENEMY / WRECK styles).
//
// Engineering notes:
// · world space is metres, 2000 × 1150; the camera cover-fits
//   the element at a fixed art-directed focal point
// · DPR-aware backing store, ResizeObserver rescale
// · the rAF loop is paused when the element is offscreen and
//   collapses to a single static frame under reduced motion
// · all composition is seeded — identical paint on every load
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { drawVehicle, FRIEND_STYLE, ENEMY_STYLE, WRECK_STYLE } from '@/game/entities/unitDraw';
import { drawShip, createMountStates } from '@/game/entities/shipDraw';
import { RNG } from '@/game/core/math';

// ── palette (lifted from terrainRender / unitDraw) ────────────
const PAPER = '#f3f1ea';
const INK = '#17150f';
const SEA_SHALLOW = '#a3b2b5';
const SEA_DEEP = '#5f7079';
const RIVER = '#9fb0b3';
const CONTOUR = '#c9c4b4';
const ROAD = '#cdc7b4';
const HAIRLINE = '#8b8577';

// ── world layout (metres; y=0 is north) ──────────────────────
const WORLD_W = 2000;
const WORLD_H = 1150;
// cover-fit focal point — keeps the composition art-directed
const FOCAL = { x: 0.52, y: 0.45 };
const ZOOM = 1.35;

// the coastline: land is above/right of this polyline
const COAST: [number, number][] = [
  [0, 560], [240, 690], [470, 810], [700, 930], [900, 1150],
];
// the river SEVERNAYA, from the highlands to the bay
const RIVER_LINE: [number, number][] = [
  [860, 0], [800, 180], [720, 380], [640, 560], [580, 700], [620, 880],
];
// MSR CENTRAL — the main supply route the column advances on
const MSR_X = 1560;
const WEST_ROAD_X = 250;

/** deterministic organic ink blob as a filled path */
function inkBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rng: RNG,
  lobes = 11
) {
  const pts: number[][] = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const rr = r * (0.55 + rng.next() * 0.75);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.82]);
  }
  ctx.beginPath();
  ctx.moveTo((pts[0][0] + pts[pts.length - 1][0]) / 2, (pts[0][1] + pts[pts.length - 1][1]) / 2);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const n = pts[(i + 1) % pts.length];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2);
  }
  ctx.closePath();
  ctx.fill();
}

/** splatter satellites around an ink strike */
function inkSplatter(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rng: RNG) {
  const n = 14 + rng.int(0, 8);
  for (let i = 0; i < n; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = r * (1.1 + rng.next() * 1.9);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 1.2 + rng.next() * 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── terrain painting ─────────────────────────────────────────

/** soft paper washes for elevation presence */
function drawWashes(ctx: CanvasRenderingContext2D, rng: RNG) {
  const spots: [number, number, number][] = [
    [420, 210, 340], [1560, 120, 420], [980, 640, 300], [1700, 820, 260],
  ];
  for (const [x, y, r] of spots) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(120, 105, 80, 0.05)');
    g.addColorStop(1, 'rgba(120, 105, 80, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // stains — the paper has lived
  for (let i = 0; i < 9; i++) {
    const x = rng.range(0, WORLD_W);
    const y = rng.range(0, WORLD_H);
    const r = rng.range(30, 110);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(110, 96, 70, 0.035)');
    g.addColorStop(1, 'rgba(110, 96, 70, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** concentric contour rings for a ridge or the plateau */
function drawContours(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rings: number,
  rng: RNG
) {
  ctx.strokeStyle = CONTOUR;
  ctx.lineWidth = 1.4;
  for (let k = rings; k >= 1; k--) {
    const f = k / rings;
    const lobes = 9;
    ctx.beginPath();
    for (let i = 0; i <= lobes * 4; i++) {
      const a = (i / (lobes * 4)) * Math.PI * 2;
      const wobble = 1 + Math.sin(a * lobes + k * 1.7) * 0.06 + rng.range(-0.02, 0.02);
      const px = cx + Math.cos(a) * rx * f * wobble;
      const py = cy + Math.sin(a) * ry * f * wobble;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    if (k === 1) {
      // spot height
      ctx.fillStyle = HAIRLINE;
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(String(Math.round(rx / 2)), cx - 8, cy + 3);
    }
  }
}

function landPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(COAST[0][0], COAST[0][1]);
  for (let i = 1; i < COAST.length; i++) ctx.lineTo(COAST[i][0], COAST[i][1]);
}

function drawSea(ctx: CanvasRenderingContext2D, t: number) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  landPath(ctx);
  ctx.lineTo(WORLD_W, WORLD_H);
  ctx.lineTo(0, WORLD_H);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 560, 500, WORLD_H);
  g.addColorStop(0, SEA_SHALLOW);
  g.addColorStop(1, SEA_DEEP);
  ctx.fillStyle = g;
  ctx.save();
  ctx.clip();
  ctx.fillRect(0, 540, 950, WORLD_H - 540);
  // gentle swell — three slow bands, phase-shifted
  ctx.strokeStyle = 'rgba(243, 241, 234, 0.14)';
  ctx.lineWidth = 2;
  for (let b = 0; b < 3; b++) {
    const base = 760 + b * 130;
    ctx.beginPath();
    for (let x = 0; x <= 950; x += 24) {
      const y = base + Math.sin(x * 0.012 + t * (0.22 + b * 0.05) + b * 2.1) * 9;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  // the beach band — pale sand along the waterline
  landPath(ctx);
  ctx.strokeStyle = '#ded8c2';
  ctx.lineWidth = 15;
  ctx.stroke();
  landPath(ctx);
  ctx.strokeStyle = 'rgba(90, 82, 62, 0.35)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function drawRiver(ctx: CanvasRenderingContext2D) {
  ctx.lineCap = 'round';
  for (let i = 0; i < RIVER_LINE.length - 1; i++) {
    const [x1, y1] = RIVER_LINE[i];
    const [x2, y2] = RIVER_LINE[i + 1];
    ctx.strokeStyle = RIVER;
    ctx.lineWidth = 14 + i * 9;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  // banks
  ctx.strokeStyle = 'rgba(90, 82, 62, 0.3)';
  ctx.lineWidth = 1.4;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    RIVER_LINE.forEach(([x, y], i) => {
      const px = x + side * (9 + i * 5.5);
      if (i === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    });
    ctx.stroke();
  }
}

function drawRoads(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = ROAD;
  ctx.lineWidth = 7;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(MSR_X, WORLD_H);
  ctx.lineTo(MSR_X - 20, 520);
  ctx.lineTo(MSR_X - 60, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(WEST_ROAD_X, WORLD_H);
  ctx.lineTo(WEST_ROAD_X - 30, 420);
  ctx.lineTo(620, 60);
  ctx.stroke();
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(820, 900);
  ctx.lineTo(760, 800);
  ctx.lineTo(720, 700);
  ctx.stroke();
}

function drawForests(ctx: CanvasRenderingContext2D, rng: RNG) {
  const clusters: [number, number, number, number][] = [
    [960, 600, 130, 60],
    [1270, 720, 150, 70],
    [360, 330, 120, 55],
    [1760, 520, 110, 60],
    [640, 180, 90, 45],
  ];
  for (const [cx, cy, rx, ry] of clusters) {
    const n = Math.round((rx * ry) / 260);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = Math.sqrt(rng.next());
      const x = cx + Math.cos(a) * rx * d;
      const y = cy + Math.sin(a) * ry * d;
      ctx.fillStyle = 'rgba(63, 59, 49, 0.5)';
      ctx.beginPath();
      ctx.arc(x, y, rng.range(4, 7.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCity(ctx: CanvasRenderingContext2D, rng: RNG) {
  // NOVY GOROD — blocks east of the river mouth
  const blocks: [number, number][] = [
    [715, 640], [755, 655], [700, 685], [745, 700], [790, 685],
    [720, 730], [775, 745], [815, 715], [745, 785], [795, 790],
    [840, 760], [865, 715],
  ];
  for (const [x, y] of blocks) {
    const w = rng.range(14, 26);
    const h = rng.range(10, 18);
    ctx.fillStyle = rng.chance(0.3) ? '#6b655a' : '#d9d4c4';
    ctx.strokeStyle = 'rgba(87, 82, 71, 0.4)';
    ctx.lineWidth = 1.4;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }
  // harbour piers reaching into the bay
  ctx.strokeStyle = '#6b655a';
  ctx.lineWidth = 3;
  const piers: [number, number, number, number][] = [
    [690, 880, 70, 0.5], [720, 905, 62, 0.42], [755, 930, 55, 0.35],
  ];
  for (const [x, y, len, ang] of piers) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
}

function drawTrenches(ctx: CanvasRenderingContext2D, rng: RNG) {
  // broken dark scars with a berm behind — the enemy dug in
  for (let seg = 0; seg < 16; seg++) {
    const x = 1120 + seg * 26 + rng.range(-6, 6);
    const y = 468 + rng.range(-14, 14);
    ctx.strokeStyle = 'rgba(23, 21, 15, 0.55)';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rng.range(8, 18), y + rng.range(-5, 5));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(23, 21, 15, 0.22)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 7);
    ctx.lineTo(x + 16, y + 7);
    ctx.stroke();
  }
}

// ── the forces ───────────────────────────────────────────────
// Nose of every hull is +X; north-bound means rotate -π/2.

/** one vehicle at a world position, rotated, drawn at close detail */
function vehicle(
  ctx: CanvasRenderingContext2D,
  type: Parameters<typeof drawVehicle>[1]['type'],
  x: number,
  y: number,
  ang: number,
  style: typeof FRIEND_STYLE,
  turret = 0
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  drawVehicle(ctx, {
    type,
    style,
    detail: 2,
    turretAngle: turret,
    radarAngle: 0.6,
  });
  ctx.restore();
}

function drawFriendlyColumn(ctx: CanvasRenderingContext2D) {
  // SABRE main body advancing north up the MSR
  const col: [Parameters<typeof drawVehicle>[1]['type'], number, number, number][] = [
    ['M1127', MSR_X - 2, 560, -Math.PI / 2],
    ['M1A2', MSR_X, 660, -Math.PI / 2],
    ['M1A2', MSR_X - 4, 745, -Math.PI / 2],
    ['M2A3', MSR_X + 22, 815, -Math.PI / 2 + 0.06],
    ['M1A2', MSR_X + 2, 895, -Math.PI / 2],
    ['M109A7', MSR_X - 26, 975, -Math.PI / 2 + 0.1],
    ['M2A3', MSR_X + 4, 1050, -Math.PI / 2],
  ];
  for (const [t, x, y, a] of col) vehicle(ctx, t, x, y, a, FRIEND_STYLE, 0.12);
  // scout pair working the west road
  vehicle(ctx, 'M1127', WEST_ROAD_X + 6, 700, -Math.PI / 2 + 0.08, FRIEND_STYLE);
  vehicle(ctx, 'M2A3', WEST_ROAD_X - 4, 800, -Math.PI / 2, FRIEND_STYLE, 0.3);

  // selected lead tank — the game's own selection language:
  // corner brackets, sight circle faint, gun range dashed
  const sx = MSR_X;
  const sy = 660;
  ctx.strokeStyle = 'rgba(76, 71, 61, 0.85)';
  ctx.lineWidth = 1.6;
  const b = 16;
  for (const [cx, cy, dx, dy] of [
    [sx - b, sy - b, 1, 1],
    [sx + b, sy - b, -1, 1],
    [sx - b, sy + b, 1, -1],
    [sx + b, sy + b, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * 7, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * 7);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(76, 71, 61, 0.16)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(sx, sy, 300, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.arc(sx, sy, 205, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawEnemy(ctx: CanvasRenderingContext2D) {
  // PL FOXTROT on the plateau — grey, static, waiting
  const garrison: [Parameters<typeof drawVehicle>[1]['type'], number, number, number][] = [
    ['T90M', 1210, 300, Math.PI / 2],
    ['T90M', 1300, 345, Math.PI / 2 - 0.12],
    ['BMP3', 1395, 305, Math.PI / 2],
    ['BMP3', 1465, 360, Math.PI / 2 + 0.2],
    ['2S19', 1180, 385, Math.PI / 2],
    ['2S19', 1520, 300, Math.PI / 2 - 0.15],
    ['TOR', 1255, 240, Math.PI],
    ['T90M', 1440, 255, Math.PI / 2 + 0.3],
  ];
  for (const [t, x, y, a] of garrison) vehicle(ctx, t, x, y, a, ENEMY_STYLE, 0.2);
}

/** the wrecks and the ink they left */
function drawAftermath(ctx: CanvasRenderingContext2D, rng: RNG) {
  // burnt-out hull on the enemy line
  vehicle(ctx, 'T90M', 1060, 480, Math.PI / 2 + 0.5, WRECK_STYLE);
  ctx.fillStyle = INK;
  inkBlob(ctx, 1058, 482, 52, rng);
  inkSplatter(ctx, 1058, 482, 52, rng);
  // a lighter loss nearer the bridges
  vehicle(ctx, 'BTR82A', 660, 842, 1.2, WRECK_STYLE);
  ctx.globalAlpha = 0.85;
  inkBlob(ctx, 658, 844, 26, rng);
  ctx.globalAlpha = 1;
  inkSplatter(ctx, 658, 844, 26, rng);
}

// ── fleet, air, smoke ────────────────────────────────────────

function ship(
  ctx: CanvasRenderingContext2D,
  type: 'FRIGATE' | 'DESTROYER' | 'PATROL',
  x: number,
  y: number,
  ang: number,
  mounts: ReturnType<typeof createMountStates>
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  drawShip(ctx, { type, style: FRIEND_STYLE, detail: 2, mounts });
  ctx.restore();
}

function drawFleet(ctx: CanvasRenderingContext2D) {
  // wakes first — foam behind each hull
  const wakes: [number, number, number, number][] = [
    [330, 990, -0.7, 150],
    [150, 900, -0.35, 190],
    [520, 1060, -0.55, 90],
  ];
  ctx.strokeStyle = 'rgba(243, 241, 234, 0.5)';
  ctx.lineCap = 'round';
  for (const [x, y, a, len] of wakes) {
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * len * 0.4, y - Math.sin(a) * len * 0.4);
    ctx.lineTo(x + Math.cos(a) * len * 0.6, y + Math.sin(a) * len * 0.6);
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * len * 0.6 + Math.sin(a) * 14, y + Math.sin(a) * len * 0.6 - Math.cos(a) * 14);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * len * 0.6 - Math.sin(a) * 14, y + Math.sin(a) * len * 0.6 + Math.cos(a) * 14);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // hulls ride east of OSTROV VOLNY
  ship(ctx, 'DESTROYER', 150, 900, -0.35, mountCache('DESTROYER'));
  ship(ctx, 'FRIGATE', 330, 990, -0.7, mountCache('FRIGATE'));
  ship(ctx, 'PATROL', 520, 1060, -0.55, mountCache('PATROL'));
}

// mount states are created once — the fleet is not re-armed per frame
const mountStore = new Map<string, ReturnType<typeof createMountStates>>();
function mountCache(type: 'FRIGATE' | 'DESTROYER' | 'PATROL') {
  let m = mountStore.get(type);
  if (!m) {
    m = createMountStates(type);
    mountStore.set(type, m);
  }
  return m;
}

function drawAir(ctx: CanvasRenderingContext2D, t: number) {
  // two fighters on a slow west→east transit, one Frogfoot-hunter low
  const flights: { y: number; speed: number; off: number; type: 'F16C' | 'A10C' }[] = [
    { y: 150, speed: 21, off: 0, type: 'F16C' },
    { y: 225, speed: 21, off: 320, type: 'F16C' },
    { y: 545, speed: 13, off: 700, type: 'A10C' },
  ];
  for (const f of flights) {
    const x = ((t * f.speed + f.off) % (WORLD_W + 500)) - 250;
    // contrail — a fading dash behind
    ctx.strokeStyle = 'rgba(76, 71, 61, 0.28)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    ctx.moveTo(x - 130, f.y + 2);
    ctx.lineTo(x - 16, f.y);
    ctx.stroke();
    ctx.setLineDash([]);
    vehicle(ctx, f.type, x, f.y, 0.04, FRIEND_STYLE);
  }
}

function drawSmoke(ctx: CanvasRenderingContext2D, t: number) {
  // sources: the burnt hull on the line, a fire by the piers
  const sources: [number, number, number][] = [
    [1062, 476, 0],
    [700, 880, 2.4],
  ];
  for (const [sx, sy, phase] of sources) {
    for (let p = 0; p < 4; p++) {
      const life = ((t * 0.09 + p * 0.25 + phase) % 1);
      const x = sx + life * 90 + Math.sin(t * 0.4 + p) * 8;
      const y = sy - life * 110 - p * 12;
      const r = 16 + life * 34;
      const a = 0.13 * (1 - life);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(52, 47, 38, ${a})`);
      g.addColorStop(1, 'rgba(52, 47, 38, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
}

// ── component ────────────────────────────────────────────────

export default function HeroBattlefield() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    // one seeded RNG re-created per paint — deterministic art
    const paint = (t: number) => {
      const rng = new RNG(0x3368);
      const cw = cv.clientWidth;
      const ch = cv.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = Math.round(cw * dpr);
      const bh = Math.round(ch * dpr);
      if (cv.width !== bw || cv.height !== bh) {
        cv.width = bw;
        cv.height = bh;
      }
      // camera: cover-fit the world at the focal point
      const s = Math.max(cw / WORLD_W, ch / WORLD_H) * ZOOM * dpr;
      const ox = bw / 2 - FOCAL.x * WORLD_W * s;
      const oy = bh / 2 - FOCAL.y * WORLD_H * s;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, bw, bh);
      ctx.setTransform(s, 0, 0, s, ox, oy);

      // layer order mirrors the game's renderer:
      // paper → washes → contours → sea → river → roads →
      // forests → city → trenches → wrecks+ink → grid →
      // ground units → fleet → smoke → air
      drawWashes(ctx, rng);
      drawContours(ctx, 430, 210, 330, 190, 4, rng);
      drawContours(ctx, 1620, 90, 380, 160, 4, rng);
      drawSea(ctx, t);
      drawRiver(ctx);
      drawRoads(ctx);
      drawForests(ctx, rng);
      drawCity(ctx, rng);
      drawTrenches(ctx, rng);
      drawAftermath(ctx, rng);

      // survey grid — 250 m squares, quiet
      ctx.strokeStyle = 'rgba(76, 71, 61, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= WORLD_W; x += 250) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD_H);
      }
      for (let y = 0; y <= WORLD_H; y += 250) {
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_W, y);
      }
      ctx.stroke();

      drawFriendlyColumn(ctx);
      drawEnemy(ctx);
      drawFleet(ctx);
      drawSmoke(ctx, t);
      drawAir(ctx, t);
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let running = false;
    let visible = true;
    const t0 = performance.now();

    const frame = () => {
      paint((performance.now() - t0) / 1000);
      if (running) raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running || reduced || !visible) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    paint(0); // first frame always — reduced motion gets a full still
    if (!reduced) start();

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(cv);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => paint((performance.now() - t0) / 1000));
      ro.observe(cv);
    }

    return () => {
      stop();
      io.disconnect();
      ro?.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-label="A monochrome battlefield: friendly armour advancing on a river line, enemy positions dug in on the high ground, warships in the bay and aircraft overhead"
      className="absolute inset-0 h-full w-full"
    />
  );
}