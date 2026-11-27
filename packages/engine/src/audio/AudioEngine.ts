import type { VehicleKind } from '@game/shared';

/**
 * Procedural game audio with the Web Audio API — no sound files needed yet.
 * Engines are synthesised per vehicle type and follow speed/throttle/gears;
 * horns, skids, crashes, footsteps and a Dhaka street ambience are generated live.
 * Recorded samples can replace any of these later (same method names).
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private sfx: GainNode;
  private voice: GainNode;
  private ambience: GainNode;
  private noiseBuffer: AudioBuffer;
  /** Street reverb (shots and blasts echo between the buildings). */
  private reverbSend: GainNode;
  private engine: EngineVoice | null = null;
  private skid: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null =
    null;
  private hornVoice: { stop: () => void } | null = null;
  private ambienceTimer = 0;
  private volume = 0.8;
  private muted = false;

  constructor() {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfx = this.bus(0.9);
    this.voice = this.bus(1);
    this.ambience = this.bus(0.35);
    this.noiseBuffer = this.makeNoise();
    const verb = this.ctx.createConvolver();
    verb.buffer = this.makeImpulse(1.8);
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.5;
    this.reverbSend.connect(verb).connect(this.master);
    this.startAmbience();
  }

  private bus(gain: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(this.master);
    return g;
  }

  private makeNoise(): AudioBuffer {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brownish
      d[i] = white * 0.6 + last * 3;
    }
    return buf;
  }

  /**
   * Impulse response for a narrow Dhaka street: a couple of early slap-back echoes off the
   * facing buildings, then a decaying stereo tail.
   */
  private makeImpulse(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * 0.5;
      }
      for (const [at, g] of [
        [0.045 + ch * 0.012, 0.55],
        [0.11 + ch * 0.02, 0.35],
        [0.19 - ch * 0.015, 0.2],
      ] as const) {
        const i0 = Math.floor(at * rate);
        for (let k = 0; k < 220 && i0 + k < len; k++)
          d[i0 + k]! += (Math.random() * 2 - 1) * g * (1 - k / 220);
      }
    }
    return buf;
  }

  /** Browsers start audio suspended until a user gesture. */
  resume() {
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolume();
  }

  /** Quiet everything while paused. */
  setPaused(p: boolean) {
    this.master.gain.setTargetAtTime(p || this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  private applyVolume() {
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  // ---------------- Engines ----------------

  /** Start/switch the engine sound for the vehicle being driven (null = none). */
  setEngine(kind: VehicleKind | null) {
    if (this.engine?.kind === kind) return;
    this.engine?.stop();
    this.engine = kind ? new EngineVoice(this.ctx, this.sfx, kind) : null;
  }

  /** speed m/s (signed), throttle 0..1, maxSpeed m/s. */
  updateEngine(speed: number, throttle: number, maxSpeed: number, dead = false) {
    this.engine?.update(speed, throttle, maxSpeed, dead);
  }

  // ---------------- One-shots ----------------

  horn(kind: VehicleKind | 'foot', on: boolean) {
    if (!on) {
      this.hornVoice?.stop();
      this.hornVoice = null;
      return;
    }
    if (this.hornVoice) return;
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(kind === 'cng' ? 0.25 : 0.32, t, 0.01);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    const freqs =
      kind === 'car'
        ? [415, 495]
        : kind === 'bike'
          ? [620, 640]
          : kind === 'cng'
            ? [880, 1180]
            : [520, 0];
    filter.frequency.value = (freqs[0]! + (freqs[1] || freqs[0]!)) / 2;
    out.connect(this.sfx);
    filter.connect(out);
    const oscs = freqs
      .filter((f) => f > 0)
      .map((f) => {
        const o = this.ctx.createOscillator();
        o.type = kind === 'cng' ? 'triangle' : 'square';
        o.frequency.value = f;
        o.connect(filter);
        o.start();
        return o;
      });
    // CNG horn is a squeaky "pip-pip"
    let lfo: OscillatorNode | null = null;
    if (kind === 'cng') {
      lfo = this.ctx.createOscillator();
      lfo.frequency.value = 7;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.25;
      lfo.connect(lfoGain).connect(out.gain);
      lfo.start();
    }
    this.hornVoice = {
      stop: () => {
        const now = this.ctx.currentTime;
        out.gain.setTargetAtTime(0, now, 0.02);
        for (const o of oscs) o.stop(now + 0.15);
        lfo?.stop(now + 0.15);
      },
    };
  }

  // ---------------- Combat ----------------

  /** Noise burst through a filter with an exponential decay (shots, blasts, hits). */
  private burst(opts: {
    gain: number;
    decay: number;
    freq: number;
    type: BiquadFilterType;
    q?: number;
    thump?: number;
    thumpFreq?: number;
    pan?: number;
    /** Reverb send 0..1. */
    send?: number;
    /** Start this many seconds from now. */
    at?: number;
  }) {
    const t = this.ctx.currentTime + (opts.at ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = opts.type;
    f.frequency.value = opts.freq;
    f.Q.value = opts.q ?? 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + opts.decay);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0;
    src.connect(f).connect(g).connect(pan).connect(this.sfx);
    if (opts.send) {
      const sg = this.ctx.createGain();
      sg.gain.value = opts.send;
      pan.connect(sg).connect(this.reverbSend);
    }
    src.start(t, Math.random() * 1.5);
    src.stop(t + opts.decay + 0.05);
    if (opts.thump) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(opts.thumpFreq ?? 90, t);
      o.frequency.exponentialRampToValueAtTime(30, t + opts.decay * 0.8);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(opts.thump, t);
      og.gain.exponentialRampToValueAtTime(0.0008, t + opts.decay);
      o.connect(og).connect(pan);
      o.start(t);
      o.stop(t + opts.decay + 0.05);
    }
  }

  /** Pistol shot: sharp crack + chesty body + low thump, echoing down the street. */
  gunshot(distance = 0, pan = 0) {
    const d = Math.max(1, distance);
    const v = Math.min(1, 12 / (d + 8));
    const far = Math.min(1, d / 60);
    // Crack (the supersonic snap) fades first with distance
    this.burst({
      gain: 0.9 * v * (1 - far * 0.8),
      decay: 0.045,
      freq: 2600,
      type: 'highpass',
      pan,
      send: 0.3,
    });
    this.burst({
      gain: 0.85 * v,
      decay: 0.2 + d * 0.004,
      freq: Math.max(600, 2400 - d * 30),
      type: 'lowpass',
      thump: 0.75 * v,
      thumpFreq: 160,
      pan,
      send: 0.55 + far * 0.4,
    });
  }

  /** Blast: deep boom, roaring body, then crackling debris and a long street echo. */
  explosion(distance = 0, pan = 0) {
    const v = Math.min(1, 30 / (Math.max(1, distance) + 15));
    this.burst({ gain: 0.9 * v, decay: 0.08, freq: 1800, type: 'highpass', pan, send: 0.4 });
    this.burst({
      gain: 1.5 * v,
      decay: 1.9,
      freq: 700,
      type: 'lowpass',
      thump: 1.4 * v,
      thumpFreq: 62,
      pan,
      send: 0.7,
    });
    this.burst({
      gain: 0.45 * v,
      decay: 1.1,
      freq: 2200,
      type: 'bandpass',
      q: 0.4,
      pan,
      send: 0.5,
    });
    // Debris pattering down
    for (let i = 0; i < 9; i++) {
      this.burst({
        gain: (0.12 + Math.random() * 0.15) * v,
        decay: 0.05 + Math.random() * 0.06,
        freq: 1500 + Math.random() * 3000,
        type: 'bandpass',
        q: 1.5,
        pan: Math.max(-1, Math.min(1, pan + (Math.random() - 0.5) * 0.6)),
        at: 0.25 + Math.random() * 1.3,
        send: 0.3,
      });
    }
  }

  /** Fist: slap transient + body thud (a whoosh when it misses). */
  punch(hit = true) {
    if (!hit) {
      this.burst({ gain: 0.22, decay: 0.14, freq: 1400, type: 'bandpass', q: 0.6 });
      return;
    }
    this.burst({ gain: 0.55, decay: 0.03, freq: 2200, type: 'highpass', send: 0.15 });
    this.burst({
      gain: 0.75,
      decay: 0.13,
      freq: 420,
      type: 'lowpass',
      thump: 0.6,
      thumpFreq: 110,
      send: 0.15,
    });
  }

  /** Empty-chamber click. */
  click() {
    this.burst({ gain: 0.25, decay: 0.03, freq: 3500, type: 'highpass' });
  }

  private siren: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;

  /** Police siren wail; volume 0 stops it. */
  setSiren(volume: number) {
    if (volume <= 0.01) {
      if (this.siren) {
        const now = this.ctx.currentTime;
        this.siren.gain.gain.setTargetAtTime(0, now, 0.2);
        this.siren.osc.stop(now + 1);
        this.siren.lfo.stop(now + 1);
        this.siren = null;
      }
      return;
    }
    if (!this.siren) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 900;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.45; // slow wail
      const depth = this.ctx.createGain();
      depth.gain.value = 320;
      lfo.connect(depth).connect(osc.frequency);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2200;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(f).connect(gain).connect(this.sfx);
      osc.start();
      lfo.start();
      this.siren = { osc, lfo, gain };
    }
    this.siren.gain.gain.setTargetAtTime(Math.min(0.12, volume * 0.12), this.ctx.currentTime, 0.15);
  }

  /** Honk from a traffic vehicle at a distance (m) and stereo pan (-1..1). */
  honkAt(distance: number, pan: number) {
    if (distance > 120) return;
    this.distantHorn(Math.min(4, 40 / Math.max(distance, 8)), pan);
  }

  /** Short honk from a world NPC vehicle (ambience). */
  private distantHorn(gain = 1, panTo?: number) {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = panTo ?? Math.random() * 2 - 1;
    g.gain.setValueAtTime(0, t);
    const dur = 0.15 + Math.random() * 0.5;
    const repeats = Math.random() < 0.4 ? 2 : 1;
    const base = [380, 450, 520, 700, 900][Math.floor(Math.random() * 5)]!;
    for (let r = 0; r < repeats; r++) {
      const s = t + r * (dur + 0.12);
      g.gain.setTargetAtTime((0.05 + Math.random() * 0.05) * gain, s, 0.01);
      g.gain.setTargetAtTime(0, s + dur, 0.02);
    }
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = base;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    o.connect(f).connect(g).connect(pan).connect(this.ambience);
    o.start(t);
    o.stop(t + repeats * (dur + 0.12) + 0.2);
  }

  crash(strength: number) {
    const t = this.ctx.currentTime;
    const s = Math.min(1, strength);
    // Metal crunch (noise) + body thump
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900 + Math.random() * 600;
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9 * s, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + s * 0.4);
    src.connect(f).connect(g).connect(this.sfx);
    g.connect(this.reverbSend);
    src.start(t, Math.random());
    src.stop(t + 1);
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.8 * s, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(og).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.35);
    // Glass tinkle on big hits
    if (s > 0.6) {
      for (let i = 0; i < 5; i++) {
        const go = this.ctx.createOscillator();
        go.type = 'triangle';
        go.frequency.value = 2500 + Math.random() * 3000;
        const gg = this.ctx.createGain();
        const st = t + 0.05 + Math.random() * 0.3;
        gg.gain.setValueAtTime(0.06, st);
        gg.gain.exponentialRampToValueAtTime(0.001, st + 0.12);
        go.connect(gg).connect(this.sfx);
        go.start(st);
        go.stop(st + 0.15);
      }
    }
  }

  /** Power cut: a dying "thunk" + the city hum drops; restore: a rising buzz + generator. */
  powerCut(out: boolean) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(out ? 110 : 45, t);
    o.frequency.exponentialRampToValueAtTime(out ? 35 : 100, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.65);
    this.ambience.gain.setTargetAtTime(out ? 0.15 : 0.35, t, 0.3);
  }

  private rain: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  /** Rain hiss on the ambience bus; 0 stops it. */
  setRain(amount: number) {
    if (amount <= 0.02) {
      if (this.rain) {
        const now = this.ctx.currentTime;
        this.rain.gain.gain.setTargetAtTime(0, now, 0.4);
        this.rain.src.stop(now + 2);
        this.rain = null;
      }
      return;
    }
    if (!this.rain) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6500;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(hp).connect(lp).connect(gain).connect(this.ambience);
      src.start();
      this.rain = { src, gain };
    }
    this.rain.gain.gain.setTargetAtTime(Math.min(1.1, amount * 1.1), this.ctx.currentTime, 0.6);
  }

  /** Thunder: a crack then a long low rumble; `distance` 0 (overhead) … 1 (far). */
  thunder(distance: number) {
    const t = this.ctx.currentTime + distance * 1.5;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800 - distance * 1400, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 2.5);
    const g = this.ctx.createGain();
    const peak = 0.9 - distance * 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.05 + distance * 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + 3.6);
  }

  /** Continuous tyre squeal, 0 = silent. */
  setSkid(amount: number) {
    if (amount <= 0.02) {
      if (this.skid) {
        this.skid.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      }
      return;
    }
    if (!this.skid) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2200;
      filter.Q.value = 6;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfx);
      src.start();
      this.skid = { src, gain, filter };
    }
    this.skid.gain.gain.setTargetAtTime(Math.min(0.35, amount * 0.35), this.ctx.currentTime, 0.04);
    this.skid.filter.frequency.setTargetAtTime(1800 + amount * 900, this.ctx.currentTime, 0.05);
  }

  footstep(strength: number) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + Math.random() * 400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18 * Math.min(1.5, strength), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.12);
  }

  /** Cash register "cha-ching" for money. */
  coin() {
    const t = this.ctx.currentTime;
    [1320, 1760].forEach((fr, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = fr;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.15, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.25);
      o.connect(g).connect(this.sfx);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.3);
    });
  }

  /** Play a recorded voice line; resolves when done (or immediately on error). */
  async playVoice(url: string): Promise<void> {
    try {
      const res = await fetch(url);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.voice);
      src.start();
      await new Promise((r) => (src.onended = r));
    } catch {
      /* missing recording: subtitles still show */
    }
  }

  // ---------------- Ambience ----------------

  private startAmbience() {
    // City hum: low-passed brown noise
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = this.ctx.createGain();
    g.gain.value = 0.22;
    src.connect(f).connect(g).connect(this.ambience);
    src.start();
  }

  /** Call every frame; schedules distant horns etc. `night` 0..1 makes the city calmer. */
  update(dt: number, night: number) {
    this.ambienceTimer -= dt;
    if (this.ambienceTimer <= 0) {
      this.distantHorn();
      this.ambienceTimer = (0.8 + Math.random() * 3) * (1 + night * 2);
    }
  }

  dispose() {
    this.engine?.stop();
    this.hornVoice?.stop();
    try {
      this.skid?.src.stop();
    } catch {
      /* already stopped */
    }
    void this.ctx.close().catch(() => {});
  }
}

