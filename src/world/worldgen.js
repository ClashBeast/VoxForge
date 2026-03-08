// ════════════════════════════════════════════════════════════════
//  WORLD GENERATION
//  Procedural terrain using fractional Brownian motion (fBm).
//
//  Want different terrain? Tweak fbm() octave weights/frequencies,
//  or add biome logic by checking the fbm value ranges.
// ════════════════════════════════════════════════════════════════

import { WSIZ, WMAXH, SEA, sB, markAllDirty } from './world.js';

// ── Noise helpers ────────────────────────────────────────────────
function hash(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function smoo(t) { return t * t * (3 - 2 * t); }

function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix,        fz = z - iz;
  const ux = smoo(fx),      uz = smoo(fz);
  return hash(ix   + iz*57)*(1-ux)*(1-uz)
       + hash(ix+1 + iz*57)*   ux *(1-uz)
       + hash(ix   +(iz+1)*57)*(1-ux)*uz
       + hash(ix+1 +(iz+1)*57)*   ux *uz;
}

export function fbm(x, z) {
  return vnoise(x*.040, z*.040)*.52
       + vnoise(x*.090, z*.090)*.26
       + vnoise(x*.200, z*.200)*.13
       + vnoise(x*.460, z*.460)*.06
       + vnoise(x*.900, z*.900)*.03;
}

// ── Tree planting ────────────────────────────────────────────────
function plantTree(x, h, z) {
  const th = 4 + Math.floor(Math.random() * 3);
  for (let ty = 1; ty <= th; ty++) sB(x, h+ty, z, 4); // trunk
  for (let lx = -2; lx <= 2; lx++)
    for (let lz = -2; lz <= 2; lz++)
      for (let ly = -1; ly <= 2; ly++) {
        if (Math.abs(lx)+Math.abs(lz)+Math.abs(ly) <= 3)
          sB(x+lx, h+th+ly, z+lz, 5); // leaves
      }
}

// ── Main generation ──────────────────────────────────────────────
export function genWorld() {
  for (let x = 0; x < WSIZ; x++) {
    for (let z = 0; z < WSIZ; z++) {
      const h    = Math.round(fbm(x,z) * 18 + SEA - 2) | 0;
      const sand = h <= SEA + 1;

      sB(x, 0, z, 3); // stone floor

      for (let y = 1; y <= h; y++) {
        if      (y === h)   sB(x, y, z, sand ? 6 : 1); // grass or sand top
        else if (y >= h-3)  sB(x, y, z, 2);             // dirt layer
        else                sB(x, y, z, 3);             // stone below
      }

      // gravel patches under sand beaches
      if (sand && h > 4)
        for (let y = h-1; y >= Math.max(1, h-2); y--) sB(x, y, z, 8);

      // fill water up to sea level
      for (let y = h+1; y <= SEA; y++) sB(x, y, z, 7);

      // trees on land
      if (!sand && h > SEA+1 && Math.random() < 0.018)
        plantTree(x, h, z);
    }
  }
  markAllDirty();
}
