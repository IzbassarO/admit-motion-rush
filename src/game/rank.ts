import type { GameResults } from './session';

export interface PerformanceTitle {
  title: string;
  tier: 1 | 2 | 3 | 4;
}

/** Cosmetic end-of-round title from deterministic thresholds. */
export function performanceTitle(r: Pick<GameResults, 'accuracy' | 'correct'>): PerformanceTitle {
  if (r.correct >= 18 && r.accuracy >= 0.85) return { title: 'Motion Master', tier: 4 };
  if (r.correct >= 12 && r.accuracy >= 0.7) return { title: 'Reflex Pro', tier: 3 };
  if (r.correct >= 6 && r.accuracy >= 0.5) return { title: 'Motion Ready', tier: 2 };
  return { title: 'Reflex Rookie', tier: 1 };
}
