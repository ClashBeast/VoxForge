// ════════════════════════════════════════════════════════════════
//  WORLD – CHUNK-BASED STORAGE
//  The world is a fixed WSIZ×WMAXH×WSIZ grid of block IDs.
//  Split into 16×16 column chunks; only dirty chunks rebuild meshes.
//
//  To make the world bigger: increase WSIZ (keep it a multiple of CHUNK).
//  To add more height:       increase WMAXH.
//  To change sea level:      change SEA.
// ════════════════════════════════════════════════════════════════

import { BD } from './blocks.js';

export const WSIZ  = 80;   // world width/depth in blocks
export const WMAXH = 48;   // max world height in blocks
export const SEA   = 16;   // sea level y
export const CHUNK = 16;   // chunk width in blocks (XZ)

export const CX = Math.ceil(WSIZ / CHUNK);
export const CZ = Math.ceil(WSIZ / CHUNK);

// Flat Uint8Array storing all block IDs: world[x + z*WSIZ + y*WSIZ*WSIZ]
export const wdata = new Uint8Array(WSIZ * WSIZ * (WMAXH + 1));

// ── Index helpers ────────────────────────────────────────────────
export function wi(x, y, z)  { return x + z * WSIZ + y * WSIZ * WSIZ; }
export function inW(x, y, z) { return x >= 0 && x < WSIZ && y >= 0 && y <= WMAXH && z >= 0 && z < WSIZ; }

// ── Block getters/setters ────────────────────────────────────────
export function gB(x, y, z) {
  x=x|0; y=y|0; z=z|0;
  return inW(x,y,z) ? wdata[wi(x,y,z)] : 0;
}

export function sB(x, y, z, id) {
  if (!inW(x,y,z)) return;
  wdata[wi(x,y,z)] = id;
  // Mark this chunk and edge-neighbours dirty
  const cx = x >> 4, cz = z >> 4;
  markChunkDirty(cx, cz);
  if ((x & 15) === 0)  markChunkDirty(cx-1, cz);
  if ((x & 15) === 15) markChunkDirty(cx+1, cz);
  if ((z & 15) === 0)  markChunkDirty(cx,   cz-1);
  if ((z & 15) === 15) markChunkDirty(cx,   cz+1);
}

export function solid(x, y, z) { const b = gB(x,y,z); return b !== 0 && !!BD[b] && BD[b].solid; }
export function opaque(x, y, z){ const b = gB(x,y,z); return b !== 0 && !!BD[b] && BD[b].opaque; }

// ── Chunk dirty tracking ─────────────────────────────────────────
export const chunkDirty = new Uint8Array(CX * CZ);

export function chunkIdx(cx, cz) { return cx + cz * CX; }

export function markChunkDirty(cx, cz) {
  if (cx >= 0 && cx < CX && cz >= 0 && cz < CZ)
    chunkDirty[chunkIdx(cx, cz)] = 1;
}

export function markAllDirty() { chunkDirty.fill(1); }
