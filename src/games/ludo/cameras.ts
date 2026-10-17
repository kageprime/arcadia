import * as THREE from "three";

export type LudoCamMode = "auto" | "board" | "dice" | "top" | "orbit";
export const CAMS: readonly LudoCamMode[] = ["auto", "board", "dice", "top", "orbit"];
export const CAM_LABEL: Record<LudoCamMode, string> = {
  auto: "Auto",
  board: "Table",
  dice: "Dice",
  top: "Top",
  orbit: "Orbit",
};

const V3 = THREE.Vector3;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class CameraRig {
  public L: { boardX: number; trayX: number };
  public mode: LudoCamMode = "auto";
  public orbit = { yaw: 0, pitch: 0.95, dist: 1.25 };

  constructor(layout: { boardX: number; trayX: number }) {
    this.L = layout;
  }

  set(m: LudoCamMode): void {
    if (CAMS.includes(m)) this.mode = m;
  }

  next(): LudoCamMode {
    this.mode = CAMS[(CAMS.indexOf(this.mode) + 1) % CAMS.length];
    return this.mode;
  }

  nudge(dyaw: number, dpitch: number, ddist: number): void {
    const o = this.orbit;
    o.yaw += dyaw;
    o.pitch = clamp(o.pitch + dpitch, 0.2, 1.5);
    o.dist = clamp(o.dist + ddist, 0.45, 2.4);
  }

  resolve(phase: string): string {
    return this.mode !== "auto" ? this.mode : phase === "roll" ? "rollcam" : "board";
  }

  private _frame(
    look: THREE.Vector3,
    w: number,
    h: number,
    elev: number,
    fov: number,
    aspect: number,
    yawOff = 0
  ): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
    const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const dist = Math.max(w / (2 * t * aspect), h / (2 * t)) * 1.06;
    const pos = new V3(
      look.x + Math.sin(yawOff) * Math.cos(elev) * dist,
      look.y + Math.sin(elev) * dist,
      look.z + Math.cos(yawOff) * Math.cos(elev) * dist
    );
    return { pos, look, fov };
  }

  compute(
    phase: string,
    aspect: number
  ): { mode: string; pos: THREE.Vector3; look: THREE.Vector3; fov: number; k: number } {
    const mode = this.resolve(phase);
    const L = this.L;
    const fov = 42;
    let shot: { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
    let k = 3.2;

    switch (mode) {
      case "rollcam":
        shot = this._frame(new V3(L.trayX * 0.5, 0, 0.02), 1.3, 0.9, 1.0, fov, aspect);
        k = 2.6;
        break;
      case "dice":
        shot = this._frame(new V3(L.trayX, 0, 0.02), 0.5, 0.5, 1.12, fov, aspect);
        k = 3.2;
        break;
      case "top":
        shot = this._frame(
          new V3((L.boardX + L.trayX) / 2 + 0.1, 0, 0.03),
          1.45,
          0.88,
          Math.PI / 2 - 0.02,
          fov,
          aspect
        );
        break;
      case "orbit": {
        const o = this.orbit;
        const look = new V3(0.2, 0, 0);
        shot = {
          look,
          fov: 46,
          pos: new V3(
            look.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
            Math.sin(o.pitch) * o.dist,
            look.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist
          ),
        };
        k = 8;
        break;
      }
      default:
        shot = this._frame(
          new V3((L.boardX + L.trayX) / 2 + 0.04, 0, 0.0),
          1.56,
          0.9,
          1.0,
          fov,
          aspect
        );
        break;
    }
    return { mode, ...shot, k };
  }
}
