# MotionRush Arena

**Your body is the controller.**

MotionRush Arena is a 60-second webcam reflex game played in the browser. You block energy blasts, duck laser sweeps and smash drones using only your body. A live **Error Coach** measures half-finished moves, tells you exactly what to fix, and rewards you when you fix it.

> Live demo: add your Vercel production URL here. The app is a static Vite build, so no server is needed.

---

## The problem

Webcam motion games usually give binary feedback: the move counted or it didn't. When it doesn't count, the player can't tell why. Was the arm not straight enough, or the squat not low enough?

MotionRush treats a *partial* move as useful signal. It measures the player's joints and turns the measurement into a concrete correction, such as "Elbow 138° → target 155°+, straighten your right elbow". It then rewards the player for acting on it.

## User journey

1. **Landing:** the pitch, the three moves, and one button: *Start with camera*.
2. **Camera check:** live read-outs for camera, person detected, upper body in view, distance (too close / too far), knees in view, and tracking confidence. Each comes with an instruction such as "Step back so we can see your knees." It moves on automatically once framing is good. If the knees can't fit in frame, *Continue without knees* is offered.
3. **Calibration:** "Stand naturally" with a 3 · 2 · 1 ring. Samples only count while tracking is good and the player stands neutral with arms down. The result is the player's standing hip and shoulder height.
4. **Quick training:** do each move once (GUARD → DUCK → PUNCH), with the Error Coach live. It can be skipped.
5. **Arena:** a 60-second round. A threat appears and the matching move must be performed before the reaction window closes.
6. **Results:** final score, a performance title, accuracy, correct / total, average reaction time, best combo, corrections made, personal best, most common form issue, per-move hit rates, *Play again* and *Share score*.

## The three moves

| Threat | Move | Success effect | Rule (our code, `src/motion/*Detector.ts`) |
|---|---|---|---|
| Energy blast flying at you | **GUARD** | shield flash, *BLOCKED* | Both wrists are ≥ 0.05 torso lengths above their shoulders. It is released below −0.03 (hysteresis). |
| Laser sweep at head height | **DUCK** | laser passes, *DODGED* | Hips drop ≥ 0.20 torso lengths below the calibrated standing height **and** knee angle ≤ 115°. Released at 0.14 / 128°. Without visible knees the hips must drop ≥ 0.30. If the hips leave the frame, the shoulders must drop ≥ 0.35. |
| Drone target beside you | **PUNCH** | explosion, *SMASHED* | One arm with elbow angle ≥ 155° (released at 145°), reach ≥ 1.2 shoulder widths, and arm elevation between −40° and +55°, i.e. forward or sideways, not up or down. |

Joint angles use MediaPipe's metric 3D *world* landmarks, so a punch aimed straight at the camera is still measured correctly despite 2D foreshortening.

## Error Coach

Every detector returns `valid`, `partial`, `idle` or `unknown`. A `partial` result carries a **form issue** built from what was actually measured. The coach panel shows:

1. **What is wrong:** *EXTEND YOUR ARM*, *GO LOWER*, *LEFT HAND HIGHER*
2. **The measurement,** when one exists: *Elbow 138°*, *Knee 126°*, *Depth 64%*
3. **The target:** *155°+*, *≤115°*
4. **What to do:** *Straighten your right elbow*, *Lower your hips a little more*

Numbers are never invented. The panel shows a measurement only when the detector produced one. GUARD issues, for example, have no number.

The skeleton overlay turns the affected region yellow or orange (arm, legs, hips) and pins the live angle to the joint. Tracking problems take priority over form feedback.

To keep feedback readable, a new issue must persist for 220 ms before it is shown, and it then stays for at least 900 ms. The live value updates in place while the issue stays the same.

### CORRECTED ✓ (coach bonus)

When the coach has visibly flagged a form issue on the **requested** move, and the player then completes **that same move** before the window closes, the game shows **CORRECTED ✓ +50 COACH BONUS**. It plays a distinct chime and counts toward *Corrections made*.

This is deterministic game state (`GameSession.markCoached()` plus the hit handler):
- The bonus is awarded at most once per prompt.
- A timeout or a different move earns no bonus.
- The flag is reset for every new prompt.

## Architecture

