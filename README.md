# MotionRush — *Your body is the controller.*

A 60-second webcam reflex game built for the ADMIT Hackathon. The game calls out **GUARD**, **DUCK** or **PUNCH** and you answer with your body. A live **Error Coach** measures half-done moves and tells you exactly what to fix.

Everything runs in the browser. There's no backend, no accounts and no uploads.

## The problem

Webcam fitness and motion games usually only say "correct" or "nothing". They don't explain *why* a move didn't count. MotionRush treats a partial attempt as a signal. It measures the joint geometry and turns it into a concrete correction.

## The three gestures

| Gesture | Game action | Rule (thresholds in `src/motion/*Detector.ts`) |
|---|---|---|
| GUARD | block the strike | Both wrists are above their shoulders by ≥ 0.05 torso lengths. It releases below −0.03 (hysteresis). |
| DUCK | dodge the beam | Hips drop ≥ 0.20 torso lengths below the calibrated standing height **and** the knee angle is ≤ 115°. It releases at 0.14 / 128°. If the knees aren't visible, the hips must drop ≥ 0.30. If the hips leave the frame, the shoulders must drop ≥ 0.35. |
| PUNCH | smash the target | One arm has an elbow angle ≥ 155° (releases at 145°) and a wrist–shoulder reach ≥ 1.2 shoulder widths. The arm's elevation must be between −40° and +55°, so it points forward or sideways, not up or down. |

Angles use MediaPipe's metric 3D *world* landmarks, so a punch straight at the camera is still measured correctly.

## Error Coach

Each detector returns `valid`, `partial`, `idle` or `unknown`. A `partial` result carries an issue built from the measured values, for example:

- "Raise your left hand above your shoulder." / "Raise both hands higher — above your shoulders."
- "Go lower — knee angle 124°, target <115°."
- "Extend your right elbow more — 136°, target >155°." / "Punch forward at shoulder height — your right arm is pointing up."

The skeleton overlay colors the affected body region yellow or red and pins the live angle to the joint. Tracking problems take priority over form feedback: no person, low confidence, too close, too far.

To keep messages from flickering, an issue has to persist for 220 ms before it shows, and it then stays up for at least 900 ms. The results screen reports the most frequent issue across the round.

## Architecture

```
MediaPipe PoseLandmarker ──► landmarks only
        │
src/hooks/usePoseLoop.ts        rAF loop → decoupled PoseFrame
src/motion/geometry.ts          angles, distances, elevation
src/motion/calibration.ts       3 s standing baseline, framing/quality checks
src/motion/{guard,duck,punch}Detector.ts   per-frame rules + partial-attempt issues
src/motion/gestureEngine.ts     stability windows, hysteresis, release/cooldown
src/motion/errorCoach.ts        message selection, smoothing, mistake tracking
src/game/                       60 s session, scoring, localStorage personal best
src/render/drawPose.ts          canvas skeleton overlay
src/components/                 landing, arena (calibration → tutorial → game → results)
```

MediaPipe only extracts pose landmarks. Everything after that is our own code: the angle math, classification, error detection, confidence checks, temporal stability and cooldowns. No model was trained.

**Temporal rules:** a gesture must stay valid for a hold period (GUARD 180 ms, DUCK 150 ms, PUNCH 70 ms, ≥ 2 frames) before it fires. It fires once, then has to be released for 150 ms before it can fire again. There is also a 450 ms per-gesture cooldown and a 250 ms global gap between moves.

**Scoring:** a correct move earns 100 points plus up to a 150-point speed bonus, times a combo multiplier of 1 + 0.1 × (combo − 1), capped at 2×. The reaction window shrinks from 3.2 s to 1.9 s over the round. A wrong move or a timeout resets the combo. The round pauses automatically when the player is lost or the tab is hidden.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run typecheck
npm run build      # production build in dist/
```

`predev`/`prebuild` copy the MediaPipe WASM runtime from `node_modules` to `public/mediapipe/wasm`. The pose model is committed at `public/models/pose_landmarker_lite.task`. Both are served from the app's own origin. The jsDelivr and Google-hosted copies are used only as a fallback.

Developer-only query flags:
- `?debug` shows live detector metrics.
- `?sim` swaps the camera for a keyboard pose simulator (hold G/D/P, or T/H/B for partial moves) so the flow can be tested without a camera.

## Deploy (Vercel)

Import the GitHub repo in Vercel. The framework preset is **Vite**, the build command is `npm run build`, and the output directory is `dist`. `vercel.json` already sets these, plus cache headers and `Permissions-Policy: camera=(self)`.

## Browser requirements

You need a recent Chrome, Edge, Safari or Firefox with WebAssembly and `getUserMedia`, and a webcam. The camera only works on `https://` or `localhost`. WebGL (GPU delegate) is used when available, with a CPU fallback.

## Privacy

Camera frames are processed locally in your browser and are never uploaded. The game stores only your personal-best score and your mute preference in `localStorage`.

Note: according to its own README, the MediaPipe Tasks library may send anonymous performance and usage metrics to Google. It does not send image data.
