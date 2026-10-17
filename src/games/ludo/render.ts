import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  COLOR_HEX,
  COLOR_CSS,
  LOOP,
  START_IDX,
  STAR_IDX,
  HOME_RED,
  rotCell,
  cellOf,
  yardSlot,
  P_HOME,
} from "./board";
import { TRAY, quatFaceUp, type DieSnapshot } from "./dicetray";
import { CameraRig } from "./cameras";
import type { LudoMove } from "./rules";

export const CELL = 0.05;
export const BOARD = CELL * 15;
export const BOARD_Y = 0.03;
export const LAYOUT = { boardX: 0, trayX: 0.68 };
const V3 = THREE.Vector3;

export const bx = (u: number): number => (u - 7.5) * CELL;

function canvasTex(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  {
    nearest = true,
    repeat = null as [number, number] | null,
    srgb = true,
  } = {}
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  if (nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  }
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 1;
  return t;
}

function rnd(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function woodTex(
  base: [number, number, number] = [92, 58, 32],
  seed = 5,
  repeat: [number, number] = [3, 2]
): THREE.CanvasTexture {
  return canvasTex(
    256,
    256,
    (g, w, h) => {
      const r = rnd(seed);
      g.fillStyle = `rgb(${base.join(",")})`;
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        const k = 0.78 + r() * 0.4;
        const a = r() < 0.12 ? 0.4 : 0.14;
        g.fillStyle = `rgba(${base
          .map((v) => Math.round(v * k * 0.55))
          .join(",")},${a})`;
        g.fillRect(0, y, w, 2);
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(20,10,4,${0.1 + r() * 0.15})`;
        g.fillRect(r() * w, r() * h, 6 + r() * 40, 1);
      }
    },
    { repeat }
  );
}

function boardTex(): THREE.CanvasTexture {
  const U = 64;
  return canvasTex(U * 15, U * 15, (g) => {
    const paper = "#f3e7c9";
    const line = "#5d462b";
    g.fillStyle = "#e8d9b5";
    g.fillRect(0, 0, U * 15, U * 15);
    const dark = (c: string, a: number) => {
      const x = parseInt(c.slice(1), 16);
      const m = (v: number) => Math.round(v * a);
      return `rgb(${m(x >> 16)},${m((x >> 8) & 255)},${m(x & 255)})`;
    };
    // yards
    for (let c = 0; c < 4; c++) {
      const corner = [
        [0, 0],
        [9, 0],
        [9, 9],
        [0, 9],
      ][c];
      g.fillStyle = COLOR_CSS[c];
      g.fillRect(corner[0] * U, corner[1] * U, 6 * U, 6 * U);
      g.fillStyle = dark(COLOR_CSS[c], 0.55);
      g.fillRect((corner[0] + 0.5) * U, (corner[1] + 0.5) * U, 5 * U, 5 * U);
      g.fillStyle = "#f6ecd3";
      g.fillRect((corner[0] + 1) * U, (corner[1] + 1) * U, 4 * U, 4 * U);
      g.strokeStyle = line;
      g.lineWidth = 3;
      g.strokeRect((corner[0] + 1) * U, (corner[1] + 1) * U, 4 * U, 4 * U);
      for (let t = 0; t < 4; t++) {
        const [px, py] = yardSlot(c, t);
        g.beginPath();
        g.arc(px * U, py * U, 0.62 * U, 0, 7);
        g.fillStyle = COLOR_CSS[c];
        g.fill();
        g.beginPath();
        g.arc(px * U, py * U, 0.44 * U, 0, 7);
        g.fillStyle = dark(COLOR_CSS[c], 0.5);
        g.fill();
      }
    }
    // path cells
    const homeCol = new Map<string, number>();
    for (let c = 0; c < 4; c++) {
      for (let i = 0; i < 5; i++) {
        homeCol.set(rotCell(HOME_RED[i], c).join(","), c);
      }
    }
    const startCell = new Map<string, number>(
      START_IDX.map((idx, c) => [LOOP[idx].join(","), c])
    );
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        const inArm = (x >= 6 && x <= 8) || (y >= 6 && y <= 8);
        if (!inArm || (x >= 6 && x <= 8 && y >= 6 && y <= 8)) continue;
        const key = x + "," + y;
        g.fillStyle = homeCol.has(key)
          ? COLOR_CSS[homeCol.get(key)!]
          : startCell.has(key)
          ? COLOR_CSS[startCell.get(key)!]
          : paper;
        g.fillRect(x * U, y * U, U, U);
        g.strokeStyle = line;
        g.lineWidth = 3;
        g.strokeRect(x * U + 1.5, y * U + 1.5, U - 3, U - 3);
      }
    }
    // stars on safe squares
    for (const idx of STAR_IDX) {
      const [x, y] = LOOP[idx];
      const cx = (x + 0.5) * U;
      const cy = (y + 0.5) * U;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = (i % 2 ? 0.14 : 0.36) * U;
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.closePath();
      g.fillStyle = "#c99a2e";
      g.fill();
      g.strokeStyle = line;
      g.lineWidth = 2;
      g.stroke();
    }
    // start squares get an indicator dot
    for (let c = 0; c < 4; c++) {
      const [x, y] = LOOP[START_IDX[c]];
      g.beginPath();
      g.arc((x + 0.5) * U, (y + 0.5) * U, 0.17 * U, 0, 7);
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.fill();
    }
    // centre triangles: red left, green top, yellow right, blue bottom
    const C: [number, number] = [7.5 * U, 7.5 * U];
    const corners: Array<[number, number]> = [
      [6 * U, 6 * U],
      [9 * U, 6 * U],
      [9 * U, 9 * U],
      [6 * U, 9 * U],
    ];
    const tri = [
      [3, 0],
      [0, 1],
      [1, 2],
      [2, 3],
    ];
    for (let c = 0; c < 4; c++) {
      const [a, b] = tri[c];
      g.beginPath();
      g.moveTo(...corners[a]);
      g.lineTo(...corners[b]);
      g.lineTo(...C);
      g.closePath();
      g.fillStyle = COLOR_CSS[c];
      g.fill();
      g.strokeStyle = line;
      g.lineWidth = 3;
      g.stroke();
    }
  });
}

function pipTex(n: number): THREE.CanvasTexture {
  return canvasTex(64, 64, (x) => {
    const g = x.createLinearGradient(0, 0, 64, 64);
    g.addColorStop(0, "#fbf6e6");
    g.addColorStop(1, "#e9e0c6");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    x.fillStyle = n === 1 ? "#c93a2a" : "#17130f";
    const a = 16;
    const m = 32;
    const b = 48;
    const P: Record<number, Array<[number, number]>> = {
      1: [[m, m]],
      2: [
        [a, a],
        [b, b],
      ],
      3: [
        [a, a],
        [m, m],
        [b, b],
      ],
      4: [
        [a, a],
        [b, a],
        [a, b],
        [b, b],
      ],
      5: [
        [a, a],
        [b, a],
        [m, m],
        [a, b],
        [b, b],
      ],
      6: [
        [a, a],
        [b, a],
        [a, m],
        [b, m],
        [a, b],
        [b, b],
      ],
    };
    for (const [px, py] of P[n] || P[1]) {
      x.beginPath();
      x.arc(px, py, n === 1 ? 9 : 5.6, 0, 7);
      x.fill();
    }
  });
}

export interface PawnRenderObj {
  c: number;
  t: number;
  grp: THREE.Group;
  m: THREE.Group;
  ring: THREE.Mesh;
  p: number;
  x: number;
  z: number;
  y: number;
  sc?: number;
  anim:
    | {
        kind: "hop";
        legs: Array<{ a: [number, number]; b: [number, number] }>;
        i: number;
        t: number;
        dur: number;
        done: () => void;
        step: number;
      }
    | {
        kind: "fly";
        a: [number, number];
        b: [number, number];
        t: number;
        dur: number;
        done: () => void;
      }
    | null;
  sel: boolean;
  hover: boolean;
  phase: number;
}

export class Stage {
  public canvas: HTMLCanvasElement;
  public pixelHeight = 360;
  public time = 0;
  public speed = 1;
  public camPos = new V3(0.3, 1.1, 0.6);
  public camLook = new V3(0.3, 0, 0);
  public camFov = 42;
  public tgtPos = this.camPos.clone();
  public tgtLook = this.camLook.clone();
  public tgtFov = 42;
  public camK = 3;
  public rig = new CameraRig(LAYOUT);
  public phase = "roll";
  public pawns: PawnRenderObj[] = [];
  public pawnMeshes: THREE.Object3D[] = [];
  public hints: THREE.Mesh[] = [];
  public pathPreviewDots: THREE.Mesh[] = [];
  public selectableMoves: LudoMove[] = [];
  public flash = 0;
  public flashColor = new THREE.Color(1, 0.2, 0.1);

  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public rt!: THREE.WebGLRenderTarget;
  public postScene!: THREE.Scene;
  public postCam!: THREE.OrthographicCamera;
  public postMat!: THREE.ShaderMaterial;
  public lamp!: THREE.SpotLight;
  public boardGroup!: THREE.Group;
  public trayGroup!: THREE.Group;
  public feltMat!: THREE.MeshStandardMaterial;
  public feltTarget?: THREE.Color;
  public turnBar!: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  public die!: THREE.Mesh;
  public aspect = 16 / 9;
  public lowRes = { w: 480, h: 270 };
  public onHop?: (step: number, pw: PawnRenderObj) => void;
  public onLand?: (pw: PawnRenderObj) => void;

  private _projVec = new V3();
  private _raycaster = new THREE.Raycaster();
  private _ndcVec = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  init(): this {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0a0705, 1);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a0705, 2.2, 4.5);

    // Studio environment map for rich pawn/wood/brass specular highlights
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.02, 20);
    this._post();
    this.resize();
    this._lights();
    this._table();
    this._board();
    this._pawns();
    this._tray();
    this._markers();
    this.setCameraTarget(this.camPos, this.camLook, { snap: true });
    return this;
  }

  dispose(): void {
    this.rt?.dispose();
    this.renderer?.dispose();
  }

  private _post(): void {
    this.rt = new THREE.WebGLRenderTarget(480, 270, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uLevels: { value: 12.0 },
        uDither: { value: 0.75 },
        uExposure: { value: 1.2 },
        uFlash: { value: 0 },
        uFlashColor: { value: this.flashColor },
      },
      vertexShader:
        "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uLevels, uDither, uExposure, uFlash; uniform vec3 uFlashColor; varying vec2 vUv;
        const float M[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;
          c = c / (1.0 + c) * 1.2;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
          vec3 s = gl_FragColor.rgb;
          s = (s - 0.5) * 1.08 + 0.5;
          ivec2 p = ivec2(mod(gl_FragCoord.xy, 4.0));
          float b = (M[p.y * 4 + p.x] + 0.5) / 16.0 - 0.5;
          s = floor(s * uLevels + b * uDither + 0.5) / uLevels;
          vec2 q = vUv - 0.5; s *= 1.0 - dot(q, q) * 0.8;
          s = mix(s, uFlashColor, uFlash);
          gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
  }

  setPixelHeight(h: number): void {
    this.pixelHeight = Math.max(150, Math.min(720, Math.round(h)));
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const cw = Math.max(1, rect?.width || window.innerWidth || 16);
    const ch = Math.max(1, rect?.height || window.innerHeight || 9);
    const aspect = cw / ch;
    const h = this.pixelHeight;
    const w = Math.max(160, Math.round(h * aspect));
    this.renderer.setSize(w, h, false);
    this.rt.setSize(w, h);
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.lowRes = { w, h };
  }

  private _lights(): void {
    this.scene.add(new THREE.HemisphereLight(0xffe8c8, 0x2a1a10, 0.78));
    const sp = new THREE.SpotLight(0xffe2b8, 42, 5, 0.75, 0.7, 1.4);
    sp.position.set(0.28, 1.7, 0.5);
    sp.target.position.set(0.28, 0, 0);
    sp.castShadow = true;
    sp.shadow.mapSize.set(1024, 1024);
    sp.shadow.bias = -0.0004;
    sp.shadow.camera.near = 0.8;
    sp.shadow.camera.far = 3.2;
    this.scene.add(sp, sp.target);
    this.lamp = sp;
    const fill = new THREE.DirectionalLight(0xa8c0ff, 0.38);
    fill.position.set(-1, 1, 1.2);
    this.scene.add(fill);
  }

  private _table(): void {
    const wood = woodTex([88, 54, 30], 7, [4, 2.5]);
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.1, 1.5),
      new THREE.MeshStandardMaterial({ map: wood, roughness: 0.65 })
    );
    top.position.set(0.25, -0.05, 0.0);
    top.receiveShadow = true;
    this.scene.add(top);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshStandardMaterial({ color: 0x1a110b, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.8;
    this.scene.add(floor);

    for (const [x, z] of [
      [-0.95, -0.55],
      [1.45, -0.55],
      [-0.95, 0.55],
      [1.45, 0.55],
    ]) {
      const l = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.75, 0.09),
        new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 })
      );
      l.position.set(x, -0.475, z);
      this.scene.add(l);
    }
  }

  private _board(): void {
    const g = new THREE.Group();
    g.position.set(LAYOUT.boardX, 0, 0);
    this.scene.add(g);
    this.boardGroup = g;

    const rimMat = new THREE.MeshStandardMaterial({
      map: woodTex([62, 36, 18], 21, [3, 1]),
      roughness: 0.55,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4a548,
      metalness: 0.85,
      roughness: 0.25,
    });
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD + 0.07, BOARD_Y, BOARD + 0.07),
      rimMat
    );
    slab.position.y = BOARD_Y / 2;
    slab.castShadow = slab.receiveShadow = true;
    g.add(slab);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD, BOARD),
      new THREE.MeshStandardMaterial({ map: boardTex(), roughness: 0.82 })
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = BOARD_Y + 0.0005;
    face.receiveShadow = true;
    g.add(face);

    const lip = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), rimMat);
      m.position.set(x, BOARD_Y + 0.004, z);
      m.castShadow = true;
      g.add(m);
    };
    const e = BOARD / 2 + 0.017;
    lip(BOARD + 0.07, 0.02, 0, -e);
    lip(BOARD + 0.07, 0.02, 0, e);
    lip(0.02, BOARD, -e, 0);
    lip(0.02, BOARD, e, 0);

    // Brass corner inlays on the parlour board
    for (const [cx, cz] of [
      [-e, -e],
      [e, -e],
      [e, e],
      [-e, e],
    ]) {
      const cornerCap = new THREE.Mesh(
        new THREE.BoxGeometry(0.026, 0.015, 0.026),
        brassMat
      );
      cornerCap.position.set(cx, BOARD_Y + 0.005, cz);
      g.add(cornerCap);
    }
  }

  private _pawns(): void {
    const pts = [
      [0, 0],
      [0.0165, 0],
      [0.0165, 0.004],
      [0.0125, 0.0085],
      [0.0085, 0.02],
      [0.0072, 0.03],
      [0.0115, 0.033],
      [0.0085, 0.0365],
      [0, 0.0365],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(pts, 14);
    const head = new THREE.SphereGeometry(0.0105, 12, 10);
    const collarGeo = new THREE.CylinderGeometry(0.0095, 0.0105, 0.003, 12);
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf4c862,
      metalness: 0.82,
      roughness: 0.22,
    });

    for (let c = 0; c < 4; c++) {
      const mat = new THREE.MeshStandardMaterial({
        color: COLOR_HEX[c],
        roughness: 0.28,
        metalness: 0.12,
      });
      const rim = new THREE.MeshBasicMaterial({
        color: 0xffd25a,
        toneMapped: false,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
      });
      for (let t = 0; t < 4; t++) {
        const grp = new THREE.Group();
        const m = new THREE.Group();
        const b = new THREE.Mesh(body, mat);
        const collar = new THREE.Mesh(collarGeo, brassMat);
        collar.position.y = 0.032;
        const h = new THREE.Mesh(head, mat);
        h.position.y = 0.0435;
        b.castShadow = h.castShadow = true;
        m.add(b, collar, h);
        grp.add(m);

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.0195, 0.0265, 24),
          rim
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.0018;
        ring.visible = false;
        grp.add(ring);

        this.scene.add(grp);
        const [ux, uz] = yardSlot(c, t);
        const p: PawnRenderObj = {
          c,
          t,
          grp,
          m,
          ring,
          p: -1,
          x: bx(ux),
          z: bx(uz),
          y: 0,
          anim: null,
          sel: false,
          hover: false,
          phase: Math.random() * 6,
        };
        b.userData.pawn = h.userData.pawn = collar.userData.pawn = p;
        this.pawns.push(p);
      }
    }
    this.pawnMeshes = this.pawns.flatMap((p) => p.m.children);
    this._applyPawns(0, true);
  }

  pawn(c: number, t: number): PawnRenderObj {
    return this.pawns[c * 4 + t];
  }

  private _markers(): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd25a,
      toneMapped: false,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.014, 0.022, 4, 1, Math.PI / 4),
        mat
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.scene.add(m);
      this.hints.push(m);
    }

    // Hopping path preview dots when hovering a selectable pawn
    const dotGeo = new THREE.SphereGeometry(0.0055, 8, 6);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffe484,
      toneMapped: false,
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < 12; i++) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.visible = false;
      this.scene.add(dot);
      this.pathPreviewDots.push(dot);
    }
  }

  homeSpot(c: number, t: number): [number, number] {
    const dir = [
      [-1, 0],
      [0, -1],
      [1, 0],
      [0, 1],
    ][c];
    const perp = [-dir[1], dir[0]];
    return [
      7.5 + dir[0] * 0.95 + perp[0] * (t - 1.5) * 0.3,
      7.5 + dir[1] * 0.95 + perp[1] * (t - 1.5) * 0.3,
    ];
  }

  unitPos(c: number, t: number, p: number): [number, number] {
    if (p < 0) return yardSlot(c, t);
    if (p >= P_HOME) return this.homeSpot(c, t);
    const [x, y] = cellOf(c, p);
    return [x + 0.5, y + 0.5];
  }

  private _targetFor(pw: PawnRenderObj): { x: number; z: number; s: number } {
    const [ux, uz] = this.unitPos(pw.c, pw.t, pw.p);
    if (pw.p < 0 || pw.p >= P_HOME) return { x: bx(ux), z: bx(uz), s: 1 };
    const mates = this.pawns.filter(
      (o) => !o.anim && o.p === pw.p && o.c === pw.c
    );
    const others = this.pawns.filter(
      (o) =>
        !o.anim &&
        o.p >= 0 &&
        o.p < P_HOME &&
        (o.c !== pw.c || o.p !== pw.p) &&
        Math.abs(this.unitPosKey(o) - this.unitPosKey(pw)) < 1e-9
    );
    const group = [...mates, ...others].sort(
      (a, b) => a.c * 4 + a.t - (b.c * 4 + b.t)
    );
    const n = group.length;
    const i = Math.max(0, group.indexOf(pw));
    const o =
      n <= 1
        ? [0, 0]
        : n === 2
        ? [(i ? 1 : -1) * 0.2, 0]
        : [
            [-0.2, -0.17],
            [0.2, -0.17],
            [-0.2, 0.2],
            [0.2, 0.2],
          ][i % 4];
    return { x: bx(ux + o[0]), z: bx(uz + o[1]), s: n > 1 ? 0.82 : 1 };
  }

  unitPosKey(pw: PawnRenderObj): number {
    const [x, y] = this.unitPos(pw.c, pw.t, pw.p);
    return x * 100 + y;
  }

  setP(c: number, t: number, p: number): void {
    const pw = this.pawn(c, t);
    pw.p = p;
  }

  setAllP(tokens: number[][], snap = true): void {
    tokens.forEach((row, c) =>
      row.forEach((p, t) => {
        this.pawn(c, t).p = p;
        this.pawn(c, t).anim = null;
      })
    );
    this._applyPawns(0, snap);
  }

  setActive(colors: number[]): void {
    this.pawns.forEach((pw) => {
      pw.grp.visible = colors.includes(pw.c);
    });
  }

  movePawn(c: number, t: number, from: number, to: number): Promise<void> {
    const pw = this.pawn(c, t);
    const pts: Array<[number, number]> = [];
    if (from < 0) pts.push(this.unitPos(c, t, 0));
    else for (let p = from + 1; p <= to; p++) pts.push(this.unitPos(c, t, p));
    const legs: Array<{ a: [number, number]; b: [number, number] }> = [];
    let cur: [number, number] = [pw.x, pw.z];
    for (const [ux, uz] of pts) {
      const nx = bx(ux);
      const nz = bx(uz);
      legs.push({ a: cur, b: [nx, nz] });
      cur = [nx, nz];
    }
    return new Promise((res) => {
      pw.anim = {
        kind: "hop",
        legs,
        i: 0,
        t: 0,
        dur: from < 0 ? 0.42 : 0.17,
        done: () => {
          pw.p = to;
          res();
        },
        step: 0,
      };
      pw.p = from;
    });
  }

  sendHome(c: number, t: number): Promise<void> {
    const pw = this.pawn(c, t);
    const [ux, uz] = yardSlot(c, t);
    return new Promise((res) => {
      pw.anim = {
        kind: "fly",
        a: [pw.x, pw.z],
        b: [bx(ux), bx(uz)],
        t: 0,
        dur: 0.6,
        done: () => {
          pw.p = -1;
          res();
        },
      };
    });
  }

  setSelectable(list: LudoMove[]): void {
    this.selectableMoves = list;
    this.pawns.forEach((pw) => {
      pw.sel = false;
    });
    this.hints.forEach((h) => {
      h.visible = false;
    });
    list.forEach((m, i) => {
      this.pawn(m.color, m.token).sel = true;
      const h = this.hints[i];
      if (!h) return;
      const [ux, uz] = this.unitPos(m.color, m.token, m.to);
      h.position.set(bx(ux), BOARD_Y + 0.003, bx(uz));
      h.visible = true;
    });
    this._updatePathPreview();
  }

  setHover(c: number, t: number): void {
    this.pawns.forEach((pw) => {
      pw.hover = pw.c === c && pw.t === t;
    });
    this._updatePathPreview();
  }

  private _updatePathPreview(): void {
    this.pathPreviewDots.forEach((d) => {
      d.visible = false;
    });
    const hoveredPawn = this.pawns.find((p) => p.hover && p.sel);
    const focusMove =
      hoveredPawn
        ? this.selectableMoves.find(
            (m) => m.color === hoveredPawn.c && m.token === hoveredPawn.t
          )
        : this.selectableMoves.length === 1
        ? this.selectableMoves[0]
        : null;
    if (!focusMove) return;

    const steps: Array<[number, number]> = [];
    if (focusMove.from < 0) {
      steps.push(this.unitPos(focusMove.color, focusMove.token, 0));
    } else {
      for (let p = focusMove.from + 1; p <= focusMove.to; p++) {
        steps.push(this.unitPos(focusMove.color, focusMove.token, p));
      }
    }
    steps.forEach(([ux, uz], idx) => {
      const dot = this.pathPreviewDots[idx];
      if (!dot) return;
      dot.position.set(bx(ux), BOARD_Y + 0.015 + Math.sin((idx + 1) * 0.5) * 0.008, bx(uz));
      dot.visible = true;
    });
  }

  private _applyPawns(dt: number, snap = false): void {
    const k = 1 - Math.exp(-dt * 16 * this.speed);
    for (const pw of this.pawns) {
      const bobbing = pw.sel
        ? Math.abs(Math.sin(this.time * 7 + pw.phase)) * 0.012
        : 0;
      const ty = BOARD_Y;
      const a = pw.anim;
      if (a) {
        a.t += dt * this.speed;
        if (a.kind === "hop") {
          const leg = a.legs[a.i];
          const u = Math.min(1, a.t / a.dur);
          const e = u * u * (3 - 2 * u);
          pw.x = leg.a[0] + (leg.b[0] - leg.a[0]) * e;
          pw.z = leg.a[1] + (leg.b[1] - leg.a[1]) * e;
          pw.y = Math.sin(u * Math.PI) * (a.dur > 0.3 ? 0.07 : 0.028);
          if (u >= 1) {
            this.onHop?.(a.step++, pw);
            a.i++;
            a.t = 0;
            if (a.i >= a.legs.length) {
              pw.anim = null;
              pw.y = 0;
              a.done();
            }
          }
        } else if (a.kind === "fly") {
          const u = Math.min(1, a.t / a.dur);
          const e = u * u * (3 - 2 * u);
          pw.x = a.a[0] + (a.b[0] - a.a[0]) * e;
          pw.z = a.a[1] + (a.b[1] - a.a[1]) * e;
          pw.y = Math.sin(u * Math.PI) * 0.16;
          pw.m.rotation.z = Math.sin(u * Math.PI * 4) * 0.6 * (1 - u);
          if (u >= 1) {
            pw.anim = null;
            pw.y = 0;
            pw.m.rotation.z = 0;
            a.done();
            this.onLand?.(pw);
          }
        }
      } else {
        const tg = this._targetFor(pw);
        if (snap) {
          pw.x = tg.x;
          pw.z = tg.z;
        } else {
          pw.x += (tg.x - pw.x) * k;
          pw.z += (tg.z - pw.z) * k;
        }
        pw.y *= snap ? 0 : 1 - k;
        pw.sc = tg.s;
      }
      const s = (pw.sc || 1) * (pw.hover ? 1.16 : 1);
      pw.grp.position.set(pw.x, ty + pw.y, pw.z);
      pw.m.position.y = bobbing;
      pw.m.scale.setScalar(s);
      pw.ring.visible = pw.sel;
      if (pw.sel) {
        const q = 1 + Math.sin(this.time * 7 + pw.phase) * 0.12;
        pw.ring.scale.setScalar(q);
        pw.ring.position.y = 0.0018 - pw.y;
      }
    }
  }

  private _tray(): void {
    const T = TRAY;
    const g = new THREE.Group();
    g.position.set(LAYOUT.trayX, 0, 0);
    this.scene.add(g);
    this.trayGroup = g;
    const cz = (T.z0 + T.z1) / 2;
    const dz = T.z1 - T.z0;
    this.feltMat = new THREE.MeshStandardMaterial({
      color: 0x2b6b3a,
      roughness: 0.95,
    });
    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(T.hx * 2 + 0.06, dz + 0.06),
      this.feltMat
    );
    felt.rotation.x = -Math.PI / 2;
    felt.position.set(0, 0.0015, cz);
    felt.receiveShadow = true;
    g.add(felt);

    const railMat = new THREE.MeshStandardMaterial({
      map: woodTex([70, 40, 20], 33, [2, 1]),
      roughness: 0.52,
    });
    const box = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      m = railMat
    ) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      b.castShadow = b.receiveShadow = true;
      g.add(b);
      return b;
    };
    box(T.hx * 2 + 0.14, 0.05, 0.035, 0, 0.025, T.z0 - 0.0275);
    box(T.hx * 2 + 0.14, 0.05, 0.035, 0, 0.025, T.z1 + 0.0275);
    box(0.035, 0.05, dz + 0.09, -T.hx - 0.0475, 0.025, cz);
    box(0.035, 0.05, dz + 0.09, T.hx + 0.0475, 0.025, cz);

    this.turnBar = new THREE.Mesh(
      new THREE.BoxGeometry(T.hx * 2 + 0.1, 0.006, 0.008),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    );
    this.turnBar.position.set(0, 0.052, T.z1 + 0.04);
    g.add(this.turnBar);

    const nums = [2, 5, 1, 6, 3, 4];
    const mats = nums.map(
      (n) => new THREE.MeshStandardMaterial({ map: pipTex(n), roughness: 0.26 })
    );
    this.die = new THREE.Mesh(
      new RoundedBoxGeometry(T.half * 2, T.half * 2, T.half * 2, 3, 0.007),
      mats
    );
    this.die.castShadow = this.die.receiveShadow = true;
    g.add(this.die);
    g.updateMatrixWorld(true);
    this.setDie(null);
  }

  setDie(s: DieSnapshot | null): void {
    const d = this.die;
    if (!s) {
      d.position.set(TRAY.rest.x, TRAY.half, TRAY.rest.z);
      const q = quatFaceUp(6, 0.3);
      d.quaternion.set(q.x, q.y, q.z, q.w);
      return;
    }
    d.position.set(s.x, s.y, s.z);
    d.quaternion.set(s.qx, s.qy, s.qz, s.qw);
  }

  setTurnColor(c: number): void {
    const col = new THREE.Color(COLOR_HEX[c]);
    this.turnBar.material.color.copy(col);
    this.feltTarget = col
      .clone()
      .multiplyScalar(0.3)
      .lerp(new THREE.Color(0x1d5a30), 0.7);
  }

  trayLocal(x: number, y: number, z: number): THREE.Vector3 {
    return this.trayGroup.localToWorld(new V3(x, y, z));
  }

  setCameraTarget(
    pos: THREE.Vector3,
    look: THREE.Vector3,
    { fov = this.tgtFov, k = this.camK, snap = false } = {}
  ): void {
    this.tgtPos.copy(pos);
    this.tgtLook.copy(look);
    this.tgtFov = fov;
    this.camK = k;
    if (snap) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.camFov = fov;
    }
  }

  project(v: THREE.Vector3): { x: number; y: number; ok: boolean } {
    const rect = this.canvas.getBoundingClientRect();
    const p = this._projVec.copy(v).project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * (rect.width || window.innerWidth),
      y: (-p.y * 0.5 + 0.5) * (rect.height || window.innerHeight),
      ok: p.z < 1 && p.z > -1,
    };
  }

  pickPawn(ndc: { x: number; y: number }): PawnRenderObj | null {
    this._ndcVec.set(ndc.x, ndc.y);
    this._raycaster.setFromCamera(this._ndcVec, this.camera);
    const hit = this._raycaster.intersectObjects(
      this.pawnMeshes.filter((m) => m.parent?.parent?.visible),
      false
    )[0];
    return hit ? (hit.object.userData.pawn as PawnRenderObj) : null;
  }

  doFlash(color = 0xff4030, amt = 0.35): void {
    this.flashColor.set(color);
    this.flash = amt;
  }

  update(dt: number): void {
    this.time += dt;
    const shot = this.rig.compute(this.phase, this.aspect || 1.78);
    this.setCameraTarget(shot.pos, shot.look, { fov: shot.fov, k: shot.k });
    const a = 1 - Math.exp(-dt * this.camK);
    this.camPos.lerp(this.tgtPos, a);
    this.camLook.lerp(this.tgtLook, a);
    this.camFov += (this.tgtFov - this.camFov) * a;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - this.camFov) > 0.01) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }
    this._applyPawns(dt);
    this.hints.forEach((h, i) => {
      if (h.visible) {
        h.rotation.z = this.time * 1.5;
        h.scale.setScalar(1 + Math.sin(this.time * 6 + i) * 0.12);
      }
    });
    this.pathPreviewDots.forEach((dot, i) => {
      if (dot.visible) {
        const s = 0.85 + Math.sin(this.time * 8 - i * 0.6) * 0.25;
        dot.scale.setScalar(s);
      }
    });
    if (this.feltTarget) {
      this.feltMat.color.lerp(this.feltTarget, 1 - Math.exp(-dt * 4));
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    this.postMat.uniforms.uFlash.value = this.flash;
  }

  render(): void {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }
}
