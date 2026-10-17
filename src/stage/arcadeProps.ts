import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { humController } from "../audio/hum";

export interface InteractiveMachine {
  id: string;
  name: string;
  actionLabel: string;
  pos: THREE.Vector3;
  radius: number;
  trigger: () => string; // returns action feedback toast
  update?: (dt: number, time: number) => void;
}

// 90s Neon Arcade Color Palette
export const ARCADE_COLORS = {
  black: "#0b0714",
  deepNavy: "#0e1124",
  charcoal: "#161822",
  steel: "#4a5260",
  chrome: "#c4cbd8",
  gold: "#ffb703",
  neonMagenta: "#ff007f",
  neonCyan: "#00f0ff",
  neonLime: "#76ff03",
  neonYellow: "#ffee00",
  neonPurple: "#b5179e",
  arcadeRed: "#e63946",
  arcadeBlue: "#1d3557",
  warmWhite: "#fffdf0",
};

/**
 * Creates procedural 90s fluorescent blacklight carpet canvas with
 * neon squiggles, triangles, dots, and confetti shapes.
 */
export function createNeonCarpetCanvas(size = 512): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Obsidian dark purple/charcoal base
  ctx.fillStyle = "#0c0816";
  ctx.fillRect(0, 0, size, size);

  // Subtle dark textured grid under-layer
  ctx.strokeStyle = "rgba(35, 20, 55, 0.45)";
  ctx.lineWidth = 1;
  const step = 32;
  for (let x = 0; x <= size; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y <= size; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // Neon Confetti & Squiggle Elements
  const colors = [
    "#ff007f", // Neon Magenta
    "#00f0ff", // Neon Cyan
    "#76ff03", // Electric Lime
    "#ffee00", // Bright Yellow
    "#9d4edd", // Violet
    "#ff5400", // Neon Orange
  ];

  // Deterministic pseudo-random seed
  let seed = 1994;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // 1. Neon Triangles
  for (let i = 0; i < 48; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const s = 8 + rand() * 16;
    const rot = rand() * Math.PI * 2;
    const col = colors[Math.floor(rand() * colors.length)];

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.86, s * 0.5);
    ctx.lineTo(-s * 0.86, s * 0.5);
    ctx.closePath();
    ctx.globalAlpha = 0.85;
    ctx.fill();

    // Fluorescent halo
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // 2. 90s Squiggles & Zigzags
  for (let i = 0; i < 36; i++) {
    const sx = rand() * size;
    const sy = rand() * size;
    const len = 24 + rand() * 32;
    const angle = rand() * Math.PI * 2;
    const col = colors[Math.floor(rand() * colors.length)];

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    ctx.strokeStyle = col;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.9;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.25, -12, len * 0.5, 12, len * 0.75, -8);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Electric Dots & Stars
  for (let i = 0; i < 110; i++) {
    const px = rand() * size;
    const py = rand() * size;
    const r = 1.5 + rand() * 2.8;
    const col = colors[Math.floor(rand() * colors.length)];
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle vignette edge for blacklight depth
  ctx.globalAlpha = 1.0;
  return canvas;
}

/**
 * Helper to make a transformed box geometry for fast batch merging
 */
function makeBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  ry = 0,
  rx = 0,
  rz = 0
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4();
  const e = new THREE.Euler(rx, ry, rz, "XYZ");
  m.makeRotationFromEuler(e);
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

/**
 * Builds a Vintage 90s Pinball Table with animated flippers,
 * flashing bumper lights, and glass playfield.
 */
export function createPinballMachine(
  name: string,
  themeColor: string,
  accentColor: string,
  x: number,
  z: number,
  rotY = 0
): { group: THREE.Group; machine: InteractiveMachine } {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;

  // Table Body Geometries (Wood Cabinet + Chrome Legs)
  // Pinball cabinet slants downward from back (0.88m) to front (0.76m)
  const woodGeos: THREE.BufferGeometry[] = [
    // Main slanted body box
    makeBox(0.68, 0.42, 1.28, 0, 0.74, 0, 0, 0.11, 0),
    // Slanted bottom apron
    makeBox(0.68, 0.08, 0.28, 0, 0.62, 0.52, 0, 0.11, 0),
  ];

  const chromeGeos: THREE.BufferGeometry[] = [
    // 4 Chrome Legs
    makeBox(0.05, 0.68, 0.05, -0.31, 0.34, 0.56, 0, 0, -0.06),
    makeBox(0.05, 0.68, 0.05, 0.31, 0.34, 0.56, 0, 0, 0.06),
    makeBox(0.05, 0.76, 0.05, -0.31, 0.38, -0.56, 0, 0, -0.06),
    makeBox(0.05, 0.76, 0.05, 0.31, 0.38, -0.56, 0, 0, 0.06),
    // Front coin door frame & lockdown bar
    makeBox(0.7, 0.06, 0.08, 0, 0.71, 0.64),
    makeBox(0.32, 0.28, 0.02, 0, 0.55, 0.64),
    // Plunger housing on right
    makeBox(0.06, 0.06, 0.16, 0.28, 0.68, 0.68),
  ];

  // Elevated Backbox (Translite Header)
  const backboxGeos: THREE.BufferGeometry[] = [
    makeBox(0.68, 0.65, 0.28, 0, 1.34, -0.56),
    makeBox(0.72, 0.06, 0.3, 0, 1.68, -0.56),
  ];

  const woodMesh = new THREE.Mesh(
    mergeGeometries(woodGeos),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(themeColor) })
  );
  woodMesh.castShadow = true;
  woodMesh.receiveShadow = true;
  group.add(woodMesh);

  const chromeMesh = new THREE.Mesh(
    mergeGeometries(chromeGeos),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(ARCADE_COLORS.chrome),
      metalness: 0.85,
      roughness: 0.25,
    })
  );
  chromeMesh.castShadow = true;
  group.add(chromeMesh);

  const backboxMesh = new THREE.Mesh(
    mergeGeometries(backboxGeos),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(ARCADE_COLORS.charcoal) })
  );
  backboxMesh.castShadow = true;
  group.add(backboxMesh);

  // Backbox Translite Art Canvas (glowing glass front)
  const transliteCanvas = document.createElement("canvas");
  transliteCanvas.width = 256;
  transliteCanvas.height = 256;
  const tctx = transliteCanvas.getContext("2d")!;
  tctx.fillStyle = themeColor;
  tctx.fillRect(0, 0, 256, 256);
  tctx.fillStyle = "#0c0816";
  tctx.fillRect(8, 8, 240, 240);
  tctx.fillStyle = accentColor;
  tctx.font = "bold 22px 'Press Start 2P', monospace";
  tctx.textAlign = "center";
  tctx.fillText(name.toUpperCase(), 128, 64);
  tctx.fillStyle = ARCADE_COLORS.warmWhite;
  tctx.font = "14px 'JetBrains Mono', monospace";
  tctx.fillText("SPACE EXPLORER", 128, 100);
  // Digital score display LED
  tctx.fillStyle = "#220000";
  tctx.fillRect(32, 140, 192, 48);
  tctx.fillStyle = "#ff2222";
  tctx.font = "bold 26px 'Press Start 2P', monospace";
  tctx.fillText("548,290", 128, 174);

  const transliteTex = new THREE.CanvasTexture(transliteCanvas);
  const transliteMat = new THREE.MeshBasicMaterial({ map: transliteTex });
  const transliteMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.52),
    transliteMat
  );
  transliteMesh.position.set(0, 1.34, -0.41);
  group.add(transliteMesh);

  // Slanted Glass Playfield
  const playfieldGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 1.18),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.9,
    })
  );
  playfieldGlass.rotation.x = -Math.PI / 2 + 0.11;
  playfieldGlass.position.set(0, 0.88, 0.02);
  group.add(playfieldGlass);

  // Playfield interior artwork surface
  const pfCanvas = document.createElement("canvas");
  pfCanvas.width = 256;
  pfCanvas.height = 512;
  const pctx = pfCanvas.getContext("2d")!;
  pctx.fillStyle = "#120c1f";
  pctx.fillRect(0, 0, 256, 512);
  // Target lanes
  pctx.strokeStyle = accentColor;
  pctx.lineWidth = 4;
  pctx.strokeRect(16, 16, 224, 480);
  // Bumper graphics
  pctx.fillStyle = themeColor;
  pctx.beginPath();
  pctx.arc(80, 160, 32, 0, Math.PI * 2);
  pctx.arc(176, 160, 32, 0, Math.PI * 2);
  pctx.arc(128, 230, 32, 0, Math.PI * 2);
  pctx.fill();
  pctx.fillStyle = "#ffee00";
  pctx.beginPath();
  pctx.arc(80, 160, 16, 0, Math.PI * 2);
  pctx.arc(176, 160, 16, 0, Math.PI * 2);
  pctx.arc(128, 230, 16, 0, Math.PI * 2);
  pctx.fill();

  const pfTex = new THREE.CanvasTexture(pfCanvas);
  const pfMat = new THREE.MeshBasicMaterial({ map: pfTex });
  const pfSurface = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.14), pfMat);
  pfSurface.rotation.x = -Math.PI / 2 + 0.11;
  pfSurface.position.set(0, 0.83, 0.02);
  group.add(pfSurface);

  // 3 Glowing Pop Bumpers (Cylinders)
  const bumperMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(accentColor) });
  const bumper1 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 12), bumperMat);
  const bumper2 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 12), bumperMat);
  const bumper3 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 12), bumperMat);

  // Position on slanted playfield
  bumper1.rotation.x = 0.11;
  bumper2.rotation.x = 0.11;
  bumper3.rotation.x = 0.11;
  bumper1.position.set(-0.13, 0.88, -0.16);
  bumper2.position.set(0.13, 0.88, -0.16);
  bumper3.position.set(0, 0.85, 0.02);
  group.add(bumper1, bumper2, bumper3);

  // Localized Pinball Bumper PointLight
  const bumperLight = new THREE.PointLight(new THREE.Color(accentColor), 0.7, 1.8);
  bumperLight.position.set(0, 0.98, -0.05);
  group.add(bumperLight);

  // Animated Flippers (left and right)
  const flipperMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
  });
  const leftFlipper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.025), flipperMat);
  const rightFlipper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.025), flipperMat);
  leftFlipper.position.set(-0.07, 0.76, 0.38);
  rightFlipper.position.set(0.07, 0.76, 0.38);
  leftFlipper.rotation.x = 0.11;
  rightFlipper.rotation.x = 0.11;
  leftFlipper.rotation.y = -0.35;
  rightFlipper.rotation.y = 0.35;
  group.add(leftFlipper, rightFlipper);

  // Silver Pinball Ball
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.95, roughness: 0.1 })
  );
  ball.position.set(0.04, 0.82, 0.2);
  group.add(ball);

  // Animation trigger state
  let triggerTime = -10;
  let flashTimer = 0;

  const machine: InteractiveMachine = {
    id: `pinball_${name.toLowerCase().replace(/\s+/g, "_")}`,
    name,
    actionLabel: `Launch & Flip ${name}`,
    pos: new THREE.Vector3(x, 1.0, z),
    radius: 1.5,
    trigger: () => {
      triggerTime = performance.now() * 0.001;
      flashTimer = 1.0;
      humController.playPinballAction();

      // Update translite score display randomly for excitement
      const score = Math.floor(500000 + Math.random() * 490000);
      tctx.fillStyle = "#220000";
      tctx.fillRect(32, 140, 192, 48);
      tctx.fillStyle = "#ffdd00";
      tctx.font = "bold 26px 'Press Start 2P', monospace";
      tctx.fillText(score.toLocaleString(), 128, 174);
      transliteTex.needsUpdate = true;

      return `+15,000 Pts! Bumpers active on ${name}!`;
    },
    update: (dt, time) => {
      const elapsed = time - triggerTime;
      if (elapsed >= 0 && elapsed < 0.6) {
        // Snap flippers up then release
        const flipAngle = Math.sin(elapsed * Math.PI * 6) * 0.55;
        leftFlipper.rotation.y = -0.35 + Math.max(0, flipAngle);
        rightFlipper.rotation.y = 0.35 - Math.max(0, flipAngle);
        ball.position.z = 0.2 - Math.sin(elapsed * Math.PI) * 0.35;
      } else {
        leftFlipper.rotation.y = -0.35;
        rightFlipper.rotation.y = 0.35;
      }

      if (flashTimer > 0) {
        flashTimer -= dt * 3.5;
        const flashIntensity = (Math.sin(time * 30) * 0.5 + 0.5) * 2.8 + 0.5;
        bumperLight.intensity = flashIntensity;
        bumperMat.color.set(accentColor).multiplyScalar(1.5);
      } else {
        bumperLight.intensity = 0.6 + Math.sin(time * 2) * 0.15;
        bumperMat.color.set(accentColor);
      }
    },
  };

  return { group, machine };
}

