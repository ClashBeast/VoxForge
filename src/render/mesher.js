// ════════════════════════════════════════════════════════════════
//  CHUNK MESHER  –  Visible-Face-Only BufferGeometry
//
//  Strategy: iterate every block, check all 6 neighbours.
//  Only emit a face when the neighbour is air/transparent.
//  Use Three.js PlaneGeometry positioned+rotated per face direction
//  to avoid any manual quad math.
//
//  Result: 1 draw call per chunk (opaque) + 1 (transparent),
//  zero buried faces, correct block colors, vertex AO.
// ════════════════════════════════════════════════════════════════

/* global THREE */

import { WSIZ, WMAXH, CHUNK, CX, CZ, gB, chunkDirty, chunkIdx } from '../world/world.js';
import { BD } from '../world/blocks.js';

let scene = null;

export const chunkMeshes = Array.from({length: CX}, () =>
  Array.from({length: CZ}, () => ({ opaque: null, trans: null }))
);

export function initMesher(sceneRef) { scene = sceneRef; }

// ── Visibility check ─────────────────────────────────────────────
function showFace(selfId, nx, ny, nz) {
  const nb = gB(nx, ny, nz);
  if (!nb || !BD[nb]) return true;          // air → show
  if (BD[nb].opaque) return false;           // solid neighbour → hide
  if (nb === selfId) return false;           // same transparent → hide
  return true;
}

// ── AO ───────────────────────────────────────────────────────────
function solidAt(x, y, z) {
  if (y < 0 || y > WMAXH) return false;
  const b = gB(x, y, z);
  return b !== 0 && !!BD[b] && BD[b].opaque;
}
function aoVal(s1, s2, sc) {
  if (s1 && s2) return 0.50;
  return 1.0 - ((s1?1:0) + (s2?1:0) + (sc?1:0)) * 0.15;
}

// ── Face specs ───────────────────────────────────────────────────
// Each face: which neighbour to check, the center offset of the
// PlaneGeometry (0.5 units from block center), rotation in Euler,
// which color key, and AO corner neighbour triples.
//
// Block center is at (x+0.5, y+0.5, z+0.5).
// Face center = block center + faceOffset.

const FACE_SPECS = [
  // +Y top
  { dir:[0,1,0],  offset:[0, 0.5, 0],  rot:[-Math.PI/2, 0, 0],          colKey:'top',
    ao:[[[-1,1,-1],[0,1,-1],[1,1,-1]], [[1,1,-1],[1,1,0],[1,1,1]],
        [[1,1,1],[0,1,1],[-1,1,1]],   [[-1,1,1],[-1,1,0],[-1,1,-1]]] },
  // -Y bottom
  { dir:[0,-1,0], offset:[0,-0.5, 0],  rot:[ Math.PI/2, 0, 0],          colKey:'bot',
    ao:[[[-1,-1,1],[0,-1,1],[1,-1,1]], [[1,-1,1],[1,-1,0],[1,-1,-1]],
        [[1,-1,-1],[0,-1,-1],[-1,-1,-1]],[[-1,-1,-1],[-1,-1,0],[-1,-1,1]]] },
  // +X right
  { dir:[1,0,0],  offset:[0.5, 0, 0],  rot:[0,-Math.PI/2, 0],           colKey:'side',
    ao:[[[1,-1,-1],[1,0,-1],[1,-1,-1]], [[1,-1,1],[1,0,1],[1,-1,1]],
        [[1,1,1],[1,0,1],[1,1,1]],      [[1,1,-1],[1,0,-1],[1,1,-1]]] },
  // -X left
  { dir:[-1,0,0], offset:[-0.5, 0, 0], rot:[0, Math.PI/2, 0],           colKey:'side',
    ao:[[[-1,-1,1],[-1,0,1],[-1,-1,1]], [[-1,-1,-1],[-1,0,-1],[-1,-1,-1]],
        [[-1,1,-1],[-1,0,-1],[-1,1,-1]], [[-1,1,1],[-1,0,1],[-1,1,1]]] },
  // +Z front
  { dir:[0,0,1],  offset:[0, 0, 0.5],  rot:[0, Math.PI, 0],             colKey:'side',
    ao:[[[1,-1,1],[0,-1,1],[1,-1,1]], [[-1,-1,1],[0,-1,1],[-1,-1,1]],
        [[-1,1,1],[0,1,1],[-1,1,1]],  [[1,1,1],[0,1,1],[1,1,1]]] },
  // -Z back
  { dir:[0,0,-1], offset:[0, 0,-0.5],  rot:[0, 0, 0],                   colKey:'side',
    ao:[[[-1,-1,-1],[0,-1,-1],[-1,-1,-1]], [[1,-1,-1],[0,-1,-1],[1,-1,-1]],
        [[1,1,-1],[0,1,-1],[1,1,-1]],      [[-1,1,-1],[0,1,-1],[-1,1,-1]]] },
];

