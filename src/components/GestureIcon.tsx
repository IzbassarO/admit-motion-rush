import type { GestureName } from '../motion/poseTypes';

const FIGURES: Record<GestureName, { head: [number, number]; lines: string[]; fist?: [number, number] }> = {
  GUARD: {
    head: [32, 11],
    lines: ['M32 17 V38', 'M24 20 H40', 'M24 20 L20 30 L24 12', 'M40 20 L44 30 L40 12', 'M32 38 L25 58', 'M32 38 L39 58'],
  },
  DUCK: {
    head: [32, 24],
    lines: ['M32 30 V44', 'M25 32 H39', 'M25 32 L19 40', 'M39 32 L45 40', 'M32 44 L21 48 L24 58', 'M32 44 L43 48 L40 58'],
  },
  PUNCH: {
    head: [24, 11],
    lines: ['M24 17 V38', 'M18 20 H30', 'M18 20 L14 29 L18 13', 'M30 20 H56', 'M24 38 L17 58', 'M24 38 L31 58'],
    fist: [57, 20],
  },
};

export function GestureIcon({ gesture, className }: { gesture: GestureName; className?: string }) {
  const f = FIGURES[gesture];
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={f.head[0]} cy={f.head[1]} r={5} />
        {f.lines.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {f.fist && <circle cx={f.fist[0]} cy={f.fist[1]} r={4} fill="currentColor" />}
    </svg>
  );
}
