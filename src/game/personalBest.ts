export interface PersonalBest {
  score: number;
  accuracy: number;
  bestCombo: number;
  date: string;
}

const KEY = 'motionrush.personalBest.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // e.g. storage disabled / private mode
  }
}

export function loadPersonalBest(store: StorageLike | null = storage()): PersonalBest | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const pb = JSON.parse(raw) as PersonalBest;
    return typeof pb?.score === 'number' && Number.isFinite(pb.score) ? pb : null;
  } catch {
    return null;
  }
}

/** Saves `candidate` if it beats the stored best. Returns { best, isNew, previous }. */
export function submitScore(
  candidate: PersonalBest,
  store: StorageLike | null = storage(),
): { best: PersonalBest; isNew: boolean; previous: PersonalBest | null } {
  const previous = loadPersonalBest(store);
  const isNew = candidate.score > 0 && (!previous || candidate.score > previous.score);
  if (isNew) {
    try {
      store?.setItem(KEY, JSON.stringify(candidate));
    } catch {
      /* quota / disabled — ignore */
    }
  }
  return { best: isNew || !previous ? candidate : previous, isNew, previous };
}

const PREF_PREFIX = 'motionrush.pref.';

export function loadPref(name: string, fallback: boolean): boolean {
  try {
    const v = storage()?.getItem(PREF_PREFIX + name);
    return v === null || v === undefined ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export function savePref(name: string, value: boolean): void {
  try {
    storage()?.setItem(PREF_PREFIX + name, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}
