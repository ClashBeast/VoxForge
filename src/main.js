// ════════════════════════════════════════════════════════════════
//  MAIN – Game Loop & Boot
//  This is the only file that touches everything else.
//  Think of it as the director: it calls each system in order
//  every frame and wires up the start/pause/respawn buttons.
// ════════════════════════════════════════════════════════════════

import { genWorld }                    from './world/worldgen.js';
import { sB, solid, WSIZ, WMAXH }      from './world/world.js';
import { PLACE_IDS }                   from './world/blocks.js';
import { initThree, scene, camera, renderer, updateDayNight, updateHighlight, dayTime } from './render/renderer.js';
import { initMesher, flushDirtyChunks, rebuildChunk } from './render/mesher.js';
import { CX, CZ, chunkDirty }          from './world/world.js';
import { PL, updatePlayer, eyePos, pMin, pMax } from './player/physics.js';
import { raycast }                     from './player/raycast.js';
import { updateBreaking }              from './player/breaking.js';
import { initInput, keys, jumpPress, setJumpPress, lmb, rmb, placeCD, setPlaceCD, selSlot, paused, started, setStarted, dead, showDebug } from './player/input.js';
import { buildHUD, buildBars, killPlayer, isPaused }  from './ui/hud.js';

// ── Boot ─────────────────────────────────────────────────────────
initThree();
initMesher(scene);
initInput();
genWorld();

// Find safe spawn
const spx = Math.floor(WSIZ / 2), spz = Math.floor(WSIZ / 2);
let spy = 1;
for (let y = WMAXH; y >= 0; y--) { if (solid(spx, y, spz)) { spy = y+1; break; } }
PL.feet.set(spx + .5, spy, spz + .5);

// Initial full chunk build
for (let cz = 0; cz < CZ; cz++)
  for (let cx = 0; cx < CX; cx++) rebuildChunk(cx, cz);
chunkDirty.fill(0);

// ── Game loop ─────────────────────────────────────────────────────
let prevT = 0;

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min((t - prevT) / 1000, 0.05);
  prevT = t;
  if (!started || isPaused() || dead) return;

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

  // Camera + walk bob
  const eyP    = eyePos();
  const bob     = Math.sin(PL.bobPhase) * 0.048;
  const bobSide = Math.sin(PL.bobPhase * 0.5) * 0.022;
  camera.position.set(eyP.x + bobSide, eyP.y + bob, eyP.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = PL.yaw;
  camera.rotation.x = PL.pitch;
  camera.rotation.z = bobSide * 0.4;

  // Death check
  if (PL.hp <= 0) killPlayer();

  // Debug overlay
  if (showDebug) {
    const f = PL.feet;
    const spd = Math.sqrt(PL.vel.x**2 + PL.vel.z**2).toFixed(1);
    const t2  = dayTime;
    const timeStr = t2 < 0.25 ? '🌙 Night' : t2 < 0.5 ? '🌅 Dawn' : t2 < 0.75 ? '☀ Day' : '🌇 Dusk';
    document.getElementById('info').innerHTML =
      `XYZ ${f.x.toFixed(1)} / ${f.y.toFixed(1)} / ${f.z.toFixed(1)}<br>` +
      `Speed ${spd} m/s  |  ${PL.fly ? '✈ FLY' : PL.inWater ? '🌊 SWIM' : PL.onGround ? 'Ground' : 'Air'}<br>` +
      `Time: ${timeStr}  |  Score: ${PL.score}<br>` +
      `[Tab] toggle debug`;
  }

  renderer.render(scene, camera);
}

// ── UI button handlers (called from HTML onclick) ─────────────────
window._startGame = function () {
  document.getElementById('overlay').style.display = 'none';
  setStarted(true);
  document.body.requestPointerLock();
  buildHUD(selSlot);
  requestAnimationFrame(loop);
};

window._resumeGame = function () {
  import('./player/input.js').then(m => {
    m.setPaused(false);
    document.getElementById('pause').style.display = 'none';
    document.body.requestPointerLock();
  });
};

window._respawn = function () {
  import('./ui/hud.js').then(m => m.respawn());
};
