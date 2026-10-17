import React, { useEffect, useRef, useState, useCallback } from "react";
import RAPIER from "@dimforge/rapier3d-compat";
import "../../styles/ludo.css";
import { Stage } from "./render";
import { DieTray } from "./dicetray";
import {
  newGame,
  rollDie,
  applyMove,
  passTurn,
  homeCount,
  type SeatType,
  type LudoState,
  type LudoMove,
} from "./rules";
import { chooseMove, type CpuDiff } from "./ai";
import { COLOR_NAMES, COLOR_CSS, P_HOME } from "./board";
import { Sound } from "./audio";
import { CAM_LABEL, type LudoCamMode } from "./cameras";
import { mulberry32 } from "./rng";
import {
  mpClient,
  type MultiplayerLobby,
  type LudoNetworkAction,
} from "../../net/multiplayerClient";

export type ScreenPresentationMode =
  | "room"
  | "crt-zoom"
  | "bezel"
  | "fullscreen";

export type LudoPresentationMode = ScreenPresentationMode;

export interface LudoViewProps {
  presentation: ScreenPresentationMode;
  muted?: boolean;
  onlineLobby?: MultiplayerLobby | null;
  onOpenMultiplayerModal?: () => void;
  onOpenMultiplayer?: () => void;
  onChangePresentation?: (mode: ScreenPresentationMode) => void;
  onSwitchGame?: () => void;
  onWalkRoom?: () => void;
  onFrameCanvas?: (canvas: HTMLCanvasElement) => void;
  onCabinetFx?: (kind: string, intensity?: number) => void;
  onScoreUpdate?: (winsOrProgress: number) => void;
}

const DIFFS: readonly CpuDiff[] = ["easy", "normal", "hard"];
const PRESETS: Record<string, SeatType[]> = {
  cpu: ["human", "cpu", "cpu", "cpu"],
  duel: ["human", "off", "cpu", "off"],
  local: ["human", "off", "human", "off"],
  four: ["human", "human", "human", "human"],
  watch: ["cpu", "cpu", "cpu", "cpu"],
};

class CancelError extends Error {}

