import { useCallback, useEffect, useState } from 'react';
import { setMuted, unlockAudio } from './audio/sfx';
import { Arena } from './components/Arena';
import { Landing, LockIcon } from './components/Landing';
import { loadPersonalBest, loadPref, savePref } from './game/personalBest';
import { useCamera } from './hooks/useCamera';
import { usePoseLandmarker } from './hooks/usePoseLandmarker';

export default function App() {
  const camera = useCamera();
  const pose = usePoseLandmarker(); // starts loading WASM + model immediately, while the landing page is shown
  const [screen, setScreen] = useState<'landing' | 'arena'>('landing');
  const [muted, setMutedState] = useState(() => loadPref('muted', false));
  const [pbVersion, setPbVersion] = useState(0);

  useEffect(() => setMuted(muted), [muted]);

  const start = useCallback(() => {
    unlockAudio();
    setScreen('arena');
    void camera.start();
  }, [camera]);

  const exit = useCallback(() => {
    camera.stop();
    setScreen('landing');
    setPbVersion((v) => v + 1);
  }, [camera]);

  const toggleMute = () => {
    unlockAudio();
    setMutedState((m) => {
      savePref('muted', !m);
      return !m;
    });
  };

  return (
    <div className={`app screen-${screen}`}>
      <header className="topbar">
        <button className="brand" onClick={screen === 'arena' ? exit : undefined} aria-label="MotionRush home">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <path d="M8 48 L22 16 L32 36 L40 24 L56 48" />
          </svg>
          <span>
            Motion<b>Rush</b>
          </span>
          <span className="brand-tag">Arena</span>
        </button>
        <div className="topbar-right">
          <span className="privacy-pill" title="Pose detection runs on this device. No camera frames are sent anywhere.">
            <LockIcon />
            <span className="privacy-long">On-device · no video uploaded</span>
            <span className="privacy-short">Local</span>
          </span>
          <button className="icon-btn" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}>
            {muted ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9h4l5-4v14l-5-4H4z M17 9l5 6 M22 9l-5 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9h4l5-4v14l-5-4H4z M17 8.5a5 5 0 0 1 0 7 M19.5 6a8.5 8.5 0 0 1 0 12" />
              </svg>
            )}
          </button>
          {screen === 'arena' && (
            <button className="btn btn-ghost btn-sm" onClick={exit}>
              Exit
            </button>
          )}
        </div>
      </header>
      {screen === 'landing' ? (
        <Landing onStart={start} modelStatus={pose.status} personalBest={loadPersonalBest()} key={pbVersion} />
      ) : (
        <Arena camera={camera} pose={pose} onExit={exit} />
      )}
    </div>
  );
}
