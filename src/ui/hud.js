// ════════════════════════════════════════════════════════════════
//  HUD & UI
//  Hotbar, health/food bars, damage flash, toast messages,
//  pause menu, death screen, respawn.
// ════════════════════════════════════════════════════════════════

import { BD, PLACE_IDS } from '../world/blocks.js';
import { PL } from '../player/physics.js';
import { solid } from '../world/world.js';
import { WSIZ, WMAXH } from '../world/world.js';

// ── Exported state touched by hud ────────────────────────────────
export let dead = false;

// ── Hotbar ────────────────────────────────────────────────────────
export function buildHUD(selSlot) {
  const hud = document.getElementById('hud');
  hud.innerHTML = '';
  PLACE_IDS.forEach((id, i) => {
    const d  = BD[id];
    const sl = document.createElement('div');
    sl.className = 'slot' + (i === selSlot ? ' active' : '');
    sl.onclick = () => {
      // Notify input module — we import lazily to avoid circular deps
      import('./input.js').then(m => { m.setSelSlot(i); buildHUD(i); });
    };
    const cv  = document.createElement('canvas');
    cv.width = cv.height = 32;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = `rgb(${d.top[0]},${d.top[1]},${d.top[2]})`;
    ctx.fillRect(0, 0, 32, 16);
    const s = d.side;
    ctx.fillStyle = `rgb(${s[0]*.70|0},${s[1]*.70|0},${s[2]*.70|0})`;
    ctx.fillRect(0, 16, 16, 16);
    ctx.fillStyle = `rgb(${s[0]*.88|0},${s[1]*.88|0},${s[2]*.88|0})`;
    ctx.fillRect(16, 16, 16, 16);
    sl.appendChild(cv);
    const num = document.createElement('div');
    num.className = 'slot-num';
    num.textContent = i + 1;
    sl.appendChild(num);
    hud.appendChild(sl);
  });
  document.getElementById('hotlabel').textContent = BD[PLACE_IDS[selSlot]].name;
  buildBars();
}

// ── Health / food bars ────────────────────────────────────────────
export function buildBars() {
  const bars = document.getElementById('bars');
  bars.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const h = document.createElement('div');
    h.className   = 'heart';
    h.textContent = i < Math.ceil(PL.hp / 2) ? '❤' : '🖤';
    bars.appendChild(h);
  }
  for (let i = 0; i < 10; i++) {
    const f = document.createElement('div');
    f.className   = 'food';
    f.textContent = i < Math.ceil(PL.food / 2) ? '🍗' : '·';
    bars.appendChild(f);
  }
}

// ── Damage flash ──────────────────────────────────────────────────
export function takeDamage(n) {
  if (dead) return;
  PL.hp = Math.max(0, PL.hp - n);
  buildBars();
  const d = document.getElementById('dmg');
  d.classList.remove('flash');
  void d.offsetWidth; // force reflow
  d.classList.add('flash');
  setTimeout(() => d.classList.remove('flash'), 200);
}

// ── Food system ───────────────────────────────────────────────────
export function drainFood(n) {
  PL.food = Math.max(0, PL.food - n);
  buildBars();
}

export function eatFood() {
  if (PL.food >= PL.maxFood) { showToast('Not hungry!'); return; }
  PL.food = Math.min(PL.maxFood, PL.food + 6);
  buildBars();
  showToast('Nom! 🍗 +6 food');
}

// ── Death & respawn ───────────────────────────────────────────────
export function killPlayer() {
  if (dead) return;
  dead = true;
  document.getElementById('deathScore').textContent = PL.score;
  document.getElementById('dead').style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock();
}

export function respawn() {
  dead = false;
  PL.hp = PL.maxHp; PL.food = PL.maxFood; PL.score = 0;
  PL.vel.set(0, 0, 0);
  const spx = Math.floor(WSIZ / 2), spz = Math.floor(WSIZ / 2);
  let spy = 1;
  for (let y = WMAXH; y >= 0; y--) { if (solid(spx, y, spz)) { spy = y+1; break; } }
  PL.feet.set(spx + .5, spy, spz + .5);
  buildBars();
  document.getElementById('dead').style.display = 'none';
  document.getElementById('underwater').style.display = 'none';
  document.body.requestPointerLock();
}

// ── Pause ─────────────────────────────────────────────────────────
let _paused = false;
export function togglePause() {
  _paused = !_paused;
  document.getElementById('pause').style.display = _paused ? 'flex' : 'none';
  if (!_paused) document.body.requestPointerLock();
  import('./input.js').then(m => m.setPaused(_paused));
}
export function isPaused() { return _paused; }

// ── Toast messages ────────────────────────────────────────────────
export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 1800);
}
