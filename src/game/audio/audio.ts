// ─────────────────────────────────────────────────────────────
// PAPER STORM · procedural audio
// Restrained, positional battle soundscape via WebAudio:
// distant guns, cannon fire, layered explosions, SAM launches,
// incoming rounds, jet engine loops, quiet wind ambience.
// ─────────────────────────────────────────────────────────────

import { clamp } from '../core/math';

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  enabled = true;
  listenerX = 2048;
  listenerY = 1536;
  viewSpan = 2000;
  private active = 0;
  private lastByKind: Record<string, number> = {};
  private engineNodes: Map<number, { oscA: OscillatorNode; oscB: OscillatorNode; gain: GainNode; filter: BiquadFilterNode }> = new Map();

  ensureStarted() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 22;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.24;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      // shared noise buffer
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        brown = (brown + 0.02 * white) / 1.02;
        data[i] = white * 0.6 + brown * 3.2;
      }
      this.noiseBuf = buf;

      this.startAmbience();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.8 : 0;
  }

  updateListener(x: number, y: number, span: number) {
    this.listenerX = x;
    this.listenerY = y;
    this.viewSpan = span;
  }

  private panFor(x: number): number {
    return clamp((x - this.listenerX) / (this.viewSpan * 0.75), -1, 1) * 0.7;
  }

  private attenFor(x: number, y: number, maxDist: number): number {
    const d = Math.hypot(x - this.listenerX, y - this.listenerY);
    return clamp(1 - d / maxDist, 0, 1) ** 1.4;
  }

  private throttle(key: string, minGap: number): boolean {
    const now = this.ctx ? this.ctx.currentTime : 0;
    if ((this.lastByKind[key] ?? -99) + minGap > now) return false;
    this.lastByKind[key] = now;
    return true;
  }

  private makeDest(x: number, y: number, maxDist: number, baseVol: number): { node: GainNode; vol: number } | null {
    if (!this.ctx || !this.master || !this.enabled) return null;
    const att = this.attenFor(x, y, maxDist);
    if (att <= 0.01) return null;
    const vol = baseVol * att;
    if (this.active > 26 && vol < 0.12) return null;
    const gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = this.panFor(x);
    gain.connect(pan);
    pan.connect(this.master);
    return { node: gain, vol };
  }

  // ── one-shots ──────────────────────────────────────────────

  explosion(kind: 'shell' | 'arty' | 'missile' | 'kill' | 'small', x: number, y: number, scale: number) {
    if (!this.ctx) return;
    const cfg = {
      shell: { vol: 0.5, dur: 0.7, lp: 1600, maxDist: 2600, sub: 52 },
      arty: { vol: 0.75, dur: 1.7, lp: 900, maxDist: 4200, sub: 38 },
      missile: { vol: 0.6, dur: 1.0, lp: 1300, maxDist: 3200, sub: 46 },
      kill: { vol: 0.85, dur: 2.2, lp: 800, maxDist: 4600, sub: 34 },
      small: { vol: 0.18, dur: 0.22, lp: 2400, maxDist: 1300, sub: 90 },
    }[kind];
    if (!this.throttle(`exp-${kind}`, kind === 'small' ? 0.05 : 0.09)) return;
    const dest = this.makeDest(x, y, cfg.maxDist, cfg.vol);
    if (!dest || !this.ctx || !this.noiseBuf) return;
    this.active++;
    const t = this.ctx.currentTime;

    // layered noise burst with lowpass sweep
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.2;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cfg.lp * (1 + scale * 0.15), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(90, cfg.lp * 0.12), t + cfg.dur);
    const g = dest.node;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(dest.vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + cfg.dur);
    src.connect(filter);
    filter.connect(g);
    src.start(t);
    src.stop(t + cfg.dur + 0.05);
    src.onended = () => this.active--;

    // sub thump
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(cfg.sub, t);
    sub.frequency.exponentialRampToValueAtTime(Math.max(24, cfg.sub * 0.55), t + cfg.dur * 0.8);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(dest.vol * 0.85, t + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + cfg.dur * 0.85);
    sub.connect(sg);
    sg.connect(g);
    sub.start(t);
    sub.stop(t + cfg.dur);
  }

  cannon(x: number, y: number, size: number) {
    if (!this.ctx) return;
    if (!this.throttle('cannon', 0.07)) return;
    const dest = this.makeDest(x, y, 2800, 0.4 + size * 0.1);
    if (!dest || !this.noiseBuf) return;
    this.active++;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.4;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 700;
    filter.Q.value = 0.6;
    const g = dest.node;
    g.gain.setValueAtTime(dest.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    src.connect(filter);
    filter.connect(g);
    src.start(t);
    src.stop(t + 0.3);
    src.onended = () => this.active--;

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(64, t);
    sub.frequency.exponentialRampToValueAtTime(36, t + 0.22);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(dest.vol * 0.7, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    sub.connect(sg);
    sg.connect(g);
    sub.start(t);
    sub.stop(t + 0.26);
  }

  autocannon(x: number, y: number) {
    if (!this.ctx) return;
    if (!this.throttle('auto', 0.09)) return;
    const dest = this.makeDest(x, y, 1500, 0.14);
    if (!dest || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.9;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1900;
    filter.Q.value = 1.2;
    const g = dest.node;
    g.gain.setValueAtTime(dest.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(filter);
    filter.connect(g);
    src.start(t);
    src.stop(t + 0.08);
  }

  artilleryFire(x: number, y: number) {
    if (!this.ctx) return;
    if (!this.throttle('artyfire', 0.25)) return;
    const dest = this.makeDest(x, y, 4600, 0.5);
    if (!dest || !this.noiseBuf) return;
    this.active++;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 1.2);
    const g = dest.node;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(dest.vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    src.connect(filter);
    filter.connect(g);
    src.start(t);
    src.stop(t + 1.35);
    src.onended = () => this.active--;
  }

  missileLaunch(x: number, y: number) {
    if (!this.ctx) return;
    if (!this.throttle('sam', 0.2)) return;
    const dest = this.makeDest(x, y, 3000, 0.3);
    if (!dest || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.9;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(2600, t + 0.5);
    const g = dest.node;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(dest.vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(filter);
    filter.connect(g);
    src.start(t);
    src.stop(t + 0.65);
  }

  whistle(x: number, y: number) {
    if (!this.ctx) return;
    const dest = this.makeDest(x, y, 2200, 0.11);
    if (!dest) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 1.05);
    const g = dest.node;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(dest.vol, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 1.15);
  }

  uiTick() {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.045, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.035);
  }

  // ── aircraft engine loop ───────────────────────────────────

  startEngine(id: number, x: number, y: number) {
    if (!this.ctx || !this.master || this.engineNodes.has(id)) return;
    const t = this.ctx.currentTime;
    const oscA = this.ctx.createOscillator();
    const oscB = this.ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = 'sawtooth';
    oscA.frequency.value = 68;
    oscB.frequency.value = 68 * 1.007;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const pan = this.ctx.createStereoPanner();
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    oscA.start(t);
    oscB.start(t);
    this.engineNodes.set(id, { oscA, oscB, gain, filter });
    void x;
    void y;
  }

  updateEngine(id: number, x: number, y: number, active: boolean) {
    const n = this.engineNodes.get(id);
    if (!n || !this.ctx) return;
    const t = this.ctx.currentTime;
    const att = this.attenFor(x, y, 3600);
    const vol = active ? att * 0.24 : 0;
    n.gain.gain.setTargetAtTime(vol, t, 0.18);
    const pan = clamp((x - this.listenerX) / (this.viewSpan * 0.75), -1, 1) * 0.7;
    n.filter.frequency.setTargetAtTime(360 + att * 260, t, 0.2);
    void pan;
  }

  stopEngine(id: number) {
    const n = this.engineNodes.get(id);
    if (!n) return;
    try {
      n.oscA.stop();
      n.oscB.stop();
    } catch {
      /* already stopped */
    }
    this.engineNodes.delete(id);
  }

  stopAllEngines() {
    for (const id of Array.from(this.engineNodes.keys())) this.stopEngine(id);
  }

  // ── ambience ───────────────────────────────────────────────

  private startAmbience() {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.value = 0.028;
    // slow swell
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    lfo.start();
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();

    // occasional far-off thunder to keep the sheet alive
    const rumble = () => {
      if (!this.ctx || !this.enabled) {
        window.setTimeout(rumble, 60000);
        return;
      }
      const t = this.ctx.currentTime;
      const s2 = this.ctx.createBufferSource();
      s2.buffer = this.noiseBuf;
      s2.playbackRate.value = 0.4;
      const f2 = this.ctx.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.value = 140;
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.04, t + 0.4);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      s2.connect(f2);
      f2.connect(g2);
      g2.connect(this.master!);
      s2.start(t);
      s2.stop(t + 3.4);
      window.setTimeout(rumble, 24000 + Math.random() * 50000);
    };
    window.setTimeout(rumble, 30000);
  }
}
