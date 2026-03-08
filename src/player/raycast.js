// ════════════════════════════════════════════════════════════════
//  RAYCASTING – DDA (Digital Differential Analyzer)
//  Steps through the world grid along the camera ray to find
//  the first solid block within reach distance.
//
//  Returns { hit:[x,y,z], prev:[x,y,z] } or null if nothing in reach.
//  hit  = the block the player is looking at
//  prev = the empty space just in front of it (used for placement)
// ════════════════════════════════════════════════════════════════

/* global THREE */

import { gB } from '../world/world.js';
import { BD } from '../world/blocks.js';
import { eyePos } from './physics.js';
import { PL } from './physics.js';

export function raycast(reach = 6) {
  const eye = eyePos();
  const dir = new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(PL.pitch, PL.yaw, 0, 'YXZ'))
    .normalize();

  let x = Math.floor(eye.x), y = Math.floor(eye.y), z = Math.floor(eye.z);
  const sx = dir.x >= 0 ? 1 : -1;
  const sy = dir.y >= 0 ? 1 : -1;
  const sz = dir.z >= 0 ? 1 : -1;
  const tdx = Math.abs(1 / dir.x);
  const tdy = Math.abs(1 / dir.y);
  const tdz = Math.abs(1 / dir.z);

  let tmx = dir.x >= 0 ? (x+1 - eye.x)*tdx : (eye.x - x)*tdx;
  let tmy = dir.y >= 0 ? (y+1 - eye.y)*tdy : (eye.y - y)*tdy;
  let tmz = dir.z >= 0 ? (z+1 - eye.z)*tdz : (eye.z - z)*tdz;

  let px = x, py = y, pz = z, t = 0;

  while (t < reach) {
    const id = gB(x, y, z);
    if (id && BD[id] && BD[id].solid) return { hit:[x,y,z], prev:[px,py,pz] };
    px = x; py = y; pz = z;
    if      (tmx < tmy && tmx < tmz) { t = tmx; x += sx; tmx += tdx; }
    else if (tmy < tmz)              { t = tmy; y += sy; tmy += tdy; }
    else                             { t = tmz; z += sz; tmz += tdz; }
  }
  return null;
}
