import { clamp } from '../motion/geometry';

export const SCORING = {
  base: 100,
  maxSpeedBonus: 150,
  /** reactions faster than this get the full speed bonus */
  fastMs: 250,
  comboStep: 0.1,
  maxComboSteps: 10,
} as const;

export function comboMultiplier(combo: number): number {
  return 1 + SCORING.comboStep * clamp(combo - 1, 0, SCORING.maxComboSteps);
}

/** Points for a correct move. `combo` is the combo count *including* this hit. */
export function pointsForHit(reactionMs: number, windowMs: number, combo: number): number {
  const span = Math.max(1, windowMs - SCORING.fastMs);
  const speed = clamp(1 - (reactionMs - SCORING.fastMs) / span);
  const raw = (SCORING.base + SCORING.maxSpeedBonus * speed) * comboMultiplier(combo);
  return Math.round(raw);
}

/** Reaction window shrinks from 3.2 s to 1.9 s over the round. */
export function reactionWindowMs(elapsedMs: number, durationMs: number): number {
  const t = clamp(elapsedMs / durationMs);
  return Math.round(3200 + (1900 - 3200) * t);
}
