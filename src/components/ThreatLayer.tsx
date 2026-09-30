import type { CSSProperties } from 'react';
import type { GestureName } from '../motion/poseTypes';

export interface ThreatPrompt {
  id: number;
  gesture: GestureName;
  windowMs: number;
}

export interface Outcome {
  id: number;
  kind: 'hit' | 'miss' | 'wrong';
  gesture: GestureName;
  points: number;
  reactionMs: number;
  combo: number;
  corrected: boolean;
  coachBonus: number;
  got?: GestureName;
}

interface Props {
  prompt: ThreatPrompt | null;
  outcome: Outcome | null;
  /** normalized y (0..1) of the player's calibrated shoulder line — threats aim at the body */
  anchorY: number;
  /** freeze threat animations (tracking lost) */
  frozen: boolean;
}

const HIT_LABEL: Record<GestureName, string> = { GUARD: 'Blocked', DUCK: 'Dodged', PUNCH: 'Smashed' };

/** Punch targets alternate sides so the player doesn't always punch the same way. */
const droneSide = (id: number) => (id % 2 === 0 ? 'left' : 'right');

/**
 * Visual representation of the requested move. Pure DOM + CSS animations: the
 * threat "arrives" over the reaction window; the outcome plays a short effect.
 */
export function ThreatLayer({ prompt, outcome, anchorY, frozen }: Props) {
  const vars = {
    '--anchor-y': `${Math.round(anchorY * 1000) / 10}%`,
  } as CSSProperties;

  return (
    <div className={`threat-layer ${frozen ? 'frozen' : ''}`} style={vars} aria-hidden="true">
      {prompt && (
        <div
          key={`threat-${prompt.id}`}
          className={`threat threat-${prompt.gesture.toLowerCase()} side-${droneSide(prompt.id)}`}
          style={{ '--window': `${prompt.windowMs}ms` } as CSSProperties}
        >
          {prompt.gesture === 'GUARD' && (
            <>
              <span className="orb-target" />
              <span className="orb">
                <span className="orb-core" />
              </span>
            </>
          )}
          {prompt.gesture === 'DUCK' && (
            <>
              <span className="beam-warning" />
              <span className="beam" />
              <span className="beam-arrows">
                <i />
                <i />
                <i />
              </span>
            </>
          )}
          {prompt.gesture === 'PUNCH' && (
            <span className="drone">
              <span className="drone-ring r1" />
              <span className="drone-ring r2" />
              <span className="drone-core" />
              <svg className="drone-timer" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="46" />
              </svg>
            </span>
          )}
        </div>
      )}

      {outcome && (
        <div
          key={`outcome-${outcome.id}`}
          className={`outcome outcome-${outcome.kind} outcome-${outcome.gesture.toLowerCase()} side-${droneSide(outcome.id)}`}
        >
          {outcome.kind === 'hit' && outcome.gesture === 'GUARD' && <span className="fx-shield" />}
          {outcome.kind === 'hit' && outcome.gesture === 'DUCK' && <span className="fx-beam-pass" />}
          {outcome.kind === 'hit' && outcome.gesture === 'PUNCH' && (
            <span className="fx-explosion">
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} style={{ '--a': `${i * 36}deg` } as CSSProperties} />
              ))}
            </span>
          )}
          {outcome.kind !== 'hit' && <span className="fx-impact" />}

          <div className="outcome-label">
            {outcome.kind === 'hit' ? (
              <>
                <strong>{HIT_LABEL[outcome.gesture]}</strong>
                <span>
                  +{outcome.points} · {(outcome.reactionMs / 1000).toFixed(2)}s
                  {outcome.combo > 1 ? ` · combo ${outcome.combo}` : ''}
                </span>
                {outcome.corrected && (
                  <em className="corrected">
                    Corrected ✓ <b>+{outcome.coachBonus} coach bonus</b>
                  </em>
                )}
              </>
            ) : outcome.kind === 'miss' ? (
              <>
                <strong>Miss</strong>
                <span>Next one — stay ready</span>
              </>
            ) : (
              <>
                <strong>Wrong move</strong>
                <span>
                  {outcome.got} — needed {outcome.gesture}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
