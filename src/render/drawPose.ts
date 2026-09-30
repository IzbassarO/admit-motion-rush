import { LM, type BodyRegion, type FocusPoint, type PoseFrame } from '../motion/poseTypes';

export type OverlayMode = 'neutral' | 'success' | 'warn' | 'error';

export interface OverlayStyle {
  mode: OverlayMode;
  /** region to tint in warn/error mode */
  region: BodyRegion | null;
  focus: FocusPoint[];
  /** 0..1, decays after a successful move */
  flash: number;
  now: number;
}

type Bone = readonly [number, number];

const BONES: Record<'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg', Bone[]> = {
  torso: [
    [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
    [LM.LEFT_SHOULDER, LM.LEFT_HIP],
    [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
    [LM.LEFT_HIP, LM.RIGHT_HIP],
  ],
  leftArm: [
    [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
    [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  ],
  rightArm: [
    [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
    [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  ],
  leftLeg: [
    [LM.LEFT_HIP, LM.LEFT_KNEE],
    [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  ],
  rightLeg: [
    [LM.RIGHT_HIP, LM.RIGHT_KNEE],
    [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  ],
};

const REGION_GROUPS: Record<BodyRegion, (keyof typeof BONES)[]> = {
  leftArm: ['leftArm'],
  rightArm: ['rightArm'],
  arms: ['leftArm', 'rightArm'],
  legs: ['leftLeg', 'rightLeg'],
  hips: ['torso', 'leftLeg', 'rightLeg'],
  body: ['torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
};

const JOINTS = [
  LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_ELBOW, LM.RIGHT_ELBOW, LM.LEFT_WRIST, LM.RIGHT_WRIST,
  LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
];

const COLORS = {
  neutral: 'rgba(132, 190, 255, 0.85)',
  neutralGlow: 'rgba(47, 140, 255, 0.9)',
  success: '#34f59a',
  warn: '#ffd23f',
  error: '#ff4d5e',
};

const VIS = 0.45;

/**
 * Draws the skeleton in canvas pixel space. The video is shown mirrored (selfie view),
 * so x is mirrored here too — which also keeps text labels readable.
 */
export function drawPose(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame | null,
  w: number,
  h: number,
  style: OverlayStyle,
  dpr: number,
): void {
  ctx.clearRect(0, 0, w, h);
  if (!frame) return;
  const lm = frame.image;
  const px = (i: number) => ({ x: (1 - lm[i].x) * w, y: lm[i].y * h });
  const ok = (i: number) => (lm[i]?.visibility ?? 0) >= VIS;
  const s = Math.max(1, Math.min(w, h) / 500) * dpr * 0.8;

  const highlighted = new Set<keyof typeof BONES>(
    style.region && (style.mode === 'warn' || style.mode === 'error') ? REGION_GROUPS[style.region] : [],
  );
  const baseColor = style.mode === 'success' ? COLORS.success : COLORS.neutral;
  const hiColor = style.mode === 'error' ? COLORS.error : COLORS.warn;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const group of Object.keys(BONES) as (keyof typeof BONES)[]) {
    const hi = highlighted.has(group);
    const color = hi ? hiColor : baseColor;
    ctx.strokeStyle = color;
    ctx.shadowColor = hi ? hiColor : style.mode === 'success' ? COLORS.success : COLORS.neutralGlow;
    ctx.shadowBlur = (hi ? 18 : 10) * s;
    ctx.lineWidth = (hi ? 7 : 4.5) * s + style.flash * 4 * s;
    for (const [a, b] of BONES[group]) {
      if (!ok(a) || !ok(b)) continue;
      const pa = px(a);
      const pb = px(b);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }

  // head marker
  if (ok(LM.NOSE) && ok(LM.LEFT_SHOULDER) && ok(LM.RIGHT_SHOULDER)) {
    const n = px(LM.NOSE);
    const sw = Math.abs(px(LM.LEFT_SHOULDER).x - px(LM.RIGHT_SHOULDER).x);
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 2.5 * s;
    ctx.shadowBlur = 8 * s;
    ctx.beginPath();
    ctx.arc(n.x, n.y, Math.max(10 * s, sw * 0.28), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  for (const i of JOINTS) {
    if (!ok(i)) continue;
    const p = px(i);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = style.mode === 'success' ? COLORS.success : COLORS.neutralGlow;
    ctx.lineWidth = 2 * s;
    ctx.stroke();
  }

  // focus rings + metric labels (e.g. live knee / elbow angle)
  const pulse = 0.5 + 0.5 * Math.sin(style.now / 140);
  const focusColor = style.mode === 'success' ? COLORS.success : style.mode === 'error' ? COLORS.error : style.mode === 'warn' ? COLORS.warn : COLORS.neutral;
  for (const f of style.focus) {
    if (!lm[f.index] || (lm[f.index].visibility ?? 0) < 0.3) continue;
    const p = px(f.index);
    ctx.strokeStyle = focusColor;
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (16 + 8 * pulse) * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (f.label) {
      const fontPx = Math.round(15 * s);
      ctx.font = `700 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const tw = ctx.measureText(f.label).width;
      const bx = p.x + 22 * s;
      const by = p.y - 12 * s - fontPx;
      const pad = 6 * s;
      ctx.fillStyle = 'rgba(5, 8, 14, 0.82)';
      roundRect(ctx, bx, by, tw + pad * 2, fontPx + pad * 1.6, 6 * s);
      ctx.fill();
      ctx.strokeStyle = focusColor;
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.fillStyle = focusColor;
      ctx.textBaseline = 'middle';
      ctx.fillText(f.label, bx + pad, by + (fontPx + pad * 1.6) / 2);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
