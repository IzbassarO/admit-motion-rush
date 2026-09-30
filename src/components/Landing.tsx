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
          <span className="dot" /> 60-second reflex game
        </p>
        <h1 className="title">
          Motion<span>Rush</span>
        </h1>
        <p className="tagline">Your body is the controller.</p>
        <p className="lede">
          Guard, duck and punch on command using just your webcam. A live Error Coach reads your joints
          and tells you exactly what to fix.
        </p>
        <div className="cta-row">
          <button className="btn btn-primary btn-xl" onClick={onStart}>
            Start camera
            <span className="btn-arrow" aria-hidden="true">
              →
            </span>
          </button>
          <span className={`model-chip model-${modelStatus}`}>
            {modelStatus === 'ready' && 'Pose model ready'}
            {modelStatus === 'loading' && 'Loading pose model…'}
            {modelStatus === 'error' && 'Pose model failed to load'}
          </span>
        </div>
        {personalBest && (
          <p className="pb-line">
            Personal best <strong>{personalBest.score.toLocaleString()}</strong>
          </p>
        )}
        <p className="privacy-note">
          <LockIcon /> Camera frames are processed locally in your browser. No image or video is uploaded
          anywhere.
        </p>
      </section>

      <section className="gesture-grid" aria-label="The three moves">
        {GESTURES.map((g, i) => {
          const info = GESTURE_INFO[g];
          return (
            <article key={g} className="gesture-card" style={{ animationDelay: `${120 + i * 90}ms` }}>
              <GestureIcon gesture={g} className="gesture-card-icon" />
              <div>
                <h2>{info.label}</h2>
                <p className="gesture-action">{info.action}</p>
                <p className="gesture-rule">{info.rule}</p>
              </div>
            </article>
          );
        })}
      </section>

      <section className="how">
        <div>
          <h3>Setup</h3>
          <p>Stand 2–3 m from the camera so your hips (ideally knees) are visible. Good, even light helps.</p>
        </div>
        <div>
          <h3>Error Coach</h3>
          <p>
            Half-done moves are measured, not ignored: “Extend your right elbow more — 136°, target &gt;155°.”
          </p>
        </div>
        <div>
          <h3>Score</h3>
          <p>Points for the right move, a bonus for fast reactions, and a multiplier for combos.</p>
        </div>
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
