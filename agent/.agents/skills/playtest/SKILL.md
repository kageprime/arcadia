---
name: playtest
description: Use when writing or verifying /workspace/out/game.js (<= 300 lines). Runs single-pass headless.mjs to verify gameplay and echoes verified game.js between markers.
---
Always chain `headless.mjs` and the verified code markers in the SAME `code_execution` command that writes `/workspace/card.json` and `/workspace/out/game.js` (`<= 300` lines) in **Tool Call #1**:
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

Do **NOT** write unused `/workspace/out/meta.json` or `/workspace/out/manifest.json` or run the second 30-second PNG-encoding `headless.mjs` command.

What `headless.mjs` verifies:
- `<= 300` lines, zero forbidden tokens (`window`, `document`, `Math.random`, `Date`, `import`, etc.), and palette indices `0..31` only.
- Peak `>= 4` distinct colors, `>= 1` `g.spr` sprite call, active playfield motion (`y >= 20`), early scoring (`> 0` within 300 ticks), `>= 5s` survival on `idle` and `hold-right`, and clean handling of Button `B` (`input.b` / `input.pressed.b`).

If `headless.mjs` prints `PASS`, **STOP CALLING TOOLS IMMEDIATELY** and reply in two sentences! Only if Step 1 failed, fix `/workspace/out/game.js` and re-run `node /workspace/engine/headless.mjs /workspace/out/game.js /workspace/card.json && echo "===BEGIN_VERIFIED_GAME_JS===" && cat /workspace/out/game.js && echo "===END_VERIFIED_GAME_JS==="` in a single command (max 2 fix passes), then reply in two sentences.
