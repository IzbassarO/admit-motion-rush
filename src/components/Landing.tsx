import { GESTURE_INFO } from '../game/gestures';
import type { PersonalBest } from '../game/personalBest';
import type { LandmarkerStatus } from '../hooks/usePoseLandmarker';
import { GESTURES } from '../motion/poseTypes';
import { GestureIcon } from './GestureIcon';

interface Props {
  onStart: () => void;
  modelStatus: LandmarkerStatus;
  personalBest: PersonalBest | null;
}

export function Landing({ onStart, modelStatus, personalBest }: Props) {
  return (
    <main className="landing">
      <div className="landing-bg" aria-hidden="true" />
      <section className="hero">
        <p className="eyebrow">
          <span className="dot" /> Arena · 60 seconds
        </p>
        <h1 className="title">
          Motion<span>Rush</span>
        </h1>
        <p className="tagline">Your body is the controller</p>
        <p className="lede">Block. Duck. Punch. No keyboard required.</p>
        <div className="cta-row">
          <button className="btn btn-primary btn-xl btn-cta" onClick={onStart}>
            Start with camera
            <span className="btn-arrow" aria-hidden="true">
              →
            </span>
          </button>
          {personalBest && (
            <span className="pb-chip">
              Best <strong>{personalBest.score.toLocaleString()}</strong>
            </span>
          )}
        </div>
        <p className="privacy-note">
          <LockIcon /> Runs locally in your browser. Your video never leaves your device.
          {modelStatus === 'error' && <span className="model-warn"> · Motion tracking failed to preload — it will retry.</span>}
        </p>
      </section>

      <section className="action-list" aria-label="The three moves">
        {GESTURES.map((g, i) => {
          const info = GESTURE_INFO[g];
          return (
            <article key={g} className={`action-card action-${g.toLowerCase()}`} style={{ animationDelay: `${150 + i * 90}ms` }}>
              <GestureIcon gesture={g} className="action-icon" />
              <div>
                <h2>{g}</h2>
                <p>{info.action}</p>
              </div>
              <span className="action-threat">{info.hazard}</span>
            </article>
          );
        })}
      </section>
    </main>
  );
}

export function LockIcon() {
  return (
    <svg className="lock-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2M3.5 7h9v7h-9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