/**
 * Builds the Classic 3-Cabinet Arcade Row (Street Brawler, Nebula 1989, Turbo Drift)
 */
export function createCabinetBank(
  startX: number,
  startZ: number
): { group: THREE.Group; machines: InteractiveMachine[] } {
  const group = new THREE.Group();
  const machines: InteractiveMachine[] = [];

  const cabConfigs = [
    {
      name: "Street Brawler",
      sub: "2-PLAYER FIGHTER",
      color: "#9d0208",
      accent: "#ffba08",
      offsetZ: -1.0,
      type: "fighter",
    },
    {
      name: "Nebula 1989",
      sub: "VERTICAL SHMUP",
      color: "#03045e",
      accent: "#00f0ff",
      offsetZ: 0.0,
      type: "shmup",
    },
    {
      name: "Turbo Drift",
      sub: "GRAND PRIX 3D",
      color: "#370617",
      accent: "#ff007f",
      offsetZ: 1.0,
      type: "racing",
    },
  ];

  cabConfigs.forEach((cfg) => {
    const cabGroup = new THREE.Group();
    const cx = startX;
    const cz = startZ + cfg.offsetZ;
    cabGroup.position.set(cx, 0, cz);
    cabGroup.rotation.y = -Math.PI / 2; // Face towards the center aisle

    // Arcade Cabinet Shell (Lower Base + Monitor Trunk + Marquee Hood)
    const shellGeos = [
      makeBox(0.64, 0.72, 0.78, 0, 0.36, 0),
      makeBox(0.64, 0.88, 0.62, 0, 1.08, -0.06),
      makeBox(0.64, 0.28, 0.44, 0, 1.62, 0.08),
    ];
    const shellMesh = new THREE.Mesh(
      mergeGeometries(shellGeos),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(cfg.color) })
    );
    shellMesh.castShadow = true;
    shellMesh.receiveShadow = true;
    cabGroup.add(shellMesh);

    // Glowing Marquee Sign
    const marqueeCanvas = document.createElement("canvas");
    marqueeCanvas.width = 256;
    marqueeCanvas.height = 80;
    const mqCtx = marqueeCanvas.getContext("2d")!;
    mqCtx.fillStyle = "#0c0816";
    mqCtx.fillRect(0, 0, 256, 80);
    mqCtx.strokeStyle = cfg.accent;
    mqCtx.lineWidth = 4;
    mqCtx.strokeRect(4, 4, 248, 72);
    mqCtx.fillStyle = cfg.accent;
    mqCtx.font = "bold 18px 'Press Start 2P', monospace";
    mqCtx.textAlign = "center";
    mqCtx.fillText(cfg.name.toUpperCase(), 128, 38);
    mqCtx.fillStyle = ARCADE_COLORS.warmWhite;
    mqCtx.font = "10px 'JetBrains Mono', monospace";
    mqCtx.fillText(cfg.sub, 128, 58);

    const marqueeTex = new THREE.CanvasTexture(marqueeCanvas);
    const marqueeMat = new THREE.MeshBasicMaterial({ map: marqueeTex });
    const marqueeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.22), marqueeMat);
    marqueeMesh.position.set(0, 1.62, 0.31);
    cabGroup.add(marqueeMesh);

    // Control Deck
    const deckGeo = makeBox(0.62, 0.08, 0.32, 0, 0.84, 0.28, 0, 0.2, 0);
    const deckMesh = new THREE.Mesh(
      deckGeo,
      new THREE.MeshLambertMaterial({ color: new THREE.Color(ARCADE_COLORS.charcoal) })
    );
    cabGroup.add(deckMesh);

    // Joysticks & Arcade Buttons on Deck
    const buttonColors = ["#ff0055", "#00f0ff", "#ffee00", "#76ff03"];
    const btnGeos: THREE.BufferGeometry[] = [];
    if (cfg.type === "racing") {
      // Molded Steering Wheel
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.11, 0.02, 8, 18),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 })
      );
      wheel.position.set(0, 0.94, 0.28);
      wheel.rotation.x = 0.55;
      cabGroup.add(wheel);

      // Shifter knob
      const shifter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8),
        new THREE.MeshStandardMaterial({ color: 0xc4cbd8, metalness: 0.8 })
      );
      shifter.position.set(0.22, 0.9, 0.25);
      cabGroup.add(shifter);
    } else {
      // 2 Joysticks (P1, P2)
      const stickMat = new THREE.MeshStandardMaterial({ color: 0xdd1111 });
      const joy1 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), stickMat);
      const joy2 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), stickMat);
      joy1.position.set(-0.16, 0.92, 0.28);
      joy2.position.set(0.12, 0.92, 0.28);
      cabGroup.add(joy1, joy2);

      // Buttons
      for (let b = 0; b < 6; b++) {
        btnGeos.push(
          makeBox(0.024, 0.015, 0.024, -0.08 + (b % 3) * 0.035, 0.89, 0.24 + Math.floor(b / 3) * 0.04)
        );
        btnGeos.push(
          makeBox(0.024, 0.015, 0.024, 0.18 + (b % 3) * 0.035, 0.89, 0.24 + Math.floor(b / 3) * 0.04)
        );
      }
      const btnsMesh = new THREE.Mesh(
        mergeGeometries(btnGeos),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(buttonColors[0]) })
      );
      cabGroup.add(btnsMesh);
    }

    // Animated Pixel CRT Screen Canvas
    const crtCanvas = document.createElement("canvas");
    crtCanvas.width = 160;
    crtCanvas.height = 128;
    const cctx = crtCanvas.getContext("2d")!;
    const crtTex = new THREE.CanvasTexture(crtCanvas);
    const crtMat = new THREE.MeshBasicMaterial({ map: crtTex });
    const crtMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.38), crtMat);
    crtMesh.position.set(0, 1.18, 0.15);
    crtMesh.rotation.x = -0.18;
    cabGroup.add(crtMesh);

    // Cabinet Coin Door with orange illuminated slots
    const coinDoorGeo = makeBox(0.32, 0.36, 0.02, 0, 0.42, 0.39);
    const coinDoor = new THREE.Mesh(
      coinDoorGeo,
      new THREE.MeshStandardMaterial({ color: 0x1f242d, metalness: 0.85, roughness: 0.3 })
    );
    cabGroup.add(coinDoor);

    const coinSlotMat = new THREE.MeshBasicMaterial({ color: 0xff7700 });
    const coinSlot1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.01), coinSlotMat);
    const coinSlot2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.01), coinSlotMat);
    coinSlot1.position.set(-0.06, 0.48, 0.41);
    coinSlot2.position.set(0.06, 0.48, 0.41);
    cabGroup.add(coinSlot1, coinSlot2);

    // Screen Glow Light
    const cabLight = new THREE.PointLight(new THREE.Color(cfg.accent), 0.7, 2.0);
    cabLight.position.set(0, 1.2, 0.4);
    cabGroup.add(cabLight);

    group.add(cabGroup);

    let credits = 2;
    let animTimer = 0;

    // Register interactive machine
    machines.push({
      id: `cab_${cfg.name.toLowerCase().replace(/\s+/g, "_")}`,
      name: cfg.name,
      actionLabel: `Insert Coin into ${cfg.name}`,
      pos: new THREE.Vector3(cx, 1.0, cz),
      radius: 1.5,
      trigger: () => {
        credits += 1;
        humController.playArcadeCoin();
        cabLight.intensity = 2.4;
        setTimeout(() => {
          cabLight.intensity = 0.7;
        }, 350);
        return `*CLINK* +1 Credit Inserted in ${cfg.name}! (${credits} CREDITS)`;
      },
      update: (dt, time) => {
        animTimer += dt * 4;
        // Draw lively animated CRT graphics
        cctx.fillStyle = "#0a0a14";
        cctx.fillRect(0, 0, 160, 128);

        if (cfg.type === "fighter") {
          // Animated 2-player fighter sparring
          const punch = Math.sin(animTimer * 2) > 0.6 ? 8 : 0;
          cctx.fillStyle = "#33bbff";
          cctx.fillRect(36 + punch, 60, 22, 44); // P1
          cctx.fillStyle = "#ff3366";
          cctx.fillRect(102 - punch, 60, 22, 44); // P2
          cctx.fillStyle = "#ffee00";
          cctx.font = "bold 10px 'Press Start 2P', monospace";
          cctx.fillText("VS", 72, 84);
          cctx.fillStyle = "#00ff66";
          cctx.fillRect(20, 16, 50, 8);
          cctx.fillRect(90, 16, 50, 8);
        } else if (cfg.type === "shmup") {
          // Scrolling vertical space shooter
          const shipX = 80 + Math.sin(animTimer) * 35;
          cctx.fillStyle = "#00f0ff";
          cctx.beginPath();
          cctx.moveTo(shipX, 100);
          cctx.lineTo(shipX - 10, 116);
          cctx.lineTo(shipX + 10, 116);
          cctx.fill();
          // Lasers
          cctx.fillStyle = "#ffee00";
          cctx.fillRect(shipX - 2, 80, 4, 12);
          // Alien bosses
          cctx.fillStyle = "#ff007f";
          cctx.fillRect(40, 24, 28, 16);
          cctx.fillRect(95, 28, 28, 16);
        } else {
          // Retro racing road perspective
          cctx.fillStyle = "#ff0055";
          cctx.fillRect(0, 0, 160, 60); // Sunset sky
          cctx.fillStyle = "#ffee00";
          cctx.beginPath();
          cctx.arc(80, 50, 18, 0, Math.PI * 2);
          cctx.fill();
          cctx.fillStyle = "#1e1e28";
          cctx.fillRect(0, 60, 160, 68); // Asphalt
          // Road lane lines
          const laneOffset = (time * 80) % 24;
          cctx.strokeStyle = "#ffffff";
          cctx.lineWidth = 3;
          for (let y = 62 + laneOffset; y < 128; y += 24) {
            cctx.beginPath();
            cctx.moveTo(80, y);
            cctx.lineTo(80, y + 12);
            cctx.stroke();
          }
        }

        // Scanlines overlay
        cctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        for (let y = 0; y < 128; y += 3) {
          cctx.fillRect(0, y, 160, 1);
        }
        crtTex.needsUpdate = true;
      },
    });
  });

  return { group, machines };
}

