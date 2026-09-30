import { GESTURE_INFO } from '../game/gestures';
import { GESTURES } from '../motion/poseTypes';
import type { FinalResults } from './Arena';

interface Props {
  results: FinalResults;
  onPlayAgain: () => void;
  onRecalibrate: () => void;
  onHome: () => void;
}

export function ResultsPanel({ results: r, onPlayAgain, onRecalibrate, onHome }: Props) {
  const stats = [
    { label: 'Accuracy', value: `${Math.round(r.accuracy * 100)}%` },
    { label: 'Correct moves', value: `${r.correct}` },
    { label: 'Total attempts', value: `${r.attempts}` },
    { label: 'Best combo', value: `${r.bestCombo}` },
    { label: 'Avg reaction', value: r.avgReactionMs !== null ? `${(r.avgReactionMs / 1000).toFixed(2)}s` : '—' },
    { label: 'Personal best', value: r.personalBest.score.toLocaleString() },
  ];
  return (
    <div className="results-backdrop">
      <section className="results" aria-labelledby="results-title">
        <p className="panel-kicker">Round complete</p>
        <h2 id="results-title" className="results-score">
          {r.score.toLocaleString()}
          <span>pts</span>
        </h2>
        {r.isNewBest && <p className="badge-best">New personal best</p>}

        <dl className="results-grid">
          {stats.map((s, i) => (
            <div key={s.label} style={{ animationDelay: `${150 + i * 60}ms` }}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="results-mistake">
          <span className="hud-label">Most common form mistake</span>
          {r.mostCommonMistake ? (
            <p>
              {r.mostCommonMistake.label}
              <small>
                {' '}
                · {r.mostCommonMistake.count} {r.mostCommonMistake.count === 1 ? 'time' : 'times'}
              </small>
            </p>
          ) : (
            <p className="clean">{r.attempts > 0 ? 'Clean form — no repeated mistakes detected.' : 'No moves attempted.'}</p>
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
          <button className="btn btn-ghost" onClick={onRecalibrate}>
            Recalibrate
          </button>
          <button className="btn btn-ghost" onClick={onHome}>
            Home
          </button>
        </div>
      </section>
    </div>
  );
}
