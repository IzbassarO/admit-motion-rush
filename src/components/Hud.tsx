import { GESTURE_INFO } from '../game/gestures';
import type { CameraApi } from '../hooks/useCamera';
import type { LandmarkerApi } from '../hooks/usePoseLandmarker';
import type { FramingReport } from '../motion/calibration';
import type { GestureName } from '../motion/poseTypes';
import { GestureIcon } from './GestureIcon';

export const TUTORIAL_STEPS: GestureName[] = ['GUARD', 'DUCK', 'PUNCH'];

export function SetupPanel({
  camera,
  pose,
  videoPlaying,
  loopError,
  onExit,
}: {
  camera: CameraApi;
  pose: LandmarkerApi;
  videoPlaying: boolean;
  loopError: string | null;
  onExit: () => void;
}) {
  const cameraFailed = ['denied', 'notfound', 'busy', 'unsupported', 'error'].includes(camera.status);
  let title = 'Starting camera';
  let body: string | null = null;
  let action: { label: string; run: () => void } | null = null;

  if (loopError) {
    title = 'Tracking stopped';
    body = loopError;
    action = { label: 'Reload', run: () => window.location.reload() };
  } else if (cameraFailed) {
    title = camera.status === 'denied' ? 'Camera access needed' : 'Camera unavailable';
    body = camera.error;
    action = { label: 'Try again', run: () => void camera.start() };
  } else if (pose.status === 'error') {
    title = 'Could not start motion tracking';
    body = pose.error;
    action = { label: 'Try again', run: pose.retry };
  }

  const steps = [
    { label: 'Camera permission', done: camera.status === 'ready', active: camera.status === 'requesting' || camera.status === 'idle' },
    { label: 'Motion tracking (on-device)', done: pose.status === 'ready', active: pose.status === 'loading' },
    { label: 'Video stream', done: videoPlaying, active: camera.status === 'ready' && !videoPlaying },
  ];

  return (
    <div className="panel panel-center setup-panel" role="status">
      <h2>{title}</h2>
      {body ? (
        <p className="panel-error">{body}</p>
      ) : (
        <ul className="checklist">
          {steps.map((s) => (
            <li key={s.label} className={s.done ? 'done' : s.active ? 'active' : ''}>
              <span className="check" aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {camera.status === 'requesting' && !body && <p className="panel-sub">Allow camera access in the browser prompt.</p>}
      <div className="panel-actions">
        {action && (
          <button className="btn btn-primary" onClick={action.run}>
            {action.label}
          </button>
        )}
        <button className="btn btn-ghost" onClick={onExit}>
          Back
        </button>
      </div>
    </div>
  );
}

type RowState = 'ok' | 'warn' | 'bad' | 'wait';

export function CameraCheckPanel({
  report,
  canContinue,
  onContinue,
}: {
  report: FramingReport | null;
  canContinue: boolean;
  onContinue: () => void;
}) {
  const r = report;
  const rows: { label: string; value: string; state: RowState }[] = [
    { label: 'Camera', value: 'On', state: 'ok' },
    { label: 'Person', value: r?.person ? 'Detected' : 'Not yet', state: r?.person ? 'ok' : 'wait' },
    {
      label: 'Upper body',
      value: r?.upperBody ? 'In view' : 'Hips not visible',
      state: !r?.person ? 'wait' : r.upperBody ? 'ok' : 'bad',
    },
    {
      label: 'Distance',
      value: !r || r.distance === 'unknown' ? '—' : r.distance === 'ok' ? 'Good' : r.distance === 'too_close' ? 'Too close' : 'Too far',
      state: !r || r.distance === 'unknown' ? 'wait' : r.distance === 'ok' ? 'ok' : 'bad',
    },
    {
      label: 'Knees',
      value: r?.knees ? 'In view' : 'Recommended',
      state: !r?.person ? 'wait' : r.knees ? 'ok' : 'warn',
    },
    {
      label: 'Tracking',
      value: !r || r.confidence === 'none' ? '—' : r.confidence[0].toUpperCase() + r.confidence.slice(1),
      state: !r || r.confidence === 'none' ? 'wait' : r.confidence === 'good' ? 'ok' : r.confidence === 'fair' ? 'warn' : 'bad',
    },
  ];
  return (
    <div className="panel panel-side check-panel">
      <p className="panel-kicker">Step 1 · Camera check</p>
      <ul className="check-rows">
        {rows.map((row) => (
          <li key={row.label} className={`row-${row.state}`}>
            <span className="row-dot" aria-hidden="true" />
            <span className="row-label">{row.label}</span>
            <span className="row-value">{row.value}</span>
          </li>
        ))}
      </ul>
      <p className={`check-message ${r?.ready ? (r.knees ? 'ok' : 'warn') : 'bad'}`} aria-live="polite">
        {r?.message ?? 'Looking for you…'}
      </p>
      {canContinue && (
        <button className="btn btn-ghost btn-sm" onClick={onContinue}>
          Continue without knees
        </button>
      )}
    </div>
  );
}

export function CalibrationPanel({ progress, hint }: { progress: number; hint: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const holding = hint.startsWith('Hold');
  const count = Math.max(1, Math.ceil(3 * (1 - progress)));
  return (
    <div className="panel panel-side calib-panel">
      <p className="panel-kicker">Step 2 · Calibrating</p>
      <h2 className="calib-title">Stand naturally</h2>
      <div className={`calib-ring ${holding ? 'holding' : ''}`}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={r} className="ring-bg" />
          <circle cx="50" cy="50" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
        </svg>
        <span className="calib-count" key={holding ? count : 'wait'}>
          {holding ? count : '·'}
        </span>
      </div>
      <p className={`calib-hint ${holding ? 'ok' : 'warn'}`} aria-live="polite">
        {hint}
      </p>
    </div>
  );
}

export function TutorialPanel({ step, cleared, onSkip }: { step: number; cleared: boolean; onSkip: () => void }) {
  const g = TUTORIAL_STEPS[step];
  const info = GESTURE_INFO[g];
  return (
    <div className={`panel panel-side tutorial-panel ${cleared ? 'cleared' : ''}`}>
      <p className="panel-kicker">
        Step 3 · Quick training {step + 1}/{TUTORIAL_STEPS.length}
      </p>
      <div className="tutorial-move" key={g}>
        <GestureIcon gesture={g} className="tutorial-icon" />
        <div>
          <h2>{cleared ? `${g} ✓` : g}</h2>
          <p>{cleared ? 'Nice — recognised.' : info.tip}</p>
        </div>
      </div>
      <div className="dots">
        {TUTORIAL_STEPS.map((s, i) => (
          <span key={s} className={i < step || (i === step && cleared) ? 'done' : i === step ? 'current' : ''} />
        ))}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onSkip}>
        Skip training
      </button>
    </div>
  );
}

export function Countdown({ value }: { value: number }) {
  return (
    <div className="countdown" aria-live="assertive">
      <span key={value}>{value}</span>
      <p>Arena starts</p>
    </div>
  );
}

export function PausedPanel({ message }: { message: string }) {
  return (
    <div className="panel panel-center paused-panel" role="status">
      <p className="panel-kicker">Paused · clock stopped</p>
      <h2>{message.startsWith('Paused while') ? 'Welcome back' : 'Step back into frame'}</h2>
      <p className="panel-sub">{message}</p>
      <p className="panel-sub">The round resumes automatically — this does not count as a miss.</p>
    </div>
  );
}
