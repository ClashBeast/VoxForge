// ════════════════════════════════════════════════════════════════
//  CHUNK MESHER
//  Builds InstancedMesh geometry for each 16×16 chunk column.
//  Only dirty chunks are rebuilt each frame (max 2 per frame).
//
//  Performance tip: to go further, replace the per-block
//  InstancedMesh approach with a custom BufferGeometry that
//  only emits visible faces (greedy meshing).
// ════════════════════════════════════════════════════════════════

/* global THREE */

import { WSIZ, WMAXH, CHUNK, CX, CZ, gB, chunkDirty, chunkIdx } from '../world/world.js';
import { BD } from '../world/blocks.js';
import { bMats } from './textures.js';

let scene = null;

// Per-chunk mesh groups: chunkMeshes[cx][cz] = array of THREE.InstancedMesh
export const chunkMeshes = Array.from({length: CX}, () => Array.from({length: CZ}, () => []));

const GEO = new THREE.BoxGeometry(1, 1, 1);
const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

export function initMesher(sceneRef) {
  scene = sceneRef;
}

// A face is visible if the neighbour is air, or a different non-opaque block
function faceVisible(selfId, nx, ny, nz) {
  const nb = gB(nx, ny, nz);
  if (!nb) return true;
  const nbDef = BD[nb];
  if (!nbDef) return true;
  if (nbDef.opaque) return false;
  if (nb === selfId) return false; // same transparent type – hide interior face
  return true;
}

export function rebuildChunk(cx, cz) {
  // Dispose old meshes
  const old = chunkMeshes[cx][cz];
  old.forEach(m => { scene.remove(m); m.geometry.dispose(); });
  chunkMeshes[cx][cz] = [];

  const x0 = cx * CHUNK, x1 = Math.min(x0 + CHUNK, WSIZ);
  const z0 = cz * CHUNK, z1 = Math.min(z0 + CHUNK, WSIZ);

  // Group block positions by block ID
  const grps = {};
  for (let y = 0; y <= WMAXH; y++)
    for (let z = z0; z < z1; z++)
      for (let x = x0; x < x1; x++) {
        const id = gB(x, y, z);
        if (!id || !BD[id]) continue;
        let vis = false;
        for (const [dx, dy, dz] of DIRS) {
          if (faceVisible(id, x+dx, y+dy, z+dz)) { vis = true; break; }
        }
        if (!vis) continue;
        if (!grps[id]) grps[id] = [];
        grps[id].push(x, y, z);
      }

  const dummy    = new THREE.Object3D();
  const newMeshes = [];

  for (const [ids, arr] of Object.entries(grps)) {
    const id  = +ids;
    const cnt = arr.length / 3;
    const m   = new THREE.InstancedMesh(GEO, bMats(id), cnt);
    m.frustumCulled = true;

    for (let i = 0; i < cnt; i++) {
      dummy.position.set(arr[i*3], arr[i*3+1], arr[i*3+2]);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;

    // Manual bounding sphere for r128 frustum culling
    m.geometry = m.geometry.clone();
    m.geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(x0 + CHUNK/2, WMAXH/2, z0 + CHUNK/2),
      Math.sqrt((CHUNK/2)**2 + (WMAXH/2)**2 + (CHUNK/2)**2) + 1
    );

    scene.add(m);
    newMeshes.push(m);
  }
  chunkMeshes[cx][cz] = newMeshes;
}

// Call once per frame – rebuilds up to REBUILD_PER_FRAME dirty chunks
const REBUILD_PER_FRAME = 2;
export function flushDirtyChunks() {
  let rebuilt = 0;
  for (let cz = 0; cz < CZ && rebuilt < REBUILD_PER_FRAME; cz++)
    for (let cx = 0; cx < CX && rebuilt < REBUILD_PER_FRAME; cx++) {
      if (chunkDirty[chunkIdx(cx, cz)]) {
        rebuildChunk(cx, cz);
        chunkDirty[chunkIdx(cx, cz)] = 0;
        rebuilt++;
      }
    }
}
