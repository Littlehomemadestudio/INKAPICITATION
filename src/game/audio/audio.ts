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

  // ── the dynamic score: drama through contrast ──
  music: MusicEngine | null = null;
  /** 0..1 — how close the listener stands to open water */
  oceanProximity = 0;
  private oceanGain: GainNode | null = null;

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

      this.music = new MusicEngine(this.ctx, this.master);
      this.startAmbience();
    } catch {
      this.ctx = null;
    }
  }

  /** how near the listener is to the sea — swells the ocean bed */
  setOceanProximity(p: number) {
    this.oceanProximity = p;
    if (this.oceanGain && this.ctx) {
      this.oceanGain.gain.setTargetAtTime(0.012 + p * 0.05, this.ctx.currentTime, 0.8);
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

  // ── one-shots ───────────────────────────────────────────

  /** naval gunfire — the heaviest voice on the sheet. Distance
   *  lowpasses the report: far guns are weather, near guns are
   *  violence. Calibre in mm. */
  navalGun(x: number, y: number, calibre: number) {
    if (!this.ctx) return;
    const key = calibre >= 200 ? 'ng-big' : calibre >= 100 ? 'ng-med' : 'ng-small';
    const gap = calibre >= 200 ? 0.5 : calibre >= 100 ? 0.24 : 0.12;
    if (!this.throttle(key, gap)) return;
    const maxDist = calibre >= 200 ? 6400 : 4200;
    const d = Math.hypot(x - this.listenerX, y - this.listenerY);
    const att = clamp(1 - d / maxDist, 0, 1) ** 1.25;
    if (att <= 0.01) return;
    const vol = (0.34 + calibre / 900) * att;
    if (this.active > 26 && vol < 0.12) return;
    if (!this.ctx || !this.master || !this.noiseBuf || !this.enabled) return;
    const g = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = this.panFor(x);
    g.connect(pan);
    pan.connect(this.master);
    this.active++;
    const t = this.ctx.currentTime;

    // the crack — band-limited noise, darker with distance
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.5 + Math.random() * 0.1;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const bright = clamp(1 - d / maxDist, 0, 1);
    const f0 = 420 + calibre * 1.2 + bright * 700;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(70, f0 * 0.1), t + 0.9 + calibre / 500);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8 + calibre / 400);
    src.connect(filter);
    filter.connect(g);
    src.start(t);
    src.stop(t + 0.9 + calibre / 350);
    src.onended = () => this.active--;

    // the thud you feel in the deck plates
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(38 + calibre / 12, t);
    sub.frequency.exponentialRampToValueAtTime(24, t + 0.7 + calibre / 600);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(vol * 0.9, t + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7 + calibre / 550);
    sub.connect(sg);
    sg.connect(g);
    sub.start(t);
    sub.stop(t + 0.8 + calibre / 500);
  }

  /** a shell finds the sea — the plunge, the white crash, the wash */
  bigSplash(x: number, y: number, calibre: number) {
    if (!this.ctx || !this.master || !this.noiseBuf || !this.enabled) return;
    if (!this.throttle('splash', 0.08)) return;
    const maxDist = 2600 + calibre * 2.5;
    const att = this.attenFor(x, y, maxDist);
    if (att <= 0.01) return;
    const vol = (0.3 + calibre / 700) * att;
    const g = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = this.panFor(x);
    g.connect(pan);
    pan.connect(this.master);
    this.active++;
    const t = this.ctx.currentTime;

    // the hollow plunge
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.9;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(240, t + 0.4);
    filter.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55 + calibre / 600);
    src.connect(filter);
    filter.connect(g);
    src.start(t);
    src.stop(t + 0.7 + calibre / 500);
    src.onended = () => this.active--;

    // the spray washing outward
    const wash = this.ctx.createBufferSource();
    wash.buffer = this.noiseBuf;
    wash.playbackRate.value = 1.6;
    const wf = this.ctx.createBiquadFilter();
    wf.type = 'highpass';
    wf.frequency.value = 900;
    const wg = this.ctx.createGain();
    wg.gain.setValueAtTime(0.0001, t + 0.06);
    wg.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.16);
    wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    wash.connect(wf);
    wf.connect(wg);
    wg.connect(pan);
    wash.start(t + 0.05);
    wash.stop(t + 1.0);

    // a deep one moves the whole bay
    if (calibre >= 150) {
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(44, t);
      sub.frequency.exponentialRampToValueAtTime(26, t + 0.6);
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(vol * 0.7, t + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      sub.connect(sg);
      sg.connect(g);
      sub.start(t);
      sub.stop(t + 0.7);
    }
  }

  /** a hull breaks and goes down — groaning steel, then the sea closes */
  shipBreaking(x: number, y: number, length: number) {
    if (!this.ctx || !this.master || !this.noiseBuf || !this.enabled) return;
    const big = length > 150;
    const dest = this.makeDest(x, y, big ? 5600 : 3600, big ? 0.9 : 0.7);
    if (!dest) return;
    this.active++;
    const t = this.ctx.currentTime;

    // the groan — tortured steel bending
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(big ? 42 : 70, t);
    osc.frequency.linearRampToValueAtTime(big ? 22 : 40, t + 2.4);
    const of = this.ctx.createBiquadFilter();
    of.type = 'lowpass';
    of.frequency.value = 180;
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(dest.vol * 0.5, t + 0.3);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    osc.connect(of);
    of.connect(og);
    og.connect(dest.node);
    osc.start(t);
    osc.stop(t + 2.7);

    // the rumble of a dying hull
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.4;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 130;
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(dest.vol * 0.8, t + 0.15);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    src.connect(filter);
    filter.connect(g2);
    g2.connect(dest.node);
    src.start(t);
    src.stop(t + 3.4);
    src.onended = () => this.active--;
  }

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

  // ── aircraft engine — a physical turbofan that passes by ──

  private engineNodes: Map<
    number,
    {
      noise: AudioBufferSourceNode;
      tone: OscillatorNode;
      gain: GainNode;
      pan: StereoPannerNode;
      lp: BiquadFilterNode;
      hp: BiquadFilterNode;
      vol: number;
      lastX: number;
      lastY: number;
      rate: number;
    }
  > = new Map();

  startEngine(id: number, x: number, y: number) {
    if (!this.ctx || !this.master || this.engineNodes.has(id)) return;
    const t = this.ctx.currentTime;

    // filtered noise = the core of a distant jet: wind, buzz, no melody
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    noise.loop = true;
    noise.playbackRate.value = 0.85;

    // a faint low rotor tone buried in the noise
    const tone = this.ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = 54;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    lp.Q.value = 0.5;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;

    const toneGain = this.ctx.createGain();
    toneGain.gain.value = 0.22;
    const gain = this.ctx.createGain();
    gain.gain.value = 0; // fades in — the aircraft is first heard far away
    const pan = this.ctx.createStereoPanner();

    noise.connect(hp);
    tone.connect(toneGain);
    toneGain.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    noise.start(t);
    tone.start(t);
    this.engineNodes.set(id, { noise, tone, gain, pan, lp, hp, vol: 0, lastX: x, lastY: y, rate: 1 });
  }

  updateEngine(id: number, x: number, y: number, active: boolean) {
    const n = this.engineNodes.get(id);
    if (!n || !this.ctx) return;
    const t = this.ctx.currentTime;

    // distance to the listener — with a little smoothing on position
    const dx = x - n.lastX;
    const dy = y - n.lastY;
    n.lastX = x;
    n.lastY = y;
    const d = Math.hypot(x - this.listenerX, y - this.listenerY);

    // loudness: quiet at the horizon, honest in close — never screaming
    const closeness = clamp(1 - d / 2600, 0, 1) ** 1.6;
    const targetVol = active ? closeness * 0.16 : 0;
    // slow envelope: a jet swells and fades, it does not flicker
    n.gain.gain.setTargetAtTime(targetVol, t, active ? 0.55 : 0.3);

    // closing speed along the listener axis → gentle doppler + brightness
    const toListenerX = this.listenerX - x;
    const toListenerY = this.listenerY - y;
    const tl = Math.hypot(toListenerX, toListenerY) || 1;
    const closing = (dx * toListenerX + dy * toListenerY) / tl; // m per update
    const approach = clamp(closing / 26, -1, 1);
    const rate = 1 + approach * 0.12;
    n.rate = n.rate * 0.9 + rate * 0.1;
    n.noise.playbackRate.setTargetAtTime(0.85 * n.rate, t, 0.4);
    n.tone.frequency.setTargetAtTime(54 * n.rate, t, 0.4);

    // nearer = brighter, but always band-limited — restraint is the rule
    n.lp.frequency.setTargetAtTime(200 + closeness * 620, t, 0.5);
    const panV = clamp((x - this.listenerX) / (this.viewSpan * 0.7), -1, 1) * 0.75;
    n.pan.pan.setTargetAtTime(panV, t, 0.35);
  }

  /** the fly-by swell as an aircraft crosses the camera — felt, not announced */
  jetPassby(x: number, y: number) {
    if (!this.ctx || !this.noiseBuf) return;
    if (!this.throttle('jetpass', 1.2)) return;
    const dest = this.makeDest(x, y, 2200, 0.2);
    if (!dest) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(160, t);
    filter.frequency.linearRampToValueAtTime(480, t + 0.9);
    filter.frequency.linearRampToValueAtTime(130, t + 2.2);
    filter.Q.value = 0.7;
    const g = dest.node;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(dest.vol, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    src.connect(filter);
    filter.connect(g);
    src.start(t);
    src.stop(t + 2.4);
  }

  stopEngine(id: number) {
    const n = this.engineNodes.get(id);
    if (!n) return;
    try {
      n.noise.stop();
      n.tone.stop();
    } catch {
      /* already stopped */
    }
    this.engineNodes.delete(id);
  }

  stopAllEngines() {
    for (const id of Array.from(this.engineNodes.keys())) this.stopEngine(id);
  }

  /** ship engine — the deep diesel heartbeat of a big hull */
  startShipEngine(id: number, x: number, y: number, length: number) {
    if (!this.ctx || !this.master || this.engineNodes.has(id) || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    noise.loop = true;
    noise.playbackRate.value = 0.35;
    const tone = this.ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = 22 + 26 / Math.max(1, length / 60); // big hull = slow thump
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 130;
    const toneGain = this.ctx.createGain();
    toneGain.gain.value = 0.5;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const pan = this.ctx.createStereoPanner();
    noise.connect(lp);
    tone.connect(toneGain);
    toneGain.connect(lp);
    lp.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    noise.start(t);
    tone.start(t);
    this.engineNodes.set(id, { noise, tone, gain, pan, lp, hp: lp, vol: 0, lastX: x, lastY: y, rate: 1 });
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

    // ── the ocean: a long slow swell that grows near the coast ──
    const oSrc = this.ctx.createBufferSource();
    oSrc.buffer = this.noiseBuf;
    oSrc.loop = true;
    oSrc.playbackRate.value = 0.5;
    const oFilter = this.ctx.createBiquadFilter();
    oFilter.type = 'lowpass';
    oFilter.frequency.value = 240;
    this.oceanGain = this.ctx.createGain();
    this.oceanGain.gain.value = 0.012;
    const swell = this.ctx.createOscillator();
    swell.frequency.value = 0.12; // ~8 s wave period
    const swellGain = this.ctx.createGain();
    swellGain.gain.value = 0.008;
    swell.connect(swellGain);
    swellGain.connect(this.oceanGain.gain);
    swell.start();
    oSrc.connect(oFilter);
    oFilter.connect(this.oceanGain);
    this.oceanGain.connect(this.master);
    oSrc.start();

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

// ─────────────────────────────────────────────────────────────
// PAPER STORM · the score
// Drama through contrast: a restrained low bed that breathes
// with the battle, swells when the fleet is found, and goes
// quiet when something enormous dies. Nothing plays loudly
// for long — silence is an instrument here.
// ─────────────────────────────────────────────────────────────

export class MusicEngine {
  private ctx: AudioContext;
  private out: GainNode;

  // beds
  private padGain: GainNode;
  private tenseGain: GainNode;
  private pulseGain: GainNode;
  private drumGain: GainNode;
  private pulseTimer = 0;
  private drumTimer = 0;
  private beat = 0;

  /** current target intensity 0..4 */
  intensity = 0;
  private display = 0;
  private duckUntil = 0;

  constructor(ctx: AudioContext, master: GainNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(master);

    // ── the pad: low detuned strings, minor, always breathing ──
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 260;
    padFilter.Q.value = 0.4;
    this.padGain.connect(padFilter);
    padFilter.connect(this.out);
    // A minor open fifth cluster: A2, E3, C4 — solemn, not sad
    for (const [freq, det] of [
      [110, -4],
      [110, 5],
      [164.8, 3],
      [261.6, -3],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      osc.connect(g);
      g.connect(this.padGain);
      osc.start();
    }
    // slow vibrato on the cluster — strings under a bow
    const vib = ctx.createOscillator();
    vib.frequency.value = 0.16;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 3;
    vib.connect(vibGain);
    vib.start();

    // ── the tension layer: a high held note that only the fight brings ──
    this.tenseGain = ctx.createGain();
    this.tenseGain.gain.value = 0;
    const tFilter = ctx.createBiquadFilter();
    tFilter.type = 'lowpass';
    tFilter.frequency.value = 1200;
    this.tenseGain.connect(tFilter);
    tFilter.connect(this.out);
    for (const [freq, det] of [
      [440, -5],
      [440, 6],
      [523.25, 2],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      osc.connect(g);
      g.connect(this.tenseGain);
      osc.start();
    }

    // ── pulse + drums are event-driven (no permanent nodes) ──
    this.pulseGain = ctx.createGain();
    this.pulseGain.gain.value = 1;
    this.pulseGain.connect(this.out);
    this.drumGain = ctx.createGain();
    this.drumGain.gain.value = 1;
    this.drumGain.connect(this.out);
  }

  /** the theatre's pulse — call every frame */
  update(dt: number) {
    // slew toward the target; a dip after a capital ship dies
    const target = this.ctx.currentTime < this.duckUntil ? 0 : this.intensity;
    this.display += (target - this.display) * Math.min(1, dt * 0.22);
    const i = this.display;
    const t = this.ctx.currentTime;

    this.padGain.gain.setTargetAtTime(i >= 0.8 ? 0.028 + i * 0.006 : 0, t, 1.6);
    this.tenseGain.gain.setTargetAtTime(i >= 2.2 ? 0.012 + (i - 2) * 0.008 : 0, t, 1.2);

    // the heartbeat pulse — comes with real engagements
    if (i >= 1.6) {
      this.pulseTimer -= dt;
      const period = i >= 3 ? 0.62 : 0.9;
      if (this.pulseTimer <= 0) {
        this.pulseTimer = period;
        this.thump(58 - (this.beat % 4) * 2, 0.16 + i * 0.014, 0.34);
        this.beat++;
      }
    }
    // timpani at full war
    if (i >= 3.1) {
      this.drumTimer -= dt;
      if (this.drumTimer <= 0) {
        this.drumTimer = 1.85;
        this.thump(46, 0.2, 0.6);
        if (this.beat % 4 === 0) this.thump(69, 0.12, 0.5);
      }
    }
  }

  /** set the theatre's target intensity 0..4 */
  setIntensity(v: number) {
    this.intensity = Math.max(0, Math.min(4, v));
  }

  /** event stingers — the score notices what matters */
  stinger(kind: 'contact' | 'capital' | 'capitalDown' | 'victory' | 'defeat') {
    const t = this.ctx.currentTime;
    switch (kind) {
      case 'contact': {
        // fleet sighted — a low brass warning
        this.swell(98, 0.22, 2.2, 0.9);
        this.swell(146.8, 0.12, 2.6, 1.4);
        this.intensity = Math.max(this.intensity, 2);
        break;
      }
      case 'capital': {
        // the BIG BOI arrives — the key change of the war
        this.swell(65.4, 0.3, 3.4, 0.8);
        this.swell(98, 0.2, 3.8, 1.6);
        this.swell(130.8, 0.12, 4.2, 2.2);
        this.thump(44, 0.3, 1.2);
        window.setTimeout(() => this.thump(44, 0.3, 1.2), 700);
        this.intensity = 4;
        break;
      }
      case 'capitalDown': {
        // she is gone — the score steps back and lets the sea speak
        this.swell(220, 0.16, 1.4, 0.3);
        this.swell(110, 0.2, 3.0, 1.1);
        this.thump(36, 0.34, 1.6);
        this.duckUntil = t + 9;
        this.intensity = 0.8;
        break;
      }
      case 'victory': {
        // A major — the resolution
        for (const [f, d, at] of [
          [220, 0.2, 0],
          [277.2, 0.14, 0.25],
          [329.6, 0.16, 0.5],
          [440, 0.12, 0.8],
        ] as const) {
          window.setTimeout(() => this.swell(f, d, 3.6, at), at * 1000);
        }
        this.intensity = 2.4;
        break;
      }
      case 'defeat': {
        this.swell(110, 0.22, 4.5, 0.2);
        this.swell(116.5, 0.16, 5.0, 2.4); // the semitone fall
        this.duckUntil = t + 12;
        this.intensity = 0;
        break;
      }
    }
  }

  /** a bowed swell — strings rising into the frame */
  private swell(freq: number, vol: number, dur: number, delay: number) {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = freq * 1.004;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, t);
    filter.frequency.linearRampToValueAtTime(700, t + dur * 0.55);
    filter.frequency.linearRampToValueAtTime(220, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(this.out);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + dur + 0.1);
    osc2.stop(t + dur + 0.1);
  }

  /** a felt drum hit */
  private thump(freq: number, vol: number, dur: number) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, freq * 0.5), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.drumGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
