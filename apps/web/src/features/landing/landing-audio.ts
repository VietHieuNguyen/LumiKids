import { ARCTIC_GLOBE, arcticShotAt } from "./arctic-path";
import type { FriendId } from "./valley-scene";

/**
 * Optional landing soundscape, synthesised with the Web Audio API. The valley has running water and birds;
 * the North Pole has wind, waves and gulls, muffled with bubbles once the camera dives. Each animal has a
 * short toy-like call. Nothing is downloaded and nothing plays until the visitor turns sound on (the context
 * is created from that click, as browsers require).
 */

export type Ambience = "valley" | "arctic";
/** The built-in calls: the valley animals' plus the North Pole's. */
export type VoiceId = FriendId | "seal" | "orca" | "walrus" | "puffin" | "fox";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth01 = (v: number) => v * v * (3 - 2 * v);

/**
 * How loud each North Pole layer is along the story (0..1), from where the camera is: wind high above the
 * globe, waves close to the ice, and "under" while the camera is below the surface (as the fog does).
 */
export function arcticSoundLevels(p: number): { wind: number; waves: number; under: number } {
  const shot = arcticShotAt(p);
  const r = Math.hypot(...shot.position);
  const above = r - ARCTIC_GLOBE.radius;
  const under = smooth01(clamp01(-above / 0.35));
  const wind = (1 - under) * clamp01(0.35 + (0.65 * above) / 12);
  const waves = clamp01((1 - under) * clamp01(1 - (above - 0.5) / 6) + 0.5 * under);
  return { wind, waves, under };
}

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

export class LandingAudio {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  /** Valley stream, or the North Pole waves. */
  private readonly water: GainNode;
  private readonly wind: GainNode | null = null;
  /** Everything passes through this low-pass; it closes when the camera is under water. */
  private readonly muffle: BiquadFilterNode;
  private readonly noise: AudioBuffer;
  private birdTimer = 0;
  private progress = 0;
  private level = -1;
  private disposed = false;

  constructor(private readonly ambience: Ambience = "valley") {
    const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Context) throw new Error("Web Audio is not available");
    this.ctx = new Context();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.muffle = this.ctx.createBiquadFilter();
    this.muffle.type = "lowpass";
    this.muffle.frequency.value = 18000;
    this.muffle.Q.value = 0.4;
    this.master.connect(this.muffle).connect(this.ctx.destination);

    // Three seconds of soft (low-passed) noise, shared by the water loop and the dog's bark.
    const length = Math.floor(this.ctx.sampleRate * 3);
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let smooth = 0;
    for (let i = 0; i < length; i += 1) {
      smooth += (Math.random() * 2 - 1 - smooth) * 0.35;
      data[i] = smooth;
    }

