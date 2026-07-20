// Procedural audio via Web Audio API — no asset files needed.
// Modern quad sound: 4 slightly-detuned motors (saw base + harmonic
// whine), prop-wash noise, wind that rises with speed, and SFX.
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private motorOscs: OscillatorNode[] = [];
  private motorGains: GainNode[] = [];
  private whineOscs: OscillatorNode[] = [];
  private whineGain: GainNode | null = null;
  private washGain: GainNode | null = null;
  private windSrc: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  volume = 0.7;

  // per-motor detune so the four motors beat against each other like a real quad
  private detune = [1.0, 1.013, 0.988, 1.021];

  /** must be called from a user gesture (click/touch) — browser autoplay rules */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    // master → gentle compressor → speakers (keeps the mix from clipping)
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // motor body: 4 saws through a lowpass
    const motorLp = this.ctx.createBiquadFilter();
    motorLp.type = 'lowpass';
    motorLp.frequency.value = 1600;
    motorLp.Q.value = 0.7;
    motorLp.connect(this.master);

    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 110 * this.detune[i];
      const g = this.ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(motorLp);
      osc.start();
      this.motorOscs.push(osc);
      this.motorGains.push(g);
    }

    // high "whine" — the modern brushless/ESC tone
    this.whineGain = this.ctx.createGain();
    this.whineGain.gain.value = 0;
    const whineHp = this.ctx.createBiquadFilter();
    whineHp.type = 'highpass';
    whineHp.frequency.value = 900;
    this.whineGain.connect(whineHp);
    whineHp.connect(this.master);
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 800 * this.detune[i * 2];
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g);
      g.connect(this.whineGain);
      osc.start();
      this.whineOscs.push(osc);
    }

    // shared noise buffer for prop wash + wind
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // prop wash: broadband "chop" that grows with throttle
    const washSrc = this.ctx.createBufferSource();
    washSrc.buffer = buf;
    washSrc.loop = true;
    const washBp = this.ctx.createBiquadFilter();
    washBp.type = 'bandpass';
    washBp.frequency.value = 2400;
    washBp.Q.value = 0.5;
    this.washGain = this.ctx.createGain();
    this.washGain.gain.value = 0;
    washSrc.connect(washBp);
    washBp.connect(this.washGain);
    this.washGain.connect(this.master);
    washSrc.start();

    // wind: rises with airspeed
    this.windSrc = this.ctx.createBufferSource();
    this.windSrc.buffer = buf;
    this.windSrc.loop = true;
    this.windSrc.playbackRate.value = 0.7;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.windSrc.start();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** throttle 0..1, speed m/s */
  update(throttle: number, speed: number, flying: boolean): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const now = performance.now() * 0.001;

    // motor RPM curve: idle hum → aggressive climb pitch
    const base = 95 + Math.pow(throttle, 1.2) * 330;
    for (let i = 0; i < this.motorOscs.length; i++) {
      // slow independent wobble makes it feel mechanical, not synthetic
      const wobble = Math.sin(now * (1.7 + i * 0.9) + i * 2.1) * 3;
      this.motorOscs[i].frequency.setTargetAtTime(base * this.detune[i] + wobble, t, 0.05);
      this.motorGains[i].gain.setTargetAtTime(
        flying ? 0.028 + throttle * 0.062 : 0,
        t,
        0.07,
      );
    }

    // whine tracks a high harmonic of motor speed
    for (let i = 0; i < this.whineOscs.length; i++) {
      this.whineOscs[i].frequency.setTargetAtTime(base * 7.2 * this.detune[i * 2], t, 0.05);
    }
    this.whineGain?.gain.setTargetAtTime(
      flying ? Math.pow(throttle, 1.6) * 0.045 : 0,
      t,
      0.08,
    );

    // prop wash with throttle
    this.washGain?.gain.setTargetAtTime(flying ? 0.02 + throttle * 0.16 : 0, t, 0.1);

    // wind with airspeed
    if (this.windGain && this.windFilter) {
      const w = Math.min(1, speed / 45);
      this.windGain.gain.setTargetAtTime(flying ? w * w * 0.45 : 0, t, 0.15);
      this.windFilter.frequency.setTargetAtTime(400 + w * 1800, t, 0.15);
    }
  }

  crash(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start();
  }

  gate(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    for (const [freq, delay] of [
      [880, 0],
      [1320, 0.09],
    ] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(0.35, t + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.35);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + delay);
      osc.stop(t + delay + 0.4);
    }
  }

  finish(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = this.ctx!.createGain();
      const start = t + i * 0.12;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.3, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(g);
      g.connect(this.master!);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  }
}