/**
 * Builds the Illuminated Prize Crane / Claw Machine with glass enclosure,
 * internal stuffed prize items, and animated claw drop on interaction.
 */
export function createClawMachine(
  x: number,
  z: number
): { group: THREE.Group; machine: InteractiveMachine } {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // Machine Base Frame & Prize Bin
  const baseGeos = [
    makeBox(0.86, 0.68, 0.86, 0, 0.34, 0),
    makeBox(0.86, 0.26, 0.86, 0, 1.87, 0),
  ];
  const baseMesh = new THREE.Mesh(
    mergeGeometries(baseGeos),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(ARCADE_COLORS.neonMagenta) })
  );
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // Glowing "PRIZE CRANE" Marquee
  const marqueeCanvas = document.createElement("canvas");
  marqueeCanvas.width = 256;
  marqueeCanvas.height = 96;
  const mctx = marqueeCanvas.getContext("2d")!;
  mctx.fillStyle = "#0c0816";
  mctx.fillRect(0, 0, 256, 96);
  mctx.strokeStyle = ARCADE_COLORS.neonCyan;
  mctx.lineWidth = 4;
  mctx.strokeRect(4, 4, 248, 88);
  mctx.fillStyle = ARCADE_COLORS.neonYellow;
  mctx.font = "bold 20px 'Press Start 2P', monospace";
  mctx.textAlign = "center";
  mctx.fillText("PRIZE CRANE", 128, 44);
  mctx.fillStyle = ARCADE_COLORS.neonCyan;
  mctx.font = "12px 'JetBrains Mono', monospace";
  mctx.fillText("WIN PLUSH TOYS!", 128, 70);

  const marqueeTex = new THREE.CanvasTexture(marqueeCanvas);
  const marqueeMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.22),
    new THREE.MeshBasicMaterial({ map: marqueeTex })
  );
  marqueeMesh.position.set(0, 1.87, 0.44);
  group.add(marqueeMesh);

  // Clear Glass Enclosure Cube
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.3,
    roughness: 0.08,
    metalness: 0.85,
  });
  const glassMesh = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.95, 0.82), glassMat);
  glassMesh.position.set(0, 1.25, 0);
  group.add(glassMesh);

  // Internal Prize Hopper & Pile of Colorful Toys/Plushies
  const plushColors = ["#ff0055", "#00f0ff", "#ffee00", "#76ff03", "#9d4edd", "#ff7700"];
  const plushGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 28; i++) {
    const rx = (Math.sin(i * 1.7) * 0.28);
    const rz = (Math.cos(i * 2.3) * 0.28);
    const ry = 0.72 + (i % 3) * 0.055;
    const size = 0.07 + (i % 4) * 0.015;
    plushGeos.push(makeBox(size, size, size, rx, ry, rz, i * 0.5, i * 0.3));
  }
  const plushMesh = new THREE.Mesh(
    mergeGeometries(plushGeos),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(plushColors[1]) })
  );
  group.add(plushMesh);

  // Overhead Crane Rail Gantry & Suspended Claw Mechanism
  const gantryMesh = new THREE.Mesh(
    makeBox(0.72, 0.04, 0.04, 0, 1.68, 0),
    new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9 })
  );
  group.add(gantryMesh);

  const clawGroup = new THREE.Group();
  clawGroup.position.set(0, 1.62, 0);

  // Wire cable
  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.35, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  cable.position.set(0, -0.175, 0);
  clawGroup.add(cable);

  // 3-prong metal claw
  const clawHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9 })
  );
  clawHead.position.set(0, -0.35, 0);
  clawGroup.add(clawHead);

  group.add(clawGroup);

  // Interior Spotlight
  const craneLight = new THREE.PointLight(new THREE.Color(ARCADE_COLORS.warmWhite), 1.2, 2.2);
  craneLight.position.set(0, 1.68, 0);
  group.add(craneLight);

  // Control deck on the front
  const deck = new THREE.Mesh(
    makeBox(0.5, 0.08, 0.24, 0, 0.76, 0.48),
    new THREE.MeshLambertMaterial({ color: 0x111111 })
  );
  group.add(deck);

  const dropButton = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12),
    new THREE.MeshBasicMaterial({ color: 0xff0055 })
  );
  dropButton.position.set(0.12, 0.81, 0.48);
  group.add(dropButton);

  let dropStartTime = -10;

  const machine: InteractiveMachine = {
    id: "prize_claw_machine",
    name: "Prize Claw Machine",
    actionLabel: "Drop Crane Claw",
    pos: new THREE.Vector3(x, 1.0, z),
    radius: 1.6,
    trigger: () => {
      dropStartTime = performance.now() * 0.001;
      humController.playClawMachine();
      return "*CLANK!* Crane claw descending... YOU WON A NEON BEAR!";
    },
    update: (_dt, time) => {
      const elapsed = time - dropStartTime;
      if (elapsed >= 0 && elapsed < 2.2) {
        // Drop down and return
        const dropY = Math.sin((elapsed / 2.2) * Math.PI) * 0.45;
        clawGroup.position.y = 1.62 - dropY;
      } else {
        clawGroup.position.y = 1.62;
      }
    },
  };

  return { group, machine };
}