// ── Build geometry for one chunk ─────────────────────────────────
function buildChunkGeom(cx, cz) {
  const x0 = cx * CHUNK, x1 = Math.min(x0 + CHUNK, WSIZ);
  const z0 = cz * CHUNK, z1 = Math.min(z0 + CHUNK, WSIZ);

  // We'll merge all opaque faces into one geometry, transparent into another
  const positions = { opq: [], trn: [] };
  const normals   = { opq: [], trn: [] };
  const colors    = { opq: [], trn: [] };
  const indices   = { opq: [], trn: [] };

  // Reusable plane geometry to sample face vertices from
  const plane = new THREE.PlaneGeometry(1, 1);
  const planePos = plane.attributes.position; // 4 verts

  const dummy = new THREE.Object3D();

  for (let y = 0; y <= WMAXH; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const id = gB(x, y, z);
        if (!id || !BD[id]) continue;
        const def   = BD[id];
        const alpha = def.alpha || 1;
        const key   = def.opaque ? 'opq' : 'trn';
        const pos   = positions[key];
        const nor   = normals[key];
        const col   = colors[key];
        const idx   = indices[key];

        for (const spec of FACE_SPECS) {
          const [dx, dy, dz] = spec.dir;
          if (!showFace(id, x+dx, y+dy, z+dz)) continue;

          // Block color for this face
          const [cr, cg, cb] = def[spec.colKey];

          // AO for 4 corners
          const aoV = spec.ao.map(([a,b,c]) =>
            aoVal(solidAt(x+a[0],y+a[1],z+a[2]),
                  solidAt(x+b[0],y+b[1],z+b[2]),
                  solidAt(x+c[0],y+c[1],z+c[2]))
          );

          // Position the plane at the correct face location
          dummy.position.set(
            x + 0.5 + spec.offset[0],
            y + 0.5 + spec.offset[1],
            z + 0.5 + spec.offset[2]
          );
          dummy.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
          dummy.updateMatrix();

          const base = pos.length / 3;
          const norm = spec.dir;

          // PlaneGeometry has 4 vertices in this order:
          // 0: (-0.5, 0.5), 1: (0.5, 0.5), 2: (-0.5,-0.5), 3: (0.5,-0.5)
          // We want corners: TL, TR, BL, BR
          // AO mapping: 0=BL, 1=BR, 2=TR, 3=TL (match our spec order)
          const aoMap = [3, 2, 1, 0]; // plane vertex → ao corner index

          for (let vi = 0; vi < 4; vi++) {
            const v = new THREE.Vector3(
              planePos.getX(vi),
              planePos.getY(vi),
              planePos.getZ(vi)
            ).applyMatrix4(dummy.matrix);

            pos.push(v.x, v.y, v.z);
            nor.push(norm[0], norm[1], norm[2]);
            const a = aoV[aoMap[vi]];
            col.push((cr/255)*a, (cg/255)*a, (cb/255)*a);
          }

          // Two triangles: 0,2,1 and 2,3,1 (PlaneGeometry winding)
          idx.push(base, base+2, base+1,  base+2, base+3, base+1);
        }
      }
    }
  }

  plane.dispose();
  return { positions, normals, colors, indices };
}

// ── Arrays → BufferGeometry ──────────────────────────────────────
function makeGeo(pos, nor, col, idx) {
  if (idx.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(idx.length > 65535
    ? new THREE.BufferAttribute(new Uint32Array(idx),  1)
    : new THREE.BufferAttribute(new Uint16Array(idx), 1));
  geo.computeBoundingSphere();
  return geo;
}

// ── Materials ────────────────────────────────────────────────────
let _matO = null, _matT = null;
const matOpaque = () => _matO || (_matO = new THREE.MeshLambertMaterial({ vertexColors: true }));
const matTrans  = () => _matT || (_matT = new THREE.MeshLambertMaterial({
  vertexColors: true, transparent: true,
  opacity: 0.72, depthWrite: false, side: THREE.DoubleSide,
}));

// ── Rebuild one chunk ─────────────────────────────────────────────
export function rebuildChunk(cx, cz) {
  const slot = chunkMeshes[cx][cz];
  if (slot.opaque) { scene.remove(slot.opaque); slot.opaque.geometry.dispose(); slot.opaque = null; }
  if (slot.trans)  { scene.remove(slot.trans);  slot.trans.geometry.dispose();  slot.trans  = null; }

  const { positions, normals, colors, indices } = buildChunkGeom(cx, cz);

  const gO = makeGeo(positions.opq, normals.opq, colors.opq, indices.opq);
  if (gO) { slot.opaque = new THREE.Mesh(gO, matOpaque()); slot.opaque.frustumCulled = true; scene.add(slot.opaque); }

  const gT = makeGeo(positions.trn, normals.trn, colors.trn, indices.trn);
  if (gT) { slot.trans  = new THREE.Mesh(gT, matTrans());  slot.trans.frustumCulled  = true; scene.add(slot.trans);  }
}

// ── Flush dirty chunks ───────────────────────────────────────────
const REBUILD_PER_FRAME = 4;
export function flushDirtyChunks() {
  let n = 0;
  for (let cz = 0; cz < CZ && n < REBUILD_PER_FRAME; cz++)
    for (let cx = 0; cx < CX && n < REBUILD_PER_FRAME; cx++)
      if (chunkDirty[chunkIdx(cx, cz)]) {
        rebuildChunk(cx, cz); chunkDirty[chunkIdx(cx, cz)] = 0; n++;
      }
}
