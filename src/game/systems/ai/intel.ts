// ─────────────────────────────────────────────────────────────
// PAPER STORM · AI intelligence picture
// The enemy commander is not omniscient. He knows what his own
// units can see: confirmed contacts where eyes are on, fading
// memory where they were. Artillery aimed at stale intelligence
// scatters — the same rules the player lives by.
// ─────────────────────────────────────────────────────────────

import type { SimContext, Unit } from '../../entities/units';
import { dist } from '../../core/math';

export interface Contact {
  unit: Unit;
  x: number;
  y: number;
  t: number;
  /** 1 = eyes on now → 0 = stale memory */
  conf: number;
  hpFrac: number;
  isAir: boolean;
}

/** power weight of a unit for force-ratio maths */
function powerOf(u: Unit): number {
  if (u.dead) return 0;
  switch (u.def.kind) {
    case 'MBT': return 3;
    case 'IFV': return 1.8;
    case 'SPG': return 1.6;
    case 'SPAA': return 1.0;
    case 'REC': return 0.9;
    case 'INF': return 0.7;
    default: return 0;
  }
}

export class IntelSystem {
  contacts = new Map<number, Contact>();
  /** combat power of confirmed contacts, cached per update */
  observedPower = 0;

  update(dt: number, ctx: SimContext) {
    void dt;
    const now = ctx.time;
    // fresh marks from every enemy unit's own eyes
    for (const e of ctx.units) {
      if (e.dead || e.faction !== 'ENEMY' || e.isAir) continue;
      for (const t of e.visibleTargets) {
        if (t.dead || t.faction !== 'FRIEND' || t.isAir) continue;
        this.contacts.set(t.id, {
          unit: t,
          x: t.x,
          y: t.y,
          t: now,
          conf: 1,
          hpFrac: t.hp / t.def.hp,
          isAir: false,
        });
      }
    }
    // decay — a contact nobody has seen for 45 s is forgotten
    let power = 0;
    for (const [id, c] of this.contacts) {
      if (c.unit.dead) {
        this.contacts.delete(id);
        continue;
      }
      const age = now - c.t;
      if (age > 45) {
        this.contacts.delete(id);
        continue;
      }
      c.conf = Math.max(0, 1 - age / 45);
      if (c.conf > 0.8) power += powerOf(c.unit) * c.hpFrac;
    }
    this.observedPower = power;
  }

  list(minConf = 0.01): Contact[] {
    const out: Contact[] = [];
    for (const c of this.contacts.values()) if (c.conf >= minConf) out.push(c);
    return out;
  }

  near(x: number, y: number, r: number, minConf = 0.4): Contact[] {
    const out: Contact[] = [];
    for (const c of this.contacts.values()) {
      if (c.conf < minConf) continue;
      if (dist(c.x, c.y, x, y) < r) out.push(c);
    }
    return out;
  }

  /** combat power of the player force within r of a point */
  strengthNear(x: number, y: number, r: number): number {
    let s = 0;
    for (const c of this.contacts.values()) {
      if (c.conf < 0.35) continue;
      if (dist(c.x, c.y, x, y) > r) continue;
      s += powerOf(c.unit) * c.hpFrac * c.conf;
    }
    return s;
  }

  /** strongest cluster of contacts — a bombardment candidate */
  bestCluster(x: number, y: number, r: number): { x: number; y: number; count: number; conf: number } | null {
    let best: { x: number; y: number; count: number; conf: number } | null = null;
    for (const c of this.contacts.values()) {
      if (c.conf < 0.4) continue;
      if (dist(c.x, c.y, x, y) > r) continue;
      let count = 0;
      let w = 0;
      let sx = 0;
      let sy = 0;
      for (const o of this.contacts.values()) {
        if (o.conf < 0.4) continue;
        if (dist(o.x, o.y, c.x, c.y) < 130) {
          count++;
          sx += o.x;
          sy += o.y;
          w += o.conf;
        }
      }
      if (!best || count > best.count || (count === best.count && w > best.conf)) {
        best = { x: sx / count, y: sy / count, count, conf: w / count };
      }
    }
    return best && best.count >= 2 ? best : null;
  }

  /** where has the player massed armour? (for CAS + strike planning) */
  armoredMass(): { x: number; y: number; tanks: number } | null {
    const tanks = this.list(0.5).filter((c) => c.unit.def.kind === 'MBT' || c.unit.def.kind === 'IFV');
    let best: { x: number; y: number; tanks: number } | null = null;
    for (const c of tanks) {
      let n = 0;
      let sx = 0;
      let sy = 0;
      for (const o of tanks) {
        if (dist(o.x, o.y, c.x, c.y) < 260) {
          n++;
          sx += o.x;
          sy += o.y;
        }
      }
      if (!best || n > best.tanks) best = { x: sx / n, y: sy / n, tanks: n };
    }
    return best && best.tanks >= 3 ? best : null;
  }
}
