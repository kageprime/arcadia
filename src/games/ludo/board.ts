// Ludo board geometry. Pure data, no DOM / Three.
// Grid is 15x15 cells (x right, y down). Cell (x,y) has its centre at (x+0.5, y+0.5) in "board units".
// Players: 0 red (top-left), 1 green (top-right), 2 yellow (bottom-right), 3 blue (bottom-left). Play runs clockwise.

export const COLORS = ["red", "green", "yellow", "blue"] as const;
export const COLOR_NAMES = ["Red", "Green", "Yellow", "Blue"] as const;
export const COLOR_HEX = [0xe0493a, 0x35b25a, 0xf2c230, 0x3a74e0] as const;
export const COLOR_CSS = ["#e0493a", "#35b25a", "#f2c230", "#3a74e0"] as const;

// The 52-cell loop, starting at red's start square.
export const LOOP: ReadonlyArray<readonly [number, number]> = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8],
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14],
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
];

export const LOOP_LEN = 52;
export const START_IDX = [0, 13, 26, 39] as const;
export const SAFE = new Set<number>([0, 13, 26, 39, 8, 21, 34, 47]);
export const STAR_IDX = [8, 21, 34, 47] as const;

export const P_BASE = -1;
export const P_START = 0;
export const P_LAST_LOOP = 50;
export const P_HOME = 56;

export const HOME_RED: ReadonlyArray<readonly [number, number]> = [
  [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7],
];
export const YARD_RED: ReadonlyArray<readonly [number, number]> = [
  [2, 2], [4, 2], [2, 4], [4, 4],
];

export const rotCell = ([x, y]: readonly [number, number], n: number): [number, number] => {
  let c: [number, number] = [x, y];
  for (let i = 0; i < n; i++) c = [14 - c[1], c[0]];
  return c;
};

export const rotPt = ([x, y]: readonly [number, number], n: number): [number, number] => {
  let c: [number, number] = [x, y];
  for (let i = 0; i < n; i++) c = [15 - c[1], c[0]];
  return c;
};

export const loopIndex = (color: number, p: number): number | null =>
  p >= 0 && p <= P_LAST_LOOP ? (START_IDX[color] + p) % LOOP_LEN : null;

export const inHomeColumn = (p: number): boolean => p > P_LAST_LOOP && p <= P_HOME;

export function cellOf(color: number, p: number): readonly [number, number] {
  if (p <= P_LAST_LOOP) {
    const idx = loopIndex(color, p)!;
    return LOOP[idx];
  }
  return rotCell(HOME_RED[p - 51], color);
}

export function yardSlot(color: number, token: number): [number, number] {
  return rotPt(YARD_RED[token], color);
}

export function tokenPoint(color: number, p: number, token: number): [number, number] {
  if (p < 0) return yardSlot(color, token);
  const [x, y] = cellOf(color, p);
  return [x + 0.5, y + 0.5];
}

export function pathCells(color: number, from: number, to: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (from < 0) {
    out.push(tokenPoint(color, 0, 0));
    return out;
  }
  for (let p = from + 1; p <= to; p++) {
    out.push(tokenPoint(color, p, 0));
  }
  return out;
}
