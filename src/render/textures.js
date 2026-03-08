// ════════════════════════════════════════════════════════════════
//  TEXTURES & MATERIALS
//  Procedurally generates pixel-noise textures from RGB colors.
//  Results are cached so each unique color is only generated once.
//
//  To add real PNG textures later: replace mkTex() with a
//  THREE.TextureLoader call and return a cached texture per block.
// ════════════════════════════════════════════════════════════════

/* global THREE */

// ── Texture cache ────────────────────────────────────────────────
const TC = {};

/**
 * Creates a 16×16 noisy canvas texture from an RGB color.
 * @param {number} r  Red   0–255
 * @param {number} g  Green 0–255
 * @param {number} b  Blue  0–255
 * @param {number} v  Noise variance (default 22)
 */
export function mkTex(r, g, b, v = 22) {
  const k = `${r},${g},${b}`;          // comma-separated key prevents hash collision
  if (TC[k]) return TC[k];

  const sz = 16;
  const cv = document.createElement('canvas');
  cv.width = cv.height = sz;
  const cx = cv.getContext('2d');
  const id = cx.createImageData(sz, sz);

  for (let i = 0; i < sz * sz; i++) {
    const d = (Math.random() - 0.5) * v;
    id.data[i*4  ] = Math.min(255, Math.max(0, r + d));
    id.data[i*4+1] = Math.min(255, Math.max(0, g + d));
    id.data[i*4+2] = Math.min(255, Math.max(0, b + d));
    id.data[i*4+3] = 255;
  }
  cx.putImageData(id, 0, 0);

  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return (TC[k] = t);
}

// ── Material cache ───────────────────────────────────────────────
const MC = {};

export function mat(r, g, b, a = 1) {
  const k = `${r},${g},${b},${a}`;
  if (MC[k]) return MC[k];
  return (MC[k] = new THREE.MeshLambertMaterial({
    map: mkTex(r, g, b),
    transparent: a < 1,
    opacity: a,
    depthWrite: a >= 1,
  }));
}

// ── Per-block material arrays ─────────────────────────────────────
// Returns [right, left, top, bottom, front, back] materials for a block ID.
import { BD } from '../world/blocks.js';

const bMatCache = {};

export function bMats(id) {
  if (bMatCache[id]) return bMatCache[id];
  const d = BD[id], a = d.alpha || 1;
  return (bMatCache[id] = [
    mat(...d.side, a),
    mat(...d.side, a),
    mat(...d.top,  a),
    mat(...d.bot,  a),
    mat(...d.side, a),
    mat(...d.side, a),
  ]);
}
