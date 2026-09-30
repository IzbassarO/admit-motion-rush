import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { play } from '../audio/sfx';
import { submitScore, type PersonalBest } from '../game/personalBest';
import { GameSession, type GameEvent, type GameResults } from '../game/session';
import type { CameraApi } from '../hooks/useCamera';
import type { LandmarkerApi } from '../hooks/usePoseLandmarker';
import { usePoseLoop, type LoopTick } from '../hooks/usePoseLoop';
import { assessPoseQuality, CalibrationCollector, framingReport, type FramingReport } from '../motion/calibration';
import { CoachSmoother, coachMessage, MistakeTracker, type CoachMessage } from '../motion/errorCoach';
import { evaluateDuck } from '../motion/duckDetector';
import { GestureEngine, type EngineOutput } from '../motion/gestureEngine';
import { evaluateGuard } from '../motion/guardDetector';
import { evaluatePunch } from '../motion/punchDetector';
import type { GestureEvaluation, GestureName } from '../motion/poseTypes';
import { drawPose, type OverlayStyle } from '../render/drawPose';
import { CoachPanel } from './CoachPanel';
import { DebugPanel, type DebugData } from './DebugPanel';
import { GameHud, type HudState } from './GameHud';
import {
  CalibrationPanel,
  CameraCheckPanel,
  Countdown,
  PausedPanel,
  SetupPanel,
  TUTORIAL_STEPS,
  TutorialPanel,
} from './Hud';
import { ResultsPanel } from './ResultsPanel';
import { ThreatLayer, type Outcome } from './ThreatLayer';

export type ArenaPhase = 'setup' | 'check' | 'calibration' | 'tutorial' | 'countdown' | 'game' | 'results';

const COUNTDOWN_STEP_MS = 800;
/** camera check: how long framing must stay good before moving on */
const CHECK_STABLE_MS = 1000;
/** pause the round after this long without a trackable player */
const PAUSE_AFTER_MS = 700;
const GESTURE_SOUND: Record<GestureName, 'guard' | 'duck' | 'punch'> = { GUARD: 'guard', DUCK: 'duck', PUNCH: 'punch' };
const EMPTY_HUD: HudState = {
  score: 0,
  combo: 0,
  timeLeftMs: 60_000,
  prompt: null,
  promptHeld: false,
  trackingLost: false,
  gain: null,
};
const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

interface Props {
  camera: CameraApi;
  pose: LandmarkerApi;
  onExit: () => void;
}


export interface FinalResults extends GameResults {
  personalBest: PersonalBest;
  isNewBest: boolean;
}

