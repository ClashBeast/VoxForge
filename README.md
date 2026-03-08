# MineClone

A browser-based Minecraft-inspired voxel game built with Three.js.

## Running the Game

Because the game uses ES Modules (`import`/`export`), you **must** serve it via a local HTTP server — you can't just open `index.html` directly in a browser.

```bash
# Option 1 – Python (built into most computers)
cd mineclone
python3 -m http.server 8080
# Then open: http://localhost:8080

# Option 2 – Node.js
npx serve .

# Option 3 – VS Code
# Install the "Live Server" extension and click "Go Live"
```

---

## Project Structure

```
mineclone/
├── index.html              ← Entry point + all CSS + UI HTML
├── src/
│   ├── main.js             ← Game loop, boot sequence, wires everything together
│   │
│   ├── world/
│   │   ├── blocks.js       ← Block registry (add new block types here)
│   │   ├── world.js        ← World data array, chunk dirty tracking
│   │   └── worldgen.js     ← Procedural terrain generation (noise, trees)
│   │
│   ├── render/
│   │   ├── renderer.js     ← Three.js setup, lighting, day/night, highlight
│   │   ├── mesher.js       ← Chunk mesh building (InstancedMesh per block type)
│   │   └── textures.js     ← Procedural pixel textures + material cache
│   │
│   ├── player/
│   │   ├── physics.js      ← Player state, AABB collision, walk/swim/fly
│   │   ├── raycast.js      ← DDA raycast for block targeting
│   │   ├── input.js        ← Keyboard, mouse, scroll wheel handlers
│   │   └── breaking.js     ← Progressive block breaking with hardness
│   │
│   └── ui/
│       └── hud.js          ← Hotbar, health/food bars, toasts, death screen
│
└── assets/
    └── textures/           ← Put PNG textures here when you add them
```

---

## How to Add Things

### New block type
Edit `src/world/blocks.js` — add an entry to `BD` and optionally add the ID to `PLACE_IDS`.

### Bigger world
In `src/world/world.js`, increase `WSIZ` (keep it a multiple of 16) and/or `WMAXH`.

### Different terrain shape
Edit the `fbm()` function in `src/world/worldgen.js` — change octave weights or frequencies.

### New biome
In `worldgen.js`, check the `fbm` value range per column and switch block types accordingly.

### Real PNG textures
Replace `mkTex()` in `src/render/textures.js` with a `THREE.TextureLoader` call per block.

### Save / Load
Add `localStorage` read/write to `src/world/world.js` — serialize `wdata` as a base64 string.

### Infinite world
Refactor `src/world/world.js` to use a `Map` keyed by `"cx,cz"` instead of a fixed array, and stream chunks in/out as the player moves.

---

## Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Space | Jump |
| Shift | Sprint |
| LMB (hold) | Break block |
| RMB | Place block |
| Scroll / 1–8 | Select hotbar slot |
| F | Toggle fly mode |
| Q | Eat (restore food) |
| R | Respawn (when dead) |
| Tab | Toggle debug info |
| Esc | Pause |
