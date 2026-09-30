import type { PoseQuality } from './calibration';
import type { FormIssue, GestureEvaluation, GestureName, IssueCode } from './poseTypes';

export type CoachTone = 'good' | 'warn' | 'error' | 'info';

export interface CoachMessage {
  /** stable key used for de-duplication / animation */
  key: string;
  text: string;
  tone: CoachTone;
  issue: FormIssue | null;
}

export const ISSUE_LABELS: Record<IssueCode, string> = {
  GUARD_LEFT_LOW: 'Left hand below the shoulder in Guard',
  GUARD_RIGHT_LOW: 'Right hand below the shoulder in Guard',
  GUARD_BOTH_LOW: 'Hands not high enough in Guard',
  GUARD_HANDS_HIDDEN: 'Hands out of view during Guard',
  DUCK_NOT_LOW: 'Not ducking low enough',
  DUCK_KNEES: 'Knees not bent enough in Duck',
  DUCK_BODY_HIDDEN: 'Body out of view during Duck',
  PUNCH_ELBOW: 'Elbow not fully extended in Punch',
  PUNCH_REACH: 'Punch not reaching far enough',
  PUNCH_TOO_HIGH: 'Punching upward instead of forward',
  PUNCH_TOO_LOW: 'Punch below shoulder height',
  PUNCH_ARM_HIDDEN: 'Arms out of view during Punch',
};

/**
 * Decide the single most useful message for the player right now.
 * Priority: tracking/framing problems > form issues on the requested gesture.
 * Messages come straight from the detectors' geometric measurements.
 */
export function coachMessage(
  target: GestureName | null,
  evaluation: GestureEvaluation | null,
  quality: PoseQuality,
): CoachMessage | null {
  if (quality.status !== 'ok') {
    return { key: `q:${quality.status}`, text: quality.message, tone: 'error', issue: null };
  }
  if (!target || !evaluation) return null;
  if (evaluation.status === 'valid') return { key: `ok:${target}`, text: 'Locked in!', tone: 'good', issue: null };
  if (evaluation.issue && (evaluation.status === 'partial' || evaluation.status === 'unknown')) {
    const i = evaluation.issue;
    return { key: `i:${i.code}`, text: i.message, tone: i.severity === 'major' ? 'error' : 'warn', issue: i };
  }
  return null;
}

/**
 * Avoids flicker: a new issue must persist `showAfterMs` before it is displayed and a
 * displayed message stays at least `minVisibleMs`. The *text* of the displayed message
 * keeps updating while its issue code stays the same (e.g. the live knee angle).
 */
export class CoachSmoother {
  private shown: CoachMessage | null = null;
  private shownAt = 0;
  private candidateKey: string | null = null;
  private candidateSince = 0;

  constructor(
    private readonly showAfterMs = 220,
    private readonly minVisibleMs = 900,
  ) {}

  reset(): void {
    this.shown = null;
    this.candidateKey = null;
  }

  update(next: CoachMessage | null, now: number): CoachMessage | null {
    const nextKey = next?.key ?? null;
    if (this.shown && nextKey === this.shown.key) {
      this.shown = next;
      this.candidateKey = null;
      return this.shown;
    }
    if (nextKey !== this.candidateKey) {
      this.candidateKey = nextKey;
      this.candidateSince = now;
    }
    const immediate = next?.tone === 'good';
    const candidateStable = now - this.candidateSince >= this.showAfterMs;
    const shownLongEnough = !this.shown || now - this.shownAt >= this.minVisibleMs;
    if ((immediate || candidateStable) && shownLongEnough) {
      this.shown = next;
      this.shownAt = now;
    }
    return this.shown;
  }
}

/**
 * Tracks which form issue dominated each prompt. An issue counts for a prompt only
 * if it was observed for at least `minMs` in total, so single-frame noise is ignored.
 */
export class MistakeTracker {
  private current = new Map<IssueCode, number>();
  private counts = new Map<IssueCode, number>();

  constructor(private readonly minMs = 250) {}

  observe(issue: FormIssue | null, dtMs: number): void {
    if (!issue) return;
    this.current.set(issue.code, (this.current.get(issue.code) ?? 0) + dtMs);
  }

  /** Close the current prompt; returns the dominant issue (if any) that was recorded. */
  endPrompt(): IssueCode | null {
    let best: IssueCode | null = null;
    let bestMs = 0;
    for (const [code, ms] of this.current) {
      if (ms >= this.minMs && ms > bestMs) {
        best = code;
        bestMs = ms;
      }
    }
    this.current.clear();
    if (best) this.counts.set(best, (this.counts.get(best) ?? 0) + 1);
    return best;
  }

  mostCommon(): { code: IssueCode; label: string; count: number } | null {
    let best: { code: IssueCode; label: string; count: number } | null = null;
    for (const [code, count] of this.counts) {
      if (!best || count > best.count) best = { code, label: ISSUE_LABELS[code], count };
    }
    return best;
  }

  totals(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }
}
