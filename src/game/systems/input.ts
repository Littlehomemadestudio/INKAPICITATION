// ─────────────────────────────────────────────────────────────
// PAPER STORM · input & command
// Precise RTS controls: box select, context orders, hotkeys.
// ─────────────────────────────────────────────────────────────

import { Unit } from '../entities/units';
import type { Camera } from './camera';
import type { Game } from '../Game';
import { dist, clamp } from '../core/math';

export type CursorMode = 'NORMAL' | 'ATTACK_MOVE' | 'FIRE_MISSION';

export class InputSystem {
  game: Game;
  camera: Camera;
  canvas: HTMLCanvasElement;

  mouseX = 0;
  mouseY = 0;
  mouseDownX = 0;
  mouseDownY = 0;
  dragSelect = false;
  middleDrag = false;
  middleX = 0;
  middleY = 0;

  selection: Unit[] = [];
  hoverUnit: Unit | null = null;
  cursorMode: CursorMode = 'NORMAL';

  keys = new Set<string>();
  private disposers: (() => void)[] = [];

  constructor(game: Game, camera: Camera, canvas: HTMLCanvasElement) {
    this.game = game;
    this.camera = camera;
    this.canvas = canvas;
    this.attach();
  }

  private attach() {
    const c = this.canvas;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) {
        this.keys.add(e.key.toLowerCase());
        return;
      }
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();

      if (!this.game.running || this.game.result) return;