/**
 * Builds the Retro Refreshment & Token Corner:
 * 1. Vintage Japanese/American Soda Vending Machine (Glowing drink marquee)
 * 2. Heavy Metal Token / Coin Changer Machine
 * 3. Red Bubble Gumball Machine
 * 4. Retro Snack Bar Counter with Stools & Neon Sign
 */
export function createSnackCorner(
  startX: number,
  startZ: number
): { group: THREE.Group; machines: InteractiveMachine[] } {
  const group = new THREE.Group();
  const machines: InteractiveMachine[] = [];

  // ==========================================
  // 1. SODA VENDING MACHINE (x = startX, z = startZ)
  // ==========================================
  const sodaGroup = new THREE.Group();
  sodaGroup.position.set(startX, 0, startZ);

  // Machine Red & Cream Body
  const sodaBodyGeos = [
    makeBox(0.88, 1.78, 0.74, 0, 0.89, 0),
    makeBox(0.84, 0.22, 0.08, 0, 0.26, 0.38), // Bottom recessed can delivery bin
  ];
  const sodaBody = new THREE.Mesh(
    mergeGeometries(sodaBodyGeos),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(ARCADE_COLORS.arcadeRed) })
  );
  sodaBody.castShadow = true;
  sodaBody.receiveShadow = true;
  sodaGroup.add(sodaBody);

  // Large Backlit Drink Selection Panel
  const sodaPanelCanvas = document.createElement("canvas");
  sodaPanelCanvas.width = 256;
  sodaPanelCanvas.height = 320;
  const sctx = sodaPanelCanvas.getContext("2d")!;
  sctx.fillStyle = "#0c0816";
  sctx.fillRect(0, 0, 256, 320);
  sctx.fillStyle = "#ffffff";
  sctx.font = "bold 20px 'Press Start 2P', monospace";
  sctx.textAlign = "center";
  sctx.fillText("COLD DRINKS", 128, 48);

  // 4 Drink Slots with prices
  const drinks = [
    { name: "SUPER COLA", col: "#ff0033" },
    { name: "NEON DEW", col: "#76ff03" },
    { name: "CHERRY FIZZ", col: "#ff007f" },
    { name: "SPARK ICE", col: "#00f0ff" },
  ];
  drinks.forEach((d, idx) => {
    const dy = 80 + idx * 56;
    sctx.fillStyle = d.col;
    sctx.fillRect(24, dy, 208, 42);
    sctx.fillStyle = "#ffffff";
    sctx.font = "bold 13px 'Press Start 2P', monospace";
    sctx.fillText(d.name, 128, dy + 26);
  });

  const sodaPanelTex = new THREE.CanvasTexture(sodaPanelCanvas);
  const sodaPanelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.74, 0.98),
    new THREE.MeshBasicMaterial({ map: sodaPanelTex })
  );
  sodaPanelMesh.position.set(0, 1.15, 0.38);
  sodaGroup.add(sodaPanelMesh);

  // Soda Machine Illuminated Glow
  const sodaLight = new THREE.PointLight(new THREE.Color(ARCADE_COLORS.neonCyan), 0.9, 2.5);
  sodaLight.position.set(0, 1.15, 0.65);
  sodaGroup.add(sodaLight);

  group.add(sodaGroup);

  machines.push({
    id: "soda_vending_machine",
    name: "Cold Drinks Vending Machine",
    actionLabel: "Vend Ice-Cold Soda ($1.00)",
    pos: new THREE.Vector3(startX, 1.0, startZ),
    radius: 1.6,
    trigger: () => {
      humController.playSodaVend();
      sodaLight.intensity = 2.2;
      setTimeout(() => {
        sodaLight.intensity = 0.9;
      }, 400);
      return "*THUNK-ROLL-FIZZ!* An ice-cold Cherry Fizz can drops into the dispenser!";
    },
  });

  // ==========================================
  // 2. TOKEN / COIN CHANGER (x = startX + 0.85, z = startZ)
  // ==========================================
  const changerGroup = new THREE.Group();
  changerGroup.position.set(startX + 0.95, 0, startZ);

  // Steel Cabinet & Pedestal
  const changerGeos = [
    makeBox(0.44, 0.64, 0.28, 0, 1.18, 0),
    makeBox(0.08, 0.88, 0.08, 0, 0.44, 0), // Floor stand pedestal
    makeBox(0.38, 0.04, 0.38, 0, 0.02, 0), // Floor base
  ];
  const changerMesh = new THREE.Mesh(
    mergeGeometries(changerGeos),
    new THREE.MeshStandardMaterial({
      color: 0x333b4d,
      metalness: 0.8,
      roughness: 0.3,
    })
  );
  changerMesh.castShadow = true;
  changerGroup.add(changerMesh);

  // "CHANGE - TOKENS" Backlit Sign
  const tokenSignCanvas = document.createElement("canvas");
  tokenSignCanvas.width = 160;
  tokenSignCanvas.height = 80;
  const tctx = tokenSignCanvas.getContext("2d")!;
  tctx.fillStyle = "#ffb703";
  tctx.fillRect(0, 0, 160, 80);
  tctx.fillStyle = "#0c0816";
  tctx.font = "bold 15px 'Press Start 2P', monospace";
  tctx.textAlign = "center";
  tctx.fillText("CHANGE", 80, 36);
  tctx.font = "bold 12px 'Press Start 2P', monospace";
  tctx.fillText("TOKENS", 80, 58);

  const tokenSignTex = new THREE.CanvasTexture(tokenSignCanvas);
  const tokenSignMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.18),
    new THREE.MeshBasicMaterial({ map: tokenSignTex })
  );
  tokenSignMesh.position.set(0, 1.36, 0.15);
  changerGroup.add(tokenSignMesh);

  // Brass Dispenser Tray & Slots
  const trayMesh = new THREE.Mesh(
    makeBox(0.24, 0.06, 0.12, 0, 0.94, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 })
  );
  changerGroup.add(trayMesh);

  group.add(changerGroup);

  machines.push({
    id: "token_changer_machine",
    name: "Arcade Token Changer",
    actionLabel: "Exchange Bill for 4 Tokens",
    pos: new THREE.Vector3(startX + 0.95, 1.0, startZ),
    radius: 1.5,
    trigger: () => {
      humController.playTokenChange();
      return "*WHIR-CLATTER!* 4 shiny brass tokens pour into the dispenser cup!";
    },
  });

  // ==========================================
  // 3. VINTAGE RED GUMBALL MACHINE (x = startX + 1.6, z = startZ + 0.3)
  // ==========================================
  const gumballGroup = new THREE.Group();
  gumballGroup.position.set(startX + 1.6, 0, startZ + 0.3);

  // Cast Iron Pedestal & Base
  const baseCylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.18, 0.85, 12),
    new THREE.MeshLambertMaterial({ color: 0xd90429 })
  );
  baseCylinder.position.set(0, 0.425, 0);
  gumballGroup.add(baseCylinder);

  // Glass Globe
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
    })
  );
  globe.position.set(0, 1.02, 0);
  gumballGroup.add(globe);

  // Colorful interior gumballs
  const gumballGeos: THREE.BufferGeometry[] = [];
  const gumballCols = ["#ff0055", "#00f0ff", "#ffee00", "#76ff03", "#9d4edd"];
  for (let g = 0; g < 18; g++) {
    const r = 0.035;
    const gx = Math.sin(g * 2.1) * 0.09;
    const gz = Math.cos(g * 2.1) * 0.09;
    const gy = 0.92 + (g % 4) * 0.045;
    const s = new THREE.SphereGeometry(r, 6, 6);
    s.translate(gx, gy, gz);
    gumballGeos.push(s);
  }
  const ballsMesh = new THREE.Mesh(
    mergeGeometries(gumballGeos),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(gumballCols[0]) })
  );
  gumballGroup.add(ballsMesh);

  // Chrome Crank & Chute
  const crank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8),
    new THREE.MeshStandardMaterial({ color: 0xc4cbd8, metalness: 0.9 })
  );
  crank.rotation.x = Math.PI / 2;
  crank.position.set(0, 0.84, 0.14);
  gumballGroup.add(crank);

  group.add(gumballGroup);

  // ==========================================
  // 4. RETRO SNACK BAR COUNTER & STOOLS (x = -1.2, z = 3.6)
  // ==========================================
  const counterGroup = new THREE.Group();
  counterGroup.position.set(-1.2, 0, 3.6);

  // Laminate Counter Body with Chrome Edge Trim
  const counterGeos = [
    makeBox(1.8, 0.88, 0.6, 0, 0.44, 0),
    makeBox(1.84, 0.06, 0.64, 0, 0.91, 0),
  ];
  const counterMesh = new THREE.Mesh(
    mergeGeometries(counterGeos),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(ARCADE_COLORS.charcoal) })
  );
  counterMesh.castShadow = true;
  counterMesh.receiveShadow = true;
  counterGroup.add(counterMesh);

  // Countertop items: Service Bell & Straw Dispenser
  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.06, 0.04, 12),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.95, roughness: 0.2 })
  );
  bell.position.set(0.45, 0.96, 0.1);
  counterGroup.add(bell);

  // 2 Chrome Diner Stools with Red Vinyl Cushions
  [-0.5, 0.5].forEach((sx) => {
    const stoolGeos = [
      makeBox(0.04, 0.58, 0.04, sx, 0.29, 0.52),
      makeBox(0.3, 0.04, 0.3, sx, 0.02, 0.52),
    ];
    const stoolBase = new THREE.Mesh(
      mergeGeometries(stoolGeos),
      new THREE.MeshStandardMaterial({ color: 0xc4cbd8, metalness: 0.85 })
    );
    counterGroup.add(stoolBase);

    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.08, 14),
      new THREE.MeshLambertMaterial({ color: 0xd90429 })
    );
    seat.position.set(sx, 0.62, 0.52);
    counterGroup.add(seat);
  });

  // Hanging Illuminated "SNACKS" Neon Sign
  const snackSignCanvas = document.createElement("canvas");
  snackSignCanvas.width = 256;
  snackSignCanvas.height = 96;
  const snCtx = snackSignCanvas.getContext("2d")!;
  snCtx.fillStyle = "#0c0816";
  snCtx.fillRect(0, 0, 256, 96);
  snCtx.strokeStyle = ARCADE_COLORS.neonYellow;
  snCtx.lineWidth = 4;
  snCtx.strokeRect(6, 6, 244, 84);
  snCtx.fillStyle = ARCADE_COLORS.neonMagenta;
  snCtx.font = "bold 26px 'Press Start 2P', monospace";
  snCtx.textAlign = "center";
  snCtx.fillText("SNACKS", 128, 48);
  snCtx.fillStyle = ARCADE_COLORS.neonLime;
  snCtx.font = "11px 'JetBrains Mono', monospace";
  snCtx.fillText("PIZZA • NACHOS • CORNDOGS", 128, 74);

  const snackSignTex = new THREE.CanvasTexture(snackSignCanvas);
  const snackSignMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.44),
    new THREE.MeshBasicMaterial({ map: snackSignTex })
  );
  snackSignMesh.position.set(0, 1.85, 0);
  counterGroup.add(snackSignMesh);

  group.add(counterGroup);

  machines.push({
    id: "snack_bar_counter",
    name: "Arcade Snack Bar",
    actionLabel: "Ring Service Bell for Hot Pizza",
    pos: new THREE.Vector3(-1.2, 1.0, 3.6),
    radius: 1.6,
    trigger: () => {
      humController.playSnackBell();
      return "*DING!* The attendant slides a warm, cheesy slice of arcade pepperoni pizza across the counter!";
    },
  });

  return { group, machines };
}

