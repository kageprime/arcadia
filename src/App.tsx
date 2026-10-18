import React, { useEffect, useRef, useState, useCallback } from "react";
import "./styles/playglow.css";
import { SelfTest } from "./selftest/SelfTest";
import { ArcadeStage } from "./stage/ArcadeStage";
import { humController } from "./audio/hum";

class ArcadeErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.warn("[playglow] recovered from UI error:", error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div id="ui">
          <div className="wordmark">
            <i />
            playglow arcade
          </div>
          <div className="walk-prompt-box">
            <div className="say">reloading arcade environment…</div>
            <button
              type="button"
              className="pill primary"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
            >
              reload &rarr;
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();

  if (params.has("selftest")) {
    return <SelfTest />;
  }

  return (
    <ArcadeErrorBoundary>
      <ArcadeEnvironmentWalk />
    </ArcadeErrorBoundary>
  );
};

const ArcadeEnvironmentWalk: React.FC = () => {
  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<ArcadeStage | null>(null);

  const [stageReady, setStageReady] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [muted, setMuted] = useState(() => humController.isMuted());
  const [hintVisible, setHintVisible] = useState(true);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [nearbyMachine, setNearbyMachine] = useState<{
    id: string;
    name: string;
    actionLabel: string;
  } | null>(null);
  const [interactionToast, setInteractionToast] = useState<string | null>(null);
  const [lightingMood, setLightingMood] = useState<"midnight" | "sunset" | "synthwave">(
    "midnight"
  );

  // Active key state for walking
  const keysRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  });

  // Check if touch device
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsTouchDevice(
        "ontouchstart" in window ||
          navigator.maxTouchPoints > 0 ||
          window.matchMedia("(pointer: coarse)").matches
      );
    }
  }, []);

  // Initialize 3D Arcade Stage
  useEffect(() => {
    const container = stageWrapRef.current;
    if (!container) return;

    const stage = new ArcadeStage(container);
    stageRef.current = stage;

    // Configure free walk
    stage.setFreeWalk(true);
    stage.setPointerLockCallback((locked) => {
      setPointerLocked(locked);
    });

    // Listen for proximity to interactive arcade machines
    stage.setProximityCallback((info) => {
      if (info.machine) {
        setNearbyMachine({
          id: info.machine.id,
          name: info.machine.name,
          actionLabel: info.machine.actionLabel,
        });
      } else {
        setNearbyMachine(null);
      }
    });

    let disposed = false;
    stage.init().then(() => {
      if (disposed) return;
      const glCanvas = container.querySelector("canvas");
      if (glCanvas) {
        glCanvas.id = "gl";
      }

      // Ensure attract screen is running on the main cabinet CRT
      stage.useAttractScreen(true);
      stage.setFreeWalk(true);
      stage.resetWalkPosition(0, 2.4, 0, -0.04);
      stage.setLightingMood("midnight");

      // Start ambient arcade audio if not muted
      humController.ensureStarted();

      requestAnimationFrame(() => {
        if (!disposed) setStageReady(true);
      });
    });

    return () => {
      disposed = true;
      stage.destroy();
      stageRef.current = null;
    };
  }, []);

  // Update stage walk keys
  const updateWalkKeys = useCallback(() => {
    stageRef.current?.setWalkKeys(keysRef.current);
  }, []);

  // Reset camera view and position
  const handleResetPosition = useCallback(() => {
    stageRef.current?.resetWalkPosition(0, 2.4, 0, -0.04);
  }, []);

  // Toggle pointer lock
  const handleTogglePointerLock = useCallback(() => {
    if (pointerLocked) {
      stageRef.current?.exitPointerLock();
    } else {
      stageRef.current?.requestPointerLock();
    }
  }, [pointerLocked]);

  // Toggle ambient audio hum
  const handleToggleMute = useCallback(() => {
    const nextMuted = humController.toggleMute();
    setMuted(nextMuted);
  }, []);

  // Trigger interaction with nearest machine (Key E)
  const handleInteract = useCallback(() => {
    if (!stageRef.current) return;
    const feedback = stageRef.current.triggerInteraction();
    if (feedback) {
      setInteractionToast(feedback);
      setTimeout(() => {
        setInteractionToast(null);
      }, 3500);
    }
  }, []);

  // Switch room lighting mood (Midnight Neon, Sunset Dusk, Synthwave)
  const handleSwitchMood = useCallback((mood: "midnight" | "sunset" | "synthwave") => {
    setLightingMood(mood);
    stageRef.current?.setLightingMood(mood);
  }, []);

  // Global Keyboard listener for free walking
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      let changed = false;

      if (k === "e") {
        handleInteract();
      } else if (k === "w" || k === "arrowup") {
        if (!keysRef.current.forward) {
          keysRef.current.forward = true;
          changed = true;
        }
      } else if (k === "s" || k === "arrowdown") {
        if (!keysRef.current.backward) {
          keysRef.current.backward = true;
          changed = true;
        }
      } else if (k === "a" || k === "arrowleft") {
        if (!keysRef.current.left) {
          keysRef.current.left = true;
          changed = true;
        }
      } else if (k === "d" || k === "arrowright") {
        if (!keysRef.current.right) {
          keysRef.current.right = true;
          changed = true;
        }
      } else if (k === "shift") {
        if (!keysRef.current.sprint) {
          keysRef.current.sprint = true;
          changed = true;
        }
      } else if (k === "r") {
        handleResetPosition();
      }

      if (changed) {
        updateWalkKeys();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      let changed = false;

      if (k === "w" || k === "arrowup") {
        if (keysRef.current.forward) {
          keysRef.current.forward = false;
          changed = true;
        }
      } else if (k === "s" || k === "arrowdown") {
        if (keysRef.current.backward) {
          keysRef.current.backward = false;
          changed = true;
        }
      } else if (k === "a" || k === "arrowleft") {
        if (keysRef.current.left) {
          keysRef.current.left = false;
          changed = true;
        }
      } else if (k === "d" || k === "arrowright") {
        if (keysRef.current.right) {
          keysRef.current.right = false;
          changed = true;
        }
      } else if (k === "shift") {
        if (keysRef.current.sprint) {
          keysRef.current.sprint = false;
          changed = true;
        }
      }

      if (changed) {
        updateWalkKeys();
      }
    };

    const onBlur = () => {
      keysRef.current = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        sprint: false,
      };
      updateWalkKeys();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [updateWalkKeys, handleResetPosition]);

  // Touch controls for mobile / tablet devices
  const setTouchMove = (
    dir: "forward" | "backward" | "left" | "right",
    pressed: boolean
  ) => {
    keysRef.current[dir] = pressed;
    updateWalkKeys();
  };

  // Touch drag for looking around on mobile
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    // Don't hijack virtual d-pad or buttons
    if (target?.closest("button") || target?.closest(".touch-dpad")) {
      return;
    }
    const t = e.touches[0];
    if (t) {
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    stageRef.current?.applyLookDelta(dx * 0.005, dy * 0.005);
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  return (
    <>
      {/* Warm CRT Boot Loader */}
      <div
        className={`boot-loader${stageReady ? " done" : ""}`}
        aria-hidden={stageReady}
      >
        <div className="boot-loader-logo">
          <i />
          playglow arcade
        </div>
        <div className="boot-loader-bar">
          <span />
        </div>
        <div className="boot-loader-sub">entering arcade room&hellip;</div>
      </div>

      {/* Fullscreen 3D Stage Container */}
      <div
        className="stage-wrap"
        ref={stageWrapRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      />

      {/* Atmospheric UI Overlay */}
      <div id="ui" data-state="walk">
        {/* Subtle center gaze crosshair */}
        <div className="walk-reticle" aria-hidden="true" />

        {/* Wordmark in top-left */}
        <div className="wordmark">
          <i />
          arcade room
        </div>

        {/* Top-right action controls */}
        <div className="walk-top-bar">
          {/* Lighting Mood Presets */}
          <div className="lighting-mood-group" role="radiogroup" aria-label="Room lighting mood">
            <button
              type="button"
              className={`lighting-pill-opt ${lightingMood === "midnight" ? "active" : ""}`}
              onClick={() => handleSwitchMood("midnight")}
              title="Midnight Neon: blacklight carpet and glowing CRTs"
            >
              🌙 Midnight
            </button>
            <button
              type="button"
              className={`lighting-pill-opt ${lightingMood === "sunset" ? "active" : ""}`}
              onClick={() => handleSwitchMood("sunset")}
              title="Sunset: Golden hour sunlight through window"
            >
              🌇 Sunset
            </button>
            <button
              type="button"
              className={`lighting-pill-opt ${lightingMood === "synthwave" ? "active" : ""}`}
              onClick={() => handleSwitchMood("synthwave")}
              title="Synthwave: High contrast magenta and cyan rimlights"
            >
              ⚡ Synth
            </button>
          </div>

          {!isTouchDevice && (
            <button
              type="button"
              className={`walk-pill-btn${pointerLocked ? " active" : ""}`}
              onClick={handleTogglePointerLock}
              title={
                pointerLocked
                  ? "Mouse locked (Press ESC to unlock)"
                  : "Click to lock cursor for full mouse look"
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="22" y1="12" x2="18" y2="12" />
                <line x1="6" y1="12" x2="2" y2="12" />
                <line x1="12" y1="6" x2="12" y2="2" />
                <line x1="12" y1="22" x2="12" y2="18" />
              </svg>
              <span>{pointerLocked ? "Mouse Locked (ESC)" : "Lock Mouse"}</span>
            </button>
          )}

          <button
            type="button"
            className="walk-pill-btn"
            onClick={handleResetPosition}
            title="Reset position to center of the room (Key R)"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span>Reset View</span>
          </button>

          <button
            type="button"
            className="mute-btn"
            aria-label={muted ? "unmute ambient hum" : "mute ambient hum"}
            onClick={handleToggleMute}
            title={muted ? "Unmute room hum" : "Mute room hum"}
          >
            {muted ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>
        </div>

        {/* Proximity Interaction Floating Prompt (Key E) */}
        {nearbyMachine && (
          <button
            type="button"
            className="walk-interact-prompt"
            onClick={handleInteract}
            aria-label={nearbyMachine.actionLabel}
          >
            <span className="interact-key-pill">E</span>
            <div className="interact-label-group">
              <span className="interact-name">{nearbyMachine.name}</span>
              <span className="interact-action">{nearbyMachine.actionLabel}</span>
            </div>
          </button>
        )}

        {/* Retro Action Feedback Toast Banner */}
        {interactionToast && (
          <div className="arcade-toast" role="status" aria-live="assertive">
            <span>{interactionToast}</span>
          </div>
        )}

        {/* Bottom hint banner: walking and camera look controls */}
        {hintVisible && (
          <div className="walk-bottom-hud" role="status" aria-live="polite">
            <div className="walk-hint-pill">
              <span className="walk-keys-group">
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd>
              </span>
              <span className="walk-hint-text">
                {pointerLocked
                  ? "Move mouse to look around · Shift sprint · E interact · ESC unlock"
                  : isTouchDevice
                  ? "Use D-Pad to walk · Drag to look around · Tap E to interact"
                  : "Walk freely · Drag or click to look around · E interact · Shift sprint · R reset"}
              </span>
              <button
                type="button"
                className="walk-hint-close"
                onClick={() => setHintVisible(false)}
                aria-label="dismiss hint"
                title="Dismiss"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {/* Mobile touch controls for walking */}
        {isTouchDevice && (
          <div className="touch-controls walk-touch-controls">
            <div className="touch-dpad">
              <button
                type="button"
                className="up"
                aria-label="walk forward"
                onPointerDown={() => setTouchMove("forward", true)}
                onPointerUp={() => setTouchMove("forward", false)}
                onPointerLeave={() => setTouchMove("forward", false)}
              >
                ▲
              </button>
              <button
                type="button"
                className="down"
                aria-label="walk backward"
                onPointerDown={() => setTouchMove("backward", true)}
                onPointerUp={() => setTouchMove("backward", false)}
                onPointerLeave={() => setTouchMove("backward", false)}
              >
                ▼
              </button>
              <button
                type="button"
                className="left"
                aria-label="strafe left"
                onPointerDown={() => setTouchMove("left", true)}
                onPointerUp={() => setTouchMove("left", false)}
                onPointerLeave={() => setTouchMove("left", false)}
              >
                ◀
              </button>
              <button
                type="button"
                className="right"
                aria-label="strafe right"
                onPointerDown={() => setTouchMove("right", true)}
                onPointerUp={() => setTouchMove("right", false)}
                onPointerLeave={() => setTouchMove("right", false)}
              >
                ▶
              </button>
            </div>

            {/* Mobile Interaction E Button */}
            <button
              type="button"
              className="touch-action-btn"
              onClick={handleInteract}
              aria-label="Interact with nearby machine"
            >
              <span>ACTION</span>
              E
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default App;
