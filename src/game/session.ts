import { GESTURES, type GestureName, type IssueCode } from '../motion/poseTypes';
import { pointsForHit, reactionWindowMs } from './scoring';

export const GAME_DURATION_MS = 60_000;
const FIRST_PROMPT_DELAY_MS = 900;
const GAP_MS = 650;

export interface Prompt {
  id: number;
  gesture: GestureName;
  shownAt: number;
  windowMs: number;
}

export type GameEvent =
  | { type: 'prompt'; prompt: Prompt }
  | { type: 'hit'; prompt: Prompt; reactionMs: number; points: number; combo: number }
  | { type: 'wrong'; prompt: Prompt; got: GestureName }
  | { type: 'miss'; prompt: Prompt }
  | { type: 'end' };

export interface GameSnapshot {
  score: number;
  combo: number;
  bestCombo: number;
  correct: number;
  attempts: number;
  timeLeftMs: number;
  prompt: Prompt | null;
  ended: boolean;
  paused: boolean;
}

export interface GameResults {
  score: number;
  accuracy: number;
  correct: number;
  attempts: number;
  bestCombo: number;
  avgReactionMs: number | null;
  mostCommonMistake: { code: IssueCode; label: string; count: number } | null;
  perGesture: Record<GestureName, { hits: number; prompts: number }>;
}

export class GameSession {
  private startAt = 0;
  private pausedAt: number | null = null;
  private nextPromptAt = 0;
  private prompt: Prompt | null = null;
  private promptSeq = 0;
  private lastGesture: GestureName | null = null;
  private ended = false;

  score = 0;
  combo = 0;
  bestCombo = 0;
  correct = 0;
  attempts = 0;
  reactions: number[] = [];
  perGesture: Record<GestureName, { hits: number; prompts: number }> = {
    GUARD: { hits: 0, prompts: 0 },
    DUCK: { hits: 0, prompts: 0 },
    PUNCH: { hits: 0, prompts: 0 },
  };

  constructor(
    private readonly durationMs = GAME_DURATION_MS,
    private readonly rng: () => number = Math.random,
  ) {}

  start(now: number): void {
    this.startAt = now;
    this.nextPromptAt = now + FIRST_PROMPT_DELAY_MS;
  }

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  pause(now: number): void {
    if (this.pausedAt === null && !this.ended) this.pausedAt = now;
  }

  resume(now: number): void {
    if (this.pausedAt === null) return;
    const d = now - this.pausedAt;
    this.startAt += d;
    this.nextPromptAt += d;
    if (this.prompt) this.prompt = { ...this.prompt, shownAt: this.prompt.shownAt + d };
    this.pausedAt = null;
  }

  elapsed(now: number): number {
    return (this.pausedAt ?? now) - this.startAt;
  }

  snapshot(now: number): GameSnapshot {
    return {
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      correct: this.correct,
      attempts: this.attempts,
      timeLeftMs: Math.max(0, this.durationMs - this.elapsed(now)),
      prompt: this.prompt,
      ended: this.ended,
      paused: this.paused,
    };
  }

  private pickGesture(): GestureName {
    let g = GESTURES[Math.floor(this.rng() * GESTURES.length)];
    // Re-roll once on a repeat so sequences feel varied but repeats still happen.
    if (g === this.lastGesture) g = GESTURES[Math.floor(this.rng() * GESTURES.length)];
    this.lastGesture = g;
    return g;
  }

  /** Advance the game. `fired` are gestures the engine confirmed on this frame. */
  update(now: number, fired: readonly GestureName[]): GameEvent[] {
    if (this.ended || this.paused) return [];
    const events: GameEvent[] = [];
    const elapsed = this.elapsed(now);

    if (elapsed >= this.durationMs) {
      this.ended = true;
      this.prompt = null;
      events.push({ type: 'end' });
      return events;
    }

    const p = this.prompt;
    if (p) {
      if (fired.length > 0) {
        const reactionMs = now - p.shownAt;
        this.attempts++;
        this.perGesture[p.gesture].prompts++;
        if (fired.includes(p.gesture)) {
          this.combo++;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
          this.correct++;
          this.perGesture[p.gesture].hits++;
          this.reactions.push(reactionMs);
          const points = pointsForHit(reactionMs, p.windowMs, this.combo);
          this.score += points;
          events.push({ type: 'hit', prompt: p, reactionMs, points, combo: this.combo });
        } else {
          this.combo = 0;
          events.push({ type: 'wrong', prompt: p, got: fired[0] });
        }
        this.prompt = null;
        this.nextPromptAt = now + GAP_MS;
      } else if (now - p.shownAt >= p.windowMs) {
        this.attempts++;
        this.perGesture[p.gesture].prompts++;
        this.combo = 0;
        events.push({ type: 'miss', prompt: p });
        this.prompt = null;
        this.nextPromptAt = now + GAP_MS;
      }
    } else if (now >= this.nextPromptAt) {
      this.prompt = {
        id: ++this.promptSeq,
        gesture: this.pickGesture(),
        shownAt: now,
        windowMs: reactionWindowMs(elapsed, this.durationMs),
      };
      events.push({ type: 'prompt', prompt: this.prompt });
    }
    return events;
  }

  results(mostCommonMistake: GameResults['mostCommonMistake']): GameResults {
    return {
      score: this.score,
      accuracy: this.attempts ? this.correct / this.attempts : 0,
      correct: this.correct,
      attempts: this.attempts,
      bestCombo: this.bestCombo,
      avgReactionMs: this.reactions.length
        ? Math.round(this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length)
        : null,
      mostCommonMistake,
      perGesture: this.perGesture,
    };
  }
}
