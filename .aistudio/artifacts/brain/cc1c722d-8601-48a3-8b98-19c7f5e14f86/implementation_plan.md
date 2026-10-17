# Implementation Plan: 90s Neon Arcade Room Expansion

Expand the interactive 3D arcade environment into a full-scale, authentic 1990s neon arcade hangout. The experience retains pure first-person walking and camera look-around, while introducing an iconic blacklight patterned carpet, an expanded lineup of vintage machines (pinball tables, cabinet bank, claw machine), a retro snack & soda refreshment corner, glowing wall neon signs, interactive machine inspection via `E` key (lights, audio chimes, flippers), and toggleable room atmosphere modes.

---

## 1. User Choices & Design Alignment
- **Aesthetic Theme**: Classic 90s Neon Arcade with blacklight-responsive geometric carpet, exposed ceiling ductwork, glowing acrylic marquees, and nostalgic posters.
- **Interactivity Level**: Proximity-aware machine interaction — walking near any machine prompts `[E] Inspect / Play with Machine`, triggering physical animations (flippers, buttons, joysticks, claw drop), localized sound chimes, and marquee flashes.
- **Default Lighting**: **Midnight Neon** — moody room lighting dominated by emissive CRT screens, neon marquee glow, and UV blacklight highlights on the carpet squiggles.

---

## 2. Spatial Architecture & Room Layout (3D Coordinates)

```
                       [ Back Wall: Neon "ARCADE" + String Lights ]
                                Z = -2.8m
     ┌────────────────────────────────────────────────────────────────────────┐
     │  [Token Changer & Soda Vending]       [Main Hero Cabinet]              │
     │      X = -2.6m, Z = -2.4m               X = 0m, Z = 0m                 │
     │                                                                        │
     │  [Retro Pinball 1 & 2]                               [Classic Cab Row] │
     │   X = -3.2m, Z = -0.5m                                X = 2.8m, Z = -1m│
     │   X = -3.2m, Z = +0.8m                                X = 2.8m, Z = 0m │
     │                                                       X = 2.8m, Z = 1m │
     │                                                                        │
     │  [Claw / Crane Machine]            (Player Spawn)     [Air Hockey]     │
     │   X = -2.4m, Z = +2.2m              X = 0, Z = 2.4m    X = 2.2m, Z = 2m│
     │                                                                        │
     │  [Snack & Stool Counter]                                               │
     │   X = -1.2m, Z = +3.6m                                                 │
     └────────────────────────────────────────────────────────────────────────┘
                                Z = +4.5m
                       [ Front Wall: Entrance Glass Doors ]
```

### Room Bounds & Collision Polygons:
- **Floor Area**: 8.0m wide (X: -4.0m to +4.0m) × 7.5m deep (Z: -2.8m to +4.7m).
- **Ceiling**: Height Y = 3.4m with dark acoustic tiles, suspended black matte HVAC ducts, and glowing linear neon tube lights.
- **Smooth Collision Capsules**: Cylindrical/box obstacle colliders for each new station (pinball tables, cabinet row, soda machine, claw machine, counter) so the player navigates naturally without clipping.

---

## 3. Key Components to Build

### Phase A: 90s Fluorescent Blacklight Carpet & Room Architecture
1. **Procedural Neon Carpet Texture**:
   - Deep obsidian/charcoal base canvas (`#0d0811`).
   - Scattered electric geometric confetti: magenta squiggles (`#ff2a8d`), neon cyan triangles (`#00e5ff`), lime yellow zigzags (`#b8ff00`), and purple stardust specks.
   - High-density UV tile repeat with anisotropic filtering and subtle roughness mapping.
2. **Ceiling & Industrial Details**:
   - Suspended circular HVAC ducting across the ceiling perimeter with matte galvanized metal finish.
   - Overhead suspended neon tube fixtures casting colored downlight.
3. **Wall Decor & Illuminated Signs**:
   - Large glowing neon tube sign on the back brick wall: *"ARCADE"* with animated pulse and subtle flicker.
   - Framed vintage 90s arcade marquee posters (space invaders, retro racers) with glass reflection sheen.
   - Illuminated Leaderboard chalkboard with retro pixel initials (`ACE - 999,990`, `GLW - 842,100`).

