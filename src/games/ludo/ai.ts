import { loopIndex, SAFE, LOOP_LEN, P_LAST_LOOP } from "./board";
import { isActive, type LudoMove, type LudoState } from "./rules";

export type CpuDiff = "easy" | "normal" | "hard";

export interface CpuLevelSpec {
  noise: number;
  random: number;
  fear: number;
}

export const LEVELS: Record<CpuDiff, CpuLevelSpec> = {
  easy: { noise: 45, random: 0.35, fear: 0.4 },
  normal: { noise: 12, random: 0.05, fear: 1.0 },
  hard: { noise: 0, random: 0, fear: 1.6 },
};

export function threatsTo(s: LudoState, color: number, idx: number | null): number {
  if (idx == null || SAFE.has(idx)) return 0;
  let n = 0;
  for (let o = 0; o < 4; o++) {
    if (o === color || !isActive(s, o)) continue;
    for (const p of s.tokens[o]) {
      if (p < 0 || p > P_LAST_LOOP) continue;
      const q = loopIndex(o, p)!;
      const d = (idx - q + LOOP_LEN) % LOOP_LEN;
      if (d >= 1 && d <= 6 && p + d <= P_LAST_LOOP) n++;
    }
  }
  return n;
}

export function scoreMove(
  s: LudoState,
  m: LudoMove,
  level: CpuLevelSpec = LEVELS.normal
): number {
  const c = m.color;
  let sc = 0;
  if (m.finishes) sc += 100;
  if (m.captures.length) {
    sc +=
      60 +
      m.captures.reduce(
        (a, v) => a + Math.max(0, s.tokens[v.color][v.token]) * 0.6,
        0
      );
  }
  if (m.enters) sc += 38;
  if (m.to > P_LAST_LOOP) sc += 22;
  const toIdx = loopIndex(c, m.to);
  const fromIdx = m.from >= 0 ? loopIndex(c, m.from) : null;
  if (toIdx != null && SAFE.has(toIdx)) sc += 14;
  sc += m.to * 0.35;

  const before = fromIdx != null ? threatsTo(s, c, fromIdx) : 0;
  const after = toIdx != null && !m.captures.length ? threatsTo(s, c, toIdx) : 0;
  sc += (before - after) * 20 * level.fear;
  if (after) sc -= (8 + m.to * 0.25) * level.fear;
  return sc;
}

export function chooseMove(
  s: LudoState,
  moves: LudoMove[],
  levelName: CpuDiff = "normal",
  rng: () => number = Math.random
): LudoMove {
  const level = LEVELS[levelName] || LEVELS.normal;
  if (moves.length === 1) return moves[0];
  if (level.random && rng() < level.random) {
    return moves[Math.floor(rng() * moves.length)];
  }
  let best = moves[0];
  let bs = -Infinity;
  for (const m of moves) {
    const sc = scoreMove(s, m, level) + (rng() - 0.5) * 2 * level.noise;
    if (sc > bs) {
      bs = sc;
      best = m;
    }
  }
  return best;
}
