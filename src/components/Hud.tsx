import { GESTURE_INFO } from '../game/gestures';
import { comboMultiplier } from '../game/scoring';
import { GAME_DURATION_MS } from '../game/session';
import type { CameraApi } from '../hooks/useCamera';
import type { LandmarkerApi } from '../hooks/usePoseLandmarker';
import type { CoachMessage } from '../motion/errorCoach';
import type { Fx, HudState } from './Arena';
import { TUTORIAL_STEPS } from './Arena';
import { GestureIcon } from './GestureIcon';

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
  let title = 'Getting ready';
  let body: string | null = null;
  let action: { label: string; run: () => void } | null = null;

  if (loopError) {
    title = 'Tracking stopped';
    body = loopError;
    action = { label: 'Reload page', run: () => window.location.reload() };
  } else if (cameraFailed) {
    title = camera.status === 'denied' ? 'Camera blocked' : 'Camera unavailable';
    body = camera.error;
    action = { label: 'Try again', run: () => void camera.start() };
  } else if (pose.status === 'error') {
    title = 'Pose model failed';
    body = pose.error;
    action = { label: 'Retry', run: pose.retry };
  }

  const steps = [
    { label: 'Camera permission', done: camera.status === 'ready', active: camera.status === 'requesting' || camera.status === 'idle' },
    { label: 'Pose model (runs on-device)', done: pose.status === 'ready', active: pose.status === 'loading' },
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

export function CalibrationPanel({ progress, hint }: { progress: number; hint: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const holding = hint.startsWith('Hold');
  return (
    <div className="panel panel-side calib-panel">
      <p className="panel-kicker">Step 1 · Calibration</p>
      <div className="calib-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={r} className="ring-bg" />
          <circle
            cx="50"
            cy="50"
            r={r}
            className="ring-fg"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - progress)}
          />
        </svg>
        <span className="calib-pct">{Math.round(progress * 100)}%</span>
      </div>
      <p className={`calib-hint ${holding ? 'ok' : 'warn'}`} aria-live="polite">
        {hint}
      </p>
      <p className="panel-sub">
        Stand relaxed, facing the camera, with your hips (ideally knees too) in view. We measure your standing
        height so Duck works for your body.
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
        Step 2 · Practice {step + 1}/{TUTORIAL_STEPS.length}
      </p>
      <div className="tutorial-move" key={g}>
        <GestureIcon gesture={g} className="tutorial-icon" />
        <div>
          <h2>{cleared ? 'Nice!' : info.label}</h2>
          <p>{info.tip}</p>
          <p className="gesture-rule">{info.rule}</p>
        </div>
      </div>
      <div className="dots">
        {TUTORIAL_STEPS.map((s, i) => (
          <span key={s} className={i < step || (i === step && cleared) ? 'done' : i === step ? 'current' : ''} />
        ))}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onSkip}>
        Skip practice
      </button>
    </div>
  );
}

export function Countdown({ value }: { value: number }) {
  return (
    <div className="countdown" aria-live="assertive">
      <span key={value}>{value}</span>
      <p>Get ready</p>
    </div>
  );
}

export function PausedPanel({ message }: { message: string }) {
  return (
    <div className="panel panel-center paused-panel" role="status">
      <p className="panel-kicker">Paused</p>
      <h2>{message}</h2>
      <p className="panel-sub">The round resumes automatically once you are back in frame.</p>
    </div>
  );
}

export function CoachBar({ message }: { message: CoachMessage | null }) {
  return (
    <div className="coach-bar" aria-live="polite">
      {message && (
        <div key={message.key} className={`coach coach-${message.tone}`}>
          <span className="coach-tag">{message.tone === 'good' ? 'OK' : message.tone === 'info' ? 'TIP' : 'COACH'}</span>
          <span className="coach-text">{message.text}</span>
        </div>
      )}
    </div>
  );
}

export function GameHud({ hud, fx }: { hud: HudState; fx: Fx | null }) {
  const secs = Math.ceil(hud.timeLeftMs / 1000);
  const frac = hud.timeLeftMs / GAME_DURATION_MS;
  const r = 44;
  const c = 2 * Math.PI * r;
  const p = hud.prompt;
  return (
    <>
      <div className="hud-top">
        <div className="hud-score">
          <span className="hud-label">Score</span>
          <span className="hud-value" key={hud.score}>
            {hud.score.toLocaleString()}
          </span>
        </div>
        <div className={`hud-combo ${hud.combo >= 2 ? 'on' : ''}`}>
          <span className="hud-label">Combo</span>
          <span className="hud-value" key={hud.combo}>
            {hud.combo}
            <small>×{comboMultiplier(Math.max(1, hud.combo)).toFixed(1)}</small>
          </span>
        </div>
        <div className={`hud-timer ${secs <= 10 ? 'low' : ''}`}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r={r} className="ring-bg" />
            <circle cx="50" cy="50" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
          </svg>
          <span>{secs}</span>
        </div>
      </div>

      {p && (
        <div className={`prompt prompt-${p.gesture.toLowerCase()}`} key={p.id}>
          <span className="prompt-hazard">{GESTURE_INFO[p.gesture].hazard}</span>
          <div className="prompt-main">
            <GestureIcon gesture={p.gesture} className="prompt-icon" />
            <span className="prompt-word">{p.gesture}</span>
          </div>
          <span className="prompt-timer" style={{ animationDuration: `${p.windowMs}ms` }} />
          {hud.promptHeld && <span className="prompt-held">Release, then go again</span>}
        </div>
      )}

      {fx && (
        <div className={`fx fx-${fx.kind}`} key={fx.id}>
          <strong>{fx.title}</strong>
          {fx.detail && <span>{fx.detail}</span>}
        </div>
      )}
    </>
  );
}