```
MediaPipe PoseLandmarker  ──►  33 landmarks per frame (image + metric world coords)
                                  │  MediaPipe's only job
──────────────────────────────────┼──────────────────────────────── our code ──
src/hooks/usePoseLoop.ts           rAF loop → decoupled PoseFrame
src/motion/geometry.ts             joint angles, distances, elevation
src/motion/calibration.ts          framing report, pose quality, 3 s standing baseline
src/motion/{guard,duck,punch}Detector.ts   per-frame rules, partial attempts, measurements
src/motion/gestureEngine.ts        stability windows, hysteresis, release, cooldowns
src/motion/errorCoach.ts           message priority, coach copy, smoothing, mistake tracking
src/game/session.ts                60 s round, prompts, scoring, combo, correction bonus, pause
src/game/{scoring,rank,personalBest}.ts
src/render/drawPose.ts             canvas skeleton + highlighted regions + angle labels
src/components/                    Landing, Arena (phase orchestration), ThreatLayer,
                                   CoachPanel, GameHud, Hud (check/calibration/training), ResultsPanel
src/audio/sfx.ts                   Web Audio synthesized sounds (no audio files)
```

**The key distinction:** MediaPipe performs pose-landmark extraction only. Gesture recognition (geometric rules), temporal logic, partial-attempt detection, the Error Coach, scoring and gameplay are MotionRush's own application code. No model was trained and no gesture library is used.

**Temporal rules** (`gestureEngine.ts`):
- A move must stay valid for a hold time (GUARD 180 ms, DUCK 150 ms, PUNCH 70 ms, and at least 2 frames) before it fires.
- It fires once, then must be released for 150 ms before it can fire again.
- There is a 450 ms per-move cooldown and a 250 ms global gap between moves.

**Scoring:**
- Points per move are 100, plus a speed bonus of up to 150, times a combo multiplier of 1 + 0.1 × (combo − 1), capped at 2×.
- Correction bonus: +50.
- The reaction window shrinks from 3.2 s to 1.9 s over the round.
- A wrong move or a miss resets the combo.

**Tracking safety:** if the player can't be tracked, the prompt's reaction clock freezes immediately. After 700 ms the round pauses ("Step back into frame") and resumes automatically. A lost pose never counts as a miss. Hiding the tab also pauses the round.

## Privacy

- Camera frames are processed locally in the browser by WebAssembly. No image or video is uploaded anywhere.
- There is no backend, no account and no analytics of our own. `localStorage` holds only the personal-best score and the mute preference.
- The MediaPipe runtime and model are served from the app's own origin. jsDelivr and Google Storage are used only as a fallback if those fail to load.
- According to its own documentation, the MediaPipe Tasks library may send anonymous performance and usage metrics to Google. It does not send image data.

## Local setup

```bash
npm install
npm run dev          # http://localhost:5173 (camera works on localhost)
npm test -- --run    # unit tests (vitest)
npm run typecheck
npm run build        # production build → dist/
npm run preview      # serve the production build
```

`predev` and `prebuild` copy the MediaPipe WASM runtime from `node_modules` into `public/mediapipe/wasm`. The pose model is committed at `public/models/pose_landmarker_lite.task`.

**Developer-only URL flags** (not linked anywhere in the UI):
- `?debug`: live detector metrics overlay.
- `?sim`: keyboard pose simulator for testing without a camera. Hold G / D / P for valid moves, or T / H / B for partial ones. Hold N for "nobody in frame". It replaces only the landmark source; everything downstream runs normally.

## Deployment (Vercel)

1. Import the GitHub repository at vercel.com/new.
2. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`. `vercel.json` already sets these, plus cache headers and `Permissions-Policy: camera=(self)`.
3. Deploy. No environment variables are needed, and the site is fully static.

## Browser requirements

You need a recent Chrome, Edge, Safari or Firefox with WebAssembly and `getUserMedia`, plus a webcam. The camera requires `https://` or `localhost`. WebGL (GPU delegate) is used when available, with a CPU fallback.

## Limitations

- Thresholds are tuned on synthetic poses and limited manual testing, not on a large set of real players. Unusual body proportions, loose clothing or poor lighting can affect detection.
- Without visible knees, DUCK uses a stricter hip-drop-only rule and can't report the knee angle.
- A single camera gives limited depth information. PUNCH relies on MediaPipe's estimated 3D world landmarks, which get noisier when the arm points straight at the camera.
- One player at a time. There is no leaderboard or backend.
- The first load downloads about 24 MB of WASM and model files; later loads are served from cache.
