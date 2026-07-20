// Procedural audio via Web Audio API — no asset files needed.
// Motor whine (pitch follows throttle), wind noise (follows speed), SFX.
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private motorOsc: OscillatorNode | null = null;
  private motorOsc2: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private windSrc: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  volume = 0.7;

  /** must be called from a user gesture (click/touch) — browser autoplay rules */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    // motor: two detuned saws through a lowpass
    this.motorGain = this.ctx.createGain();
    this.motorGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    this.motorGain.connect(lp);
    lp.connect(this.master);

    this.motorOsc = this.ctx.createOscillator();
    this.motorOsc.type = 'sawtooth';
    this.motorOsc.frequency.value = 90;
    this.motorOsc.connect(this.motorGain);
    this.motorOsc.start();

    this.motorOsc2 = this.ctx.createOscillator();
    this.motorOsc2.type = 'square';
    this.motorOsc2.frequency.value = 92;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.35;
    this.motorOsc2.connect(g2);
    g2.connect(this.motorGain);
    this.motorOsc2.start();

    // wind: looping noise buffer through bandpass
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.windSrc = this.ctx.createBufferSource();
    this.windSrc.buffer = buf;
    this.windSrc.loop = true;
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
    if (!this.ctx || !this.motorOsc || !this.motorGain) return;
    const t = this.ctx.currentTime;
    const target = flying ? 0.05 + throttle * 0.22 : 0;
    this.motorGain.gain.setTargetAtTime(target, t, 0.06);
    const f = 80 + throttle * 240;
    this.motorOsc.frequency.setTargetAtTime(f, t, 0.05);
    this.motorOsc2?.frequency.setTargetAtTime(f * 1.02 + 3, t, 0.05);

    if (this.windGain && this.windFilter) {
      const w = Math.min(1, speed / 45);
      this.windGain.gain.setTargetAtTime(flying ? w * w * 0.5 : 0, t, 0.15);
      this.windFilter.frequency.setTargetAtTime(400 + w * 1600, t, 0.15);
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
