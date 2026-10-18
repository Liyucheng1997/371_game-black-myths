// 程序化音效：WebAudio 实时合成（风声、棍风、击打、金属、咆哮、钟鸣）+ Karplus-Strong 古筝拨弦配乐
export class Sound {
  constructor() { this.ctx = null; this.enabled = true; }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(comp);
    // 混响
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    // 噪声
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.ambience();
    this.music();
  }
  out(node, wet = 0.2) {
    node.connect(this.master);
    if (wet > 0) { const g = this.ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(this.verb); }
  }
  noise(dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    s.start(this.ctx.currentTime, Math.random() * 1.5);
    s.stop(this.ctx.currentTime + dur);
    return s;
  }
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  ambience() {
    const ctx = this.ctx, n = this.noise(1e6);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lg = ctx.createGain(); lg.gain.value = 250;
    lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    n.connect(f); f.connect(g); this.out(g, 0.1);
  }
  pluckBuf(freq) {
    this._pc = this._pc || new Map();
    if (this._pc.has(freq)) return this._pc.get(freq);
    const sr = this.ctx.sampleRate, len = Math.floor(sr * 3), N = Math.floor(sr / freq);
    const b = this.ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    for (let i = 0; i < N; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
    for (let i = N; i < len; i++) d[i] = 0.4985 * (d[i - N] + d[i - N - 1]) + (i < N * 2 ? 0 : 0);
    this._pc.set(freq, b);
    return b;
  }
  pluck(freq, t, vol = 0.12) {
    const s = this.ctx.createBufferSource(); s.buffer = this.pluckBuf(freq);
    const g = this.ctx.createGain(); g.gain.value = vol;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    s.connect(f); f.connect(g); this.out(g, 0.5);
    s.start(t);
  }
  music() {
    const scale = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0];
    const loop = () => {
      if (!this.enabled) return;
      const t0 = this.ctx.currentTime + 0.1;
      let t = t0;
      let idx = 2 + Math.floor(Math.random() * 4);
      const n = 4 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        idx = Math.max(0, Math.min(scale.length - 1, idx + Math.floor(Math.random() * 5) - 2));
        this.pluck(scale[idx], t, 0.07 + Math.random() * 0.05);
        if (Math.random() < 0.25) this.pluck(scale[idx] * 2, t + 0.04, 0.03);
        t += [0.25, 0.5, 0.5, 0.75, 1.0][Math.floor(Math.random() * 5)];
      }
      this.pluck(scale[0] / 2, t0, 0.09);
      setTimeout(loop, (t - t0 + 2 + Math.random() * 4) * 1000);
    };
    setTimeout(loop, 1500);
  }
  whoosh(k = 1, pitch = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, d = 0.28 / Math.sqrt(pitch);
    const n = this.noise(d + 0.05);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.8;
    f.frequency.setValueAtTime(300 * pitch, t);
    f.frequency.exponentialRampToValueAtTime(1600 * pitch, t + d * 0.45);
    f.frequency.exponentialRampToValueAtTime(400 * pitch, t + d);
    const g = ctx.createGain(); this.env(g, t, d * 0.4, 0.5 * k, d * 0.6);
    n.connect(f); f.connect(g); this.out(g, 0.15);
  }
  hit(k = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140 * (1.2 - k * 0.2), t); o.frequency.exponentialRampToValueAtTime(40, t + 0.22);
    const g = ctx.createGain(); this.env(g, t, 0.004, 0.9 * k, 0.25);
    o.connect(g); this.out(g, 0.2); o.start(t); o.stop(t + 0.35);
    const n = this.noise(0.12);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500;
    const g2 = ctx.createGain(); this.env(g2, t, 0.002, 0.6 * k, 0.09);
    n.connect(f); f.connect(g2); this.out(g2, 0.1);
  }
  clang(k = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [fr, a] of [[523, 0.3], [1307, 0.2], [2213, 0.14], [3351, 0.09], [4410, 0.05]]) {
      const o = ctx.createOscillator(); o.frequency.value = fr * (0.97 + Math.random() * 0.06);
      const g = ctx.createGain(); this.env(g, t, 0.002, a * k, 0.5 + Math.random() * 0.4);
      o.connect(g); this.out(g, 0.4); o.start(t); o.stop(t + 1.1);
    }
    this.hit(0.4 * k);
  }
  boom(k = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    const g = ctx.createGain(); this.env(g, t, 0.005, 1.2 * k, 0.8);
    o.connect(g); this.out(g, 0.5); o.start(t); o.stop(t + 1);
    const n = this.noise(1.2);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(150, t + 1.0);
    const g2 = ctx.createGain(); this.env(g2, t, 0.003, 0.8 * k, 1.0);
    n.connect(f); f.connect(g2); this.out(g2, 0.4);
  }
  step(k = 0.3) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noise(0.08);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = ctx.createGain(); this.env(g, t, 0.003, k * 0.5, 0.06);
    n.connect(f); f.connect(g); this.out(g, 0.05);
  }
  bell() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [fr, a, d] of [[392, 0.25, 2.5], [784, 0.18, 2], [1176, 0.1, 1.5], [1568, 0.08, 1.0], [2352, 0.05, 0.6]]) {
      const o = ctx.createOscillator(); o.frequency.value = fr;
      const g = ctx.createGain(); this.env(g, t, 0.003, a, d);
      o.connect(g); this.out(g, 0.8); o.start(t); o.stop(t + d + 0.2);
    }
  }
  charge(level) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 220 * Math.pow(1.335, level);
    const g = ctx.createGain(); this.env(g, t, 0.01, 0.18, 0.5);
    o.connect(g); this.out(g, 0.6); o.start(t); o.stop(t + 0.6);
  }
  roar() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(130, t + 0.4); o.frequency.exponentialRampToValueAtTime(60, t + 1.4);
    const n = this.noise(1.5);
    const mix = ctx.createGain(); mix.gain.value = 1;
    const ng = ctx.createGain(); ng.gain.value = 0.6;
    o.connect(mix); n.connect(ng); ng.connect(mix);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 520; f1.Q.value = 3;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1100; f2.Q.value = 4;
    const g = ctx.createGain(); this.env(g, t, 0.08, 0.9, 1.3);
    mix.connect(f1); mix.connect(f2); f1.connect(g); f2.connect(g);
    this.out(g, 0.6); o.start(t); o.stop(t + 1.6);
  }
  gulp() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 0.18;
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
      const g = ctx.createGain(); this.env(g, t, 0.01, 0.25, 0.1);
      o.connect(g); this.out(g, 0.1); o.start(t); o.stop(t + 0.2);
    }
  }
  shimmer() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(); o.frequency.value = 1200 + i * 330;
      const g = ctx.createGain(); this.env(g, t + i * 0.03, 0.01, 0.06, 0.6);
      o.connect(g); this.out(g, 0.9); o.start(t + i * 0.03); o.stop(t + 1);
    }
  }
}
