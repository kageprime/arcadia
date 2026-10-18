import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

export interface RoomVisitor {
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

const VISITOR_COLORS = [
  "#FF6C24",
  "#29ADFF",
  "#00E436",
  "#FFEC27",
  "#FF77A8",
  "#FFA300",
];

function generateLobbyCode(existing: Map<string, MultiplayerLobby>): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!existing.has(code)) return code;
  }
  return "CLB9";
}

export function attachMultiplayerServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const clients = new Map<string, WebSocket>();
  const visitors = new Map<string, RoomVisitor>();
  const lobbies = new Map<string, MultiplayerLobby>();
  const clientLobby = new Map<string, string>();

  function sendTo(clientId: string, payload: unknown): void {
    const ws = clients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function broadcastAll(payload: unknown, excludeId?: string): void {
    const raw = JSON.stringify(payload);
    for (const [id, ws] of clients.entries()) {
      if (id !== excludeId && ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      }
    }
  }

  function broadcastLobby(code: string, payload: unknown, excludeId?: string): void {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    const raw = JSON.stringify(payload);
    for (const p of lobby.players) {
      if (p.id === excludeId) continue;
      const ws = clients.get(p.id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      }
    }
  }

  function getPublicLobbiesList(): MultiplayerLobby[] {
    return Array.from(lobbies.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  function removePlayerFromCurrentLobby(clientId: string): void {
    const code = clientLobby.get(clientId);
    if (!code) return;
    clientLobby.delete(clientId);
    const lobby = lobbies.get(code);
    if (!lobby) return;

    lobby.players = lobby.players.filter((p) => p.id !== clientId);
    delete lobby.scores[clientId];

    if (lobby.players.length === 0) {
      lobbies.delete(code);
    } else {
      if (lobby.hostId === clientId) {
        lobby.hostId = lobby.players[0].id;
      }
      broadcastLobby(code, { type: "lobby:updated", lobby });
    }
    broadcastAll({ type: "lobbies:list", lobbies: getPublicLobbiesList() });
  }

  wss.on("connection", (ws) => {
    let clientId = "";

    ws.on("message", (rawBuf) => {
      let msg: any;
      try {
        msg = JSON.parse(String(rawBuf));
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== "string") return;

      switch (msg.type) {
        case "visitor:hello": {
          const id =
            typeof msg.id === "string" && msg.id.length > 0
              ? msg.id.slice(0, 36)
              : `v_${Math.random().toString(36).slice(2, 10)}`;
          clientId = id;
          clients.set(id, ws);

          const existing = visitors.get(id);
          const color =
            existing?.color ||
            VISITOR_COLORS[visitors.size % VISITOR_COLORS.length];
          const visitor: RoomVisitor = {
            id,
            name: String(msg.name || existing?.name || "PLAYER").slice(0, 14).toUpperCase(),
            color,
            x: typeof msg.x === "number" ? msg.x : 0,
            z: typeof msg.z === "number" ? msg.z : 1.75,
            yaw: typeof msg.yaw === "number" ? msg.yaw : Math.PI,
            station: String(msg.station || "lounge"),
            activeGameId: msg.activeGameId || null,
            updatedAt: Date.now(),
          };
          visitors.set(id, visitor);

          sendTo(id, {
            type: "sync:init",
            selfId: id,
            visitors: Array.from(visitors.values()),
            lobbies: getPublicLobbiesList(),
          });
          broadcastAll({ type: "visitor:joined", visitor }, id);
          break;
        }

        case "visitor:update": {
          if (!clientId) break;
          const v = visitors.get(clientId);
          if (!v) break;
          if (typeof msg.name === "string" && msg.name.trim()) {
            v.name = msg.name.trim().slice(0, 14).toUpperCase();
          }
          if (typeof msg.x === "number") v.x = Math.max(-4.5, Math.min(4.5, msg.x));
          if (typeof msg.z === "number") v.z = Math.max(-2.2, Math.min(3.8, msg.z));
          if (typeof msg.yaw === "number") v.yaw = msg.yaw;
          if (typeof msg.station === "string") v.station = msg.station;
          if (typeof msg.status === "string") v.status = msg.status.slice(0, 24);
          if (msg.activeGameId !== undefined) v.activeGameId = msg.activeGameId;
          v.updatedAt = Date.now();
          broadcastAll({ type: "visitor:moved", visitor: v }, clientId);
          break;
        }

        case "visitor:emote": {
          if (!clientId) break;
          const v = visitors.get(clientId);
          if (!v) break;
          const text = String(msg.text || "").slice(0, 48);
          const emoji = typeof msg.emoji === "string" ? msg.emoji.slice(0, 4) : undefined;
          v.lastEmote = { text, emoji, time: Date.now() };
          broadcastAll({
            type: "visitor:emote",
            id: clientId,
            name: v.name,
            color: v.color,
            text,
            emoji,
            timestamp: Date.now(),
          });
          break;
        }

        case "lobby:create": {
          if (!clientId) break;
          const v = visitors.get(clientId);
          if (!v) break;
          removePlayerFromCurrentLobby(clientId);

          const code =
            typeof msg.preferredCode === "string" &&
            /^[A-Z0-9]{4}$/.test(msg.preferredCode.toUpperCase()) &&
            !lobbies.has(msg.preferredCode.toUpperCase())
              ? msg.preferredCode.toUpperCase()
              : generateLobbyCode(lobbies);

          const gameId = String(msg.gameId || "house_ludo");
          const gameTitle = String(msg.gameTitle || "CLUB LUDO");

          const lobby: MultiplayerLobby = {
            code,
            hostId: clientId,
            gameId,
            gameTitle,
            mode: "waiting",
            cpuDiff:
              msg.cpuDiff === "easy" || msg.cpuDiff === "hard"
                ? msg.cpuDiff
                : "normal",
            fillCpu: msg.fillCpu !== false,
            seed: (Math.random() * 1e9) >>> 0,
            players: [
              {
                id: clientId,
                name: v.name,
                color: v.color,
                seatIndex: 0,
                ready: true,
              },
            ],
            scores: {},
            createdAt: Date.now(),
          };
          lobbies.set(code, lobby);
          clientLobby.set(clientId, code);

          sendTo(clientId, { type: "lobby:joined", lobby });
          broadcastAll({ type: "lobbies:list", lobbies: getPublicLobbiesList() });
          break;
        }

        case "lobby:join": {
          if (!clientId) break;
          const v = visitors.get(clientId);
          if (!v) break;
          const code = String(msg.code || "").trim().toUpperCase();
          const lobby = lobbies.get(code);
          if (!lobby) {
            sendTo(clientId, {
              type: "lobby:error",
              message: `Room ${code} not found.`,
            });
            break;
          }
          if (lobby.players.some((p) => p.id === clientId)) {
            sendTo(clientId, { type: "lobby:joined", lobby });
            break;
          }
          if (lobby.players.length >= 4) {
            sendTo(clientId, {
              type: "lobby:error",
              message: `Room ${code} is full (4/4).`,
            });
            break;
          }

          removePlayerFromCurrentLobby(clientId);

          const takenSeats = new Set(lobby.players.map((p) => p.seatIndex));
          let seatIndex = 0;
          while (takenSeats.has(seatIndex) && seatIndex < 4) seatIndex++;

          lobby.players.push({
            id: clientId,
            name: v.name,
            color: v.color,
            seatIndex,
            ready: true,
          });
          clientLobby.set(clientId, code);

          sendTo(clientId, { type: "lobby:joined", lobby });
          broadcastLobby(code, { type: "lobby:updated", lobby }, clientId);
          broadcastAll({ type: "lobbies:list", lobbies: getPublicLobbiesList() });
          break;
        }

        case "lobby:quickmatch": {
          if (!clientId) break;
          const v = visitors.get(clientId);
          if (!v) break;
          const gameId = String(msg.gameId || "house_ludo");
          const gameTitle = String(msg.gameTitle || "CLUB LUDO");

          // Find an open waiting lobby for this game
          const openLobby = Array.from(lobbies.values()).find(
            (l) =>
              l.mode === "waiting" &&
              l.gameId === gameId &&
              l.players.length < 4 &&
              !l.players.some((p) => p.id === clientId)
          );

          if (openLobby) {
            removePlayerFromCurrentLobby(clientId);
            const takenSeats = new Set(openLobby.players.map((p) => p.seatIndex));
            let seatIndex = 0;
            while (takenSeats.has(seatIndex) && seatIndex < 4) seatIndex++;
            openLobby.players.push({
              id: clientId,
              name: v.name,
              color: v.color,
              seatIndex,
              ready: true,
            });
            clientLobby.set(clientId, openLobby.code);
            sendTo(clientId, { type: "lobby:joined", lobby: openLobby });
            broadcastLobby(
              openLobby.code,
              { type: "lobby:updated", lobby: openLobby },
              clientId
            );
            broadcastAll({
              type: "lobbies:list",
              lobbies: getPublicLobbiesList(),
            });
          } else {
            removePlayerFromCurrentLobby(clientId);
            const code = generateLobbyCode(lobbies);
            const lobby: MultiplayerLobby = {
              code,
              hostId: clientId,
              gameId,
              gameTitle,
              mode: "waiting",
              cpuDiff: "normal",
              fillCpu: true,
              seed: (Math.random() * 1e9) >>> 0,
              players: [
                {
                  id: clientId,
                  name: v.name,
                  color: v.color,
                  seatIndex: 0,
                  ready: true,
                },
              ],
              scores: {},
              createdAt: Date.now(),
            };
            lobbies.set(code, lobby);
            clientLobby.set(clientId, code);
            sendTo(clientId, { type: "lobby:joined", lobby });
            broadcastAll({
              type: "lobbies:list",
              lobbies: getPublicLobbiesList(),
            });
          }
          break;
        }

        case "lobby:leave": {
          if (!clientId) break;
          removePlayerFromCurrentLobby(clientId);
          sendTo(clientId, { type: "lobby:left" });
          break;
        }

        case "lobby:config": {
          if (!clientId) break;
          const code = clientLobby.get(clientId);
          if (!code) break;
          const lobby = lobbies.get(code);
          if (!lobby || lobby.hostId !== clientId) break;
          if (typeof msg.gameId === "string") lobby.gameId = msg.gameId;
          if (typeof msg.gameTitle === "string") lobby.gameTitle = msg.gameTitle;
          if (
            msg.cpuDiff === "easy" ||
            msg.cpuDiff === "normal" ||
            msg.cpuDiff === "hard"
          ) {
            lobby.cpuDiff = msg.cpuDiff;
          }
          if (typeof msg.fillCpu === "boolean") lobby.fillCpu = msg.fillCpu;
          broadcastLobby(code, { type: "lobby:updated", lobby });
          broadcastAll({ type: "lobbies:list", lobbies: getPublicLobbiesList() });
          break;
        }

        case "lobby:start": {
          if (!clientId) break;
          const code = clientLobby.get(clientId);
          if (!code) break;
          const lobby = lobbies.get(code);
          if (!lobby || lobby.hostId !== clientId) break;
          lobby.mode = "playing";
          lobby.seed = (Math.random() * 1e9) >>> 0;
          lobby.scores = {};
          for (const p of lobby.players) {
            lobby.scores[p.id] = { score: 0, status: "playing" };
          }
          broadcastLobby(code, { type: "lobby:started", lobby });
          broadcastAll({ type: "lobbies:list", lobbies: getPublicLobbiesList() });
          break;
        }

        case "ludo:action": {
          if (!clientId) break;
          const code = clientLobby.get(clientId);
          if (!code) break;
          const lobby = lobbies.get(code);
          if (!lobby) break;
          broadcastLobby(code, {
            type: "ludo:action",
            senderId: clientId,
            action: msg.action,
          });
          break;
        }

        case "arcade:score": {
          if (!clientId) break;
          const code = clientLobby.get(clientId);
          if (!code) break;
          const lobby = lobbies.get(code);
          if (!lobby) break;
          lobby.scores[clientId] = {
            score: Number(msg.score) || 0,
            status: msg.status === "done" ? "done" : "playing",
          };
          broadcastLobby(code, {
            type: "lobby:updated",
            lobby,
          });
          break;
        }
      }
    });

    ws.on("close", () => {
      if (!clientId) return;
      removePlayerFromCurrentLobby(clientId);
      clients.delete(clientId);
      visitors.delete(clientId);
      broadcastAll({ type: "visitor:left", id: clientId });
    });
  });
}
