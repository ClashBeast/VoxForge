// ════════════════════════════════════════════════════════════════
//  BLOCK BREAKING
//  Hold LMB to progressively break a block based on its hardness.
//  The progress bar fills over time; release resets it.
// ════════════════════════════════════════════════════════════════

import { gB, sB } from '../world/world.js';
import { BD } from '../world/blocks.js';
import { PL } from '../player/physics.js';
import { buildBars } from '../ui/hud.js';

let breakTarget   = null;
let breakProgress = 0;

export function updateBreaking(dt, ray, lmb) {
  const bar  = document.getElementById('breakbar');
  const prog = document.getElementById('breakprogress');

  if (!lmb || !ray) {
    breakTarget = null; breakProgress = 0;
    prog.style.display = 'none'; bar.style.width = '0%';
    return;
  }

  const [bx, by, bz] = ray.hit;
  const key = `${bx},${by},${bz}`;
  if (breakTarget !== key) { breakTarget = key; breakProgress = 0; }

  const id = gB(bx, by, bz);
  if (!id || !BD[id]) { breakTarget = null; breakProgress = 0; return; }

  const hardness  = BD[id].hardness || 1.0;
  breakProgress  += dt / hardness;
  const pct       = Math.min(breakProgress, 1) * 100;
  prog.style.display = 'block';
  bar.style.width    = pct + '%';

  if (breakProgress >= 1) {
    sB(bx, by, bz, 0);
    breakTarget = null; breakProgress = 0;
    prog.style.display = 'none'; bar.style.width = '0%';
    PL.score++;
    buildBars();
  }
}