/** Synthesised engine: two detuned oscillators through a filter, AM for two-strokes. */
class EngineVoice {
  private oscA: OscillatorNode;
  private oscB: OscillatorNode;
  private filter: BiquadFilterNode;
  private gain: GainNode;
  private am: OscillatorNode;
  private amGain: GainNode;
  private rpm = 0.15;

  constructor(
    private ctx: AudioContext,
    out: AudioNode,
    readonly kind: VehicleKind,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 3;
    this.oscA = ctx.createOscillator();
    this.oscB = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB.type = kind === 'car' ? 'sawtooth' : 'square';
    this.oscB.detune.value = kind === 'car' ? -1200 : 7;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    this.oscA.connect(mix);
    this.oscB.connect(mix);
    // Amplitude modulation: "putt-putt" of a CNG / single-cylinder bike
    const amNode = ctx.createGain();
    amNode.gain.value = 1;
    this.am = ctx.createOscillator();
    this.am.type = 'square';
    this.amGain = ctx.createGain();
    this.amGain.gain.value = kind === 'car' ? 0.08 : kind === 'cng' ? 0.55 : 0.35;
    this.am.connect(this.amGain).connect(amNode.gain);
    mix.connect(amNode).connect(this.filter).connect(this.gain).connect(out);
    this.oscA.start();
    this.oscB.start();
    this.am.start();
    this.gain.gain.setTargetAtTime(0.18, ctx.currentTime, 0.2);
  }