const dedupeMoves = (moves: LudoMove[]): LudoMove[] => {
  const seen = new Set<string | number>();
  return moves.filter((m) => {
    const k = m.enters ? "in" : m.token;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

let rapierInitPromise: Promise<void> | null = null;
function ensureRapier(): Promise<void> {
  if (!rapierInitPromise) {
    rapierInitPromise = RAPIER.init();
  }
  return rapierInitPromise;
}

export const LudoView: React.FC<LudoViewProps> = ({
  presentation,
  muted,
  onlineLobby,
  onOpenMultiplayerModal,
  onFrameCanvas,
  onCabinetFx,
  onScoreUpdate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<Stage | null>(null);
  const trayRef = useRef<DieTray | null>(null);
  const audioRef = useRef<Sound>(new Sound());
  const hudCompositeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [ready, setReady] = useState(false);
  const [uiMode, setUiMode] = useState<"menu" | "play" | "over">("menu");
  const [paused, setPaused] = useState(false);
  const [seats, setSeats] = useState<SeatType[]>([
    "human",
    "cpu",
    "cpu",
    "cpu",
  ]);
  const [seatNames, setSeatNames] = useState<string[]>([
    "YOU",
    "CPU GREEN",
    "CPU YELLOW",
    "CPU BLUE",
  ]);
  const [cpuDiff, setCpuDiff] = useState<CpuDiff>("normal");
  const [camMode, setCamMode] = useState<LudoCamMode>("auto");
  const [fastSpeed, setFastSpeed] = useState(false);
  const [scanlinesOn, setScanlinesOn] = useState(true);

  // Active game snapshot for React HUD
  const [gameSnap, setGameSnap] = useState<{
    turn: number;
    phase: string;
    tokens: number[][];
    seats: SeatType[];
    winner: number | null;
    stats: Array<{ captures: number; captured: number; sixes: number }>;
    canRoll: boolean;
    pickMoves: LudoMove[];
    dieShown: number;
    dieColor: string;
  }>({
    turn: 0,
    phase: "roll",
    tokens: [
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
    ],
    seats: ["human", "cpu", "cpu", "cpu"],
    winner: null,
    stats: [
      { captures: 0, captured: 0, sixes: 0 },
      { captures: 0, captured: 0, sixes: 0 },
      { captures: 0, captured: 0, sixes: 0 },
      { captures: 0, captured: 0, sixes: 0 },
    ],
    canRoll: false,
    pickMoves: [],
    dieShown: 0,
    dieColor: COLOR_CSS[0],
  });

  const [chargePct, setChargePct] = useState<number | null>(null);
  const [flashBanner, setFlashBanner] = useState<{
    title: string;
    sub: string;
    color: string;
  } | null>(null);
  const [projectedTags, setProjectedTags] = useState<
    Array<{ token: number; label: string; x: number; y: number; move: LudoMove }>
  >([]);
  const [projectedDie, setProjectedDie] = useState<{
    face: number;
    x: number;
    y: number;
    color: string;
  } | null>(null);

  // Mutable controller state (mirrors original G object cleanly)
  const ctrlRef = useRef<{
    st: LudoState | null;
    mode: "menu" | "play" | "over";
    paused: boolean;
    run: number;
    speed: number;
    clock: number;
    timers: Array<{ t: number; res: () => void; rej: (e: any) => void }>;
    waits: Array<{
      fn: () => boolean;
      res: () => void;
      rej: (e: any) => void;
    }>;
    rollReq: { power: number; rollSeed?: number; forcedFace?: number } | null;
    charge: { t: number } | null;
    canRoll: boolean;
    pickMoves: LudoMove[] | null;
    pickResolve: ((m: LudoMove) => void) | null;
    lastRollColor: number;
    menuOrbit: boolean;
    flashT: number;
    isOnline: boolean;
    localSeatIndices: Set<number>;
    isHost: boolean;
    remoteActionQueue: LudoNetworkAction[];
  }>({
    st: null,
    mode: "menu",
    paused: false,
    run: 0,
    speed: 1,
    clock: 0,
    timers: [],
    waits: [],
    rollReq: null,
    charge: null,
    canRoll: false,
    pickMoves: null,
    pickResolve: null,
    lastRollColor: 0,
    menuOrbit: true,
    flashT: 0,
    isOnline: false,
    localSeatIndices: new Set([0]),
    isHost: true,
    remoteActionQueue: [],
  });

  useEffect(() => {
    audioRef.current.setMuted(Boolean(muted));
  }, [muted]);

  const triggerFlash = useCallback(
    (title: string, sub = "", color = "#ffb84a") => {
      setFlashBanner({ title, sub, color });
      ctrlRef.current.flashT = 1.65;
    },
    []
  );

  const syncReactHud = useCallback(() => {
    const c = ctrlRef.current;
    const s = c.st;
    if (!s) return;
    const tray = trayRef.current;
    const shown =
      tray && (tray.phase === "ready" || tray.phase === "tidy")
        ? tray.face || tray._tween?.face || 0
        : 0;
    setGameSnap({
      turn: s.turn,
      phase: s.phase,
      tokens: s.tokens.map((r) => [...r]),
      seats: [...s.seats],
      winner: s.winner,
      stats: s.stats.map((st) => ({ ...st })),
      canRoll: c.canRoll,
      pickMoves: c.pickMoves ? [...c.pickMoves] : [],
      dieShown: shown,
      dieColor: COLOR_CSS[c.lastRollColor ?? s.turn],
    });
  }, []);

  const cancelAllTimers = useCallback(() => {
    const c = ctrlRef.current;
    for (const x of [...c.timers, ...c.waits]) {
      x.rej(new CancelError());
    }
    c.timers = [];
    c.waits = [];
  }, []);

  const sleep = useCallback((sec: number): Promise<void> => {
    return new Promise((res, rej) => {
      ctrlRef.current.timers.push({ t: sec, res, rej });
    });
  }, []);

  const until = useCallback((fn: () => boolean): Promise<void> => {
    return new Promise((res, rej) => {
      ctrlRef.current.waits.push({ fn, res, rej });
    });
  }, []);

  const startGame = useCallback(
    (opts?: {
      customSeats?: SeatType[];
      customDiff?: CpuDiff;
      customSeed?: number;
      onlineLobby?: MultiplayerLobby | null;
    }) => {
      const stage = stageRef.current;
      if (!stage) return;
      const c = ctrlRef.current;
      c.run++;
      cancelAllTimers();

      const activeLobby = opts?.onlineLobby ?? onlineLobby;
      const baseSeed =
        opts?.customSeed ??
        activeLobby?.seed ??
        ((Math.random() * 1e9) >>> 0);

      trayRef.current?.dispose();
      trayRef.current = new DieTray(RAPIER, { seed: (baseSeed + 7919) | 0 });
      const rng = mulberry32((baseSeed ^ 2654435761) >>> 0);

      let chosenSeats = [...(opts?.customSeats || seats)];
      let chosenDiff = opts?.customDiff || cpuDiff;
      let names = ["YOU", "GREEN", "YELLOW", "BLUE"];

      if (activeLobby && activeLobby.mode === "playing") {
        c.isOnline = true;
        c.isHost = activeLobby.hostId === mpClient.selfId;
        c.localSeatIndices = new Set();
        c.remoteActionQueue = [];
        chosenDiff = activeLobby.cpuDiff;
        chosenSeats = [
          activeLobby.fillCpu ? "cpu" : "off",
          activeLobby.fillCpu ? "cpu" : "off",
          activeLobby.fillCpu ? "cpu" : "off",
          activeLobby.fillCpu ? "cpu" : "off",
        ];
        names = ["CPU RED", "CPU GREEN", "CPU YELLOW", "CPU BLUE"];

        for (const p of activeLobby.players) {
          const sIdx = p.seatIndex % 4;
          chosenSeats[sIdx] = "human";
          names[sIdx] = p.id === mpClient.selfId ? `${p.name} (YOU)` : p.name;
          if (p.id === mpClient.selfId) {
            c.localSeatIndices.add(sIdx);
          }
        }
        if (chosenSeats.filter((x) => x !== "off").length < 2) {
          chosenSeats[1] = "cpu";
        }
      } else {
        c.isOnline = false;
        c.isHost = true;
        c.localSeatIndices = new Set([0, 1, 2, 3]);
        const humans = chosenSeats.filter((s) => s === "human").length;
        names = chosenSeats.map((s, i) =>
          s === "off"
            ? "EMPTY"
            : s === "cpu"
            ? `CPU ${COLOR_NAMES[i].toUpperCase()}`
            : humans === 1
            ? "YOU"
            : `P${i + 1} ${COLOR_NAMES[i].toUpperCase()}`
        );
      }

      setSeats(chosenSeats);
      setSeatNames(names);
      setCpuDiff(chosenDiff);

      const activeColors = chosenSeats
        .map((s, i) => (s !== "off" ? i : -1))
        .filter((i) => i >= 0);
      const firstSeat = activeColors[Math.floor(rng() * activeColors.length)];
      c.st = newGame(chosenSeats, firstSeat);
      c.mode = "play";
      c.paused = false;
      c.pickMoves = null;
      c.pickResolve = null;
      c.canRoll = false;
      c.charge = null;
      c.rollReq = null;
      setUiMode("play");
      setPaused(false);
      setFlashBanner(null);

      stage.setAllP(c.st.tokens);
      stage.setSelectable([]);
      stage.setActive(activeColors);
      stage.setDie(null);
      if (stage.rig.mode === "orbit" && c.menuOrbit) {
        stage.rig.set("auto");
        setCamMode("auto");
      }
      stage.phase = "roll";
      audioRef.current.play("turn");
      syncReactHud();

      const myRun = c.run;

      const throwAndRead = async (
        power: number,
        rollSeed?: number,
        forcedFace?: number
      ): Promise<number> => {
        const tray = trayRef.current!;
        setProjectedDie(null);
        tray.throwDie(power, { rollSeed, forcedFace });
        audioRef.current.play("throw");
        onCabinetFx?.("shake", 0.35);
        stage.phase = "roll";
        await until(() => tray.phase === "ready");
        return tray.face;
      };

      const doMove = async (m: LudoMove) => {
        const s = c.st!;
        const col = m.color;
        await stage.movePawn(col, m.token, m.from, m.to);
        const r = applyMove(s, m);
        audioRef.current.play("place");

        if (m.captures.length) {
          audioRef.current.play("capture");
          stage.doFlash(0xff3020, 0.3);
          onCabinetFx?.("hit", 0.8);
          triggerFlash(
            "CAPTURED!",
            `${COLOR_NAMES[col]} sends ${m.captures
              .map((v) => COLOR_NAMES[v.color])
              .join(" & ")} back to yard`,
            "#ff6a5a"
          );
          await Promise.all(
            m.captures.map((v) => stage.sendHome(v.color, v.token))
          );
        }
        if (m.finishes) {
          audioRef.current.play("home");
          onCabinetFx?.("powerup", 0.7);
          if (!r.won) triggerFlash("HOME!", "Pawn reached home triangle", "#5fe08a");
        }

        // Report progress score to arcade leaderboard
        const humanHomes = homeCount(s, 0) * 250 + s.stats[0].captures * 100;
        onScoreUpdate?.(humanHomes);

        syncReactHud();
        if (r.won) {
          audioRef.current.play("win");
          onCabinetFx?.("win", 1.0);
          triggerFlash(
            `${COLOR_NAMES[col].toUpperCase()} WINS!`,
            "",
            COLOR_CSS[col]
          );
          return;
        }
        if (r.bonus) {
          if (!m.captures.length && !m.finishes) {
            triggerFlash(
              "ROLL AGAIN",
              s.die === 6 ? "Rolled a Six!" : "",
              "#ffb84a"
            );
          }
          await sleep(0.55);
        } else {
          await sleep(0.25);
        }
      };

      const runLoop = async () => {
        const s = c.st!;
        stage.onHop = (step) => audioRef.current.play("hop", { step });

        while (s.phase !== "over" && c.run === myRun) {
          const seat = s.seats[s.turn];
          const isLocalTurn =
            !c.isOnline ? seat === "human" : c.localSeatIndices.has(s.turn);
          const isCpuAutomated =
            seat === "cpu" && (!c.isOnline || c.isHost);

          stage.setTurnColor(s.turn);
          stage.phase = "roll";
          syncReactHud();

          if (s.phase === "roll") {
            let power = 0.6;
            let rollSeed = ((Math.random() * 1e9) >>> 0) || 17;
            let forcedFace: number | undefined;

            if (isLocalTurn) {
              c.canRoll = true;
              c.rollReq = null;
              syncReactHud();
              await until(() => c.rollReq != null);
              power = c.rollReq!.power;
              rollSeed = c.rollReq!.rollSeed ?? rollSeed;
              c.canRoll = false;
              syncReactHud();
              if (c.isOnline) {
                mpClient.sendLudoAction({
                  kind: "throw",
                  turn: s.turn,
                  power,
                  rollSeed,
                });
              }
            } else if (isCpuAutomated) {
              await sleep(0.75);
              power = 0.45 + rng() * 0.55;
              rollSeed = (rng.state() ^ (s.turns * 4099)) >>> 0;
              if (c.isOnline) {
                mpClient.sendLudoAction({
                  kind: "throw",
                  turn: s.turn,
                  power,
                  rollSeed,
                });
              }
            } else {
              // Waiting for remote online player or host CPU throw
              await until(
                () =>
                  c.remoteActionQueue.length > 0 &&
                  c.remoteActionQueue[0].kind === "throw"
              );
              const act = c.remoteActionQueue.shift() as Extract<
                LudoNetworkAction,
                { kind: "throw" }
              >;
              power = act.power;
              rollSeed = act.rollSeed;
              forcedFace = act.forcedFace;
            }

            const face = await throwAndRead(power, rollSeed, forcedFace);
            await sleep(0.3);
            const ph = rollDie(s, face);
            c.lastRollColor = s.turn;
            syncReactHud();

            if (face === 6 && ph !== "forfeit") {
              audioRef.current.play("six");
              onCabinetFx?.("score", 0.5);
            }
            if (ph === "forfeit") {
              triggerFlash("THREE SIXES!", "Turn forfeited", "#ff6a5a");
              audioRef.current.play("nomove");
              stage.doFlash(0xff3020, 0.25);
              await sleep(1.7);
              passTurn(s);
              continue;
            }
            if (ph === "nomove") {
              triggerFlash(
                "NO LEGAL MOVE",
                face === 6 ? "" : "Roll a 6 to leave the yard",
                "#8d92a8"
              );
              audioRef.current.play("nomove");
              await sleep(1.3);
              passTurn(s);
              continue;
            }
          }

          if (s.phase === "pick") {
            await sleep(0.55);
            stage.phase = "play";
            const moves = dedupeMoves(s.moves);
            let chosen: LudoMove;

            if (moves.length === 1) {
              stage.setSelectable(moves);
              c.pickMoves = null;
              syncReactHud();
              await sleep(0.65);
              chosen = moves[0];
            } else if (isLocalTurn) {
              c.pickMoves = moves;
              stage.setSelectable(moves);
              syncReactHud();
              chosen = await new Promise<LudoMove>((res, rej) => {
                c.pickResolve = res;
                c.timers.push({ t: 1e9, res: () => {}, rej });
              });
              if (c.isOnline) {
                mpClient.sendLudoAction({
                  kind: "move",
                  turn: s.turn,
                  token: chosen.token,
                });
              }
            } else if (isCpuAutomated) {
              stage.setSelectable(moves);
              syncReactHud();
              await sleep(0.85);
              chosen = chooseMove(s, s.moves, chosenDiff, rng);
              if (c.isOnline) {
                mpClient.sendLudoAction({
                  kind: "move",
                  turn: s.turn,
                  token: chosen.token,
                });
              }
            } else {
              stage.setSelectable(moves);
              syncReactHud();
              await until(
                () =>
                  c.remoteActionQueue.length > 0 &&
                  c.remoteActionQueue[0].kind === "move"
              );
              const act = c.remoteActionQueue.shift() as Extract<
                LudoNetworkAction,
                { kind: "move" }
              >;
              chosen =
                s.moves.find((m) => m.token === act.token) || moves[0];
            }

            c.pickMoves = null;
            c.pickResolve = null;
            stage.setSelectable([]);
            stage.setHover(-1, -1);
            syncReactHud();
            await doMove(chosen);
          }
        }

        if (c.run === myRun) {
          await sleep(0.9);
          c.mode = "over";
          setUiMode("over");
          syncReactHud();
        }
      };

      runLoop().catch((err) => {
        if (!(err instanceof CancelError)) {
          console.error("[Ludo] loop error:", err);
        }
      });
    },
    [
      onlineLobby,
      seats,
      cpuDiff,
      cancelAllTimers,
      syncReactHud,
      until,
      sleep,
      triggerFlash,
      onCabinetFx,
      onScoreUpdate,
    ]
  );

  // Listen for online multiplayer Ludo actions & lobby start
  useEffect(() => {
    const unsubAction = mpClient.onLudoAction((senderId, action) => {
      if (senderId === mpClient.selfId) return;
      if (action.kind === "rematch") {
        startGame({ customSeed: action.seed, onlineLobby });
        return;
      }
      ctrlRef.current.remoteActionQueue.push(action);
    });
    const unsubStart = mpClient.onLobbyStart((lobby) => {
      if (lobby.gameId === "house_ludo") {
        startGame({ onlineLobby: lobby, customSeed: lobby.seed });
      }
    });
    return () => {
      unsubAction();
      unsubStart();
    };
  }, [startGame, onlineLobby]);

  // Auto-start if launched with an active playing onlineLobby
  useEffect(() => {
    if (ready && onlineLobby && onlineLobby.mode === "playing") {
      startGame({ onlineLobby, customSeed: onlineLobby.seed });
    }
  }, [ready, onlineLobby, startGame]);

  // Charge & release dice throw
  const chargeStart = useCallback(() => {
    const c = ctrlRef.current;
    if (!c.canRoll || c.charge || c.paused) return;
    audioRef.current.unlock();
    c.charge = { t: 0 };
    setChargePct(0.05);
  }, []);

  const chargeRelease = useCallback(() => {
    const c = ctrlRef.current;
    if (!c.charge) return;
    const p = 0.22 + 0.78 * Math.min(1, c.charge.t / 0.9);
    c.charge = null;
    setChargePct(null);
    if (c.canRoll) {
      c.rollReq = {
        power: p,
        rollSeed: ((Math.random() * 1e9) >>> 0) || 42,
      };
      c.canRoll = false;
      syncReactHud();
    }
  }, [syncReactHud]);

  const chooseTokenMove = useCallback((tok: number) => {
    const c = ctrlRef.current;
    const ms = c.pickMoves;
    if (!ms || !c.st || !c.pickResolve) return;
    let found = ms.find((m) => m.token === tok) || null;
    if (!found && c.st.tokens[c.st.turn][tok] === -1) {
      found = ms.find((m) => m.enters) || null;
    }
    if (!found) return;
    const resolve = c.pickResolve;
    c.pickResolve = null;
    audioRef.current.play("pick");
    resolve(found);
  }, []);

  // Initialize Rapier + Three.js Stage + Animation Loop
  useEffect(() => {
    let disposed = false;
    let rafId = 0;

    ensureRapier().then(() => {
      if (disposed || !canvasRef.current) return;
      const stage = new Stage(canvasRef.current).init();
      stageRef.current = stage;
      stage.setAllP([
        [-1, -1, -1, -1],
        [-1, -1, -1, -1],
        [-1, -1, -1, -1],
        [-1, -1, -1, -1],
      ]);
      stage.setActive([0, 1, 2, 3]);
      setReady(true);

      let last = performance.now();
      let lastHits = 0;
      let lastPhase = "idle";

      const tick = (now: number) => {
        if (disposed) return;
        rafId = requestAnimationFrame(tick);
        const raw = Math.min(0.05, (now - last) / 1000);
        last = now;
        const c = ctrlRef.current;
        const dt = c.paused ? 0 : raw * c.speed;
        c.clock += dt;

        if (c.mode === "menu") {
          const o = stage.rig.orbit;
          stage.rig.mode = "orbit";
          c.menuOrbit = true;
          o.yaw = Math.sin(c.clock * 0.18) * 0.55;
          o.pitch = 0.78;
          o.dist = 1.55;
        } else if (c.menuOrbit) {
          c.menuOrbit = false;
          stage.rig.mode = "auto";
        }

        // Advance game-time promises
        for (const x of c.timers) x.t -= dt;
        const due = c.timers.filter((x) => x.t <= 0);
        c.timers = c.timers.filter((x) => x.t > 0);
        due.forEach((x) => x.res());

        const readyWaits = c.waits.filter((x) => x.fn());
        c.waits = c.waits.filter((x) => !x.fn());
        readyWaits.forEach((x) => x.res());

        // Power bar charging
        if (c.charge && !c.paused) {
          c.charge.t += raw;
          const u = Math.min(1, c.charge.t / 0.9);
          setChargePct(u);
          if (c.charge.t > 1.6) {
            chargeRelease();
          }
        }

        // Step Rapier die physics
        const tray = trayRef.current;
        if (tray) {
          tray.step(dt);
          stage.setDie(tray.snapshot());
          if (tray.hits > lastHits) {
            audioRef.current.play("hit", { gain: 0.8 });
          }
          lastHits = tray.hits;
          if (lastPhase === "rolling" && tray.phase === "tidy") {
            audioRef.current.play("land");
          }
          lastPhase = tray.phase;
        }

        if (c.flashT > 0) {
          c.flashT -= raw;
          if (c.flashT <= 0) setFlashBanner(null);
        }

        stage.update(c.paused ? 0 : raw);
        stage.render();

        // Project 3D pawn tags & die face callout when in full/bezel mode
        if (c.mode === "play" && !c.paused && c.st) {
          const ms = c.pickMoves || [];
          const nextTags = ms
            .map((m) => {
              const pw = stage.pawn(m.color, m.token);
              const proj = stage.project(
                pw.grp.position.clone().add({ x: 0, y: 0.08, z: 0 } as any)
              );
              if (!proj.ok) return null;
              return {
                token: m.token,
                label: String(m.token + 1),
                x: Math.round(proj.x),
                y: Math.round(proj.y),
                move: m,
              };
            })
            .filter(Boolean) as Array<{
            token: number;
            label: string;
            x: number;
            y: number;
            move: LudoMove;
          }>;
          setProjectedTags(nextTags);

          const shown =
            tray && (tray.phase === "ready" || tray.phase === "tidy")
              ? tray.face || tray._tween?.face || 0
              : 0;
          if (shown) {
            const snap = tray!.snapshot();
            const p = stage.project(stage.trayLocal(snap.x, 0.1, snap.z));
            if (p.ok) {
              setProjectedDie({
                face: shown,
                x: Math.round(p.x),
                y: Math.round(p.y),
                color: COLOR_CSS[c.lastRollColor ?? c.st.turn],
              });
            }
          } else {
            setProjectedDie(null);
          }
        } else {
          setProjectedTags([]);
          setProjectedDie(null);
        }

        // Stream composite frame (3D WebGL + CRT HUD overlay) to the 3D Arcade Cabinet CRT when in room / crt-zoom presentation
        if (onFrameCanvas && stage.canvas.width > 0 && stage.canvas.height > 0) {
          let comp = hudCompositeCanvasRef.current;
          if (!comp) {
            comp = document.createElement("canvas");
            comp.width = 320;
            comp.height = 200;
            hudCompositeCanvasRef.current = comp;
          }
          const ctx = comp.getContext("2d");
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(stage.canvas, 0, 0, 320, 200);
            if (c.st && c.mode === "play") {
              // Crisp mini HUD bar at top of cabinet CRT screen
              ctx.fillStyle = "rgba(10, 7, 15, 0.82)";
              ctx.fillRect(0, 0, 320, 20);
              ctx.fillStyle = COLOR_CSS[c.st.turn];
              ctx.fillRect(6, 4, 12, 12);
              ctx.fillStyle = "#FFF1E8";
              ctx.font = '10px "Press Start 2P", monospace';
              const statusTxt = c.canRoll
                ? `${COLOR_NAMES[c.st.turn].toUpperCase()} · HOLD SPACE`
                : c.pickMoves
                ? `${COLOR_NAMES[c.st.turn].toUpperCase()} · PICK 1-4`
                : `${COLOR_NAMES[c.st.turn].toUpperCase()} TURN`;
              ctx.fillText(statusTxt, 24, 14);
              if (tray && tray.face > 0) {
                ctx.fillStyle = "#FFEC27";
                ctx.fillText(`DIE:${tray.face}`, 254, 14);
              }
            }
            onFrameCanvas(comp);
          }
        }
      };

      rafId = requestAnimationFrame(tick);
    });

    const onResize = () => stageRef.current?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      cancelAllTimers();
      trayRef.current?.dispose();
      stageRef.current?.dispose();
    };
  }, [cancelAllTimers, chargeRelease, onFrameCanvas]);

  // Resize stage when presentation mode changes
  useEffect(() => {
    const t = setTimeout(() => {
      stageRef.current?.resize();
    }, 30);
    return () => clearTimeout(t);
  }, [presentation]);

  // Keyboard shortcuts for Ludo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      audioRef.current.unlock();
      const c = ctrlRef.current;
      const code = e.code;

      if (c.mode === "menu") {
        if (code === "Enter") {
          e.preventDefault();
          startGame();
        }
        return;
      }
      if (c.mode === "over") {
        if (code === "Enter") {
          e.preventDefault();
          startGame();
        }
        return;
      }

      if (code === "KeyP") {
        e.preventDefault();
        c.paused = !c.paused;
        setPaused(c.paused);
        return;
      }
      if (c.paused) return;

      if (code === "Space") {
        e.preventDefault();
        if (!e.repeat) chargeStart();
        return;
      }

      const digitMatch = /^(?:Digit|Numpad)([1-4])$/.exec(code);
      if (digitMatch && c.pickMoves) {
        e.preventDefault();
        chooseTokenMove(Number(digitMatch[1]) - 1);
        return;
      }

      if (code === "KeyC" && stageRef.current) {
        e.preventDefault();
        const nextCam = stageRef.current.rig.next();
        setCamMode(nextCam);
        audioRef.current.play("tick");
      } else if (code === "KeyF" && stageRef.current) {
        e.preventDefault();
        c.speed = c.speed > 1 ? 1 : 2.2;
        stageRef.current.speed = c.speed;
        setFastSpeed(c.speed > 1);
      } else if (code === "Minus" && stageRef.current) {
        stageRef.current.setPixelHeight(stageRef.current.pixelHeight - 40);
      } else if (code === "Equal" && stageRef.current) {
        stageRef.current.setPixelHeight(stageRef.current.pixelHeight + 40);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        chargeRelease();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [startGame, chargeStart, chargeRelease, chooseTokenMove]);

  // Pointer interactions on the 3D Ludo canvas (clicking pawns + dragging orbit camera)
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const getNdc = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      y: -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    audioRef.current.unlock();
    const stage = stageRef.current;
    const c = ctrlRef.current;
    if (!stage) return;

    if (stage.rig.mode === "orbit") {
      dragRef.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }

    if (c.pickMoves && c.st && !c.paused) {
      const pw = stage.pickPawn(getNdc(e));
      if (pw && pw.c === c.st.turn) {
        chooseTokenMove(pw.t);
      }
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stage = stageRef.current;
    const c = ctrlRef.current;
    if (!stage) return;

    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current = { x: e.clientX, y: e.clientY };
      stage.rig.nudge(-dx * 0.006, dy * 0.004, 0);
      return;
    }

    if (c.pickMoves && c.st && !c.paused) {
      const pw = stage.pickPawn(getNdc(e));
      const ok =
        pw &&
        pw.c === c.st.turn &&
        (c.pickMoves.some((m) => m.token === pw.t) ||
          (c.st.tokens[c.st.turn][pw.t] === -1 &&
            c.pickMoves.some((m) => m.enters)));
      stage.setHover(ok ? pw.c : -1, ok ? pw.t : -1);
      e.currentTarget.style.cursor = ok ? "pointer" : "default";
    } else if (e.currentTarget.style.cursor !== "default") {
      e.currentTarget.style.cursor = "default";
      stage.setHover(-1, -1);
    }
  };

  const handleCanvasPointerUp = () => {
    dragRef.current = null;
  };

  const cycleSeat = (idx: number) => {
    audioRef.current.unlock();
    audioRef.current.play("tick");
    const order: SeatType[] = ["human", "cpu", "off"];
    const next = [...seats];
    next[idx] = order[(order.indexOf(next[idx]) + 1) % 3];
    if (next.filter((x) => x !== "off").length < 2) {
      next[idx] = "human";
    }
    setSeats(next);
  };

  const toMenu = () => {
    const c = ctrlRef.current;
    c.run++;
    cancelAllTimers();
    c.mode = "menu";
    c.st = null;
    c.pickMoves = null;
    c.pickResolve = null;
    c.canRoll = false;
    c.charge = null;
    setUiMode("menu");
    setPaused(false);
    stageRef.current?.setAllP([
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
    ]);
    stageRef.current?.setSelectable([]);
    stageRef.current?.setActive([0, 1, 2, 3]);
  };

  const isDirectViewport =
    presentation === "fullscreen" || presentation === "bezel";

  const renderInteractiveContent = () => (
    <>
      <div className="ludo-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="ludo-canvas"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
        />

        {/* Projected 3D Pawn Number Tags & Die Result Tag (in Direct Viewport modes) */}
        {isDirectViewport &&
          uiMode === "play" &&
          !paused &&
          projectedTags.map((tg) => (
            <button
              key={tg.token}
              type="button"
              className="ludo-ptag"
              style={{ left: `${tg.x}px`, top: `${tg.y}px` }}
              onClick={() => chooseTokenMove(tg.token)}
            >
              {tg.label}
            </button>
          ))}

        {isDirectViewport && uiMode === "play" && !paused && projectedDie && (
          <div
            className="ludo-dietag"
            style={
              {
                left: `${projectedDie.x}px`,
                top: `${projectedDie.y}px`,
                "--c": projectedDie.color,
              } as React.CSSProperties
            }
          >
            {projectedDie.face}
          </div>
        )}
      </div>

      {/* HUD OVERLAY */}
      {uiMode === "play" && (
        <div className="ludo-hud">
          {/* Top Turn Banner */}
          <div className="ludo-panel ludo-turn-banner">
            <span
              className="sw"
              style={{ background: COLOR_CSS[gameSnap.turn] }}
            />
            <span>
              {(
                seatNames[gameSnap.turn] || COLOR_NAMES[gameSnap.turn]
              ).toUpperCase()}
            </span>
            <small>
              {gameSnap.phase === "over"
                ? "GAME OVER"
                : gameSnap.pickMoves.length > 0
                ? "PICK A PAWN"
                : gameSnap.canRoll
                ? "YOUR THROW"
                : "ROLLING DIE"}
            </small>
            {gameSnap.dieShown > 0 && (
              <span
                style={{
                  color: "#ffb84a",
                  marginLeft: 6,
                  padding: "2px 6px",
                  background: "#0b0e1d",
                  boxShadow: "0 0 0 2px #000",
                }}
              >
                DIE {gameSnap.dieShown}
              </span>
            )}
          </div>

          {/* Right Player Status Cards */}
          <div className="ludo-player-cards">
            {gameSnap.seats.map((seat, cIdx) => {
              if (seat === "off") return null;
              const pips = gameSnap.tokens[cIdx] || [-1, -1, -1, -1];
              return (
                <div
                  key={cIdx}
                  className={`ludo-pc${
                    gameSnap.turn === cIdx && gameSnap.phase !== "over"
                      ? " active"
                      : ""
                  }`}
                  style={{ "--c": COLOR_CSS[cIdx] } as React.CSSProperties}
                >
                  <div className="ludo-pc-top">
                    <span>{COLOR_NAMES[cIdx].toUpperCase()}</span>
                    <small>
                      {seatNames[cIdx] ||
                        (seat === "cpu" ? `CPU ${cpuDiff}` : "HUMAN")}
                    </small>
                  </div>
                  <div className="ludo-pips">
                    {pips.map((p, tIdx) => (
                      <i
                        key={tIdx}
                        className={`ludo-pip${
                          p === P_HOME ? " h" : p >= 0 ? " b" : ""
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Center Event Flash */}
          {flashBanner && (
            <div
              className="ludo-flash"
              style={{ color: flashBanner.color }}
              role="status"
            >
              <div className="big">{flashBanner.title}</div>
              {flashBanner.sub && <div className="s">{flashBanner.sub}</div>}
            </div>
          )}

          {/* Bottom Interactive Action Dock (Works in ALL 4 Screen Presentations!) */}
          <div className="ludo-bottom-dock">
            {chargePct !== null && (
              <div className="ludo-panel ludo-power-wrap">
                <div className="lbl">THROW POWER</div>
                <div
                  className="ludo-powerbar"
                  style={
                    {
                      "--c":
                        chargePct > 0.8
                          ? "#ff6a5a"
                          : chargePct > 0.45
                          ? "#ffb84a"
                          : "#5fe08a",
                    } as React.CSSProperties
                  }
                >
                  {Array.from({ length: 14 }).map((_, idx) => (
                    <i
                      key={idx}
                      className={idx < Math.round(chargePct * 14) ? "on" : ""}
                    />
                  ))}
                </div>
              </div>
            )}

            {gameSnap.canRoll && chargePct === null && (
              <button
                type="button"
                className="ludo-btn big primary"
                onPointerDown={(e) => {
                  e.preventDefault();
                  chargeStart();
                }}
                onPointerUp={chargeRelease}
                onPointerCancel={chargeRelease}
              >
                HOLD TO THROW DIE <span className="ludo-kbd">SPACE</span>
              </button>
            )}

            {gameSnap.pickMoves.length > 0 && (
              <div className="ludo-move-choices">
                {gameSnap.pickMoves.map((m) => {
                  const tag = m.finishes
                    ? "HOME!"
                    : m.captures.length > 0
                    ? "CAPTURE!"
                    : m.enters
                    ? "LEAVE YARD"
                    : `+${m.to - m.from} STEPS`;
                  return (
                    <button
                      key={m.token}
                      type="button"
                      className="ludo-btn primary"
                      onMouseEnter={() =>
                        stageRef.current?.setHover(m.color, m.token)
                      }
                      onMouseLeave={() => stageRef.current?.setHover(-1, -1)}
                      onClick={() => chooseTokenMove(m.token)}
                    >
                      PAWN #{m.token + 1} &middot; {tag}{" "}
                      <span className="ludo-kbd">{m.token + 1}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ludo-toolbar-strip">
              <button
                type="button"
                className="ludo-btn small"
                onClick={() => {
                  if (!stageRef.current) return;
                  const next = stageRef.current.rig.next();
                  setCamMode(next);
                  audioRef.current.play("tick");
                }}
              >
                CAM: {CAM_LABEL[camMode].toUpperCase()}{" "}
                <span className="ludo-kbd">C</span>
              </button>
              <button
                type="button"
                className={`ludo-btn small${fastSpeed ? " on" : ""}`}
                onClick={() => {
                  const c = ctrlRef.current;
                  c.speed = c.speed > 1 ? 1 : 2.2;
                  if (stageRef.current) stageRef.current.speed = c.speed;
                  setFastSpeed(c.speed > 1);
                }}
              >
                {fastSpeed ? "SPEED: 2.2X" : "SPEED: 1X"}{" "}
                <span className="ludo-kbd">F</span>
              </button>
              <button
                type="button"
                className="ludo-btn small"
                onClick={() => {
                  const c = ctrlRef.current;
                  c.paused = !c.paused;
                  setPaused(c.paused);
                }}
              >
                PAUSE <span className="ludo-kbd">P</span>
              </button>
              <button
                type="button"
                className="ludo-btn small"
                onClick={toMenu}
              >
                TABLE SETUP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MENU OVERLAY */}
      {uiMode === "menu" && (
        <div className="ludo-overlay">
          <div className="ludo-panel ludo-card">
            <h1>LUDO</h1>
            <div className="ludo-sub">
              CLUB No.9 EDITION &middot; 3D RAPIER PHYSICS DICE
            </div>

            <div className="ludo-lbl">
              SEATS <small>(click any seat to toggle HUMAN / CPU / EMPTY)</small>
            </div>
            <div className="ludo-seats">
              {seats.map((s, i) => (
                <div
                  key={i}
                  className={`ludo-seat${s === "off" ? " off" : ""}`}
                  onClick={() => cycleSeat(i)}
                >
                  <span
                    className="sw"
                    style={{ background: COLOR_CSS[i] }}
                  />
                  <span className="nm">{COLOR_NAMES[i].toUpperCase()}</span>
                  <span className={`who ${s}`}>
                    {s === "human" ? "HUMAN" : s === "cpu" ? "CPU" : "EMPTY"}
                  </span>
                </div>
              ))}
            </div>

            <div className="ludo-presets">
              <button
                type="button"
                className="ludo-btn small"
                onClick={() => setSeats([...PRESETS.cpu])}
              >
                YOU vs 3 CPU
              </button>
              <button
                type="button"
                className="ludo-btn small"
                onClick={() => setSeats([...PRESETS.duel])}
              >
                1v1 DUEL
              </button>
              <button
                type="button"
                className="ludo-btn small"
                onClick={() => setSeats([...PRESETS.local])}
              >
                2P LOCAL
              </button>
              <button
                type="button"
                className="ludo-btn small"
                onClick={() => setSeats([...PRESETS.four])}
              >
                4P HOT-SEAT
              </button>
              <button
                type="button"
                className="ludo-btn small"
                onClick={() => setSeats([...PRESETS.watch])}
              >
                WATCH CPUs
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div>
                <div className="ludo-lbl" style={{ marginBottom: 6 }}>
                  CPU SKILL
                </div>
                <div className="ludo-seg">
                  {DIFFS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`ludo-btn small${cpuDiff === d ? " on" : ""}`}
                      onClick={() => setCpuDiff(d)}
                    >
                      {d.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="ludo-lbl" style={{ marginBottom: 6 }}>
                  ONLINE MULTIPLAYER
                </div>
                <button
                  type="button"
                  className="ludo-btn small"
                  style={{ color: "#54e0ee" }}
                  onClick={onOpenMultiplayerModal}
                >
                  ONLINE LOBBIES / QUICK MATCH &rarr;
                </button>
              </div>
            </div>

            <button
              type="button"
              className="ludo-btn big primary"
              onClick={() => {
                audioRef.current.unlock();
                startGame();
              }}
            >
              START TABLE <span className="ludo-kbd">ENTER</span>
            </button>

            <div className="ludo-rules">
              Throw a <b>6</b> to leave the yard &middot; <b>6</b>, capture, or
              reaching home = roll again &middot; three <b>6s</b> in a row
              forfeit the turn &middot; star &amp; start squares are safe
              &middot; exact roll required to enter home triangle.
            </div>
          </div>
        </div>
      )}

      {/* PAUSE OVERLAY */}
      {paused && uiMode === "play" && (
        <div className="ludo-overlay">
          <div className="ludo-panel ludo-card compact">
            <h2>PAUSED</h2>
            <button
              type="button"
              className="ludo-btn primary"
              onClick={() => {
                ctrlRef.current.paused = false;
                setPaused(false);
              }}
            >
              RESUME <span className="ludo-kbd">P</span>
            </button>
            <button
              type="button"
              className="ludo-btn"
              onClick={() => startGame()}
            >
              RESTART MATCH
            </button>
            <button type="button" className="ludo-btn" onClick={toMenu}>
              TABLE SETUP MENU
            </button>
          </div>
        </div>
      )}

      {/* GAME OVER OVERLAY */}
      {uiMode === "over" && (
        <div className="ludo-overlay">
          <div className="ludo-panel ludo-card">
            <h2>
              <span style={{ color: COLOR_CSS[gameSnap.winner ?? 0] }}>
                {COLOR_NAMES[gameSnap.winner ?? 0].toUpperCase()}
              </span>{" "}
              WINS THE TABLE!
            </h2>
            <div className="ludo-over-stats">
              <div className="ludo-os hd">
                <span />
                <span>PLAYER</span>
                <span>HOME</span>
                <span>HITS</span>
                <span>HIT</span>
                <span>SIXES</span>
              </div>
              {gameSnap.seats
                .map((seat, c) => (seat === "off" ? null : c))
                .filter((c): c is number => c !== null)
                .map((c) => {
                  const st = gameSnap.stats[c];
                  const homes = gameSnap.tokens[c].filter(
                    (p) => p === P_HOME
                  ).length;
                  return (
                    <div
                      key={c}
                      className={`ludo-os${
                        c === gameSnap.winner ? " win" : ""
                      }`}
                    >
                      <span
                        className="sw"
                        style={{ background: COLOR_CSS[c] }}
                      />
                      <span>{seatNames[c] || COLOR_NAMES[c].toUpperCase()}</span>
                      <span>{homes}/4</span>
                      <span>{st.captures}</span>
                      <span>{st.captured}</span>
                      <span>{st.sixes}</span>
                    </div>
                  );
                })}
            </div>
            <div
              style={{ display: "flex", gap: 10, justifyContent: "center" }}
            >
              <button
                type="button"
                className="ludo-btn big primary"
                onClick={() => {
                  if (ctrlRef.current.isOnline) {
                    const nextSeed = (Math.random() * 1e9) >>> 0;
                    mpClient.sendLudoAction({ kind: "rematch", seed: nextSeed });
                    startGame({ customSeed: nextSeed, onlineLobby });
                  } else {
                    startGame();
                  }
                }}
              >
                REMATCH <span className="ludo-kbd">ENTER</span>
              </button>
              <button type="button" className="ludo-btn" onClick={toMenu}>
                TABLE SETUP
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className={`ludo-root mode-${presentation}`}>
      {presentation === "bezel" ? (
        <div className="ludo-viewport-frame">
          <div className="ludo-bezel-shell">
            <div className="ludo-bezel-screen">
              {renderInteractiveContent()}
              {scanlinesOn && <div className="ludo-bezel-scanlines" />}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: 10,
                paddingInline: 8,
                fontSize: 9,
                color: "#d4943a",
              }}
            >
              <span>CLUB No.9 PARLOUR MONITOR &middot; 60HZ RGB</span>
              <button
                type="button"
                className="ludo-btn small"
                onClick={() => setScanlinesOn((v) => !v)}
              >
                SCANLINES: {scanlinesOn ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="ludo-viewport-frame">{renderInteractiveContent()}</div>
      )}
    </div>
  );
};
