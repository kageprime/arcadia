import { loopIndex, SAFE, P_BASE, P_HOME, P_LAST_LOOP } from "./board";

export type SeatType = "human" | "cpu" | "off";

export const SEAT = {
  HUMAN: "human" as SeatType,
  CPU: "cpu" as SeatType,
  OFF: "off" as SeatType,
};

export interface LudoCapture {
  color: number;
  token: number;
}

export interface LudoMove {
  color: number;
  token: number;
  from: number;
  to: number;
  captures: LudoCapture[];
  finishes: boolean;
  enters: boolean;
}

export interface LudoPlayerStats {
  captures: number;
  captured: number;
  sixes: number;
}

export type LudoPhase = "roll" | "pick" | "nomove" | "forfeit" | "over";

export interface LudoState {
  seats: SeatType[];
  tokens: number[][];
  turn: number;
  die: number | null;
  sixes: number;
  phase: LudoPhase;
  moves: LudoMove[];
  winner: number | null;
  turns: number;
  stats: LudoPlayerStats[];
}

export function newGame(
  seats: SeatType[] = ["human", "cpu", "cpu", "cpu"],
  first: number | null = null
): LudoState {
  const active = seats
    .map((s, i) => (s !== SEAT.OFF ? i : -1))
    .filter((i) => i >= 0);
  if (active.length < 2) throw new Error("Ludo needs at least two players");
  return {
    seats: [...seats],
    tokens: [0, 1, 2, 3].map(() => [P_BASE, P_BASE, P_BASE, P_BASE]),
    turn: first != null && active.includes(first) ? first : active[0],
    die: null,
    sixes: 0,
    phase: "roll",
    moves: [],
    winner: null,
    turns: 0,
    stats: [0, 1, 2, 3].map(() => ({ captures: 0, captured: 0, sixes: 0 })),
  };
}

export const isActive = (s: LudoState, c: number): boolean =>
  s.seats[c] !== SEAT.OFF;

export const homeCount = (s: LudoState, c: number): number =>
  s.tokens[c].filter((p) => p === P_HOME).length;

export function capturesAt(
  s: LudoState,
  color: number,
  to: number
): LudoCapture[] {
  if (to < 1 || to > P_LAST_LOOP) return [];
  const idx = loopIndex(color, to);
  if (idx === null || SAFE.has(idx)) return [];
  const hit: LudoCapture[] = [];
  for (let o = 0; o < 4; o++) {
    if (o === color || !isActive(s, o)) continue;
    s.tokens[o].forEach((p, j) => {
      if (p >= 0 && p <= P_LAST_LOOP && loopIndex(o, p) === idx) {
        hit.push({ color: o, token: j });
      }
    });
  }
  return hit;
}

export function legalMoves(
  s: LudoState,
  die: number,
  color: number = s.turn
): LudoMove[] {
  const out: LudoMove[] = [];
  s.tokens[color].forEach((p, i) => {
    let to: number;
    if (p === P_BASE) {
      if (die !== 6) return;
      to = 0;
    } else {
      to = p + die;
      if (to > P_HOME) return;
    }
    out.push({
      color,
      token: i,
      from: p,
      to,
      captures: capturesAt(s, color, to),
      finishes: to === P_HOME,
      enters: p === P_BASE,
    });
  });
  return out;
}

export function rollDie(s: LudoState, die: number): LudoPhase {
  s.die = die;
  s.turns++;
  if (die === 6) {
    s.sixes++;
    s.stats[s.turn].sixes++;
  } else {
    s.sixes = 0;
  }
  if (s.sixes >= 3) {
    s.sixes = 0;
    s.moves = [];
    s.phase = "forfeit";
    return s.phase;
  }
  s.moves = legalMoves(s, die);
  s.phase = s.moves.length ? "pick" : "nomove";
  return s.phase;
}

export function applyMove(
  s: LudoState,
  m: LudoMove
): { bonus: boolean; won: boolean; captured: LudoCapture[] } {
  const c = m.color;
  s.tokens[c][m.token] = m.to;
  for (const v of m.captures) {
    s.tokens[v.color][v.token] = P_BASE;
    s.stats[c].captures++;
    s.stats[v.color].captured++;
  }
  const won = homeCount(s, c) === 4;
  const bonus = !won && (s.die === 6 || m.captures.length > 0 || m.finishes);
  s.moves = [];
  if (won) {
    s.phase = "over";
    s.winner = c;
  } else if (bonus) {
    s.phase = "roll";
    if (s.die !== 6) s.sixes = 0;
  } else {
    passTurn(s);
  }
  return { bonus, won, captured: m.captures };
}

export function passTurn(s: LudoState): void {
  let n = s.turn;
  for (let i = 0; i < 4; i++) {
    n = (n + 1) % 4;
    if (isActive(s, n)) break;
  }
  s.turn = n;
  s.sixes = 0;
  s.moves = [];
  s.phase = "roll";
}