/**
 * Builds ceiling elements: Galvanized HVAC ducts and hanging neon fixtures
 */
export function createCeilingArchitecture(): THREE.Group {
  const group = new THREE.Group();

  // Galvanized HVAC Air Ducts suspended at Y = 3.2m
  const ductMat = new THREE.MeshStandardMaterial({
    color: 0x5a6373,
    metalness: 0.75,
    roughness: 0.35,
  });

  // Main duct running along back ceiling (X: -4 to +4)
  const duct1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 8.2, 16), ductMat);
  duct1.rotation.z = Math.PI / 2;
  duct1.position.set(0, 3.15, -1.6);
  group.add(duct1);

  // Side duct branch
  const duct2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.8, 16), ductMat);
  duct2.rotation.x = Math.PI / 2;
  duct2.position.set(2.4, 3.15, 0.8);
  group.add(duct2);

  // Suspended Linear Neon Tube Light Fixtures (Magenta & Cyan)
  const tubeMatMagenta = new THREE.MeshBasicMaterial({ color: 0xff007f });
  const tubeMatCyan = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

  const fixtureGeos = [
    makeBox(2.2, 0.04, 0.04, -1.5, 3.05, 0.6),
    makeBox(2.2, 0.04, 0.04, 1.5, 3.05, 0.6),
  ];
  const tubeMagenta = new THREE.Mesh(fixtureGeos[0], tubeMatMagenta);
  const tubeCyan = new THREE.Mesh(fixtureGeos[1], tubeMatCyan);
  group.add(tubeMagenta, tubeCyan);

  return group;
}

