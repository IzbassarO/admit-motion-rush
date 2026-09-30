import { GESTURE_INFO } from '../game/gestures';
import { comboMultiplier } from '../game/scoring';
import { GAME_DURATION_MS, type Prompt } from '../game/session';
import { GestureIcon } from './GestureIcon';

export interface HudState {
  score: number;
  combo: number;
  timeLeftMs: number;
  prompt: Prompt | null;
  promptHeld: boolean;
  trackingLost: boolean;
  /** last score gain, for the floating "+N" */
  gain: { id: number; value: number } | null;
}

/** Arena HUD: score (+combo) top-left, current threat top-centre, time top-right. */
export function GameHud({ hud }: { hud: HudState }) {
  const secs = Math.ceil(hud.timeLeftMs / 1000);
  const frac = hud.timeLeftMs / GAME_DURATION_MS;
  const r = 44;
  const c = 2 * Math.PI * r;
  const p = hud.prompt;
  return (
    <div className="hud-top">
      <div className="hud-left">
        <div className="hud-score">
          <span className="hud-label">Score</span>
          <span className="hud-value" key={hud.score}>
            {hud.score.toLocaleString()}
          </span>
          {hud.gain && (
            <span className="hud-gain" key={`gain-${hud.gain.id}`}>
              +{hud.gain.value}
            </span>
          )}
        </div>
        <div className={`hud-combo ${hud.combo >= 2 ? 'on' : ''}`}>
          <span className="hud-label">Combo</span>
          <span className="hud-combo-value" key={`combo-${hud.combo}`}>
            {hud.combo}
            <small>×{comboMultiplier(Math.max(1, hud.combo)).toFixed(1)}</small>
          </span>
        </div>
      </div>

      <div className="hud-center">
        {p ? (
          <div className={`prompt prompt-${p.gesture.toLowerCase()} ${hud.trackingLost ? 'frozen' : ''}`} key={`prompt-${p.id}`}>
            <span className="prompt-hazard">{GESTURE_INFO[p.gesture].hazard}</span>
            <div className="prompt-main">
              <GestureIcon gesture={p.gesture} className="prompt-icon" />
              <span className="prompt-word">{p.gesture}</span>
            </div>
            <span className="prompt-timer" style={{ animationDuration: `${p.windowMs}ms` }} />
            {hud.promptHeld && <span className="prompt-held">Release, then go again</span>}
          </div>
        ) : (
          <div className="prompt-idle">Get ready</div>
        )}
      </div>

      <div className={`hud-timer ${secs <= 10 ? 'low' : ''}`}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={r} className="ring-bg" />
          <circle cx="50" cy="50" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
        </svg>
        <span className="hud-timer-value">{secs}</span>
        <span className="hud-label hud-timer-label">Time</span>
      </div>
    </div>
  );
}
