/**
 * Tiny synthesized sound effects via the Web Audio API — no audio files to load.
 * The AudioContext is created lazily and must be unlocked from a user gesture.
 */
type Sound =
  | 'hit'
  | 'guard'
  | 'duck'
  | 'punch'
  | 'corrected'
  | 'wrong'
  | 'miss'
  | 'prompt'
  | 'tick'
  | 'go'
  | 'combo'
  | 'end'
  | 'calibrated'
  | 'paused';

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean): void {
  muted = m;
}

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain = 0.18, endFreq?: number): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;

/** Filtered white-noise burst (whooshes, impacts). */
function noise(start: number, dur: number, filter: BiquadFilterType, f0: number, f1: number, gain = 0.2): void {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + start;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export function play(sound: Sound, combo = 0): void {
  if (muted || !ctx || ctx.state !== 'running') return;
  switch (sound) {
    case 'hit': {
      const lift = Math.min(combo, 10) * 40;
      tone(660 + lift, 0, 0.09, 'square', 0.08);
      tone(990 + lift, 0.06, 0.14, 'triangle', 0.14);
      break;
    }
    case 'guard': // shield: bright metallic ring
      tone(1320, 0, 0.18, 'square', 0.06);
      tone(1980, 0, 0.22, 'triangle', 0.1);
      noise(0, 0.12, 'highpass', 3000, 6000, 0.12);
      break;
    case 'duck': // laser passes overhead: descending whoosh
      noise(0, 0.32, 'bandpass', 2400, 300, 0.25);
      tone(900, 0, 0.28, 'sawtooth', 0.04, 220);
      break;
    case 'punch': // impact: low thump + crack
      tone(160, 0, 0.18, 'sine', 0.35, 45);
      noise(0, 0.16, 'lowpass', 4000, 400, 0.3);
      break;
    case 'corrected': // rising "fixed it" arpeggio
      tone(660, 0, 0.09, 'triangle', 0.12);
      tone(880, 0.08, 0.09, 'triangle', 0.12);
      tone(1320, 0.16, 0.22, 'triangle', 0.14);
      break;
    case 'paused':
      tone(440, 0, 0.12, 'sine', 0.08, 330);
      break;
    case 'combo':
      tone(880, 0, 0.08, 'triangle', 0.12);
      tone(1175, 0.07, 0.08, 'triangle', 0.12);
      tone(1568, 0.14, 0.16, 'triangle', 0.12);
      break;
    case 'wrong':
      tone(180, 0, 0.22, 'sawtooth', 0.12, 110);
      break;
    case 'miss':
      tone(300, 0, 0.18, 'triangle', 0.12, 160);
      break;
    case 'prompt':
      tone(420, 0, 0.1, 'sine', 0.1, 840);
      break;
    case 'tick':
      tone(520, 0, 0.07, 'sine', 0.12);
      break;
    case 'go':
      tone(784, 0, 0.12, 'square', 0.08);
      tone(1046, 0.1, 0.25, 'square', 0.08);
      break;
    case 'calibrated':
      tone(523, 0, 0.1, 'triangle', 0.12);
      tone(784, 0.09, 0.18, 'triangle', 0.12);
      break;
    case 'end':
      tone(784, 0, 0.14, 'triangle', 0.12);
      tone(659, 0.13, 0.14, 'triangle', 0.12);
      tone(523, 0.26, 0.3, 'triangle', 0.12);
      break;
  }
}
