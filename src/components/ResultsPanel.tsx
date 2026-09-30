import { useState } from 'react';
import { GESTURE_INFO } from '../game/gestures';
import { performanceTitle } from '../game/rank';
import { GESTURES } from '../motion/poseTypes';
import type { FinalResults } from './Arena';

interface Props {
  results: FinalResults;
  onPlayAgain: () => void;
  onRecalibrate: () => void;
  onHome: () => void;
}

export function ResultsPanel({ results: r, onPlayAgain, onRecalibrate, onHome }: Props) {
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const rank = performanceTitle(r);
  const stats = [
    { label: 'Accuracy', value: `${Math.round(r.accuracy * 100)}%` },
    { label: 'Correct / total', value: `${r.correct}/${r.attempts}` },
    { label: 'Avg reaction', value: r.avgReactionMs !== null ? `${(r.avgReactionMs / 1000).toFixed(2)}s` : '—' },
    { label: 'Best combo', value: `${r.bestCombo}` },
    { label: 'Corrections made', value: `${r.correctionsMade}`, accent: r.correctionsMade > 0 },
    { label: 'Personal best', value: r.personalBest.score.toLocaleString() },
  ];

  const share = async () => {
    const text = `I scored ${r.score.toLocaleString()} in MotionRush Arena — ${rank.title}, ${Math.round(
      r.accuracy * 100,
    )}% accuracy. Your body is the controller.`;
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'MotionRush Arena', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShareState('copied');
    } catch (e) {
      // user cancelled the share sheet → not an error worth showing
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setShareState('failed');
    }
  };

  return (
    <div className="results-backdrop">
      <section className="results" aria-labelledby="results-title">
        <p className={`rank rank-${rank.tier}`}>{rank.title}</p>
        <p className="panel-kicker">Final score</p>
        <h2 id="results-title" className="results-score">
          {r.score.toLocaleString()}
        </h2>
        {r.isNewBest && <p className="badge-best">New personal best</p>}

        <dl className="results-grid">
          {stats.map((s, i) => (
            <div key={s.label} className={s.accent ? 'accent' : ''} style={{ animationDelay: `${150 + i * 60}ms` }}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="results-mistake">
          <span className="hud-label">Most common form issue</span>
          {r.mostCommonMistake ? (
            <p>
              {r.mostCommonMistake.label}
              <small>
                {' '}
                · {r.mostCommonMistake.count} {r.mostCommonMistake.count === 1 ? 'round' : 'rounds'}
              </small>
            </p>
          ) : (
            <p className="clean">{r.attempts > 0 ? 'Clean form — no repeated issues detected.' : 'No moves attempted.'}</p>
          )}
        </div>

        <div className="results-gestures">
          {GESTURES.map((g) => {
            const pg = r.perGesture[g];
            const pct = pg.prompts ? pg.hits / pg.prompts : 0;
            return (
              <div key={g}>
                <span>{GESTURE_INFO[g].label}</span>
                <span className="bar">
                  <span style={{ width: `${pct * 100}%` }} />
                </span>
                <span className="mono">
                  {pg.hits}/{pg.prompts}
                </span>
              </div>
            );
          })}
        </div>

        <div className="panel-actions">
          <button className="btn btn-primary btn-xl" onClick={onPlayAgain} autoFocus>
            Play again
          </button>
          <button className="btn btn-ghost" onClick={share}>
            {shareState === 'copied' ? 'Copied ✓' : shareState === 'failed' ? 'Copy failed' : 'Share score'}
          </button>
        </div>
        <div className="results-links">
          <button className="link-btn" onClick={onRecalibrate}>
            Recalibrate
          </button>
          <button className="link-btn" onClick={onHome}>
            Home
          </button>
        </div>
      </section>
    </div>
  );
}