    if (ambience === "arctic") {
      // Waves: deep, slowly washing noise. Wind: a breathy band that drifts in pitch, with a faint whistle.
      this.water = this.ctx.createGain();
      this.water.gain.value = 0;
      this.loopNoise(1.0, this.filter("lowpass", 620, 0.5, this.water), 0.11, 0.07);
      this.water.connect(this.master);
      this.wind = this.ctx.createGain();
      this.wind.gain.value = 0;
      const gust = this.filter("bandpass", 520, 0.9, this.wind);
      const drift = this.ctx.createOscillator();
      drift.frequency.value = 0.07;
      const driftDepth = this.ctx.createGain();
      driftDepth.gain.value = 260;
      drift.connect(driftDepth).connect(gust.frequency);
      drift.start();
      this.loopNoise(0.6, gust, 0.05, 0.05);
      this.loopNoise(1.7, this.filter("bandpass", 1900, 9, this.wind), 0.09, 0.03);
      this.wind.connect(this.master);
      return;
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

  /** A looping noise source (offset into the shared buffer) into `into`, swelling slowly by `swellDepth`. */
  private loopNoise(offset: number, into: AudioNode, swellRate: number, swellDepth: number): void {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.85;
    const swell = this.ctx.createOscillator();
    swell.frequency.value = swellRate;
    const depth = this.ctx.createGain();
    depth.gain.value = swellDepth * 6;
    swell.connect(depth).connect(gain.gain);
    source.connect(gain).connect(into);
    source.start(0, offset);
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

  /** Follow the scroll story (0–1): water swells near the falls; at the North Pole, wind, waves and the dive. */
  setProgress(p: number): void {
    this.progress = p;
    if (this.ambience === "arctic") {
      const { wind, waves, under } = arcticSoundLevels(p);
      const key = wind * 7 + waves * 3 + under * 11;
      if (Math.abs(key - this.level) < 0.03) return;
      this.level = key;
      const t = this.ctx.currentTime;
      this.wind?.gain.setTargetAtTime(0.12 * wind, t, 0.6);
      this.water.gain.setTargetAtTime(0.15 * waves, t, 0.6);
      this.muffle.frequency.setTargetAtTime(18000 * Math.pow(420 / 18000, under), t, 0.35);
      return;
    }
    const level = waterLevel(p);
    if (Math.abs(level - this.level) < 0.02) return;
    this.level = level;
    this.water.gain.setTargetAtTime(0.16 * level, this.ctx.currentTime, 0.5);
  }

  private scheduleBird(): void {
    // Birds thin out as the evening comes.
    const evening = this.progress > 0.88;
    if (this.ambience === "arctic") {
      // Gulls now and then above the water; under it, little bursts of bubbles instead.
      const under = arcticSoundLevels(this.progress).under > 0.5;
      const wait = under ? 1400 + Math.random() * 2200 : 5000 + Math.random() * 7000;
      this.birdTimer = window.setTimeout(() => {
        if (this.disposed) return;
        if (arcticSoundLevels(this.progress).under > 0.5) this.bubbles();
        else this.gull(evening ? 0.6 : 1);
        this.scheduleBird();
      }, wait);
      return;
    }
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

  /** A gull far off: two or three falling "kyow" calls. */
  private gull(loudness: number): void {
    const out = this.panned(0.05 * loudness);
    const cry = this.filter("bandpass", 1500, 2.2, out);
    const calls = 2 + Math.floor(Math.random() * 2);
    const base = 1250 + Math.random() * 350;
    for (let i = 0; i < calls; i += 1) {
      const t = this.ctx.currentTime + 0.02 + i * 0.32;
      this.tone("sawtooth", [[t, base * 1.25], [t + 0.07, base * 1.35], [t + 0.26, base * 0.82]], [[t, 0], [t + 0.03, 0.8], [t + 0.2, 0.5], [t + 0.27, 0]], cry, { rate: 11, depth: 25 });
    }
  }

  /** A few bubbles rising: short sine blips gliding up. */
  private bubbles(): void {
    const out = this.panned(0.09);
    const count = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i += 1) {
      const t = this.ctx.currentTime + 0.02 + i * (0.05 + Math.random() * 0.09);
      const f = 320 + Math.random() * 380;
      this.tone("sine", [[t, f], [t + 0.07, f * 2.3]], [[t, 0], [t + 0.008, 0.9], [t + 0.075, 0]], out);
    }
  }

  /** A gain into the master, panned somewhere between left and right when the browser can. */
  private panned(gain: number): GainNode {
    const out = this.ctx.createGain();
    out.gain.value = gain;
    if (typeof this.ctx.createStereoPanner === "function") {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      out.connect(pan).connect(this.master);
    } else {
      out.connect(this.master);
    }
    return out;
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
  voice(id: VoiceId): void {
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
      case "frog": {
        // Two throaty croaks: a buzzy low tone through a hollow band-pass.
        const throat = this.filter("bandpass", 620, 2.4, out);
        for (const start of [t, t + 0.26]) {
          this.tone("square", [[start, 150], [start + 0.05, 205], [start + 0.16, 120]], [[start, 0], [start + 0.015, 0.75], [start + 0.17, 0]], throat, { rate: 38, depth: 22 });
        }
        break;
      }
      case "deer": {
        // A soft, high bleat that lifts then falls, with a little wobble.
        const nose = this.filter("bandpass", 1400, 1.6, out);
        const pitch = [[t, 760], [t + 0.12, 980], [t + 0.36, 690]] as const;
        this.tone("triangle", pitch, [[t, 0], [t + 0.03, 0.55], [t + 0.3, 0.35], [t + 0.4, 0]], nose, { rate: 9, depth: 30 });
        this.tone("sine", pitch.map(([time, f]) => [time, f * 2] as const), [[t, 0], [t + 0.03, 0.15], [t + 0.38, 0]], nose);
        break;
      }
      case "seal": {
        // Two honking barks, "ồ ồ".
        const snout = this.filter("bandpass", 820, 2.4, out);
        for (const start of [t, t + 0.27]) {
          this.tone("square", [[start, 310], [start + 0.05, 340], [start + 0.2, 215]], [[start, 0], [start + 0.02, 0.6], [start + 0.21, 0]], snout);
        }
        break;
      }
      case "orca": {
        // A bright whistle that rises and curls back, then a quick click train.
        const pitch = [[t, 1100], [t + 0.25, 2300], [t + 0.5, 1700], [t + 0.7, 2100]] as const;
        this.tone("sine", pitch, [[t, 0], [t + 0.05, 0.4], [t + 0.6, 0.3], [t + 0.75, 0]], out, { rate: 6, depth: 60 });
        for (let i = 0; i < 6; i += 1) {
          const c = t + 0.82 + i * 0.045;
          this.tone("square", [[c, 2600], [c + 0.01, 1900]], [[c, 0], [c + 0.002, 0.25], [c + 0.012, 0]], out);
        }
        break;
      }
      case "walrus": {
        // A long, deep, bubbly grunt.
        const chest = this.filter("lowpass", 420, 0.9, out);
        const pitch = [[t, 105], [t + 0.25, 128], [t + 0.7, 92]] as const;
        this.tone("sawtooth", pitch, [[t, 0], [t + 0.06, 0.8], [t + 0.55, 0.6], [t + 0.75, 0]], chest, { rate: 17, depth: 9 });
        break;
      }
      case "puffin": {
        // A soft, purring chuckle.
        const throat = this.filter("bandpass", 700, 1.8, out);
        for (const start of [t, t + 0.3]) {
          this.tone("triangle", [[start, 250], [start + 0.12, 300], [start + 0.24, 230]], [[start, 0], [start + 0.03, 0.55], [start + 0.25, 0]], throat, { rate: 32, depth: 40 });
        }
        break;
      }
      case "fox": {
        // Two quick, high yips.
        for (const start of [t, t + 0.18]) {
          this.tone("triangle", [[start, 880], [start + 0.05, 1450], [start + 0.12, 1100]], [[start, 0], [start + 0.01, 0.5], [start + 0.13, 0]], out);
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