      if (k === 'escape') {
        if (this.cursorMode !== 'NORMAL') {
          this.cursorMode = 'NORMAL';
        } else {
          this.clearSelection();
        }
        this.game.audio.uiTick();
      } else if (k === 'a') {
        if (this.selection.length) {
          this.cursorMode = this.cursorMode === 'ATTACK_MOVE' ? 'NORMAL' : 'ATTACK_MOVE';
          this.game.audio.uiTick();
        }
      } else if (k === 'f') {
        const arty = this.selection.filter((u) => u.def.projectile === 'ARTY' && !u.dead);
        if (arty.length) {
          this.cursorMode = this.cursorMode === 'FIRE_MISSION' ? 'NORMAL' : 'FIRE_MISSION';
          this.game.audio.uiTick();
        }
      } else if (k === 's') {
        for (const u of this.selection) u.orderStop();
        this.game.log(`${this.selection.length} UNIT(S) — HALT ORDER`);
      } else if (k === 'h') {
        for (const u of this.selection) u.orderHold();
        this.game.log(`${this.selection.length} UNIT(S) — HOLD POSITION`);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.key.toLowerCase());
    };
    const onMouseMove = (e: MouseEvent) => {
      const rect = c.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      if (this.middleDrag) {
        const dx = e.clientX - this.middleX;
        const dy = e.clientY - this.middleY;
        this.middleX = e.clientX;
        this.middleY = e.clientY;
        this.camera.panBy(dx, dy);
      }
      this.updateHover();
    };
    const onMouseDown = (e: MouseEvent) => {
      this.game.audio.ensureStarted();
      const rect = c.getBoundingClientRect();
      if (e.button === 0) {
        this.mouseDownX = e.clientX - rect.left;
        this.mouseDownY = e.clientY - rect.top;
        this.dragSelect = true;
      } else if (e.button === 1) {
        e.preventDefault();
        this.middleDrag = true;
        this.middleX = e.clientX;
        this.middleY = e.clientY;
      } else if (e.button === 2) {
        this.handleRightClick();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 1) this.middleDrag = false;
      if (e.button !== 0) return;
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (!this.dragSelect) return;
      this.dragSelect = false;
      const moved = Math.hypot(x - this.mouseDownX, y - this.mouseDownY);
      if (this.cursorMode === 'ATTACK_MOVE' || this.cursorMode === 'FIRE_MISSION') {
        this.issueModeOrder(x, y);
        this.cursorMode = 'NORMAL';
        return;
      }
      if (moved > 7) {
        this.boxSelect(this.mouseDownX, this.mouseDownY, x, y, e.shiftKey);
      } else {
        this.clickSelect(x, y, e.shiftKey);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const f = Math.exp(-e.deltaY * 0.0026);
      this.camera.zoomBy(f, e.clientX - rect.left, e.clientY - rect.top);
    };
    const onContext = (e: Event) => e.preventDefault();
    const onBlur = () => this.keys.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    c.addEventListener('mousemove', onMouseMove);
    c.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    c.addEventListener('wheel', onWheel, { passive: false });
    c.addEventListener('contextmenu', onContext);
    window.addEventListener('blur', onBlur);
    this.disposers.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      c.removeEventListener('mousemove', onMouseMove);
      c.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      c.removeEventListener('wheel', onWheel);
      c.removeEventListener('contextmenu', onContext);
      window.removeEventListener('blur', onBlur);
    });
  }

  dispose() {
    for (const d of this.disposers) d();
    this.disposers = [];
  }

  update(dt: number) {
    // WASD / arrows camera pan
    let dx = 0;
    let dy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      const speed = (this.camera.viewW / this.camera.zoom) * 0.85;
      this.camera.tx += (dx / len) * speed * dt;
      this.camera.ty += (dy / len) * speed * dt;
      this.camera.panBy(0, 0);
    }
  }

  // ── picking ────────────────────────────────────────────────

  unitAt(wx: number, wy: number, friendOnly: boolean): Unit | null {
    let best: Unit | null = null;
    let bd = Infinity;
    for (const u of this.game.units) {
      if (u.dead) continue;
      if (friendOnly && u.faction !== 'FRIEND') continue;
      if (!friendOnly && u.faction === 'ENEMY' && u.intel === 'HIDDEN') continue;
      if (!friendOnly && u.faction === 'ENEMY' && u.intel === 'GHOST') {
        const d = dist(wx, wy, u.knownX, u.knownY);
        if (d < 18 && d < bd) {
          bd = d;
          best = u;
        }
        continue;
      }
      const r = Math.max(6, 14 / this.game.camera.zoom) * (u.isAir ? 1.6 : 1);
      const d = dist(wx, wy, u.x, u.y);
      if (d < r && d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  private updateHover() {
    const w = this.camera.screenToWorld(this.mouseX, this.mouseY);
    const friend = this.unitAt(w.x, w.y, true);
    if (friend) {
      this.hoverUnit = friend;
    } else {
      const enemy = this.unitAt(w.x, w.y, false);
      this.hoverUnit = enemy;
    }
  }

  // ── selection ──────────────────────────────────────────────

  clearSelection() {
    this.selection = [];
  }

  private clickSelect(sx: number, sy: number, additive: boolean) {
    const w = this.camera.screenToWorld(sx, sy);
    const u = this.unitAt(w.x, w.y, true);
    this.game.audio.uiTick();
    if (!u) {
      if (!additive) this.clearSelection();
      return;
    }
    if (additive) {
      const i = this.selection.indexOf(u);
      if (i >= 0) this.selection.splice(i, 1);
      else this.selection.push(u);
    } else {
      this.selection = [u];
    }
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean) {
    const a = this.camera.screenToWorld(Math.min(x0, x1), Math.min(y0, y1));
    const b = this.camera.screenToWorld(Math.max(x0, x1), Math.max(y0, y1));
    const picked: Unit[] = [];
    for (const u of this.game.units) {
      if (u.dead || u.faction !== 'FRIEND') continue;
      if (u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y) picked.push(u);
    }
    this.game.audio.uiTick();
    if (!picked.length) {
      if (!additive) this.clearSelection();
      return;
    }
    if (additive) {
      for (const u of picked) if (!this.selection.includes(u)) this.selection.push(u);
    } else {
      this.selection = picked;
    }
  }

  // ── orders ─────────────────────────────────────────────────

  private handleRightClick() {
    const w = this.camera.screenToWorld(this.mouseX, this.mouseY);
    const sel = this.selection.filter((u) => !u.dead);
    if (!sel.length) return;
    if (this.cursorMode !== 'NORMAL') {
      this.cursorMode = 'NORMAL';
    }
    this.game.audio.uiTick();

    // enemy under cursor → attack / fire mission
    const enemy = this.unitAt(w.x, w.y, false);
    if (enemy && enemy.faction === 'ENEMY') {
      const arty = sel.filter((u) => u.def.projectile === 'ARTY');
      const direct = sel.filter((u) => u.def.projectile !== 'ARTY');
      for (const u of direct) u.orderAttack(enemy, this.game.simCtx());
      for (const u of arty) {
        u.orderFireMission({ x: enemy.x, y: enemy.y });
        this.game.log(`${u.callsign} · FIRE MISSION — GRID ${enemy.positionGrid()}`);
      }
      this.game.effects.orderMarker(enemy.x, enemy.y, 'attack');
      return;
    }

    // aircraft → patrol assignment
    const air = sel.filter((u) => u.isAir);
    const ground = sel.filter((u) => !u.isAir);
    for (const u of air) {
      if (u.airState === 'STANDBY' || u.airState === 'REARM') continue;
      u.patrol = { ...w };
      this.game.log(`${u.callsign} · PATROL AREA ASSIGNED`);
    }
    if (ground.length) {
      this.formationMove(ground, w);
      this.game.effects.orderMarker(w.x, w.y, 'move');
    }
  }

  private issueModeOrder(sx: number, sy: number) {
    const w = this.camera.screenToWorld(sx, sy);
    const sel = this.selection.filter((u) => !u.dead);
    if (!sel.length) return;
    if (this.cursorMode === 'ATTACK_MOVE') {
      const ground = sel.filter((u) => !u.isAir);
      this.formationMove(ground, w, true);
      this.game.effects.orderMarker(w.x, w.y, 'attack');
      this.game.log(`${sel.length} UNIT(S) — ATTACK-MOVE`);
    } else if (this.cursorMode === 'FIRE_MISSION') {
      const arty = sel.filter((u) => u.def.projectile === 'ARTY');
      for (const u of arty) u.orderFireMission({ ...w });
      if (arty.length) {
        this.game.effects.orderMarker(w.x, w.y, 'fire');
        this.game.log(`${arty.length} GUN(S) · FIRE MISSION — GRID ${Math.floor(clamp(w.x, 0, 9999) / 10)}-${Math.floor(clamp(w.y, 0, 9999) / 10)}`);
      }
    }
  }

  /** spread a group into marching formation offsets */
  private formationMove(units: Unit[], dest: { x: number; y: number }, attackMove = false) {
    const ang = Math.atan2(dest.y - units[0].y, dest.x - units[0].x);
    const perp = ang + Math.PI / 2;
    const spacing = 62;
    const cols = Math.ceil(Math.sqrt(units.length));
    units.forEach((u, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const ox = (col - (cols - 1) / 2) * spacing;
      const oy = (row - (Math.ceil(units.length / cols) - 1) / 2) * spacing * 1.35;
      const px = dest.x + Math.cos(perp) * ox - Math.cos(ang) * oy;
      const py = dest.y + Math.sin(perp) * ox - Math.sin(ang) * oy;
      if (attackMove) u.orderAttackMove({ x: px, y: py }, this.game.simCtx());
      else u.orderMove({ x: px, y: py }, this.game.simCtx());
    });
  }

  // ── HUD command hooks ──────────────────────────────────────

  commandStop() {
    for (const u of this.selection) u.orderStop();
  }

  commandHold() {
    for (const u of this.selection) u.orderHold();
  }

  commandAttackMove() {
    if (this.selection.length) this.cursorMode = 'ATTACK_MOVE';
  }

  commandFireMission() {
    const arty = this.selection.filter((u) => u.def.projectile === 'ARTY');
    if (arty.length) this.cursorMode = 'FIRE_MISSION';
  }

  launchAircraft(unitId: number, patrol: { x: number; y: number }) {
    const u = this.game.units.find((x) => x.id === unitId);
    if (u && u.isAir && (u.airState === 'STANDBY' || u.airState === 'REARM')) {
      u.launchAir(patrol);
      this.game.log(`${u.callsign} · LAUNCH — ON STATION INBOUND`, 'info');
    } else if (u && u.isAir) {
      u.patrol = { ...patrol };
    }
  }
}
