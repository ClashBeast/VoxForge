// ════════════════════════════════════════════════════════════════
//  INPUT
//  Keyboard, mouse look, mouse buttons, scroll wheel.
//  All raw input state is exported so other modules can read it.
// ════════════════════════════════════════════════════════════════

import { PL } from './physics.js';
import { PLACE_IDS } from '../world/blocks.js';
import { buildHUD, showToast, eatFood } from '../ui/hud.js';
import { togglePause } from '../ui/hud.js';
import { respawn } from '../ui/hud.js';

export const keys     = {};
export let jumpPress  = false;
export let selSlot    = 0;
export let lmb        = false;
export let rmb        = false;
export let placeCD    = 0;
export let paused     = false;
export let started    = false;
export let dead       = false;
export let showDebug  = true;

// Setters for external modules
export function setJumpPress(v)  { jumpPress = v; }
export function setLmb(v)        { lmb = v; }
export function setRmb(v)        { rmb = v; }
export function setPlaceCD(v)    { placeCD = v; }
export function setPaused(v)     { paused = v; }
export function setStarted(v)    { started = v; }
export function setDead(v)       { dead = v; }
export function setShowDebug(v)  { showDebug = v; }
export function setSelSlot(v)    { selSlot = v; }

export function initInput() {
  document.addEventListener('keydown', e => {
    if (!started) return;
    if (e.code === 'Escape') { if (!dead) togglePause(); return; }
    if (paused || dead) return;

    keys[e.code] = true;

    if (e.code === 'Space')   { jumpPress = true; e.preventDefault(); }
    if (e.code === 'KeyF')    { PL.fly = !PL.fly; PL.vel.set(0,0,0); showToast(PL.fly ? '✈ Fly ON' : '▶ Fly OFF'); }
    if (e.code === 'Tab')     { e.preventDefault(); showDebug = !showDebug; document.getElementById('info').style.display = showDebug ? 'block' : 'none'; }
    if (e.code === 'KeyQ')    { eatFood(); }
    if (e.code === 'KeyR')    { if (dead) respawn(); }

    if (e.code.startsWith('Digit')) {
      const n = +e.key - 1;
      if (n >= 0 && n < PLACE_IDS.length) { selSlot = n; buildHUD(); }
    }
  });

  document.addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'Space') jumpPress = false;
  });

  document.addEventListener('mousemove', e => {
    if (!started || paused || dead || document.pointerLockElement !== document.body) return;
    PL.yaw   -= e.movementX * 0.002;
    PL.pitch -= e.movementY * 0.002;
    PL.pitch  = Math.max(-Math.PI/2 + .015, Math.min(Math.PI/2 - .015, PL.pitch));
  });

  document.addEventListener('mousedown', e => {
    if (!started || paused || dead) return;
    if (document.pointerLockElement !== document.body) { document.body.requestPointerLock(); return; }
    if (e.button === 0) lmb = true;
    if (e.button === 2) rmb = true;
  });

  document.addEventListener('mouseup', e => {
    if (e.button === 0) lmb = false;
    if (e.button === 2) rmb = false;
  });

  document.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('wheel', e => {
    if (!started || paused || dead) return;
    selSlot = (selSlot + (e.deltaY > 0 ? 1 : -1) + PLACE_IDS.length) % PLACE_IDS.length;
    buildHUD();
  });
}