### Phase B: New 3D Retro Arcade Machines
1. **Vintage Pinball Machines (Left Wing, X = -3.2m)**:
   - Two angled wooden & chrome pinball tables (`Space Odyssey` and `Cyber Knight`).
   - Slanted glass playfield with metallic bumpers, roll-over lanes, and illuminated score backbox display.
2. **Classic 3-Cabinet Bank (Right Wall, X = +2.8m)**:
   - **Cabinet 1: 2-Player Fighter**: Dual joysticks with 6 colorful buttons, glowing "FIGHT" marquee, animated CRT preview.
   - **Cabinet 2: Space Shmup**: Vertical-oriented CRT monitor, red ball-top joystick, alien side art.
   - **Cabinet 3: Retro Racing**: Molded steering wheel, gear shifter, floor pedals, and checkpoint marquee.
3. **Illuminated Claw / Crane Machine (X = -2.4m, Z = +2.2m)**:
   - Clear glass cube enclosure, top spotlight, interior joystick console, and colorful plush shapes resting in the bin.
4. **Retro Refreshment & Coin Corner (Back Left)**:
   - Vintage Japanese/American soda vending machine with glowing front acrylic drink panel.
   - Heavy metal Token / Coin Changer machine with brass coin slots and "TOKENS" marquee.
   - Red bubble gumball machine with reflective glass globe filled with colorful spheres.

### Phase C: Proximity Interaction System (`[E]` Key & Mobile Tap)
1. **Proximity Detection**:
   - Stage calculates distance from `walkPlayerPos` to each machine center.
   - When within interaction radius ($d \le 1.6\text{m}$), HUD displays a clean, minimal interaction prompt:
     `[E] Inspect Machine Name` (or a dedicated quick-tap icon on mobile).
2. **Machine Triggers**:
   - **Pinball**: `E` fires flipper animation, flashes playfield bumpers, and plays an authentic mechanical solenoid "clack" and chime sound.
   - **Arcade Cabinets**: `E` plays coin insert chime (`coin-drop`), jiggles joystick, and boosts marquee brightness.
   - **Soda Machine**: `E` plays a heavy soda can drop thud with a fizz chime.
   - **Token Changer**: `E` dispenses a token clatter sound effect.
3. **Footsteps Audio & Ambient Arcade Murmur**:
   - Soft carpet footstep clicks synthesized via Web Audio API in rhythm with player movement speed.
   - Layered warm room hum with faint retro arcade bleeps in the stereo field.

### Phase D: Lighting Mood Presets
- Quick toggle button in HUD or wall light-switch:
  - **Midnight Neon (Default)**: Deep moody shadows, intense CRT scanline glow, vibrant UV carpet pop.
  - **Sunset / Golden Hour**: Warm orange sunlight cutting through the west window with drifting dust particles.
  - **Cyber Synthwave**: High-contrast magenta & cyan rim lights with deep indigo shadows.

---

## 4. Technical File Plan
- `src/stage/arcadeProps.ts`: Modular procedural 3D prop generators for pinball tables, cabinet row, soda machine, claw machine, and ceiling ducts (merged geometries for high FPS).
- `src/stage/ArcadeStage.ts`: Integration of new room props, carpet texture, machine colliders, proximity calculation, and `E`-key interaction triggers.
- `src/audio/hum.ts`: Enhanced Web Audio sound synthesizer for coin-drops, pinball solenoids, soda drops, and footstep ticks.
- `src/App.tsx`: Clean semantic HUD update for proximity interaction banner (`[E] Inspect`) and lighting mood switcher without cluttering the view.
- `src/styles/playglow.css`: Non-obtrusive styling for proximity prompts and lighting mode pill.

---

## 5. Verification Plan
- **Performance Budget**: Target 60 FPS on 1080p desktop with merged geometry draw calls $< 40$.
- **Collision Integrity**: Verify player cannot walk through machines or clip outside room perimeter.
- **Interaction Testing**: Verify pressing `E` near every machine triggers unique visual and sound reactions.
- **Build & Lint**: Run `compile_applet` and `npm run lint` (`tsc --noEmit`) to ensure clean compilation.
