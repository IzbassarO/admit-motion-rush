import type { CoachMessage } from '../motion/errorCoach';

/**
 * The Error Coach, front and centre: WHAT is wrong, the MEASURED value vs TARGET
 * (only when the detector measured one) and WHAT TO DO.
 */
export function CoachPanel({ message }: { message: CoachMessage | null }) {
  if (!message) return <div className="coach-slot" aria-live="polite" />;
  const m = message;
  if (m.tone === 'good') {
    return (
      <div className="coach-slot" aria-live="polite">
        <div key={m.key} className="coach-card coach-good compact">
          <span className="coach-tag">✓</span>
          <strong className="coach-headline">{m.headline ?? m.text}</strong>
        </div>
      </div>
    );
  }
  const tag = m.tone === 'info' ? 'Tip' : m.issue ? 'Error coach' : 'Tracking';
  return (
    <div className="coach-slot" aria-live="polite">
      <div key={m.key} className={`coach-card coach-${m.tone}`} role="status">
        <div className="coach-top">
          <span className="coach-tag">{tag}</span>
          <strong className="coach-headline">{m.headline ?? m.text}</strong>
        </div>
        {m.measure && (
          <div className="coach-measure">
            <span className="coach-label">{m.measure.label}</span>
            <span className="coach-value">{m.measure.value}</span>
            <span className="coach-arrow">→</span>
            <span className="coach-label">Target</span>
            <span className="coach-target">{m.measure.target}</span>
            {m.progress !== undefined && (
              <span className="coach-meter">
                <span style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, m.progress))})` }} />
              </span>
            )}
          </div>
        )}
        {m.action && m.action !== m.headline && <p className="coach-action">{m.action}</p>}
      </div>
    </div>
  );
}
