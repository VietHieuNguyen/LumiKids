import type { FriendId } from "./valley-scene";

/**
 * Optional valley soundscape, synthesised with the Web Audio API: running water, a few birds and a short
 * toy-like call for each animal. Nothing is downloaded and nothing plays until the visitor turns sound on
 * (the context is created from that click, as browsers require).
 */

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** How loud the water is along the story: loudest beside the falls and at the top spring. */
const WATER_LEVELS: readonly (readonly [number, number])[] = [
  [0, 0.35], [0.1, 0.6], [0.15, 1], [0.3, 1], [0.36, 0.35], [0.66, 0.3], [0.79, 0.65], [0.9, 0.3], [1, 0.2],
];

function waterLevel(p: number): number {
  for (let i = 1; i < WATER_LEVELS.length; i += 1) {
    const [p1, v1] = WATER_LEVELS[i];
    if (p <= p1) {
      const [p0, v0] = WATER_LEVELS[i - 1];
      return v0 + ((v1 - v0) * (p - p0)) / Math.max(1e-6, p1 - p0);
    }
  }
  return WATER_LEVELS[WATER_LEVELS.length - 1][1];
}

export function audioSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.AudioContext ?? (window as AudioWindow).webkitAudioContext);
}

export class ValleyAudio {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly water: GainNode;
  private readonly noise: AudioBuffer;
  private birdTimer = 0;
  private progress = 0;
  private level = -1;
  private disposed = false;

  constructor() {
    const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Context) throw new Error("Web Audio is not available");
    this.ctx = new Context();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // Three seconds of soft (low-passed) noise, shared by the water loop and the dog's bark.
    const length = Math.floor(this.ctx.sampleRate * 3);
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let smooth = 0;
    for (let i = 0; i < length; i += 1) {
      smooth += (Math.random() * 2 - 1 - smooth) * 0.35;
      data[i] = smooth;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1150;
    band.Q.value = 0.55;
    const high = this.ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 320;
    this.water = this.ctx.createGain();
    this.water.gain.value = 0;
    // A slow swell so the stream never sounds like a steady hiss.
    const swell = this.ctx.createOscillator();
    swell.frequency.value = 0.13;
    const swellDepth = this.ctx.createGain();
    swellDepth.gain.value = 0.05;
    swell.connect(swellDepth).connect(this.water.gain);
    source.connect(band).connect(high).connect(this.water).connect(this.master);
    source.start();
    swell.start();
  }

