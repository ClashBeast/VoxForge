// ════════════════════════════════════════════════════════════════
//  PLAYER – STATE, PHYSICS & COLLISION
//  Swept AABB collision with 4 substeps for stability.
//  Supports walking, sprinting, jumping, flying, swimming.
// ════════════════════════════════════════════════════════════════

/* global THREE */

import { gB, solid, WSIZ, WMAXH } from '../world/world.js';
import { buildBars, takeDamage, drainFood } from '../ui/hud.js';

// ── Player state ─────────────────────────────────────────────────
export const PL = {
  feet:       new THREE.Vector3(),
  vel:        new THREE.Vector3(),
  yaw:        0,
  pitch:      0,
  onGround:   false,
  fly:        false,
  W:          0.6,
  H:          1.8,
  EYE:        1.62,
  bobPhase:   0,
  hp:         20, maxHp:   20,
  food:       20, maxFood: 20,
  lastFallVel:0,
  foodTimer:  0,
  regenTimer: 0,
  score:      0,
  inWater:    false,
};

// ── Physics constants ─────────────────────────────────────────────
const GRAV       = -32.0;
const JUMP_V     =   9.2;
const WALK_ACC   =  60.0;
const SPRINT_ACC =  90.0;
const WALK_MAX   =   4.3;
const SPRINT_MAX =   6.5;
const AIR_DRAG   =   0.08;
const FLY_SPD    =  12.0;
const WATER_DRAG =   0.85;
const WATER_JUMP =   4.5;

// ── Helpers ───────────────────────────────────────────────────────
export function eyePos() {
  return new THREE.Vector3(PL.feet.x, PL.feet.y + PL.EYE, PL.feet.z);
}
export function pMin() { return { x: PL.feet.x - PL.W/2, y: PL.feet.y,       z: PL.feet.z - PL.W/2 }; }
export function pMax() { return { x: PL.feet.x + PL.W/2, y: PL.feet.y + PL.H, z: PL.feet.z + PL.W/2 }; }

// ── Collision helpers ─────────────────────────────────────────────
function overlapBlocks(mn, mx) {
  const out = [], EPS = 5e-4;
  const x0 = Math.floor(mn.x+EPS), x1 = Math.floor(mx.x-EPS);
  const y0 = Math.floor(mn.y+EPS), y1 = Math.floor(mx.y-EPS);
  const z0 = Math.floor(mn.z+EPS), z1 = Math.floor(mx.z-EPS);
  for (let bx = x0; bx <= x1; bx++)
    for (let by = y0; by <= y1; by++)
      for (let bz = z0; bz <= z1; bz++)
        if (solid(bx,by,bz)) out.push(bx,by,bz);
  return out;
}

function resolveY() {
  const EPS = 4e-4;
  const mn = { x: PL.feet.x-PL.W/2+EPS, y: PL.feet.y,       z: PL.feet.z-PL.W/2+EPS };
  const mx = { x: PL.feet.x+PL.W/2-EPS, y: PL.feet.y+PL.H,  z: PL.feet.z+PL.W/2-EPS };
  const bl = overlapBlocks(mn, mx);
  for (let i = 0; i < bl.length; i += 3) {
    const by = bl[i+1];
    if (PL.vel.y <= 0) { PL.feet.y = by+1;      PL.vel.y = 0; PL.onGround = true; }
    else               { PL.feet.y = by - PL.H;  PL.vel.y = 0; }
    mn.y = PL.feet.y; mx.y = PL.feet.y + PL.H;
  }
}

function resolveX() {
  const EPS = 4e-4;
  const mn = { x: PL.feet.x-PL.W/2,   y: PL.feet.y+EPS,        z: PL.feet.z-PL.W/2+EPS };
  const mx = { x: PL.feet.x+PL.W/2,   y: PL.feet.y+PL.H-EPS,   z: PL.feet.z+PL.W/2-EPS };
  const bl = overlapBlocks(mn, mx);
  for (let i = 0; i < bl.length; i += 3) {
    const bx = bl[i];
    if (PL.vel.x > 0) PL.feet.x = bx      - PL.W/2;
    else              PL.feet.x = bx + 1 + PL.W/2;
    PL.vel.x = 0;
    mn.x = PL.feet.x-PL.W/2; mx.x = PL.feet.x+PL.W/2;
  }
}

function resolveZ() {
  const EPS = 4e-4;
  const mn = { x: PL.feet.x-PL.W/2+EPS, y: PL.feet.y+EPS,        z: PL.feet.z-PL.W/2 };
  const mx = { x: PL.feet.x+PL.W/2-EPS, y: PL.feet.y+PL.H-EPS,   z: PL.feet.z+PL.W/2 };
  const bl = overlapBlocks(mn, mx);
  for (let i = 0; i < bl.length; i += 3) {
    const bz = bl[i+2];
    if (PL.vel.z > 0) PL.feet.z = bz      - PL.W/2;
    else              PL.feet.z = bz + 1 + PL.W/2;
    PL.vel.z = 0;
    mn.z = PL.feet.z-PL.W/2; mx.z = PL.feet.z+PL.W/2;
  }
}

// ── Fly mode ──────────────────────────────────────────────────────
function updateFly(dt, keys) {
  const fw = new THREE.Vector3(-Math.sin(PL.yaw), 0, -Math.cos(PL.yaw));
  const rt = new THREE.Vector3( Math.cos(PL.yaw), 0, -Math.sin(PL.yaw));
  const mv = new THREE.Vector3();
  if (keys.KeyW) mv.add(fw); if (keys.KeyS) mv.sub(fw);
  if (keys.KeyA) mv.sub(rt); if (keys.KeyD) mv.add(rt);
  if (keys.Space)     mv.y += 1;
  if (keys.ShiftLeft) mv.y -= 1;
  if (mv.lengthSq() > 0) mv.normalize().multiplyScalar(FLY_SPD);
  PL.vel.lerp(mv, 0.18);
  PL.feet.addScaledVector(PL.vel, dt);
  PL.feet.y = Math.max(0, PL.feet.y);
}

