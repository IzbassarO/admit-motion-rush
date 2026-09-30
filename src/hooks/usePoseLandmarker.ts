import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { useCallback, useEffect, useState } from 'react';
import { createSimSource, SIM_MODE } from '../sim/simulator';
import type { PoseSource } from './usePoseLoop';

// Version must match package.json; only used as a fallback if self-hosted files fail.
const MP_VERSION = '1.0.1';
const BASE = import.meta.env.BASE_URL;

const SOURCES = [
  { wasm: `${BASE}mediapipe/wasm`, model: `${BASE}models/pose_landmarker_lite.task` },
  {
    wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
    model:
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
];

async function create(): Promise<PoseLandmarker> {
  let lastError: unknown = null;
  for (const src of SOURCES) {
    let fileset;
    try {
      fileset = await FilesetResolver.forVisionTasks(src.wasm);
    } catch (e) {
      lastError = e;
      continue;
    }
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        return await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: src.model, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputSegmentationMasks: false,
        });
      } catch (e) {
        lastError = e;
        console.warn(`[MotionRush] PoseLandmarker init failed (${delegate}, ${src.wasm})`, e);
      }
    }
  }
  throw lastError ?? new Error('PoseLandmarker initialisation failed');
}

// Module-level singleton: survives React StrictMode double mounts and phase changes.
let pending: Promise<PoseSource> | null = null;

function load(): Promise<PoseSource> {
  if (SIM_MODE) return (pending ??= Promise.resolve(createSimSource()));
  if (!pending) {
    pending = create().catch((e) => {
      pending = null; // allow retry
      throw e;
    });
  }
  return pending;
}

export type LandmarkerStatus = 'loading' | 'ready' | 'error';

export interface LandmarkerApi {
  status: LandmarkerStatus;
  landmarker: PoseSource | null;
  error: string | null;
  retry: () => void;
}

export function usePoseLandmarker(): LandmarkerApi {
  const [landmarker, setLandmarker] = useState<PoseSource | null>(null);
  const [status, setStatus] = useState<LandmarkerStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    load().then(
      (lm) => {
        if (!alive) return;
        setLandmarker(lm);
        setStatus('ready');
      },
      (e: unknown) => {
        console.error('[MotionRush] pose model failed to load', e);
        if (!alive) return;
        setStatus('error');
        setError(
          'Motion tracking could not start. Check your internet connection and try again — ' +
            'MotionRush needs a recent Chrome, Edge, Safari or Firefox.',
        );
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { status, landmarker, error, retry };
}
