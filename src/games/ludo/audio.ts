// Procedural sound: no audio files. Everything is synthesised with WebAudio on user interaction.
export class Sound {
  public ctx: AudioContext | null = null;
  public master: GainNode | null = null;
  public muted = false;
  private noiseBuf: AudioBuffer | null = null;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    const n = Math.floor(this.ctx.sampleRate * 0.4);
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  private _tone(
    f: number,
    dur: number,
    {
      type = "square" as OscillatorType,
      gain = 0.2,
      slide = 0,
      delay = 0,
      attack = 0.004,
    } = {}
  ): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (slide) {
      o.frequency.exponentialRampToValueAtTime(
        Math.max(30, f + slide),
        t0 + dur
      );
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private _noise(
    dur: number,
    {
      gain = 0.2,
      freq = 1800,
      q = 1,
      delay = 0,
      type = "bandpass" as BiquadFilterType,
    } = {}
  ): void {
    const c = this.ctx;
    if (!c || !this.master || !this.noiseBuf) return;
    const t0 = c.currentTime + delay;
    const s = c.createBufferSource();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t0);
    s.stop(t0 + dur + 0.02);
  }

  play(name: string, o: { gain?: number; step?: number } = {}): void {
    if (!this.ctx || this.muted) return;
    const v = o.gain ?? 1;
    switch (name) {
      case "throw":
        this._noise(0.28, { gain: 0.22 * v, freq: 2600, q: 0.7 });
        for (let i = 0; i < 5; i++) {
          this._noise(0.04, {
            gain: 0.15 * v,
            freq: 1500 + Math.random() * 1800,
            q: 3,
            delay: i * 0.045,
          });
        }
        break;
      case "hit":
        this._noise(0.07, {
          gain: 0.3 * v,
          freq: 700 + Math.random() * 600,
          q: 2,
        });
        this._tone(160 + Math.random() * 40, 0.08, {
          type: "triangle",
          gain: 0.2 * v,
          slide: -60,
        });
        break;
      case "land":
        this._tone(110, 0.12, { type: "triangle", gain: 0.3 * v, slide: -40 });
        this._noise(0.05, { gain: 0.2 * v, freq: 500, q: 1 });
        break;
      case "tick":
        this._tone(900, 0.04, { gain: 0.08 * v });
        break;
      case "pick":
        this._tone(660, 0.06, { gain: 0.14 * v });
        this._tone(990, 0.08, { gain: 0.12 * v, delay: 0.06 });
        break;
      case "hop":
        this._tone(420 + (o.step || 0) * 28, 0.07, {
          type: "square",
          gain: 0.1 * v,
          slide: 120,
        });
        break;
      case "place":
        this._tone(200, 0.1, { type: "triangle", gain: 0.25 * v, slide: -80 });
        this._noise(0.04, { gain: 0.12 * v, freq: 900 });
        break;
      case "six":
        [523, 659, 784, 1046].forEach((f, i) =>
          this._tone(f, 0.12, { gain: 0.13 * v, delay: i * 0.07 })
        );
        break;
      case "capture":
        this._tone(300, 0.3, { type: "sawtooth", gain: 0.18 * v, slide: -240 });
        this._noise(0.2, { gain: 0.22 * v, freq: 400 });
        break;
      case "home":
        [523, 659, 784].forEach((f, i) =>
          this._tone(f, 0.16, { type: "triangle", gain: 0.2 * v, delay: i * 0.09 })
        );
        break;
      case "nomove":
        this._tone(200, 0.2, { type: "triangle", gain: 0.18 * v, slide: -60 });
        break;
      case "win":
        [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) =>
          this._tone(f, 0.2, { type: "square", gain: 0.12 * v, delay: i * 0.12 })
        );
        break;
      case "turn":
        this._tone(520, 0.05, { gain: 0.07 * v });
        break;
      default:
        break;
    }
  }
}
