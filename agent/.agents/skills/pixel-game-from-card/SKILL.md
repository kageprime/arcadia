---
name: pixel-game-from-card
description: Use for every request. Turns a GameDesignCard JSON into a bespoke, arcade-polished /workspace/out/game.js (<= 300 lines) in 1 single tool call.
---
## 1-Step Fast Path (`1 Tool Call`)
1. **Step 1 (Tool Call #1 — Single `code_execution` call)**:
   - Do **NOT** run `ls` or `cat /workspace/engine/games/<genre>.js` first (the reference `<genre>.js` is already provided in the prompt, and `/workspace/engine/games/<genre>.js` is on disk if ever needed).
   - Do **NOT** write unused `/workspace/out/meta.json` or `/workspace/out/manifest.json` or run the second 30-second PNG-encoding `headless.mjs` command.
   - Immediately in **Tool Call #1**, run a single bash command that creates `/workspace/out`, writes `/workspace/card.json`, writes `/workspace/out/game.js` (`<= 300` lines implementing the 4 customization pillars: 5–6 color dark-outlined 2-frame hero sprites `hero1`/`hero2` using single-char keys `{o:16,k:16,w:7,b:P.accent1,f:P.fg,a:P.accent2}`, 2 distinct enemy sprites `enemy1Spr`/`enemy2Spr`, 3-layer backdrop for `card.art.scene`, and active Button `B` ability for `card.mechanics` using `engine.burst()` and `engine.popup()`), runs `node /workspace/engine/headless.mjs /workspace/out/game.js /workspace/card.json`, and on `PASS` echoes the verified file between markers:
     ```bash
     mkdir -p /workspace/out && cat << 'EOF' > /workspace/card.json
     ...card JSON...
     EOF
     cat << 'EOF' > /workspace/out/game.js
     export function create(engine, card) {
       // <= 300 lines
     }
     EOF
     node /workspace/engine/headless.mjs /workspace/out/game.js /workspace/card.json && echo "===BEGIN_VERIFIED_GAME_JS===" && cat /workspace/out/game.js && echo "===END_VERIFIED_GAME_JS==="
     ```
2. **Step 2 (ONLY if Step 1 did NOT print `PASS`, max 2 fix passes)**:
   - If Step 1 printed `PASS`, **STOP CALLING TOOLS IMMEDIATELY** and reply in two sentences!
   - Only if Step 1 failed, fix `/workspace/out/game.js` and re-run `node /workspace/engine/headless.mjs /workspace/out/game.js /workspace/card.json && echo "===BEGIN_VERIFIED_GAME_JS===" && cat /workspace/out/game.js && echo "===END_VERIFIED_GAME_JS==="` in a single command, then reply in two sentences.

## The 4 Mandatory Customization Pillars (`<= 300` lines total)

### Pillar 1: 5–6 Color Outlined Multi-Frame Hero & 2 Distinct Enemy Sprites
- Craft custom `12x12` to `16x16` sprites (`scale: 2`) using **single-character palette keys only** (NEVER write `"16"` inside a sprite string):
  `const pal = { o: 16, k: 16, w: 7, b: P.accent1, f: P.fg, a: P.accent2 };`
  where `o` = dark silhouette outline (`16` or `18`), `b`/`f` = primary/secondary body, `a` = signature accessory from `card.hero.description`, `w: 7` & `k: 16` = 2-pixel eyes + highlight.
- Define **2 hero animation frames** (`hero1`, `hero2` toggled via `((engine.frame >> 3) & 1)`) and **2 distinct enemy sprites** (`enemy1Spr` for `card.enemies[0]`, `enemy2Spr` for `card.enemies[1] || card.enemies[0]`). Draw with `g.spr(spr, x, y, { scale: 2, flipX, flash: hitTimer > 0 ? 7 : undefined })`.

### Pillar 2: 3-Layer Procedural Backdrop Matching `card.art.scene`
Render 3 depth layers before gameplay entities:
1. **Sky & Celestial Body**: `g.dither(0, 20, 320, 76, P.bg, 16, 2)` + `g.circ(...)` sun/moon/ringed planet.
2. **Scrolling Midground Silhouettes**: Parallax hills, city towers, pine ridges, or temple pillars using `g.rect`, `g.tri`, or `g.circ` scrolled by `engine.time`.
3. **Foreground / Ambient Motion**: `g.starfield(0, engine.time * 24, 28, 7, P.accent2)` or drifting embers/snow/bubbles + ground/arena trim.

### Pillar 3: Signature Button `B` Hero Ability + Built-In Engine Juice
- Implement the hero's signature **Button `B` ability** from `card.mechanics` on `input.pressed.b` (with a short cooldown timer and HUD/player indicator).
- Trigger 1-line engine juice on every collect, ability activation, and hit:
  - `engine.burst(x, y, { count: 12, color: P.accent2, speed: 70 })` (built-in particle ring buffer)
  - `engine.popup("+25", x, y, P.accent2)` (floating shadowed text)
  - `engine.flash(4, 7)` & `engine.shake(6, 3)` & `engine.sfx("powerup", 4)`

### Pillar 4: 18 Sub-Genre Blueprints (Pick the Best Fit for `card.mechanics` & `card.hero`)
Keep early scoring (`> 0` points within 300 ticks), `>= 5s` survival on `idle` and `hold-right`, and `gameOver` within 120s on `idle`:
- **`dodger`**:
  1. *Skyfall Survival*: Falling meteors (`enemy1Spr`), diagonal seekers (`enemy2Spr`), telegraphed `!` giant crushers, near-miss graze bonus (`+5`), and `B` phase-dash.
  2. *360° Arena Graze*: 4-way movement inside a central ring while hazards converge from all 4 edges; `B` triggers a shockwave/shield pulse.
  3. *Warp-Lane Switcher*: 4–5 lanes with hazards charging down tracks; `A`/`B` warp-dashes between lanes with afterimage trail.
- **`shooter`**:
  1. *Galaga Formation & Dreadnought*: Sine-wave squadrons (`enemy1Spr`), locking divers, and 5-HP mini-boss (`enemy2Spr` with `g.bar` HP bar); `B` fires a shot-clearing nova pulse.
  2. *Twin-Stick / 4-Way Turret Arena*: Free 2D movement firing in movement/aim direction against perimeter waves; `B` fires an overdrive spread ring.
  3. *Side-Scrolling Shmup*: Horizontal starfighter scrolling right across terrain ridges, blasting forward waves; `B` launches a piercing mega-beam.
- **`runner`**:
  1. *Hurdle & Swooper Dash*: Ground hazards (`enemy1Spr`) + mid-air swooper drones (`enemy2Spr`), double-jump (`A`/`UP`), fast-fall slam (`DOWN`), and `B` forward surge dash.
  2. *Gravity-Flip Floor/Ceiling*: Hero flips gravity between floor (`y=166`) and ceiling (`y=34`) on `A`/`UP` while dodging top/bottom hazards; `B` star-magnet dash.
  3. *Jetpack Cave Flyer*: Hold `A`/`UP` to thrust through cavern stalactites and aerial drones; `B` sonic clear / turbo boost.
- **`maze`**:
  1. *Wrap-Tunnel Ghost Chase*: Tile maze with row-5 warp tunnel, 3 ghost personalities (Chaser, Ambusher, Patroller), power pellets, and `B` flutter phase-dash.
  2. *Stealth Light-Cone Heist*: Patrol guards (`enemy1Spr`) sweep forward light cones (`g.tri`); `B` triggers a brief stealth cloak or smoke bomb.
  3. *Grid Bomb-Dropper*: Collect maze loot and drop spark-bombs on `B` that detonate in a `+` cross to stun chasers and clear blocks.
- **`breakout`**:
  1. *Armored Brick Breaker*: Beveled bricks + 2-HP silver top row (`enemy2Spr`), `"M"`/`"W"` drops, 3-point ball trail, and `B`/`A` paddle Power Smash pierce.
  2. *Boss Core Siege*: Bricks shield a moving top-lane Boss Core (`enemy2Spr` with `g.bar` HP) that lobs sparks down; `B` fires a counter-shot or dash-slides paddle.
  3. *Pinball Bumper Arena*: Top brick banks + glowing mid-field circular bumpers (`g.circ`) that ricochet the ball for combo multipliers; `B` upward ball boost.
- **`platformer`**:
  1. *Vertical Tower Climber*: Stone side pillars with wall-slide & wall-jump, stompable beetles (`enemy1Spr`), rising lava (`enemy2Spr`), top goal flag, and `B` shockwave stomp.
  2. *Single-Screen Orb-Kick Arena*: Stomp or press `B` to stun enemies (`enemy1Spr`) and kick them across ledges to bowl over other hazards (`enemy2Spr`) for gem showers.
  3. *Rising-Hazard Wall-Jumper*: Fast alternating wall-jumps and moving ledges above a rising hazard tide; `B` air-dash / grapple boost.

## Hard Sandbox Rules
- Forbidden tokens (never use even in comments/strings): `window`, `document`, `globalThis`, `fetch`, `XMLHttpRequest`, `WebSocket`, `import`, `eval`, `Function`, `setTimeout`, `setInterval`, `Date`, `Math.random`. Use `engine.time`, `engine.frame`, `engine.rng()`, `engine.rngInt(min, max)`.
