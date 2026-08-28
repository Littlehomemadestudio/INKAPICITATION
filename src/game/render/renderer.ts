// ─────────────────────────────────────────────────────────────
// PAPER STORM · master renderer
// Layer composition: paper → features → craters → rubble →
// sectors → objectives → factories → wrecks → units → ink →
// smoke. The battlefield is the hero; command marks stay quiet.
// ─────────────────────────────────────────────────────────────

import { Camera } from '../systems/camera';
import type { Unit } from '../entities/units';
import type { Game } from '../Game';
import { drawVehicle, drawSelectionBrackets, FRIEND_STYLE, ENEMY_STYLE, WRECK_STYLE } from '../entities/unitDraw';
import { clamp } from '../core/math';
import type { ObjectiveState, Sector } from '../core/types';

interface HoverLabel {
  sx: number;
  sy: number;
  lines: string[];
  hostile: boolean;
}

export class Renderer {
  private monoFont = 'ui-monospace, monospace';
  private sansFont = 'system-ui, sans-serif';
  minimapBase: HTMLCanvasElement | null = null;
  private grainPattern: CanvasPattern | null = null;

  initFonts() {
    try {
      const style = getComputedStyle(document.body);
      const mono = style.getPropertyValue('--font-geist-mono').trim();
      const sans = style.getPropertyValue('--font-geist-sans').trim();
      if (mono) this.monoFont = mono;
      if (sans) this.sansFont = sans;
    } catch {
      /* defaults */
    }
  }

  draw(ctx: CanvasRenderingContext2D, game: Game, dpr: number) {
    const cam = game.camera;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // dark table around the sheet
    ctx.fillStyle = '#161513';
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);

    cam.applyTransform(ctx, dpr);

    game.terrainRenderer.drawBase(ctx, cam, game.effects.scars);
    game.terrainRenderer.drawFeatures(ctx, cam);
    game.effects.drawCraters(ctx, cam);
    game.effects.drawRubble(ctx, cam);

    const hovers: HoverLabel[] = [];
    this.drawSectors(ctx, game, cam);
    this.drawAssembly(ctx, game, cam);
    this.drawObjectives(ctx, game, cam);
    this.drawFactories(ctx, game, cam, hovers);
    this.drawWrecks(ctx, game, cam);
    this.drawUnits(ctx, game, cam, hovers);
    game.projectiles.draw(ctx);
    game.effects.drawCore(ctx);
    game.effects.drawOrderMarkers(ctx);
    game.effects.drawSmoke(ctx);
    game.terrainRenderer.drawFurniture(ctx);

    // screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawPaperGrain(ctx, game, cam);
    this.drawSelectionBox(ctx, game);
    this.drawHoverLabels(ctx, hovers);
    this.drawCursorMode(ctx, game);
  }

  /** constant screen-size paper grain, anchored to world position */
  private drawPaperGrain(ctx: CanvasRenderingContext2D, game: Game, cam: Camera) {
    const strength = clamp((cam.zoom - 0.35) * 1.1, 0, 0.55);
    if (strength <= 0.02) return;
    if (!this.grainPattern) {
      this.grainPattern = ctx.createPattern(game.terrainRenderer.grain, 'repeat');
      if (!this.grainPattern) return;
    }
    const ox = ((-cam.x * cam.zoom) % 256 + 256) % 256;
    const oy = ((-cam.y * cam.zoom) % 256 + 256) % 256;
    ctx.save();
    ctx.translate(ox - 256, oy - 256);
    ctx.globalAlpha = strength;
    ctx.fillStyle = this.grainPattern;
    ctx.fillRect(0, 0, cam.viewW + 512, cam.viewH + 512);
    ctx.restore();
  }

  // ── strategic sectors ──────────────────────────────────────

  private drawSectors(ctx: CanvasRenderingContext2D, game: Game, cam: Camera) {
    if (cam.zoom > 1.6) return; // at close range the ground speaks for itself
    for (const s of game.economy.sectors) {
      const inView =
        s.pos.x + s.radius > cam.viewX &&
        s.pos.x - s.radius < cam.viewX + cam.viewW &&
        s.pos.y + s.radius > cam.viewY &&
        s.pos.y - s.radius < cam.viewY + cam.viewH;
      if (!inView) continue;
      this.drawSector(ctx, s, cam);
    }
  }

  private drawSector(ctx: CanvasRenderingContext2D, s: Sector, cam: Camera) {
    const strong = cam.zoom < 0.7;
    ctx.save();
    // boundary — a surveyed area, not a video game circle
    ctx.strokeStyle =
      s.control === 'FRIEND' ? 'rgba(20,17,12,0.55)' : s.control === 'ENEMY' ? 'rgba(80,74,62,0.5)' : 'rgba(110,104,90,0.38)';
    ctx.lineWidth = Math.max(1, 1 / cam.zoom);
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.arc(s.pos.x, s.pos.y, s.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // inner tick ring at quarter radius
    if (strong) {
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([3, 14]);
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, s.radius * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // capture progress — an arc filling as the ground changes hands
    if (s.capturing && s.captureT > 0.2) {
      const frac = clamp(s.captureT / s.captureTime, 0, 1);
      ctx.strokeStyle = s.capturing === 'FRIEND' ? '#141210' : '#5a544a';
      ctx.lineWidth = Math.max(2.2, 2.6 / cam.zoom);
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, s.radius * 0.72, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }

    // ownership mark — square for friendly, hollow for enemy, dot for neutral
    const ms = Math.max(9, 12 / cam.zoom);
    if (s.control === 'FRIEND') {
      ctx.fillStyle = 'rgba(20,17,12,0.92)';
      ctx.fillRect(s.pos.x - ms / 2, s.pos.y - ms / 2, ms, ms);
      ctx.fillStyle = '#f3f1ea';
      ctx.fillRect(s.pos.x - ms * 0.14, s.pos.y - ms * 0.14, ms * 0.28, ms * 0.28);
    } else if (s.control === 'ENEMY') {
      ctx.strokeStyle = 'rgba(70,64,52,0.9)';
      ctx.lineWidth = Math.max(1.4, 1.6 / cam.zoom);
      ctx.strokeRect(s.pos.x - ms / 2, s.pos.y - ms / 2, ms, ms);
      ctx.fillStyle = 'rgba(70,64,52,0.75)';
      ctx.fillRect(s.pos.x - ms * 0.14, s.pos.y - ms * 0.14, ms * 0.28, ms * 0.28);
    } else {
      ctx.strokeStyle = 'rgba(96,90,76,0.8)';
      ctx.lineWidth = Math.max(1.1, 1.2 / cam.zoom);
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, ms * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }

    // designation
    if (cam.zoom > 0.2) {
      const size = clamp(12 / cam.zoom + 5, 11, 26);
      ctx.font = `600 ${size}px ${this.sansFont}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = `${s.name} · +${s.income.toFixed(1)}`;
      ctx.strokeStyle = 'rgba(243,241,234,0.85)';
      ctx.lineWidth = size * 0.22;
      ctx.strokeText(label, s.pos.x, s.pos.y - ms * 1.4);
      ctx.fillStyle = 'rgba(28,25,19,0.85)';
      ctx.fillText(label, s.pos.x, s.pos.y - ms * 1.4);
    }
    ctx.restore();
  }

  /** the staging area — where purchased battalions arrive */
  private drawAssembly(ctx: CanvasRenderingContext2D, game: Game, cam: Camera) {
    if (game.result) return;
    const a = game.economy.friendlyAssembly;
    ctx.save();
    ctx.strokeStyle = 'rgba(20,17,12,0.4)';
    ctx.lineWidth = Math.max(1, 1 / cam.zoom);
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(a.x - 130, a.y - 100, 260, 200);
    ctx.setLineDash([]);
    if (cam.zoom > 0.3) {
      const size = clamp(10 / cam.zoom + 4, 10, 20);
      ctx.font = `600 ${size}px ${this.sansFont}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(28,25,19,0.6)';
      ctx.strokeStyle = 'rgba(243,241,234,0.8)';
      ctx.lineWidth = size * 0.2;
      const t = 'ASSEMBLY ALPHA';
      ctx.strokeText(t, a.x, a.y - 112);
      ctx.fillText(t, a.x, a.y - 112);
    }
    ctx.restore();
  }

  // ── objectives ─────────────────────────────────────────────

  private drawObjectives(ctx: CanvasRenderingContext2D, game: Game, cam: Camera) {
    for (const obj of game.objectives as ObjectiveState[]) {
      const size = 95;
      ctx.save();
      ctx.strokeStyle = '#141210';
      ctx.lineWidth = Math.max(1.1, 1.1 / cam.zoom);
      if (!obj.secured) ctx.setLineDash([10, 7]);
      // corner brackets
      const draw = (s: number, gap: number) => {
        const l = s * 0.42;
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
          ctx.beginPath();
          ctx.moveTo(obj.pos.x + sx * s - sx * l, obj.pos.y + sy * (s + gap));
          ctx.lineTo(obj.pos.x + sx * s, obj.pos.y + sy * (s + gap));
          ctx.lineTo(obj.pos.x + sx * s, obj.pos.y + sy * (s + gap) - sy * l);
          ctx.stroke();
        }
      };
      draw(size, 26);
      if (obj.primary) draw(size + 16, 26);
      ctx.setLineDash([]);
      // leader line from bracket to label
      ctx.strokeStyle = 'rgba(24,21,15,0.45)';
      ctx.lineWidth = Math.max(0.8, 0.8 / cam.zoom);
      ctx.beginPath();
      ctx.moveTo(obj.pos.x, obj.pos.y - size - 4);
      ctx.lineTo(obj.pos.x, obj.pos.y - size - 16);
      ctx.stroke();
      // label
      const labelSize = clamp(15 / cam.zoom + 8, 12, 30);
      ctx.font = `600 ${labelSize}px ${this.sansFont}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = obj.secured ? 'rgba(24,21,15,0.95)' : 'rgba(24,21,15,0.8)';
      ctx.strokeStyle = 'rgba(243,241,234,0.9)';
      ctx.lineWidth = labelSize * 0.22;
      const status = obj.secured ? 'SECURED' : 'HOSTILE';
      const text = `${obj.name} — ${status}`;
      ctx.strokeText(text, obj.pos.x, obj.pos.y - size - 22);
      ctx.fillText(text, obj.pos.x, obj.pos.y - size - 22);
      ctx.restore();
    }
  }

  // ── ink works (factory structures) ─────────────────────────

  private drawFactories(ctx: CanvasRenderingContext2D, game: Game, cam: Camera, hovers: HoverLabel[]) {
    for (const u of game.units) {
      if (u.def.kind !== 'FACTORY') continue;
      if (u.dead) continue;
      const zx = u.x;
      const zy = u.y;
      const halfW = u.def.length * 0.62;
      const halfH = u.def.width * 0.85;

      ctx.save();
      ctx.translate(zx, zy);
      ctx.rotate(0.08);

      // perimeter — surveyed boundary of the installation
      const friendly = u.factoryCtl === 'FRIEND';
      const neutral = u.factoryCtl === 'NEUTRAL';
      ctx.strokeStyle = friendly
        ? 'rgba(20,17,12,0.8)'
        : neutral
          ? 'rgba(104,98,84,0.65)'
          : 'rgba(76,70,58,0.8)';
      ctx.lineWidth = Math.max(1.3, 1.5 / cam.zoom);
      ctx.setLineDash([14, 9]);
      ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
      ctx.setLineDash([]);

      // capture progress arc across the works
      if (u.capturing && u.captureT > 0.2) {
        const frac = clamp(u.captureT / 7, 0, 1);
        ctx.strokeStyle = u.capturing === 'FRIEND' ? '#141210' : '#5a544a';
        ctx.lineWidth = Math.max(2.6, 3 / cam.zoom);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(halfW, halfH) * 1.12, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.stroke();
      }

      // control pennant — pole and flag at the works corner
      const px = halfW * 0.8;
      const py = -halfH * 0.8;
      ctx.strokeStyle = '#26221b';
      ctx.lineWidth = Math.max(1, 1.1 / cam.zoom);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - 16);
      ctx.stroke();
      ctx.beginPath();
      if (friendly) {
        ctx.fillStyle = '#141210';
        ctx.moveTo(px, py - 16);
        ctx.lineTo(px + 11, py - 12.5);
        ctx.lineTo(px, py - 9);
        ctx.closePath();
        ctx.fill();
      } else if (neutral) {
        ctx.strokeStyle = 'rgba(96,90,76,0.9)';
        ctx.lineWidth = Math.max(1, 1.1 / cam.zoom);
        ctx.moveTo(px, py - 16);
        ctx.lineTo(px + 11, py - 12.5);
        ctx.lineTo(px, py - 9);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(82,76,64,0.9)';
        ctx.moveTo(px, py - 16);
        ctx.lineTo(px + 11, py - 12.5);
        ctx.lineTo(px, py - 9);
        ctx.closePath();
        ctx.fill();
      }

      // designation plate
      if (cam.zoom > 0.24) {
        const size = clamp(11 / cam.zoom + 5, 10, 24);
        ctx.font = `600 ${size}px ${this.sansFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const status = friendly ? 'HOLDING · +5 INK/S' : neutral ? 'UNCLAIMED · +5 INK/S' : 'ENEMY HELD · +5 INK/S';
        const label = `${u.callsign} — ${status}`;
        ctx.strokeStyle = 'rgba(243,241,234,0.88)';
        ctx.lineWidth = size * 0.22;
        ctx.strokeText(label, 0, -halfH - size * 0.9);
        ctx.fillStyle = friendly ? 'rgba(24,21,15,0.92)' : 'rgba(46,42,34,0.85)';
        ctx.fillText(label, 0, -halfH - size * 0.9);
      }

      // damage: soot creeping across the works
      if (u.hp < u.def.hp * 0.7) {
        const dmg = 1 - u.hp / u.def.hp;
        ctx.fillStyle = `rgba(22,18,12,${0.18 * dmg})`;
        ctx.fillRect(-halfW, -halfH, halfW * 2, halfH * 2);
      }
      ctx.restore();

      if (game.input.hoverUnit === u) {
        const s = cam.worldToScreen(zx, zy);
        hovers.push({
          sx: s.x,
          sy: s.y,
          hostile: !friendly,
          lines: [
            `${u.callsign} · INK WORKS`,
            friendly ? 'FRIENDLY — PRODUCING' : neutral ? 'UNCLAIMED — CAPTURE TO DRAW INK' : 'ENEMY — CAPTURE OR DESTROY',
            `INTEGRITY ${Math.ceil((u.hp / u.def.hp) * 100)}%`,
          ],
        });
      }
    }
  }

  // ── wrecks ─────────────────────────────────────────────────

  private drawWrecks(ctx: CanvasRenderingContext2D, game: Game, cam: Camera) {
    const zoom = cam.zoom;
    const detail = zoom < 0.28 ? 0 : zoom < 0.85 ? 1 : 2;
    for (const w of game.effects.wrecks) {
      // strategic ink blot — wrecks must register from the overview
      if (zoom < 0.5) {
        const r = Math.max(9, 13 / zoom);
        const g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, r);
        g.addColorStop(0, 'rgba(20,17,11,0.5)');
        g.addColorStop(1, 'rgba(20,17,11,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const age = game.time - w.born;
      const alpha = clamp(1 - age / 900, 0.62, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(w.x, w.y);
      ctx.rotate(w.angle);
      drawVehicle(ctx, {
        type: w.type as never,
        style: WRECK_STYLE,
        detail,
        turretAngle: 0,
        radarAngle: 0,
        wreck: true,
        noTurret: true,
      });
      ctx.restore();
      // tossed turret
      if (w.turretToss) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(w.turretToss.x, w.turretToss.y);
        ctx.rotate(w.turretToss.angle);
        ctx.fillStyle = '#232019';
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.4, 3.0, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(2.6, -0.35, 4.4, 0.7);
        if (detail >= 1) {
          ctx.fillStyle = '#2e2a22';
          ctx.beginPath();
          ctx.arc(-0.6, 0.7, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  // ── units ──────────────────────────────────────────────────

  private drawUnits(ctx: CanvasRenderingContext2D, game: Game, cam: Camera, hovers: HoverLabel[]) {
    const zoom = cam.zoom;
    const detail = zoom < 0.28 ? 0 : zoom < 0.85 ? 1 : 2;
    // strategic readability: units never shrink below a legible stamp
    const minPx = 15;
    const scaleFor = (u: Unit) => Math.min(4.2, Math.max(1, minPx / (zoom * u.def.length)));

    // ground units first, aircraft on top
    const ground: Unit[] = [];
    const air: Unit[] = [];
    for (const u of game.units) {
      if (u.dead || u.def.kind === 'FACTORY') continue;
      if (u.isAir) {
        if (u.airState === 'STANDBY' || u.airState === 'REARM') continue;
        air.push(u);
      } else {
        if (u.faction === 'ENEMY' && u.intel === 'HIDDEN') continue;
        ground.push(u);
      }
    }

    for (const u of ground) {
      const selected = game.input.selection.includes(u);
      const ghost = u.faction === 'ENEMY' && u.intel === 'GHOST';
      const gx = ghost ? u.knownX : u.x;
      const gy = ghost ? u.knownY : u.y;
      const es = scaleFor(u);

      ctx.save();
      ctx.translate(gx, gy);

      if (ghost) {
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = '#565046';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, 13 * es, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      const style = u.faction === 'FRIEND' ? FRIEND_STYLE : ENEMY_STYLE;
      // paper halo — separates the stamp from terrain shading
      if (es > 1.15 && !ghost) {
        ctx.fillStyle = 'rgba(243,241,234,0.5)';
        ctx.beginPath();
        ctx.ellipse(0, 0, u.def.length * 0.62 * es, u.def.width * 0.85 * es, u.angle, 0, Math.PI * 2);
        ctx.fill();
      }
      // shadow
      if (!ghost && es <= 1.15) {
        ctx.save();
        ctx.translate(2.6, 3.2);
        ctx.rotate(u.angle);
        ctx.fillStyle = 'rgba(25,22,16,0.15)';
        ctx.beginPath();
        ctx.ellipse(0, 0, u.def.length * 0.52, u.def.width * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.scale(es, es);
      ctx.rotate(u.angle);
      drawVehicle(ctx, {
        type: u.def.type,
        style,
        detail,
        turretAngle: u.turretAngle - u.angle,
        radarAngle: u.radarAngle,
        recoil: u.recoil * (u.def.projectile === 'SHELL' || u.def.projectile === 'ARTY' ? 0.8 : 0.3),
        missiles: u.isAir ? u.ammo : undefined,
      });
      ctx.restore();

      // damage flash
      if (u.damageFlash > 0) {
        ctx.save();
        ctx.rotate(u.angle);
        ctx.globalAlpha = u.damageFlash * 0.5;
        ctx.fillStyle = '#f3f1ea';
        ctx.beginPath();
        ctx.ellipse(0, 0, u.def.length * 0.42 * es, u.def.width * 0.42 * es, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // selection
      if (selected && u.faction === 'FRIEND') {
        ctx.save();
        ctx.translate(gx, gy);
        drawSelectionBrackets(ctx, u.def.length * 0.62 * Math.max(es, 1), 7 / zoom, Math.max(1.2, 1.3 / zoom), '#141210');
        // command path
        if (u.dest) {
          ctx.strokeStyle = 'rgba(20,17,12,0.5)';
          ctx.lineWidth = Math.max(0.9, 1 / zoom);
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(u.dest.x, u.dest.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeRect(u.dest.x - 3, u.dest.y - 3, 6, 6);
        }
        // hp bar when damaged
        if (u.hp < u.def.hp) {
          const w = Math.max(16, u.def.length * 2.2 * Math.max(es, 1));
          const yy = gy + (u.def.width + 9) * Math.max(es, 1);
          ctx.fillStyle = 'rgba(243,241,234,0.85)';
          ctx.fillRect(gx - w / 2, yy, w, 2.6);
          ctx.fillStyle = '#141210';
          ctx.fillRect(gx - w / 2, yy, (w * u.hp) / u.def.hp, 2.6);
        }
        ctx.restore();
      }

      // hover label data
      if (game.input.hoverUnit === u) {
        const s = cam.worldToScreen(gx, gy);
        if (u.faction === 'FRIEND') {
          hovers.push({
            sx: s.x,
            sy: s.y,
            hostile: false,
            lines: [`${u.callsign} · ${u.def.shortName}`, u.getActivity(), `GRID ${u.positionGrid()}`],
          });
        } else {
          hovers.push({
            sx: s.x,
            sy: s.y,
            hostile: true,
            lines: [
              `ENEMY · ${u.def.shortName}`,
              ghost ? 'LAST KNOWN POSITION' : u.getActivity(),
              `GRID ${u.positionGrid()}`,
            ],
          });
        }
      }
    }

    // aircraft
    for (const u of air) {
      const selected = game.input.selection.includes(u);
      const es = scaleFor(u) * 0.7;
      // ground shadow (altitude illusion)
      ctx.save();
      ctx.translate(u.x + 26, u.y + 34);
      ctx.rotate(u.angle);
      ctx.fillStyle = 'rgba(25,22,16,0.10)';
      ctx.beginPath();
      ctx.ellipse(0, 0, u.def.length * 0.5, u.def.width * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(u.x, u.y);
      if (es > 1.1) {
        ctx.fillStyle = 'rgba(243,241,234,0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 0, u.def.length * 0.5 * es, u.def.width * 0.55 * es, u.angle, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.scale(es, es);
      ctx.rotate(u.angle);
      ctx.scale(1, 1 - Math.abs(u.bank) * 0.28);
      drawVehicle(ctx, {
        type: u.def.type,
        style: FRIEND_STYLE,
        detail,
        turretAngle: 0,
        radarAngle: 0,
        missiles: u.ammo,
      });
      ctx.restore();
      ctx.restore();

      if (selected) {
        ctx.save();
        ctx.translate(u.x, u.y);
        drawSelectionBrackets(ctx, 26, 8 / zoom, Math.max(1.2, 1.3 / zoom), '#141210');
        // patrol orbit
        ctx.strokeStyle = 'rgba(20,17,12,0.3)';
        ctx.lineWidth = Math.max(0.8, 0.9 / zoom);
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.arc(u.patrol.x, u.patrol.y, 640, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      if (game.input.hoverUnit === u) {
        const s = cam.worldToScreen(u.x, u.y);
        hovers.push({
          sx: s.x,
          sy: s.y,
          hostile: false,
          lines: [`${u.callsign} · ${u.def.shortName}`, u.getActivity(), `MSL ${u.ammo}/${u.def.ammo}`],
        });
      }
    }
  }

  // ── screen-space overlays ──────────────────────────────────

  private drawSelectionBox(ctx: CanvasRenderingContext2D, game: Game) {
    const inp = game.input;
    if (!inp.dragSelect || inp.cursorMode !== 'NORMAL') return;
    const x = Math.min(inp.mouseDownX, inp.mouseX);
    const y = Math.min(inp.mouseDownY, inp.mouseY);
    const w = Math.abs(inp.mouseX - inp.mouseDownX);
    const h = Math.abs(inp.mouseY - inp.mouseDownY);
    if (w + h < 8) return;
    ctx.fillStyle = 'rgba(20,18,15,0.05)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#141210';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    // corner ticks
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    const t = 7;
    ctx.beginPath();
    ctx.moveTo(x, y + t);
    ctx.lineTo(x, y);
    ctx.lineTo(x + t, y);
    ctx.moveTo(x + w - t, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + t);
    ctx.moveTo(x, y + h - t);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + t, y + h);
    ctx.moveTo(x + w - t, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - t);
    ctx.stroke();
  }

  private drawHoverLabels(ctx: CanvasRenderingContext2D, hovers: HoverLabel[]) {
    for (const h of hovers) {
      ctx.font = `500 10px ${this.monoFont}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const y0 = h.sy - 16;
      h.lines.forEach((line, i) => {
        const y = y0 - (h.lines.length - 1 - i) * 12;
        const wpx = ctx.measureText(line).width + 10;
        ctx.fillStyle = 'rgba(243,241,234,0.82)';
        ctx.fillRect(h.sx - wpx / 2, y - 10, wpx, 12);
        ctx.fillStyle = h.hostile ? '#33302a' : '#141210';
        ctx.fillText(line, h.sx, y);
      });
    }
  }

  private drawCursorMode(ctx: CanvasRenderingContext2D, game: Game) {
    const mode = game.input.cursorMode;
    if (mode === 'NORMAL') return;
    const text =
      mode === 'ATTACK_MOVE' ? 'SELECT DESTINATION — ATTACK-MOVE' : 'SELECT TARGET AREA — FIRE MISSION';
    ctx.font = `600 10px ${this.monoFont}`;
    const x = game.input.mouseX + 14;
    const y = game.input.mouseY + 18;
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = '#141210';
    ctx.fillRect(x, y - 11, w, 16);
    ctx.fillStyle = '#f3f1ea';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 6, y - 3);
  }

  // ── minimap ────────────────────────────────────────────────

  drawMinimap(ctx: CanvasRenderingContext2D, w: number, h: number, game: Game) {
    if (!this.minimapBase) {
      this.minimapBase = document.createElement('canvas');
      this.minimapBase.width = w;
      this.minimapBase.height = h;
      game.terrainRenderer.renderMinimapBase(this.minimapBase.getContext('2d')!, w, h);
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.minimapBase, 0, 0);

    const sx = w / game.terrain.W;
    const sy = h / game.terrain.H;

    // unexplored fog
    const vis = game.vision;
    const cellW = w / vis.cols;
    const cellH = h / vis.rows;
    ctx.fillStyle = 'rgba(30,27,22,0.34)';
    for (let gy = 0; gy < vis.rows; gy++) {
      for (let gx = 0; gx < vis.cols; gx++) {
        if (!vis.explored[gy * vis.cols + gx]) {
          ctx.fillRect(gx * cellW, gy * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
    }

    // sectors — ownership diamonds
    for (const s of game.economy.sectors) {
      const x = s.pos.x * sx;
      const y = s.pos.y * sy;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      const s2 = 3.2;
      if (s.control === 'FRIEND') {
        ctx.fillStyle = '#0c0b08';
        ctx.fillRect(-s2, -s2, s2 * 2, s2 * 2);
      } else if (s.control === 'ENEMY') {
        ctx.strokeStyle = 'rgba(110,104,92,0.95)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-s2, -s2, s2 * 2, s2 * 2);
      } else {
        ctx.strokeStyle = 'rgba(130,124,110,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, s2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // objectives
    for (const obj of game.objectives) {
      ctx.strokeStyle = obj.secured ? '#141210' : 'rgba(30,27,22,0.85)';
      ctx.lineWidth = 1;
      const s = 5;
      ctx.strokeRect(obj.pos.x * sx - s, obj.pos.y * sy - s, s * 2, s * 2);
    }

    // ink works — squares, filled by holder
    for (const u of game.units) {
      if (u.def.kind !== 'FACTORY') continue;
      const x = u.x * sx;
      const y = u.y * sy;
      const s = 4;
      if (u.dead) {
        ctx.strokeStyle = 'rgba(20,17,12,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - s, y - s);
        ctx.lineTo(x + s, y + s);
        ctx.moveTo(x + s, y - s);
        ctx.lineTo(x - s, y + s);
        ctx.stroke();
      } else if (u.factoryCtl === 'FRIEND') {
        ctx.fillStyle = '#0c0b08';
        ctx.fillRect(x - s, y - s, s * 2, s * 2);
      } else if (u.factoryCtl === 'NEUTRAL') {
        ctx.strokeStyle = 'rgba(60,55,46,0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - s, y - s, s * 2, s * 2);
      } else {
        ctx.fillStyle = 'rgba(110,104,92,0.95)';
        ctx.fillRect(x - s, y - s, s * 2, s * 2);
      }
    }

    // wrecks
    ctx.fillStyle = 'rgba(20,17,12,0.5)';
    for (const wr of game.effects.wrecks) {
      ctx.fillRect(wr.x * sx - 1, wr.y * sy - 1, 2, 2);
    }

    // units
    for (const u of game.units) {
      if (u.dead) continue;
      if (u.faction === 'FRIEND') {
        if (u.isAir && (u.airState === 'STANDBY' || u.airState === 'REARM')) continue;
        if (u.def.kind === 'FACTORY') continue;
        ctx.fillStyle = '#0c0b08';
        if (u.isAir) {
          ctx.beginPath();
          ctx.moveTo(u.x * sx, u.y * sy - 3);
          ctx.lineTo(u.x * sx + 3, u.y * sy + 2);
          ctx.lineTo(u.x * sx - 3, u.y * sy + 2);
          ctx.closePath();
          ctx.fill();
        } else {
          const s = 2.5;
          ctx.fillRect(u.x * sx - s / 2, u.y * sy - s / 2, s, s);
        }
      } else {
        if (u.def.kind === 'FACTORY') continue;
        if (u.intel === 'DETECTED') {
          const s = 2.5;
          ctx.fillStyle = '#6b655a';
          ctx.fillRect(u.x * sx - s / 2, u.y * sy - s / 2, s, s);
        } else if (u.intel === 'GHOST') {
          ctx.strokeStyle = 'rgba(90,84,74,0.8)';
          ctx.lineWidth = 1;
          ctx.strokeRect(u.knownX * sx - 1.5, u.knownY * sy - 1.5, 3, 3);
        }
      }
    }

    // viewport
    const cam = game.camera;
    ctx.strokeStyle = '#0c0b08';
    ctx.lineWidth = 1;
    ctx.strokeRect(cam.viewX * sx, cam.viewY * sy, (cam.viewW / cam.zoom) * sx, (cam.viewH / cam.zoom) * sy);
  }
}