// ── Walk / swim mode ──────────────────────────────────────────────
export function updatePlayer(DT, keys, jumpPress) {
  if (PL.fly) { updateFly(DT, keys); return false; } // returns new jumpPress

  // Water detection
  const waterBlock = gB(PL.feet.x|0, (PL.feet.y+0.5)|0, PL.feet.z|0);
  PL.inWater = (waterBlock === 7);
  document.getElementById('underwater').style.display = PL.inWater ? 'block' : 'none';

  const fw = new THREE.Vector3(-Math.sin(PL.yaw), 0, -Math.cos(PL.yaw));
  const rt = new THREE.Vector3( Math.cos(PL.yaw), 0, -Math.sin(PL.yaw));
  const mv = new THREE.Vector3();
  if (keys.KeyW) mv.add(fw); if (keys.KeyS) mv.sub(fw);
  if (keys.KeyA) mv.sub(rt); if (keys.KeyD) mv.add(rt);

  const sprint = keys.ShiftLeft && mv.lengthSq() > 0 && !PL.inWater;
  const maxSpd = PL.inWater ? WALK_MAX*0.5 : (sprint ? SPRINT_MAX : WALK_MAX);
  const acc    = sprint ? SPRINT_ACC : WALK_ACC;

  // Food drain from sprinting
  if (sprint) {
    PL.foodTimer += DT;
    if (PL.foodTimer > 1.5) { PL.foodTimer = 0; drainFood(1); }
  }

  const SUBSTEPS = 4;
  const dt = DT / SUBSTEPS;

  for (let s = 0; s < SUBSTEPS; s++) {
    if (mv.lengthSq() > 0) {
      const dir  = mv.clone().normalize();
      const hvel = new THREE.Vector3(PL.vel.x, 0, PL.vel.z);
      const lack = maxSpd - hvel.dot(dir);
      if (lack > 0) {
        const push = Math.min(acc*dt, lack);
        PL.vel.x += dir.x * push;
        PL.vel.z += dir.z * push;
      }
      const spd2 = PL.vel.x**2 + PL.vel.z**2;
      if (spd2 > maxSpd**2) {
        const f = maxSpd / Math.sqrt(spd2);
        PL.vel.x *= f; PL.vel.z *= f;
      }
    } else {
      if (PL.onGround) {
        const dec = acc * dt * 1.4;
        const spd = Math.sqrt(PL.vel.x**2 + PL.vel.z**2);
        if (spd <= dec) { PL.vel.x = 0; PL.vel.z = 0; }
        else { const f = (spd-dec)/spd; PL.vel.x *= f; PL.vel.z *= f; }
      } else if (!PL.inWater) {
        PL.vel.x *= (1 - AIR_DRAG);
        PL.vel.z *= (1 - AIR_DRAG);
      }
    }

    if (PL.inWater) {
      PL.vel.y += (-GRAV * 0.85) * dt;
      PL.vel.x *= WATER_DRAG; PL.vel.y *= WATER_DRAG; PL.vel.z *= WATER_DRAG;
      if (jumpPress && !PL.onGround) PL.vel.y = WATER_JUMP;
    } else {
      PL.vel.y += GRAV * dt;
      PL.vel.y  = Math.max(PL.vel.y, -60);
      if (jumpPress && PL.onGround) { PL.vel.y = JUMP_V; PL.onGround = false; jumpPress = false; }
    }

    PL.onGround = false;
    PL.feet.y += PL.vel.y * dt; resolveY();
    PL.feet.x += PL.vel.x * dt; resolveX();
    PL.feet.z += PL.vel.z * dt; resolveZ();
  }

  // World boundary clamp
  PL.feet.x = Math.max(PL.W/2+.01, Math.min(WSIZ - PL.W/2-.01, PL.feet.x));
  PL.feet.z = Math.max(PL.W/2+.01, Math.min(WSIZ - PL.W/2-.01, PL.feet.z));
  if (PL.feet.y < 0) { PL.feet.y = 0; PL.vel.y = 0; PL.onGround = true; }

  // Fall damage
  if (PL.onGround && PL.vel.y === 0 && PL.lastFallVel < -16 && !PL.inWater) {
    const dmg = Math.floor((-PL.lastFallVel - 16) / 4);
    if (dmg > 0) takeDamage(dmg);
  }
  PL.lastFallVel = PL.vel.y;

  // Walk bob
  const hspd = Math.sqrt(PL.vel.x**2 + PL.vel.z**2);
  if (PL.onGround && hspd > 0.5) PL.bobPhase += hspd * DT * 3.2;
  else PL.bobPhase *= 0.85;

  // Health regen when well-fed
  if (PL.food >= 18 && PL.hp < PL.maxHp) {
    PL.regenTimer += DT;
    if (PL.regenTimer > 1.8) { PL.regenTimer = 0; PL.hp = Math.min(PL.maxHp, PL.hp+1); buildBars(); }
  }
  // Starvation damage
  if (PL.food === 0 && PL.hp > 1) {
    PL.regenTimer += DT;
    if (PL.regenTimer > 2.5) { PL.regenTimer = 0; takeDamage(1); }
  }

  return jumpPress;
}
