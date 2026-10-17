export interface SeededRng {
  (): number;
  state: () => number;
  range: (lo: number, hi: number) => number;
  int: (lo: number, hi: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  gauss: () => number;
}

export function mulberry32(seed: number): SeededRng {
  let a = seed >>> 0;
  const f = function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  } as SeededRng;

  f.state = () => a;
  f.range = (lo: number, hi: number) => lo + (hi - lo) * f();
  f.int = (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = <T>(arr: readonly T[]) => arr[Math.floor(f() * arr.length)];
  f.gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = f();
    while (v === 0) v = f();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return f;
}

export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