/**
 * Builds Back Wall Neon "ARCADE" and High-Score Leaderboard
 */
export function createWallDecorations(): THREE.Group {
  const group = new THREE.Group();

  // Glowing "ARCADE" Neon Tube Sign on back wall at Z = -1.78
  const arcadeSignCanvas = document.createElement("canvas");
  arcadeSignCanvas.width = 512;
  arcadeSignCanvas.height = 128;
  const actx = arcadeSignCanvas.getContext("2d")!;
  actx.fillStyle = "#000000";
  actx.fillRect(0, 0, 512, 128);

  // Neon tube outer glow
  actx.shadowColor = "#ff007f";
  actx.shadowBlur = 18;
  actx.strokeStyle = "#ff007f";
  actx.lineWidth = 6;
  actx.strokeRect(12, 12, 488, 104);

  // Neon text
  actx.fillStyle = "#ffee00";
  actx.shadowColor = "#00f0ff";
  actx.shadowBlur = 24;
  actx.font = "bold 44px 'Press Start 2P', monospace";
  actx.textAlign = "center";
  actx.fillText("ARCADE", 256, 78);

  const arcadeSignTex = new THREE.CanvasTexture(arcadeSignCanvas);
  const arcadeSignMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshBasicMaterial({ map: arcadeSignTex })
  );
  arcadeSignMesh.position.set(0, 2.65, -1.74);
  group.add(arcadeSignMesh);

  // Retro High Score Chalkboard / Leaderboard at X = -3.85, Z = 0.5 (mounted on left wall)
  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = 256;
  boardCanvas.height = 384;
  const bctx = boardCanvas.getContext("2d")!;
  bctx.fillStyle = "#11151c";
  bctx.fillRect(0, 0, 256, 384);
  bctx.strokeStyle = "#ffb703";
  bctx.lineWidth = 4;
  bctx.strokeRect(6, 6, 244, 372);

  bctx.fillStyle = "#ffee00";
  bctx.font = "bold 15px 'Press Start 2P', monospace";
  bctx.textAlign = "center";
  bctx.fillText("HIGH SCORES", 128, 42);

  const scores = [
    { rank: "1ST", tag: "ACE", pts: "999,990" },
    { rank: "2ND", tag: "GLW", pts: "842,100" },
    { rank: "3RD", tag: "NEO", pts: "719,550" },
    { rank: "4TH", tag: "MAX", pts: "605,220" },
    { rank: "5TH", tag: "SAM", pts: "492,080" },
  ];
  scores.forEach((s, idx) => {
    const sy = 88 + idx * 54;
    bctx.fillStyle = "#00f0ff";
    bctx.font = "11px 'Press Start 2P', monospace";
    bctx.textAlign = "left";
    bctx.fillText(`${s.rank} ${s.tag}`, 24, sy);
    bctx.fillStyle = "#ff007f";
    bctx.textAlign = "right";
    bctx.fillText(s.pts, 232, sy);
  });

  const boardTex = new THREE.CanvasTexture(boardCanvas);
  const boardMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 1.25),
    new THREE.MeshBasicMaterial({ map: boardTex })
  );
  boardMesh.rotation.y = Math.PI / 2;
  boardMesh.position.set(-4.16, 2.0, 0.5);
  group.add(boardMesh);

  return group;
}
