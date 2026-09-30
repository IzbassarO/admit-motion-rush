/**
 * ?sim — keyboard-driven pose simulator for testing the full game flow without a
 * camera or a person in frame. It replaces only the *landmark source*: calibration,
 * detectors, error coach and game logic run exactly as they do with MediaPipe.
 *
 *   hold G = guard     T = guard, right hand low (partial)
 *   hold D = duck      H = half squat (partial)
 *   hold P = punch     B = punch with bent elbow (partial)
 *   hold N = nobody in frame
 */
import { makePose, SIM_POSES, type SimPoseName } from '../motion/simPoses';
import type { PoseSource } from '../hooks/usePoseLoop';

export const SIM_MODE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sim');

const KEYS: Record<string, SimPoseName | 'nobody'> = {
  g: 'guard',
  t: 'guardLeftOnly',
  d: 'duck',
  h: 'halfDuck',
  p: 'punch',
  b: 'bentPunch',
  n: 'nobody',
};

export function createSimSource(): PoseSource {
  let current: SimPoseName | 'nobody' = 'neutral';
  window.addEventListener('keydown', (e) => {
    const k = KEYS[e.key.toLowerCase()];
    if (k) current = k;
  });
  window.addEventListener('keyup', (e) => {
    if (KEYS[e.key.toLowerCase()] === current) current = 'neutral';
  });
  const jitter = () => (Math.random() - 0.5) * 0.002;
  return {
    detectForVideo: (video) => {
      if (current === 'nobody') return { landmarks: [], worldLandmarks: [] };
      const f = makePose(SIM_POSES[current], 0, video.videoWidth / video.videoHeight || undefined);
      return {
        landmarks: [f.image.map((l) => ({ ...l, x: l.x + jitter(), y: l.y + jitter() }))],
        worldLandmarks: [f.world ?? []],
      };
    },
  };
}

/** A synthetic "camera" (16:9, or 9:16 on portrait screens) so the normal video pipeline keeps running. */
export function createSimStream(): MediaStream {
  const c = document.createElement('canvas');
  const portrait = window.innerHeight > window.innerWidth;
  const W = portrait ? 720 : 1280;
  const H = portrait ? 1280 : 720;
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const draw = () => {
    const t = performance.now() / 1000;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0b1220');
    g.addColorStop(1, '#101a2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(92,200,255,0.08)';
    for (let x = (t * 20) % 64; x < W; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.save();
    ctx.scale(-1, 1); // the video element is mirrored; keep this text readable
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '600 20px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('SIMULATION · hold G / D / P (T, H, B = partial)', -24, H - 64);
    ctx.restore();
  };
  draw();
  setInterval(draw, 33);
  return c.captureStream(30);
}
