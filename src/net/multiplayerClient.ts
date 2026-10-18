export interface RemoteVisitor {
  id: string;
  name: string;
  color: string;
  x: number;
  z: number;
  yaw: number;
  station: string;
  status?: string;
  lastEmote?: { text: string; emoji?: string; time: number };
  activeGameId: string | null;
  updatedAt: number;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  color: string;
  seatIndex: number;
  ready: boolean;
}

export interface MultiplayerLobby {
  code: string;
  hostId: string;
  gameId: string;
  gameTitle: string;
  mode: "waiting" | "playing" | "finished";
  cpuDiff: "easy" | "normal" | "hard";
  fillCpu: boolean;
  seed: number;
  players: LobbyPlayer[];
  scores: Record<string, { score: number; status: "playing" | "done" }>;
  createdAt: number;
}

export type LudoNetworkAction =
  | {
      kind: "throw";
      turn: number;
      power: number;
      rollSeed: number;
      forcedFace?: number;
    }
  | {
      kind: "move";
      turn: number;
      token: number;
    }
  | {
      kind: "rematch";
      seed: number;
    };

type Listener = () => void;
type LudoActionListener = (senderId: string, action: LudoNetworkAction) => void;
type LobbyStartListener = (lobby: MultiplayerLobby) => void;
export type EmoteListener = (data: {
  id: string;
  name: string;
  color?: string;
  text: string;
  emoji?: string;
}) => void;

class MultiplayerClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  public selfId: string;
  public selfName: string;
  public connected = false;
  public visitors = new Map<string, RemoteVisitor>();
  public lobbies: MultiplayerLobby[] = [];
  public currentLobby: MultiplayerLobby | null = null;
  public lastError: string | null = null;

  private listeners = new Set<Listener>();
  private ludoListeners = new Set<LudoActionListener>();
  private startListeners = new Set<LobbyStartListener>();
  private emoteListeners = new Set<EmoteListener>();
  private lastMoveSentAt = 0;

  constructor() {
    let savedId = "";
    let savedName = "PLAYER 1";
    try {
      if (typeof sessionStorage !== "undefined") {
        savedId = sessionStorage.getItem("playglow:mp-id") || "";
        savedName = localStorage.getItem("playglow:mp-name") || "PLAYER 1";
      }
    } catch {
      // ignore
    }
    if (!savedId) {
      savedId = `p_${Math.random().toString(36).slice(2, 10)}`;
      try {
        sessionStorage.setItem("playglow:mp-id", savedId);
      } catch {
        // ignore
      }
    }
    this.selfId = savedId;
    this.selfName = savedName;
  }

  public connect(): void {
    if (typeof window === "undefined") return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.addEventListener("open", () => {
        this.connected = true;
        this.send({
          type: "visitor:hello",
          id: this.selfId,
          name: this.selfName,
          x: 0,
          z: 1.75,
          yaw: Math.PI,
          station: "center",
        });
        this.notify();
      });

      ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          this.handleMessage(msg);
        } catch {
          // ignore
        }
      });

      ws.addEventListener("close", () => {
        this.connected = false;
        this.ws = null;
        this.notify();
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 2500);
      });

      ws.addEventListener("error", () => {
        ws.close();
      });
    } catch {
      // ignore
    }
  }

  private handleMessage(msg: any): void {
    if (!msg || typeof msg.type !== "string") return;

    switch (msg.type) {
      case "sync:init": {
        if (typeof msg.selfId === "string") this.selfId = msg.selfId;
        this.visitors.clear();
        if (Array.isArray(msg.visitors)) {
          for (const v of msg.visitors) {
            if (v && v.id) this.visitors.set(v.id, v);
          }
        }
        if (Array.isArray(msg.lobbies)) {
          this.lobbies = msg.lobbies;
        }
        this.notify();
        break;
      }
      case "visitor:joined":
      case "visitor:moved": {
        if (msg.visitor?.id) {
          this.visitors.set(msg.visitor.id, msg.visitor);
          this.notify();
        }
        break;
      }
      case "visitor:emote": {
        if (msg.id) {
          const v = this.visitors.get(msg.id);
          if (v) {
            v.lastEmote = {
              text: String(msg.text || ""),
              emoji: msg.emoji,
              time: msg.timestamp || Date.now(),
            };
            this.notify();
          }
          for (const fn of this.emoteListeners) {
            fn({
              id: msg.id,
              name: msg.name || "PLAYER",
              color: msg.color,
              text: String(msg.text || ""),
              emoji: msg.emoji,
            });
          }
        }
        break;
      }
      case "visitor:left": {
        if (msg.id) {
          this.visitors.delete(msg.id);
          this.notify();
        }
        break;
      }
      case "lobbies:list": {
        if (Array.isArray(msg.lobbies)) {
          this.lobbies = msg.lobbies;
          if (this.currentLobby) {
            const updated = this.lobbies.find(
              (l) => l.code === this.currentLobby?.code
            );
            if (updated) this.currentLobby = updated;
          }
          this.notify();
        }
        break;
      }
      case "lobby:joined":
      case "lobby:updated": {
        if (msg.lobby) {
          this.currentLobby = msg.lobby;
          this.lastError = null;
          this.notify();
        }
        break;
      }
      case "lobby:left": {
        this.currentLobby = null;
        this.notify();
        break;
      }
      case "lobby:error": {
        this.lastError = String(msg.message || "Lobby error");
        this.notify();
        break;
      }
      case "lobby:started": {
        if (msg.lobby) {
          this.currentLobby = msg.lobby;
          this.notify();
          for (const cb of this.startListeners) cb(msg.lobby);
        }
        break;
      }
      case "ludo:action": {
        if (msg.action) {
          for (const cb of this.ludoListeners) {
            cb(msg.senderId, msg.action as LudoNetworkAction);
          }
        }
        break;
      }
    }
  }

  public send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public setName(name: string): void {
    const clean = (name.trim() || "PLAYER 1").slice(0, 14).toUpperCase();
    this.selfName = clean;
    try {
      localStorage.setItem("playglow:mp-name", clean);
    } catch {
      // ignore
    }
    this.send({ type: "visitor:update", name: clean });
    this.notify();
  }

  public setPlayerName(name: string): void {
    this.setName(name);
  }

  public updatePosition(
    xOrPatch:
      | number
      | {
          x?: number;
          z?: number;
          yaw?: number;
          station?: string;
          activeGameId?: string | null;
        },
    z = 1.25,
    yaw = 0,
    station = "center",
    activeGameId: string | null = null,
    force = false
  ): void {
    if (typeof xOrPatch === "object" && xOrPatch !== null) {
      const selfVis = this.visitors.get(this.selfId);
      const nx = xOrPatch.x ?? selfVis?.x ?? 0;
      const nz = xOrPatch.z ?? selfVis?.z ?? 1.25;
      const nyaw = xOrPatch.yaw ?? selfVis?.yaw ?? 0;
      const nst = xOrPatch.station ?? selfVis?.station ?? "center";
      const ngame =
        xOrPatch.activeGameId !== undefined
          ? xOrPatch.activeGameId
          : selfVis?.activeGameId ?? null;
      this.send({
        type: "visitor:update",
        x: Number(nx.toFixed(3)),
        z: Number(nz.toFixed(3)),
        yaw: Number(nyaw.toFixed(3)),
        station: nst,
        activeGameId: ngame,
      });
      return;
    }

    const now = performance.now();
    if (!force && now - this.lastMoveSentAt < 65) return;
    this.lastMoveSentAt = now;
    this.send({
      type: "visitor:update",
      x: Number(xOrPatch.toFixed(3)),
      z: Number(z.toFixed(3)),
      yaw: Number(yaw.toFixed(3)),
      station,
      activeGameId,
    });
  }

  public createLobby(
    optsOrGameId:
      | {
          gameId: string;
          gameTitle: string;
          cpuDiff?: "easy" | "normal" | "hard";
          fillCpu?: boolean;
          preferredCode?: string;
        }
      | string,
    gameTitle = "Club Ludo",
    _isPrivate = false
  ): void {
    this.lastError = null;
    if (typeof optsOrGameId === "string") {
      this.send({
        type: "lobby:create",
        gameId: optsOrGameId,
        gameTitle,
        cpuDiff: "normal",
        fillCpu: true,
      });
      return;
    }
    this.send({ type: "lobby:create", ...optsOrGameId });
  }

  public joinLobby(code: string): void {
    this.lastError = null;
    this.send({ type: "lobby:join", code: code.trim().toUpperCase() });
  }

  public quickMatch(gameId: string, gameTitle: string): void {
    this.lastError = null;
    this.send({ type: "lobby:quickmatch", gameId, gameTitle });
  }

  public leaveLobby(): void {
    this.send({ type: "lobby:leave" });
    this.currentLobby = null;
    this.notify();
  }

  public updateLobbyConfig(opts: {
    gameId?: string;
    gameTitle?: string;
    cpuDiff?: "easy" | "normal" | "hard";
    fillCpu?: boolean;
  }): void {
    this.send({ type: "lobby:config", ...opts });
  }

  public startLobbyMatch(): void {
    this.send({ type: "lobby:start" });
  }

  public sendLudoAction(action: LudoNetworkAction): void {
    this.send({ type: "ludo:action", action });
  }

  public sendArcadeScore(score: number, status: "playing" | "done" = "playing"): void {
    this.send({ type: "arcade:score", score, status });
  }

  public getSnapshot(): MultiplayerSnapshot {
    const selfVis = this.visitors.get(this.selfId);
    const activeLobby = this.currentLobby
      ? {
          ...this.currentLobby,
          name: this.currentLobby.gameTitle || "Club Ludo Room",
          status: this.currentLobby.mode,
          maxPlayers: 4,
        }
      : null;

    return {
      connected: this.connected,
      selfId: this.selfId,
      selfName: this.selfName,
      selfColor: selfVis?.color || "#ffa300",
      visitors: Array.from(this.visitors.values()),
      lobbies: this.lobbies.map((l) => ({
        ...l,
        name: l.gameTitle || "Club Ludo Room",
        status: l.mode,
        maxPlayers: 4,
      })),
      activeLobby,
      lastError: this.lastError,
    };
  }

  public subscribe(fn: (snap: MultiplayerSnapshot) => void): () => void {
    const wrapped = () => fn(this.getSnapshot());
    this.listeners.add(wrapped);
    return () => this.listeners.delete(wrapped);
  }

  public onLudoAction(fn: LudoActionListener): () => void {
    this.ludoListeners.add(fn);
    return () => this.ludoListeners.delete(fn);
  }

  public onLobbyStart(fn: LobbyStartListener): () => void {
    this.startListeners.add(fn);
    return () => this.startListeners.delete(fn);
  }

  public sendEmote(text: string, emoji?: string): void {
    const clean = String(text || "").trim().slice(0, 48);
    if (!clean && !emoji) return;
    this.send({ type: "visitor:emote", text: clean, emoji });
    const selfVis = this.visitors.get(this.selfId);
    if (selfVis) {
      selfVis.lastEmote = { text: clean, emoji, time: Date.now() };
    }
    for (const fn of this.emoteListeners) {
      fn({
        id: this.selfId,
        name: this.selfName,
        text: clean,
        emoji,
      });
    }
    this.notify();
  }

  public onEmote(fn: EmoteListener): () => void {
    this.emoteListeners.add(fn);
    return () => this.emoteListeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}

export interface MultiplayerLobbyView extends MultiplayerLobby {
  name: string;
  status: "waiting" | "playing" | "finished";
  maxPlayers: number;
}

export interface MultiplayerSnapshot {
  connected: boolean;
  selfId: string;
  selfName: string;
  selfColor: string;
  visitors: RemoteVisitor[];
  lobbies: MultiplayerLobbyView[];
  activeLobby: MultiplayerLobbyView | null;
  lastError: string | null;
}

export const mpClient = new MultiplayerClient();
export const multiplayerClient = mpClient;
