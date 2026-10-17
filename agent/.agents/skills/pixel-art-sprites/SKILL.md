---
name: pixel-art-sprites
description: Use when drawing the hero, enemies, collectibles or tiles. How to craft 5–6 color dark-outlined multi-frame pixel-art sprites for the engine.
---
## 1. Critical Single-Character Legend Rule
- **NEVER write two-digit numbers like `16` inside a sprite string** (`..16..` is parsed character-by-character as `'1'` and `'6'`).
- Always use **single-character keys** (`o`, `k`, `w`, `a`, `b`, `f`) and map `{ o: 16, k: 16, w: 7, b: P.accent1, f: P.fg, a: P.accent2 }` in `engine.sprite(art, paletteMap)`.
- `.` is always transparent (`0`). Every row should be `12x12` to `16x16` (the engine auto-pads shorter rows with `.`, up to `64x64`).

## 2. 5–6 Color Dark-Outlined Layered Palette Recipe
Every hero and enemy sprite should use **5–6 colors** so it pops against any background:
- `o: 16` or `18` — **Dark 1px silhouette outline** wrapping the character so it never blends into the backdrop.
- `b: P.accent1` & `f: P.fg` — **Primary body & secondary shading** (belly, wings, back, or lower limbs).
- `a: P.accent2` — **Signature hero accessory** taken directly from `card.hero.description` (e.g. yellow gumboots, bubble helmet, scarf, cape, crown, sunglasses, tie).
- `w: 7` & `k: 16` — **Expressive 2-pixel eyes & specular highlight** (`wk` for white sclera + dark pupil looking forward, plus a `w` top-edge shine).

```js
const pal = { o: 16, k: 16, w: 7, b: P.accent1, f: P.fg, a: P.accent2 };
const hero1 = engine.sprite([
  "....oooo....",
  "...obbbbo...",
  "..obwwwwbo..",
  "..obwkbwbo..",
  "..obbbbbbo..",
  ".oobfffaaoo.",
  ".obffffffbo.",
  "..obbbbbbo..",
  "...oo..oo...",
  "..oaa..aao..",
  "..ooo..ooo..",
], pal);
```

## 3. Mandatory Animation & Variety
- **2-Frame Hero Animation**: Always define at least `hero1` and `hero2` (alternating leg stride, wing flap, bobbing accessory, or thruster flame every 6–8 frames: `((engine.frame >> 3) & 1) ? hero2 : hero1`), plus a jump/dash pose or hit flash (`g.spr(spr, x, y, { scale: 2, flipX: facing < 0, flash: invuln > 0 ? 7 : undefined })`).
- **2 Distinct Enemy Sprites**: Define `enemy1Spr` for `card.enemies[0]` (e.g. ground patroller/formation alien) and `enemy2Spr` for `card.enemies[1] || card.enemies[0]` (e.g. aerial swooper/homing orb/armored mini-boss).
- **Collectible Sprite**: Define a `7x7` or `8x8` shaded collectible sprite (`colSpr`) with dark outline `o`, body `a`/`b`, and white sparkle core `w: 7`.
