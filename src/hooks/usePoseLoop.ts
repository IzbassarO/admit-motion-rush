import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useRef } from 'react';
import type { Landmark, PoseFrame } from '../motion/poseTypes';

export interface LoopTick {
  /** latest pose (null if nobody detected) */
  frame: PoseFrame | null;
  /** true when `frame` was computed from a new video frame on this tick */
  fresh: boolean;
  now: number;
  dt: number;
  fps: number;
}

const copy = (l: { x: number; y: number; z: number; visibility?: number }): Landmark => ({
  x: l.x,
  y: l.y,
  z: l.z,
  visibility: l.visibility ?? 0,
});

/**
 * Runs MediaPipe on every new video frame (requestAnimationFrame) and hands a
 * decoupled PoseFrame to `onTick`. MediaPipe's only job is producing landmarks.
 */
export function usePoseLoop(
  video: HTMLVideoElement | null,
  landmarker: PoseLandmarker | null,
  onTick: (t: LoopTick) => void,
  onError?: (e: unknown) => void,
): void {
  const tickRef = useRef(onTick);
  const errRef = useRef(onError);
  tickRef.current = onTick;
  errRef.current = onError;

  useEffect(() => {
    if (!video || !landmarker) return;
    let raf = 0;
    let lastVideoTime = -1;
    let lastTs = 0;
    let lastNow = performance.now();
    let frame: PoseFrame | null = null;
    let fps = 0;
    let failures = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(100, now - lastNow);
      lastNow = now;
      let fresh = false;
      if (video.readyState >= 2 && video.videoWidth > 0 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        // MediaPipe requires strictly increasing timestamps.
        const ts = Math.max(now, lastTs + 1);
        const frameDt = ts - lastTs;
        lastTs = ts;
        try {
          const res = landmarker.detectForVideo(video, ts);
          const image = res.landmarks[0];
          frame = image
            ? {
                image: image.map(copy),
                world: res.worldLandmarks[0]?.map(copy) ?? null,
                aspect: video.videoWidth / video.videoHeight,
                timestamp: ts,
              }
            : null;
          fresh = true;
          failures = 0;
          if (frameDt < 1000) fps = fps ? fps * 0.9 + (1000 / frameDt) * 0.1 : 1000 / frameDt;
        } catch (e) {
          if (++failures === 30) errRef.current?.(e);
        }
      }
      tickRef.current({ frame, fresh, now, dt, fps });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [video, landmarker]);
}