export function Arena({ camera, pose, onExit }: Props) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

  const [phase, setPhaseState] = useState<ArenaPhase>('setup');
  const phaseRef = useRef<ArenaPhase>('setup');
  const phaseStartRef = useRef(0);
  const setPhase = useCallback((p: ArenaPhase) => {
    phaseRef.current = p;
    phaseStartRef.current = performance.now();
    setPhaseState(p);
  }, []);

  // --- per-frame logic objects (refs: they change every frame, React doesn't need to know) ---
  const collectorRef = useRef(new CalibrationCollector());
  const engineRef = useRef<GestureEngine | null>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const smootherRef = useRef(new CoachSmoother());
  const mistakesRef = useRef(new MistakeTracker());
  const lastOutRef = useRef<EngineOutput | null>(null);
  const flashRef = useRef(0);
  const tutorialStepRef = useRef(0);
  const tutorialAdvanceAt = useRef<number | null>(null);
  const badQualityMs = useRef(0);
  const goodQualityMs = useRef(0);
  const countdownShown = useRef(-1);
  const checkReadyMs = useRef(0);
  const gainRef = useRef<HudState['gain']>(null);

  // --- UI state (updated only when values change) ---
  const [calib, setCalib] = useState({ progress: 0, hint: 'Step into the frame.' });
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialCleared, setTutorialCleared] = useState(false);
  const [coach, setCoach] = useState<CoachMessage | null>(null);
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [check, setCheck] = useState<FramingReport | null>(null);
  const [checkCanSkip, setCheckCanSkip] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [goFx, setGoFx] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [paused, setPaused] = useState<string | null>(null);
  const [stageFlash, setStageFlash] = useState<{ kind: 'hit' | 'wrong' | 'miss'; id: number } | null>(null);
  const [results, setResults] = useState<FinalResults | null>(null);
  const [trackingMsg, setTrackingMsg] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [loopError, setLoopError] = useState<string | null>(null);
  const fxId = useRef(0);
  const [debug, setDebug] = useState<DebugData | null>(null);
  const debugAt = useRef(0);

  // attach camera stream to the <video>
  useEffect(() => {
    if (!video) return;
    if (camera.stream) {
      video.srcObject = camera.stream;
      video.play().catch(() => {
        /* autoplay is allowed for muted inline video; ignore transient errors */
      });
    } else {
      video.srcObject = null;
      setVideoPlaying(false);
    }
  }, [video, camera.stream]);

  // fit the stage to the available area while keeping the video's aspect ratio
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      let w = width;
      let h = width / videoAspect;
      if (h > height) {
        h = height;
        w = height * videoAspect;
      }
      setStageSize({ w: Math.floor(w), h: Math.floor(h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [videoAspect]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(stageSize.w * dpr));
    c.height = Math.max(1, Math.round(stageSize.h * dpr));
  }, [stageSize]);

  // setup -> camera check once camera, model and video are all live
  useEffect(() => {
    if (phase === 'setup' && camera.status === 'ready' && pose.status === 'ready' && videoPlaying) {
      checkReadyMs.current = 0;
      setCheckCanSkip(false);
      setPhase('check');
    }
  }, [phase, camera.status, pose.status, videoPlaying, setPhase]);

  const startCalibration = useCallback(() => {
    collectorRef.current = new CalibrationCollector();
    setCalib({ progress: 0, hint: 'Hold still…' });
    setPhase('calibration');
  }, [setPhase]);

  // pause the round when the tab is hidden (rAF stops, the clock must too)
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && phaseRef.current === 'game') {
        sessionRef.current?.pause(performance.now());
        setPaused('Paused while the tab was hidden. Step back into frame to continue.');
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const flashStage = useCallback((kind: 'hit' | 'wrong' | 'miss') => setStageFlash({ kind, id: ++fxId.current }), []);

  const startCountdown = useCallback(() => {
    engineRef.current?.reset();
    smootherRef.current.reset();
    countdownShown.current = -1;
    setCoach(null);
    setCountdown(3);
    setPhase('countdown');
  }, [setPhase]);

  const startGame = useCallback((now: number) => {
    const s = new GameSession();
    s.start(now);
    sessionRef.current = s;
    mistakesRef.current = new MistakeTracker();
    badQualityMs.current = 0;
    setPaused(null);
    setResults(null);
    gainRef.current = null;
    setOutcome(null);
    setHud(EMPTY_HUD);
    setPhase('game');
  }, [setPhase]);

  const finishGame = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    const r = s.results(mistakesRef.current.mostCommon());
    const { best, isNew } = submitScore({
      score: r.score,
      accuracy: r.accuracy,
      bestCombo: r.bestCombo,
      date: new Date().toISOString(),
    });
    setResults({ ...r, personalBest: best, isNewBest: isNew });
    setCoach(null);
    setPhase('results');
    play('end');
  }, [setPhase]);

  const handleGameEvents = useCallback(
    (events: GameEvent[]) => {
      for (const e of events) {
        switch (e.type) {
          case 'prompt':
            smootherRef.current.reset();
            play('prompt');
            break;
          case 'hit': {
            mistakesRef.current.endPrompt();
            smootherRef.current.reset();
            setCoach(null);
            flashRef.current = 1;
            play(GESTURE_SOUND[e.prompt.gesture]);
            if (e.corrected) window.setTimeout(() => play('corrected'), 140);
            else if (e.combo > 1 && e.combo % 5 === 0) window.setTimeout(() => play('combo'), 120);
            flashStage('hit');
            gainRef.current = { id: ++fxId.current, value: e.points + e.coachBonus };
            setOutcome({
              id: e.prompt.id,
              kind: 'hit',
              gesture: e.prompt.gesture,
              points: e.points,
              reactionMs: e.reactionMs,
              combo: e.combo,
              corrected: e.corrected,
              coachBonus: e.coachBonus,
            });
            break;
          }
          case 'wrong':
          case 'miss':
            mistakesRef.current.endPrompt();
            smootherRef.current.reset();
            setCoach(null);
            play(e.type);
            flashStage(e.type);
            setOutcome({
              id: e.prompt.id,
              kind: e.type,
              gesture: e.prompt.gesture,
              points: 0,
              reactionMs: 0,
              combo: 0,
              corrected: false,
              coachBonus: 0,
              got: e.type === 'wrong' ? e.got : undefined,
            });
            break;
          case 'end':
            finishGame();
            break;
        }
      }
    },
    [finishGame, flashStage],
  );

  const onTick = useCallback(
    ({ frame, fresh, now, dt, fps: currentFps }: LoopTick) => {
      const p = phaseRef.current;
      const quality = assessPoseQuality(frame);
      flashRef.current = Math.max(0, flashRef.current - dt / 500);
      const overlay: OverlayStyle = { mode: 'neutral', region: null, focus: [], flash: flashRef.current, now };

      if (fresh) {
        setFps((f) => (Math.abs(f - currentFps) >= 2 ? Math.round(currentFps) : f));
        setTrackingMsg((m) => {
          const next = quality.status === 'ok' ? null : quality.message;
          return m === next ? m : next;
        });
      }

      let out = lastOutRef.current;
      if (fresh && engineRef.current && p !== 'calibration' && p !== 'check') {
        out = engineRef.current.update(frame, now);
        lastOutRef.current = out;
      }
      const fired = fresh && out ? out.fired : [];

      if (DEBUG && fresh && now - debugAt.current > 150) {
        debugAt.current = now;
        const cal = engineRef.current?.calibration ?? null;
        setDebug({
          quality: quality.status,
          calibrated: !!cal,
          evaluations:
            out?.evaluations ??
            (frame
              ? { GUARD: evaluateGuard(frame, cal), DUCK: evaluateDuck(frame, cal), PUNCH: evaluatePunch(frame) }
              : null),
        });
      }

      const applyEvaluation = (ev: GestureEvaluation | null, msg: CoachMessage | null) => {
        if (!ev) return;
        if (flashRef.current > 0.05 || ev.status === 'valid') {
          overlay.mode = 'success';
          overlay.focus = ev.focus;
        } else if (msg?.issue) {
          overlay.mode = msg.tone === 'error' ? 'error' : 'warn';
          overlay.region = msg.issue.region;
          overlay.focus = ev.status === 'partial' ? ev.focus : [];
        }
      };

      if (p === 'check') {
        if (fresh) {
          const r = framingReport(frame);
          setCheck((c) =>
            c &&
            c.message === r.message &&
            c.person === r.person &&
            c.upperBody === r.upperBody &&
            c.distance === r.distance &&
            c.knees === r.knees &&
            c.confidence === r.confidence
              ? c
              : r,
          );
          checkReadyMs.current = r.ready ? checkReadyMs.current + dt : 0;
          const stable = checkReadyMs.current >= CHECK_STABLE_MS;
          setCheckCanSkip(stable && !r.knees);
          if (stable && r.knees) {
            play('tick');
            collectorRef.current = new CalibrationCollector();
            setCalib({ progress: 0, hint: 'Hold still…' });
            setPhase('calibration');
          }
        }
      } else if (p === 'calibration') {
        if (fresh) {
          const c = collectorRef.current;
          c.add(frame, now);
          const progress = Math.round(c.progress * 50) / 50;
          setCalib((s) => (s.progress === progress && s.hint === c.hint.message ? s : { progress, hint: c.hint.message }));
          if (c.done) {
            const result = c.result();
            if (result) {
              engineRef.current = new GestureEngine(result);
              lastOutRef.current = null;
              play('calibrated');
              tutorialStepRef.current = 0;
              tutorialAdvanceAt.current = null;
              setTutorialStep(0);
              setTutorialCleared(false);
              smootherRef.current.reset();
              setPhase('tutorial');
            } else {
              collectorRef.current = new CalibrationCollector();
            }
          }
        }
      } else if (p === 'tutorial' && out) {
        const step = tutorialStepRef.current;
        const target = TUTORIAL_STEPS[step];
        const ev = out.evaluations[target];
        if (tutorialAdvanceAt.current === null && fired.includes(target)) {
          flashRef.current = 1;
          play(GESTURE_SOUND[target]);
          setTutorialCleared(true);
          tutorialAdvanceAt.current = now + 900;
        }
        if (tutorialAdvanceAt.current !== null && now >= tutorialAdvanceAt.current) {
          tutorialAdvanceAt.current = null;
          setTutorialCleared(false);
          smootherRef.current.reset();
          if (step + 1 >= TUTORIAL_STEPS.length) {
            startCountdown();
          } else {
            tutorialStepRef.current = step + 1;
            setTutorialStep(step + 1);
          }
        }
        const raw = tutorialAdvanceAt.current !== null ? null : coachMessage(target, ev, quality);
        const msg = smootherRef.current.update(raw, now);
        setCoach((c) => (c?.key === msg?.key && c?.text === msg?.text ? c : msg));
        applyEvaluation(ev, msg);
      } else if (p === 'countdown') {
        const elapsed = now - phaseStartRef.current;
        const n = 3 - Math.floor(elapsed / COUNTDOWN_STEP_MS);
        if (n !== countdownShown.current && n > 0) {
          countdownShown.current = n;
          setCountdown(n);
          play('tick');
        }
        if (n <= 0) {
          play('go');
          setGoFx((g) => g + 1);
          startGame(now);
        }
      } else if (p === 'game' && sessionRef.current) {
        const s = sessionRef.current;
        // pause when the player is lost for a while, resume once tracking is stable again
        if (quality.status === 'ok') {
          badQualityMs.current = 0;
          goodQualityMs.current += dt;
        } else {
          badQualityMs.current += dt;
          goodQualityMs.current = 0;
        }
        if (!s.paused && badQualityMs.current > PAUSE_AFTER_MS) {
          s.pause(now);
          play('paused');
          setPaused(quality.message);
        } else if (s.paused) {
          if (quality.status === 'ok' && goodQualityMs.current > 700 && !document.hidden) {
            s.resume(now);
            setPaused(null);
          } else if (quality.status !== 'ok') {
            setPaused((m) => (m === quality.message ? m : quality.message));
          }
        }

        const tracking = quality.status === 'ok';
        const events = s.update(now, fired, tracking);
        handleGameEvents(events);
        if (phaseRef.current !== 'game') return;

        const snap = s.snapshot(now);
        const prompt = snap.prompt;
        let msg: CoachMessage | null = null;
        let held = false;
        if (prompt && out) {
          const ev = out.evaluations[prompt.gesture];
          mistakesRef.current.observe(ev.status === 'partial' ? ev.issue : null, dt);
          held = engineRef.current!.isActive(prompt.gesture) && !fired.includes(prompt.gesture);
          const raw = held
            ? { key: 'held', text: 'Reset your pose, then do it again.', tone: 'info' as const, issue: null }
            : coachMessage(prompt.gesture, ev, quality);
          msg = smootherRef.current.update(raw, now);
          // The coach is visibly flagging a form issue on the requested move: if the
          // player now fixes it and lands the same move in time, it is a correction.
          if (msg?.issue && ev.status === 'partial') s.markCoached();
          applyEvaluation(ev, msg);
        } else {
          msg = smootherRef.current.update(quality.status === 'ok' ? null : coachMessage(null, null, quality), now);
          if (flashRef.current > 0.05) overlay.mode = 'success';
        }
        setCoach((c) => (c?.key === msg?.key && c?.text === msg?.text ? c : msg));
        const timeLeftMs = Math.ceil(snap.timeLeftMs / 100) * 100;
        const trackingLost = !tracking;
        const gain = gainRef.current;
        setHud((h) =>
          h.score === snap.score &&
          h.combo === snap.combo &&
          h.timeLeftMs === timeLeftMs &&
          h.prompt === prompt &&
          h.promptHeld === held &&
          h.trackingLost === trackingLost &&
          h.gain === gain
            ? h
            : { score: snap.score, combo: snap.combo, timeLeftMs, prompt, promptHeld: held, trackingLost, gain },
        );
      }

      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) {
        drawPose(ctx, frame, c.width, c.height, overlay, Math.min(2, window.devicePixelRatio || 1));
      }
    },
    [handleGameEvents, setPhase, startCountdown, startGame],
  );

  usePoseLoop(videoPlaying ? video : null, pose.landmarker, onTick, (e) => {
    console.error('[MotionRush] pose detection keeps failing', e);
    setLoopError('Pose detection stopped working in this browser. Reload the page or try Chrome/Edge.');
  });

  const playAgain = useCallback(() => startCountdown(), [startCountdown]);
  const recalibrate = useCallback(() => {
    setCoach(null);
    setResults(null);
    checkReadyMs.current = 0;
    setCheckCanSkip(false);
    setPhase('check');
  }, [setPhase]);
  const skipTutorial = useCallback(() => startCountdown(), [startCountdown]);

  const cameraLost = phase !== 'setup' && camera.status !== 'ready';
  const showSetup = phase === 'setup' || cameraLost || !!loopError;

  return (
    <main className={`arena phase-${phase}`}>
      <div className="stage-wrap" ref={wrapRef}>
        <div className="stage" style={{ width: stageSize.w || undefined, height: stageSize.h || undefined }}>
          <video
            ref={setVideo}
            className="stage-video"
            playsInline
            muted
            autoPlay
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
            }}
            onPlaying={() => setVideoPlaying(true)}
          />
          <canvas ref={canvasRef} className="stage-canvas" />
          <div className="stage-vignette" aria-hidden="true" />
          <div className="stage-corners" aria-hidden="true" />
          {stageFlash && <div key={stageFlash.id} className={`stage-flash flash-${stageFlash.kind}`} aria-hidden="true" />}

          <div className="stage-chips">
            <span className="chip chip-live">
              <span className="dot" /> Local only
            </span>
            {fps > 0 && <span className="chip chip-fps">{fps} fps</span>}
          </div>

          {phase === 'game' && (
            <ThreatLayer
              prompt={hud.prompt}
              outcome={outcome}
              anchorY={engineRef.current?.calibration?.shoulderY ?? 0.35}
              frozen={hud.trackingLost || !!paused}
            />
          )}
          {phase === 'check' && !showSetup && (
            <CameraCheckPanel report={check} canContinue={checkCanSkip} onContinue={startCalibration} />
          )}
          {phase === 'calibration' && !showSetup && <CalibrationPanel progress={calib.progress} hint={calib.hint} />}
          {phase === 'tutorial' && !showSetup && (
            <TutorialPanel step={tutorialStep} cleared={tutorialCleared} onSkip={skipTutorial} />
          )}
          {phase === 'countdown' && <Countdown value={countdown} />}
          {phase === 'game' && <GameHud hud={hud} />}
          {goFx > 0 && phase === 'game' && (
            <div className="go-fx" key={`go-${goFx}`} aria-hidden="true">
              GO!
            </div>
          )}
          {(phase === 'tutorial' || phase === 'game') && !paused && <CoachPanel message={coach} />}
          {phase === 'game' && paused && <PausedPanel message={paused} />}
          {phase === 'results' && results && (
            <ResultsPanel results={results} onPlayAgain={playAgain} onRecalibrate={recalibrate} onHome={onExit} />
          )}
          {DEBUG && debug && <DebugPanel data={debug} fps={fps} />}
          {showSetup && (
            <SetupPanel
              camera={camera}
              pose={pose}
              videoPlaying={videoPlaying}
              loopError={loopError}
              onExit={onExit}
            />
          )}
          {!showSetup && trackingMsg && phase === 'countdown' && (
            <div className="tracking-toast">{trackingMsg}</div>
          )}
        </div>
      </div>
    </main>
  );
}
