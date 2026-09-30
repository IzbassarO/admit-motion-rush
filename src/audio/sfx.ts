/**
 * Tiny synthesized sound effects via the Web Audio API — no audio files to load.
 * The AudioContext is created lazily and must be unlocked from a user gesture.
 */
type Sound = 'hit' | 'wrong' | 'miss' | 'prompt' | 'tick' | 'go' | 'combo' | 'end' | 'calibrated';

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

export function play(sound: Sound, combo = 0): void {
  if (muted || !ctx || ctx.state !== 'running') return;
  switch (sound) {
    case 'hit': {
      const lift = Math.min(combo, 10) * 40;
      tone(660 + lift, 0, 0.09, 'square', 0.08);
      tone(990 + lift, 0.06, 0.14, 'triangle', 0.14);
      break;
    }
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