  /** Fade in and start the birds. Call from the click that turns sound on. */
  async start(): Promise<void> {
    if (this.disposed) return;
    await this.ctx.resume();
    this.master.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.4);
    this.level = -1;
    this.setProgress(this.progress);
    this.scheduleBird();
  }

  /** Fade out and pause (sound switched off, tab hidden, or the valley scrolled out of view). */
  stop(): void {
    if (this.disposed) return;
    window.clearTimeout(this.birdTimer);
    this.birdTimer = 0;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
    window.setTimeout(() => { if (!this.disposed && !this.birdTimer) void this.ctx.suspend(); }, 500);
  }

  /** Follow the scroll story (0–1): water swells near the falls. */
  setProgress(p: number): void {
    this.progress = p;
    const level = waterLevel(p);
    if (Math.abs(level - this.level) < 0.02) return;
    this.level = level;
    this.water.gain.setTargetAtTime(0.16 * level, this.ctx.currentTime, 0.5);
  }

  private scheduleBird(): void {
    // Birds thin out as the evening comes.
    const evening = this.progress > 0.88;
    const wait = (evening ? 6000 : 2400) + Math.random() * (evening ? 7000 : 4600);
    this.birdTimer = window.setTimeout(() => {
      if (this.disposed) return;
      this.chirp(evening ? 0.6 : 1);
      this.scheduleBird();
    }, wait);
  }

  private chirp(loudness: number): void {
    const t0 = this.ctx.currentTime + 0.02;
    const base = 2300 + Math.random() * 1900;
    const notes = 2 + Math.floor(Math.random() * 4);
    const out = this.ctx.createGain();
    out.gain.value = 0.07 * loudness;
    if (typeof this.ctx.createStereoPanner === "function") {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      out.connect(pan).connect(this.master);
    } else {
      out.connect(this.master);
    }
    for (let i = 0; i < notes; i += 1) {
      const t = t0 + i * (0.09 + Math.random() * 0.05);
      const f = base * (1 + (Math.random() - 0.5) * 0.18);
      this.tone("sine", [[t, f], [t + 0.035, f * 1.28], [t + 0.085, f * 0.94]], [[t, 0], [t + 0.012, 1], [t + 0.09, 0]], out);
    }
  }

  /** One oscillator with a pitch contour and a gain envelope (both as [time, value] points). */
  private tone(type: OscillatorType, pitch: readonly (readonly [number, number])[], envelope: readonly (readonly [number, number])[], destination: AudioNode, vibrato?: { rate: number; depth: number }): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(pitch[0][1], pitch[0][0]);
    for (const [t, f] of pitch.slice(1)) osc.frequency.exponentialRampToValueAtTime(f, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, envelope[0][0]);
    for (const [t, v] of envelope.slice(1)) gain.gain.linearRampToValueAtTime(Math.max(0.0001, v), t);
    osc.connect(gain).connect(destination);
    const end = envelope[envelope.length - 1][0] + 0.03;
    if (vibrato) {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = vibrato.rate;
      const depth = this.ctx.createGain();
      depth.gain.value = vibrato.depth;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(envelope[0][0]);
      lfo.stop(end);
    }
    osc.start(envelope[0][0]);
    osc.stop(end);
  }

  private filter(type: BiquadFilterType, frequency: number, q: number, destination: AudioNode): BiquadFilterNode {
    const node = this.ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    node.connect(destination);
    return node;
  }

  /** A short, friendly call when an animal is tapped. */
  voice(id: FriendId): void {
    if (this.disposed || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime + 0.02;
    const out = this.ctx.createGain();
    out.gain.value = 0.5;
    out.connect(this.master);
    switch (id) {
      case "duck": {
        const nasal = this.filter("bandpass", 1150, 3.2, out);
        for (const start of [t, t + 0.19]) {
          this.tone("sawtooth", [[start, 430], [start + 0.13, 290]], [[start, 0], [start + 0.012, 0.7], [start + 0.14, 0]], nasal);
        }
        break;
      }
      case "elephant": {
        const horn = this.filter("bandpass", 880, 1.1, out);
        const pitch = [[t, 270], [t + 0.22, 520], [t + 0.5, 470], [t + 0.72, 380]] as const;
        const envelope = [[t, 0], [t + 0.05, 0.5], [t + 0.5, 0.42], [t + 0.74, 0]] as const;
        this.tone("sawtooth", pitch, envelope, horn, { rate: 7, depth: 14 });
        this.tone("square", pitch.map(([time, f]) => [time, f * 0.5] as const), envelope.map(([time, v]) => [time, v * 0.35] as const), horn);
        break;
      }
      case "dog": {
        const body = this.filter("lowpass", 950, 0.8, out);
        for (const start of [t, t + 0.23]) {
          this.tone("triangle", [[start, 330], [start + 0.1, 165]], [[start, 0], [start + 0.01, 0.9], [start + 0.12, 0]], body);
          const breath = this.ctx.createBufferSource();
          breath.buffer = this.noise;
          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.linearRampToValueAtTime(0.6, start + 0.01);
          gain.gain.linearRampToValueAtTime(0.0001, start + 0.09);
          breath.connect(gain).connect(body);
          breath.start(start, Math.random() * 2, 0.12);
        }
        break;
      }
      case "rabbit": {
        for (let i = 0; i < 3; i += 1) {
          const start = t + i * 0.1;
          this.tone("sine", [[start, 1450 + i * 180], [start + 0.06, 2050 + i * 180]], [[start, 0], [start + 0.012, 0.32], [start + 0.075, 0]], out);
        }
        break;
      }
      case "bear": {
        const chest = this.filter("lowpass", 520, 0.7, out);
        const pitch = [[t, 150], [t + 0.16, 192], [t + 0.3, 158], [t + 0.42, 186], [t + 0.56, 138]] as const;
        const envelope = [[t, 0], [t + 0.04, 0.8], [t + 0.24, 0.5], [t + 0.34, 0.8], [t + 0.58, 0]] as const;
        this.tone("triangle", pitch, envelope, chest);
        this.tone("sine", pitch.map(([time, f]) => [time, f * 2] as const), envelope.map(([time, v]) => [time, v * 0.25] as const), chest);
        break;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.birdTimer);
    void this.ctx.close();
  }
}
