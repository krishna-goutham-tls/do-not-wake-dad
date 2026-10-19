// All sounds are synthesized with Web Audio, so the game ships no audio files.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let tvHum: AudioBufferSourceNode | null = null;

try {
  muted = localStorage.getItem('dwd-muted') === '1';
} catch {
  /* storage blocked */
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('dwd-muted', m ? '1' : '0');
  } catch {
    /* storage blocked */
  }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02);
}

// Browsers block audio until a user gesture, so the first tap calls this.
export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startTvHum();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function noise(t: number, dur: number, opts: { type?: BiquadFilterType; freq?: number; q?: number; gain?: number; attack?: number; freqEnd?: number }) {
  if (!ctx || !master || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.setValueAtTime(opts.freq ?? 1000, t);
  if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + dur);
  f.Q.value = opts.q ?? 1;
  const g = ctx.createGain();
  const peak = opts.gain ?? 0.3;
  const a = opts.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

function tone(t: number, dur: number, opts: { type?: OscillatorType; freq: number; freqEnd?: number; gain?: number; attack?: number; lowpass?: number; vibrato?: number }) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(opts.freq, t);
  if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + dur);
  if (opts.vibrato) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 7;
    lg.gain.value = opts.vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  const g = ctx.createGain();
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out: AudioNode = o.connect(g);
  if (opts.lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = opts.lowpass;
    out = g.connect(f);
  }
  out.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function now() {
  return ctx ? ctx.currentTime : 0;
}

function startTvHum() {
  if (!ctx || !master || !noiseBuf) return;
  tvHum = ctx.createBufferSource();
  tvHum.buffer = noiseBuf;
  tvHum.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 2400;
  f.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.value = 0.012;
  tvHum.connect(f).connect(g).connect(master);
  tvHum.start();
}

// One snore = a rough inhale, then a lip-flapping exhale.
export function snore(intensity = 1) {
  const t = now();
  const v = 0.7 + Math.random() * 0.5;
  noise(t, 1.1, { type: 'bandpass', freq: 380, q: 2, gain: 0.12 * intensity * v, attack: 0.8 });
  tone(t + 0.05, 1.05, { type: 'sawtooth', freq: 62 + Math.random() * 10, freqEnd: 75, gain: 0.22 * intensity * v, attack: 0.7, lowpass: 420, vibrato: 18 });
  noise(t + 1.25, 0.9, { type: 'lowpass', freq: 500, freqEnd: 200, gain: 0.08 * intensity * v, attack: 0.05 });
  tone(t + 1.25, 0.6, { type: 'triangle', freq: 95, freqEnd: 60, gain: 0.1 * intensity * v, lowpass: 300, vibrato: 30 });
}

export function snort() {
  const t = now();
  tone(t, 0.28, { type: 'sawtooth', freq: 140, freqEnd: 60, gain: 0.35, lowpass: 700, vibrato: 40 });
  noise(t, 0.25, { type: 'bandpass', freq: 600, q: 3, gain: 0.25 });
}

export function hmm() {
  const t = now();
  tone(t, 0.55, { type: 'triangle', freq: 150, freqEnd: 230, gain: 0.32, attack: 0.05, lowpass: 900, vibrato: 4 });
  tone(t, 0.55, { type: 'sine', freq: 300, freqEnd: 460, gain: 0.08, attack: 0.05 });
}

export function grumble() {
  const t = now();
  tone(t, 0.6, { type: 'triangle', freq: 150, freqEnd: 95, gain: 0.25, attack: 0.05, lowpass: 600, vibrato: 10 });
}

export function huh() {
  const t = now();
  tone(t, 0.35, { type: 'square', freq: 180, freqEnd: 320, gain: 0.25, lowpass: 1200 });
  tone(t, 0.35, { type: 'sine', freq: 360, freqEnd: 640, gain: 0.12 });
}

export function step(heavy = 1) {
  const t = now();
  noise(t, 0.05, { type: 'bandpass', freq: 900 + Math.random() * 500, q: 2, gain: 0.06 * heavy });
}

export function creak() {
  const t = now();
  tone(t, 0.5, { type: 'sawtooth', freq: 260, freqEnd: 140, gain: 0.18, attack: 0.04, lowpass: 900, vibrato: 25 });
  noise(t, 0.45, { type: 'bandpass', freq: 700, q: 8, gain: 0.12, attack: 0.04 });
}

export function crinkle(intensity = 1) {
  const t = now();
  const n = Math.round(4 + intensity * 5);
  for (let i = 0; i < n; i++) {
    noise(t + Math.random() * 0.45, 0.03 + Math.random() * 0.04, { type: 'highpass', freq: 2500 + Math.random() * 3000, gain: 0.12 * intensity });
  }
}

export function clank() {
  const t = now();
  tone(t, 0.6, { type: 'triangle', freq: 820, gain: 0.18 });
  tone(t, 0.5, { type: 'triangle', freq: 1340, gain: 0.1 });
  noise(t, 0.08, { type: 'highpass', freq: 3000, gain: 0.15 });
}

export function heartbeat() {
  const t = now();
  tone(t, 0.14, { type: 'sine', freq: 62, freqEnd: 45, gain: 0.55 });
  tone(t + 0.2, 0.16, { type: 'sine', freq: 58, freqEnd: 42, gain: 0.45 });
}

export function whoosh() {
  const t = now();
  noise(t, 0.7, { type: 'bandpass', freq: 300, freqEnd: 2200, q: 2, gain: 0.3, attack: 0.3 });
}

export function thwack() {
  const t = now();
  noise(t, 0.18, { type: 'lowpass', freq: 2500, gain: 0.8 });
  tone(t, 0.25, { type: 'sine', freq: 140, freqEnd: 50, gain: 0.8 });
  noise(t + 0.02, 0.1, { type: 'highpass', freq: 4000, gain: 0.3 });
}

export function caughtSting() {
  const t = now();
  [196, 233, 277].forEach((f, i) => {
    tone(t + i * 0.02, 0.9, { type: 'sawtooth', freq: f, freqEnd: f * 0.7, gain: 0.12, lowpass: 1400 });
  });
}

export function fridgeOpen() {
  const t = now();
  noise(t, 0.25, { type: 'bandpass', freq: 300, q: 1, gain: 0.2 });
  tone(t + 0.1, 1.4, { type: 'sine', freq: 120, gain: 0.05, attack: 0.3 });
}

export function win() {
  const t = now();
  [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, 0.35, { type: 'triangle', freq: f, gain: 0.22 }));
  tone(t + 0.44, 0.7, { type: 'triangle', freq: 1319, gain: 0.18 });
}

export function click() {
  const t = now();
  tone(t, 0.06, { type: 'square', freq: 660, gain: 0.08 });
}
