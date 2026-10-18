import React, { useEffect, useRef, useState, useCallback } from "react";
import "./styles/playglow.css";
import { SelfTest } from "./selftest/SelfTest";
import { ArcadeStage } from "./stage/ArcadeStage";
import { humController } from "./audio/hum";
import {
  multiplayerClient,
  type MultiplayerSnapshot,
} from "./net/multiplayerClient";

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

  // Social & Cabinet Game States
  const [activeCabinetGame, setActiveCabinetGame] = useState<"chess" | null>(null);
  const [showEmoteDock, setShowEmoteDock] = useState(false);
  const [customEmoteText, setCustomEmoteText] = useState("");
  const [mpSnapshot, setMpSnapshot] = useState<MultiplayerSnapshot>(() =>
    multiplayerClient.getSnapshot()
  );
  const [emoteToast, setEmoteToast] = useState<{
    id: string;
    name: string;
    text: string;
    emoji?: string;
  } | null>(null);

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

  // Connect and sync real-time multiplayer visitors
  useEffect(() => {
    multiplayerClient.connect();
    const unsubSnap = multiplayerClient.subscribe((snap) => {
      setMpSnapshot(snap);
    });

    const unsubEmote = multiplayerClient.onEmote((data) => {
      setEmoteToast(data);
      setTimeout(() => {
        setEmoteToast((prev) => (prev?.id === data.id && prev?.text === data.text ? null : prev));
      }, 4200);
    });

    // 15 Hz position & avatar synchronization
    const syncInterval = setInterval(() => {
      if (!stageRef.current) return;
      const walkState = stageRef.current.getWalkState();
      multiplayerClient.updatePosition(walkState.x, walkState.z, walkState.yaw, "walk");
      const visitorsList = Array.from(multiplayerClient.visitors.values());
      stageRef.current.syncWalkVisitors(
        { x: walkState.x, z: walkState.z, yaw: walkState.yaw },
        visitorsList,
        true
      );
    }, 66);

    return () => {
      unsubSnap();
      unsubEmote();
      clearInterval(syncInterval);
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

  // Launch Pixel Chess inside arcade CRT bezel overlay
  const handleLaunchChess = useCallback(() => {
    humController.playArcadeCoin();
    setActiveCabinetGame("chess");
    stageRef.current?.dollyToCabinet("pixel_chess");
  }, []);

  // Step back from arcade cabinet into free walk
  const handleExitCabinet = useCallback(() => {
    setActiveCabinetGame(null);
    stageRef.current?.exitCabinetView();
  }, []);

  // Send speech bubble emote in room
  const handleSendEmote = useCallback((text: string, emoji?: string) => {
    multiplayerClient.sendEmote(text, emoji);
    humController.playFootstep();
    setShowEmoteDock(false);
  }, []);

  // Trigger interaction with nearest machine (Key E)
  const handleInteract = useCallback(() => {
    if (!stageRef.current) return;
    if (nearbyMachine?.id === "pixel_chess") {
      handleLaunchChess();
      return;
    }
    const feedback = stageRef.current.triggerInteraction();
    if (feedback) {
      if (feedback.toLowerCase().includes("pixel chess")) {
        handleLaunchChess();
      } else {
        setInteractionToast(feedback);
        setTimeout(() => {
          setInteractionToast(null);
        }, 3500);
      }
    }
  }, [nearbyMachine, handleLaunchChess]);

  // Switch room lighting mood (Midnight Neon, Sunset Dusk, Synthwave)
  const handleSwitchMood = useCallback((mood: "midnight" | "sunset" | "synthwave") => {
    setLightingMood(mood);
    stageRef.current?.setLightingMood(mood);
  }, []);

  // Global Keyboard listener for free walking, cabinet exits, and emotes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in chat/emote text box
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;

      const k = e.key.toLowerCase();
      let changed = false;

      if (e.key === "Escape") {
        if (activeCabinetGame) {
          handleExitCabinet();
          return;
        }
        if (showEmoteDock) {
          setShowEmoteDock(false);
          return;
        }
      }

      if (k === "c") {
        setShowEmoteDock((prev) => !prev);
        return;
      }

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
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;

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
  }, [
    updateWalkKeys,
    handleResetPosition,
    handleInteract,
    handleExitCabinet,
    activeCabinetGame,
    showEmoteDock,
  ]);

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
    if (
      target?.closest("button") ||
      target?.closest(".touch-dpad") ||
      target?.closest(".cabinet-bezel-modal") ||
      target?.closest(".quick-emote-dock")
    ) {
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

  // Total online users (remote connected players + simulated retro arcade patrons)
  const totalOnline =
    (mpSnapshot?.visitors?.length || 1) +
    (stageRef.current?.getActivePatronCount() || 3);

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
        {/* Center crosshair */}
        <div className="walk-reticle" aria-hidden="true" />

        {/* Wordmark & Live Online Presence */}
        <div className="wordmark-group">
          <div className="wordmark">
            <i />
            arcade room
          </div>
          <div className="online-presence-badge" title="Live players and retro patrons in the arcade">
            <span className="pulse-green-dot" />
            <span className="online-count-text">{totalOnline} IN ROOM</span>
          </div>
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

          {/* Quick Emotes Button */}
          <button
            type="button"
            className={`walk-pill-btn ${showEmoteDock ? "active" : ""}`}
            onClick={() => setShowEmoteDock((prev) => !prev)}
            title="Open Emote & Shout Menu (Key C)"
          >
            💬 <span>Emotes (C)</span>
          </button>

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

        {/* Quick Emote Dock Popover (Key C) */}
        {showEmoteDock && (
          <div className="quick-emote-dock" role="menu" aria-label="Social Emotes Menu">
            <div className="emote-dock-header">
              <span className="dock-title">💬 ARCADE SHOUTOUTS</span>
              <button
                type="button"
                className="dock-close-btn"
                onClick={() => setShowEmoteDock(false)}
                title="Close (ESC)"
              >
                &times;
              </button>
            </div>
            <div className="emote-preset-grid">
              {[
                { emoji: "👑", text: "Checkmate!" },
                { emoji: "🕹️", text: "GG!" },
                { emoji: "⚡", text: "Match?" },
                { emoji: "🔥", text: "Nice moves!" },
                { emoji: "🥤", text: "Snack break!" },
                { emoji: "🪙", text: "Got tokens!" },
              ].map((opt) => (
                <button
                  key={opt.text}
                  type="button"
                  className="emote-preset-pill"
                  onClick={() => handleSendEmote(opt.text, opt.emoji)}
                >
                  <span className="emote-icon">{opt.emoji}</span>
                  <span className="emote-label">{opt.text}</span>
                </button>
              ))}
            </div>
            <form
              className="custom-emote-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (customEmoteText.trim()) {
                  handleSendEmote(customEmoteText.trim(), "💬");
                  setCustomEmoteText("");
                }
              }}
            >
              <input
                type="text"
                className="custom-emote-input"
                placeholder="Type custom shoutout… [Enter]"
                maxLength={48}
                value={customEmoteText}
                onChange={(e) => setCustomEmoteText(e.target.value)}
              />
              <button type="submit" className="custom-emote-send">
                SEND
              </button>
            </form>
          </div>
        )}

        {/* Floating Social Emote Banner Toast */}
        {emoteToast && (
          <div className="emote-toast-banner" role="status" aria-live="polite">
            <span className="emote-sender">{emoteToast.name}:</span>
            <span className="emote-text">
              {emoteToast.emoji} {emoteToast.text}
            </span>
          </div>
        )}

        {/* Proximity Interaction Floating Prompt (Key E) */}
        {nearbyMachine && !activeCabinetGame && (
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

        {/* Dedicated Pixel Chess Cabinet CRT Bezel Overlay */}
        {activeCabinetGame === "chess" && (
          <div
            className="cabinet-bezel-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Pixel Chess Arcade Cabinet"
          >
            <div className="cabinet-bezel-frame">
              {/* Backlit Arcade Marquee Header */}
              <div className="bezel-top-marquee">
                <div className="marquee-glow-badge">
                  <span className="marquee-crown">♚</span>
                  <span className="marquee-title">PIXEL CHESS</span>
                  <span className="marquee-edition">1992 TOURNAMENT ROM</span>
                </div>
                <div className="bezel-top-actions">
                  <a
                    href="https://chessnuts-nine.vercel.app/chess/index.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bezel-link-btn"
                    title="Open game in popout window"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    <span>POPOUT</span>
                  </a>
                  <button
                    type="button"
                    className="bezel-exit-btn"
                    onClick={handleExitCabinet}
                    title="Step back to arcade free walk (ESC)"
                  >
                    <span>EXIT CABINET [ESC]</span>
                    &times;
                  </button>
                </div>
              </div>

              {/* CRT Monitor Bezel & Live Iframe Game */}
              <div className="bezel-crt-screen-holder">
                <div className="crt-scanline-overlay" />
                <div className="crt-glare-overlay" />
                <iframe
                  src="https://chessnuts-nine.vercel.app/chess/index.html"
                  title="Pixel Chess Arcade Game"
                  className="pixel-chess-iframe"
                  allow="autoplay; encrypted-media; fullscreen"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>

              {/* Bottom Arcade Control Deck Strip */}
              <div className="bezel-bottom-bar">
                <div className="bezel-deck-info">
                  <span className="deck-coin-indicator">🪙 CREDITS: 02</span>
                  <span className="deck-author-tag">
                    PIXEL CHESS BY KAGEPRIME · ARCADE LINKED
                  </span>
                </div>
                <div className="bezel-deck-hints">
                  <button
                    type="button"
                    className="bezel-step-back-btn"
                    onClick={handleExitCabinet}
                  >
                    <kbd className="bezel-kbd">ESC</kbd>
                    <span>Step Back Into Room</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Retro Action Feedback Toast Banner */}
        {interactionToast && (
          <div className="arcade-toast" role="status" aria-live="assertive">
            <span>{interactionToast}</span>
          </div>
        )}

        {/* Bottom hint banner: walking and camera look controls */}
        {hintVisible && !activeCabinetGame && (
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
                  ? "Move mouse to look · Shift sprint · E interact · C emotes · ESC unlock"
                  : isTouchDevice
                  ? "Use D-Pad to walk · Drag to look around · Tap E to interact · Tap C for emotes"
                  : "Walk freely · Drag or click to look around · E interact · C emotes · Shift sprint · R reset"}
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
        {isTouchDevice && !activeCabinetGame && (
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
