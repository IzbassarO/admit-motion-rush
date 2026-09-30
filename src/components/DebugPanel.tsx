import type { PoseQuality } from '../motion/calibration';
import type { GestureEvaluation, GestureName } from '../motion/poseTypes';

export interface DebugData {
  quality: PoseQuality['status'];
  evaluations: Record<GestureName, GestureEvaluation> | null;
  calibrated: boolean;
}

const fmt = (k: string, v: number) =>
  k.toLowerCase().includes('angle') || k === 'elevation' ? `${Math.round(v)}°` : k === 'side' ? (v ? 'R' : 'L') : v.toFixed(2);

/** Live detector read-out, enabled with ?debug in the URL. Handy for tuning thresholds on site. */
export function DebugPanel({ data, fps }: { data: DebugData; fps: number }) {
  return (
    <div className="debug-panel" data-testid="debug">
      <div>
        quality <b data-testid="debug-quality">{data.quality}</b> · {fps} fps · {data.calibrated ? 'calibrated' : 'uncalibrated'}
      </div>
      {data.evaluations &&
        Object.values(data.evaluations).map((ev) => (
          <div key={ev.gesture} className={`debug-row debug-${ev.status}`}>
            <b data-testid={`debug-${ev.gesture}`}>
              {ev.gesture} {ev.status}
            </b>{' '}
            {Math.round(ev.progress * 100)}%{' '}
            {Object.entries(ev.metrics)
              .map(([k, v]) => `${k}=${fmt(k, v)}`)
              .join(' ')}
            {ev.issue && <div className="debug-issue">{ev.issue.message}</div>}
          </div>
        ))}
    </div>
  );
}
