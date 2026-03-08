// ════════════════════════════════════════════════════════════════
//  MAIN – Game Loop & Boot
// ════════════════════════════════════════════════════════════════

import { genWorld }                         from './world/worldgen.js';
import { sB, solid, WSIZ, WMAXH, saveWorld, loadWorld, hasSave, deleteSave } from './world/world.js';
import { PLACE_IDS }                        from './world/blocks.js';
import { initThree, scene, camera, renderer, updateDayNight, updateHighlight, dayTime } from './render/renderer.js';
import { initMesher, flushDirtyChunks, rebuildChunk } from './render/mesher.js';
import { CX, CZ, chunkDirty }               from './world/world.js';
import { PL, updatePlayer, eyePos, pMin, pMax } from './player/physics.js';
import { raycast }                          from './player/raycast.js';
import { updateBreaking }                   from './player/breaking.js';
import { initInput, keys, jumpPress, setJumpPress, lmb, rmb, placeCD, setPlaceCD, selSlot, setStarted, dead, showDebug } from './player/input.js';
import { buildHUD, buildBars, killPlayer, isPaused } from './ui/hud.js';

// ── Boot ─────────────────────────────────────────────────────────
initThree();
initMesher(scene);
initInput();

// Show CONTINUE button on title screen if save exists
if (hasSave()) {
  document.getElementById('loadWorldBtn').style.display = 'block';
}

// ── Helpers ───────────────────────────────────────────────────────
function spawnPlayer() {
  const spx = Math.floor(WSIZ / 2), spz = Math.floor(WSIZ / 2);
  let spy = 1;
  for (let y = WMAXH; y >= 0; y--) { if (solid(spx, y, spz)) { spy = y+1; break; } }
  PL.feet.set(spx + .5, spy, spz + .5);
}

function fullRebuild() {
  for (let cz = 0; cz < CZ; cz++)
    for (let cx = 0; cx < CX; cx++) rebuildChunk(cx, cz);
  chunkDirty.fill(0);
}

function showSaveMsg(msg, color='#8f8') {
  const el = document.getElementById('saveMsg');
  el.style.color = color;
  el.textContent = msg;
  setTimeout(() => el.textContent = '', 2500);
}

function flashAutosave() {
  const el = document.getElementById('autosave');
  el.style.opacity = '1';
  setTimeout(() => el.style.opacity = '0', 2000);
}

// ── Game loop ─────────────────────────────────────────────────────
let prevT = 0;
let autoSaveTimer = 0;

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min((t - prevT) / 1000, 0.05);
  prevT = t;
  if (isPaused() || dead) return;

  const newJump = updatePlayer(dt, keys, jumpPress);
  if (newJump !== undefined) setJumpPress(newJump);

  updateDayNight(dt);
  flushDirtyChunks();
  setPlaceCD(placeCD - dt);

  const ray = raycast();
  updateHighlight(ray ? ray.hit : null);
  updateBreaking(dt, ray, lmb);

  // Block placement
  if (rmb && placeCD <= 0 && ray) {
    const [px, py, pz] = ray.prev;
    const pm = pMin(), pM = pMax();
    if (!(pm.x < px+1 && pM.x > px && pm.y < py+1 && pM.y > py && pm.z < pz+1 && pM.z > pz)) {
      sB(px, py, pz, PLACE_IDS[selSlot]);
      PL.score++;
      buildBars();
    }
    setPlaceCD(0.25);
  }

  // Auto-save every 60 seconds
  autoSaveTimer += dt;
  if (autoSaveTimer >= 60) {
    autoSaveTimer = 0;
    saveWorld();
    flashAutosave();
  }

  // Camera + walk bob
  const eyP     = eyePos();
  const bob     = Math.sin(PL.bobPhase) * 0.048;
  const bobSide = Math.sin(PL.bobPhase * 0.5) * 0.022;
  camera.position.set(eyP.x + bobSide, eyP.y + bob, eyP.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = PL.yaw;
  camera.rotation.x = PL.pitch;
  camera.rotation.z = bobSide * 0.4;

  if (PL.hp <= 0) killPlayer();

  if (showDebug) {
    const f = PL.feet;
    const spd = Math.sqrt(PL.vel.x**2 + PL.vel.z**2).toFixed(1);
    const t2  = dayTime;
    const timeStr = t2 < 0.25 ? '🌙 Night' : t2 < 0.5 ? '🌅 Dawn' : t2 < 0.75 ? '☀ Day' : '🌇 Dusk';
    document.getElementById('info').innerHTML =
      `XYZ ${f.x.toFixed(1)} / ${f.y.toFixed(1)} / ${f.z.toFixed(1)}<br>` +
      `Speed ${spd} m/s  |  ${PL.fly ? '✈ FLY' : PL.inWater ? '🌊 SWIM' : PL.onGround ? 'Ground' : 'Air'}<br>` +
      `Time: ${timeStr}  |  Score: ${PL.score}<br>` +
      `[Tab] toggle debug  |  [Ctrl+S] save`;
  }

  renderer.render(scene, camera);
}

// ── Button handlers ───────────────────────────────────────────────

// New world
window._startGame = function () {
  genWorld();
  spawnPlayer();
  fullRebuild();
  document.getElementById('overlay').style.display = 'none';
  setStarted(true);
  document.body.requestPointerLock();
  buildHUD(selSlot);
  requestAnimationFrame(loop);
};

// Continue from save
window._loadAndStart = function () {
  if (loadWorld()) {
    spawnPlayer();
    fullRebuild();
    document.getElementById('overlay').style.display = 'none';
    setStarted(true);
    document.body.requestPointerLock();
    buildHUD(selSlot);
    requestAnimationFrame(loop);
  }
};

// Resume from pause
window._resumeGame = function () {
  import('./player/input.js').then(m => {
    m.setPaused(false);
    document.getElementById('pause').style.display = 'none';
    document.body.requestPointerLock();
  });
};

// Save from pause menu
window._saveGame = function () {
  const ok = saveWorld();
  showSaveMsg(ok ? '✅ World saved!' : '❌ Save failed!', ok ? '#8f8' : '#f88');
  document.getElementById('loadWorldBtn').style.display = 'block';
};

// Load from pause menu
window._loadGame = function () {
  if (!hasSave()) { showSaveMsg('❌ No save found!', '#f88'); return; }
  loadWorld();
  fullRebuild();
  showSaveMsg('✅ World loaded!');
};

// New world from pause menu
window._newGame = function () {
  if (!confirm('Delete your save and start a new world?')) return;
  deleteSave();
  genWorld();
  spawnPlayer();
  fullRebuild();
  document.getElementById('loadWorldBtn').style.display = 'none';
  import('./player/input.js').then(m => {
    m.setPaused(false);
    document.getElementById('pause').style.display = 'none';
    document.body.requestPointerLock();
  });
};

// Respawn
window._respawn = function () {
  import('./ui/hud.js').then(m => m.respawn());
};

// Ctrl+S to save anytime
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.code === 'KeyS') {
    e.preventDefault();
    saveWorld();
    flashAutosave();
  }
});