  update(speed: number, throttle: number, maxSpeed: number, dead: boolean) {
    const t = this.ctx.currentTime;
    if (dead) {
      this.gain.gain.setTargetAtTime(0, t, 0.3);
      return;
    }
    // Simple gearbox: rpm climbs within each gear, drops on shift.
    const gears = this.kind === 'cng' ? 3 : this.kind === 'bike' ? 5 : 5;
    const frac = Math.min(1, Math.abs(speed) / maxSpeed);
    const gearPos = frac * gears;
    const inGear = gearPos - Math.floor(Math.min(gearPos, gears - 0.001));
    const target = Math.max(
      0.12,
      0.25 + inGear * 0.65 * (Math.abs(speed) > 0.5 ? 1 : 0) + throttle * 0.15,
    );
    this.rpm += (target - this.rpm) * 0.15;
    const base = this.kind === 'car' ? 55 : this.kind === 'cng' ? 38 : 70;
    const range = this.kind === 'car' ? 170 : this.kind === 'cng' ? 75 : 210;
    const f = base + this.rpm * range;
    this.oscA.frequency.setTargetAtTime(f, t, 0.03);
    this.oscB.frequency.setTargetAtTime(f * (this.kind === 'car' ? 2 : 1.01), t, 0.03);
    this.am.frequency.setTargetAtTime(this.kind === 'cng' ? 14 + this.rpm * 30 : f / 2, t, 0.03);
    this.filter.frequency.setTargetAtTime(400 + this.rpm * 1800 + throttle * 600, t, 0.05);
    this.gain.gain.setTargetAtTime(0.1 + throttle * 0.1 + this.rpm * 0.06, t, 0.08);
  }

  stop() {
    const t = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(0, t, 0.08);
    this.oscA.stop(t + 0.4);
    this.oscB.stop(t + 0.4);
    this.am.stop(t + 0.4);
  }
}
