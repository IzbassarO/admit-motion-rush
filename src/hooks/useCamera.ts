import { useCallback, useEffect, useRef, useState } from 'react';
import { createSimStream, SIM_MODE } from '../sim/simulator';

export type CameraStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'notfound' | 'busy' | 'unsupported' | 'error';

export interface CameraApi {
  status: CameraStatus;
  error: string | null;
  stream: MediaStream | null;
  start: () => Promise<void>;
  stop: () => void;
}

function describe(err: unknown): { status: CameraStatus; message: string } {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return {
        status: 'denied',
        message:
          'Camera access is required to play MotionRush. Enable camera permission in your browser (the camera icon in the address bar) and try again.',
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return { status: 'notfound', message: 'No camera was found. Connect a webcam and try again.' };
    case 'NotReadableError':
    case 'TrackStartError':
      return { status: 'busy', message: 'The camera is in use by another app or tab. Close it and try again.' };
    default:
      console.error('[MotionRush] camera error', err);
      return { status: 'error', message: 'The camera could not be started. Close other apps using it and try again.' };
  }
}

export function useCamera(): CameraApi {
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    if (SIM_MODE) {
      const s = createSimStream();
      streamRef.current = s;
      setStream(s);
      setStatus('ready');
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      setError(
        window.isSecureContext
          ? 'This browser does not support camera access. Try a recent Chrome, Edge, Safari or Firefox.'
          : 'Camera access needs a secure page (https:// or localhost).',
      );
      return;
    }
    setStatus('requesting');
    setError(null);
    const portrait = window.innerHeight > window.innerWidth;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: portrait ? 720 : 1280 },
          height: { ideal: portrait ? 1280 : 720 },
          frameRate: { ideal: 30, max: 60 },
        },
      });
      streamRef.current = s;
      s.getVideoTracks()[0]?.addEventListener('ended', () => {
        streamRef.current = null;
        setStream(null);
        setStatus('error');
        setError('The camera was disconnected.');
      });
      setStream(s);
      setStatus('ready');
    } catch (err) {
      const d = describe(err);
      setStatus(d.status);
      setError(d.message);
    }
  }, []);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return { status, error, stream, start, stop };
}
