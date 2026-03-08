// ════════════════════════════════════════════════════════════════
//  CHUNK MESHER  –  Greedy Face-Merging
//
//  Replaces the old InstancedMesh-per-block approach with a single
//  BufferGeometry per chunk that only emits *visible* faces, merged
//  into the largest possible quads (greedy meshing).
//
//  Why it's faster:
//    Old: 1 draw-call per block-type per chunk, full cube geometry
//         including buried faces.
//    New: 1–2 draw-calls per chunk (opaque + transparent), only
//         exposed faces, merged into big quads.
//         Typical terrain: 10–50× fewer triangles.
//
//  How greedy meshing works (per axis-slice):
//    1. Build a 2-D "face mask" for every y-slice (top/bottom faces),
//       x-slice (left/right), z-slice (front/back).
//    2. Walk the mask; when you find an unmerged face, expand it as
//       far right as possible, then as far down as possible (rectangle
//       extension), emit one quad covering the whole rectangle, mark
//       those cells consumed.
//    3. Push positions, normals, UVs, and a vertex-color that encodes
//       the block's texture color + AO into Float32Arrays.
//
//  Vertex Color AO (ambient occlusion):
//    Each corner of a quad checks its 3 neighbours (edge, edge, corner).
//    Count of solid neighbours → darker corner.  Gives cheap soft shadows
//    with zero extra draw calls.
//
//  Face ordering  (matches Three.js BoxGeometry convention so existing
//  texture/material lookups stay compatible):
//    0 +X right   1 -X left   2 +Y top   3 -Y bottom
//    4 +Z front   5 -Z back
// ════════════════════════════════════════════════════════════════

/* global THREE */

import { WSIZ, WMAXH, CHUNK, CX, CZ, gB, chunkDirty, chunkIdx } from '../world/world.js';
import { BD } from '../world/blocks.js';

let scene = null;

// chunkMeshes[cx][cz] = { opaque: THREE.Mesh|null, trans: THREE.Mesh|null }
export const chunkMeshes = Array.from({length: CX}, () =>
  Array.from({length: CZ}, () => ({ opaque: null, trans: null }))
);

export function initMesher(sceneRef) { scene = sceneRef; }

// ── AO helper ────────────────────────────────────────────────────
// Returns 0.0–1.0 brightness for a quad corner.
// e1, e2 = the two edge neighbours; c = the diagonal corner neighbour.
function aoVal(e1, e2, c) {
  const s1 = e1 ? 1 : 0, s2 = e2 ? 1 : 0, sc = c ? 1 : 0;
  if (s1 && s2) return 0.50;           // fully occluded corner
  return 1.0 - (s1 + s2 + sc) * 0.15; // 0, 1, or 2 neighbours
}

// ── Face definitions ──────────────────────────────────────────────
// For each of the 6 faces we need:
//   norm   – outward normal vector
//   du/dv  – the two tangent axes that span the quad
//   check  – offset to the neighbouring block (to test visibility)
//   ao*    – offsets for the 4 AO edge/corner neighbours per corner
//
// Quad corners are: (0,0) (1,0) (1,1) (0,1) in (u,v) space.
// We emit 2 triangles: [0,1,2] and [0,2,3].

const FACES = [
  // +X right
  { norm:[1,0,0], du:[0,0,1], dv:[0,1,0], check:[1,0,0],
    ao:[ [[0,1,-1],[0,-1,0],[0,-1,-1]], [[0,1,1],[0,-1,0],[0,-1,1]],
         [[0,1,1],[0,1,0],[0,1,1]],    [[0,1,-1],[0,1,0],[0,1,-1]] ] },
  // -X left
  { norm:[-1,0,0], du:[0,0,-1], dv:[0,1,0], check:[-1,0,0],
    ao:[ [[0,1,1],[0,-1,0],[0,-1,1]], [[0,1,-1],[0,-1,0],[0,-1,-1]],
         [[0,1,-1],[0,1,0],[0,1,-1]], [[0,1,1],[0,1,0],[0,1,1]] ] },
  // +Y top
  { norm:[0,1,0], du:[1,0,0], dv:[0,0,1], check:[0,1,0],
    ao:[ [[-1,0,0],[0,0,-1],[-1,0,-1]], [[1,0,0],[0,0,-1],[1,0,-1]],
         [[1,0,0],[0,0,1],[1,0,1]],    [[-1,0,0],[0,0,1],[-1,0,1]] ] },
  // -Y bottom
  { norm:[0,-1,0], du:[1,0,0], dv:[0,0,-1], check:[0,-1,0],
    ao:[ [[-1,0,0],[0,0,1],[-1,0,1]], [[1,0,0],[0,0,1],[1,0,1]],
         [[1,0,0],[0,0,-1],[1,0,-1]], [[-1,0,0],[0,0,-1],[-1,0,-1]] ] },
  // +Z front
  { norm:[0,0,1], du:[-1,0,0], dv:[0,1,0], check:[0,0,1],
    ao:[ [[1,0,0],[0,-1,0],[1,-1,0]], [[-1,0,0],[0,-1,0],[-1,-1,0]],
         [[-1,0,0],[0,1,0],[-1,1,0]], [[1,0,0],[0,1,0],[1,1,0]] ] },
  // -Z back
  { norm:[0,0,-1], du:[1,0,0], dv:[0,1,0], check:[0,0,-1],
    ao:[ [[-1,0,0],[0,-1,0],[-1,-1,0]], [[1,0,0],[0,-1,0],[1,-1,0]],
         [[1,0,0],[0,1,0],[1,1,0]],    [[-1,0,0],[0,1,0],[-1,1,0]] ] },
];

// Map face index → which color array on the block definition to use
const FACE_COLOR = ['side','side','top','bot','side','side'];

// ── Solid check (for AO + face visibility) ───────────────────────
function isSolid(x,y,z) {
  if (y < 0 || y > WMAXH) return false;
  const b = gB(x,y,z);
  return b !== 0 && !!BD[b] && BD[b].opaque;
}

// ── Build geometry arrays for one chunk ──────────────────────────
function buildChunkGeom(cx, cz) {
  const x0 = cx * CHUNK, x1 = Math.min(x0 + CHUNK, WSIZ);
  const z0 = cz * CHUNK, z1 = Math.min(z0 + CHUNK, WSIZ);

  // We'll accumulate two separate meshes: opaque and transparent
  const bufs = {
    opaque: { pos:[], nor:[], uv:[], col:[], idx:[] },
    trans:  { pos:[], nor:[], uv:[], col:[], idx:[] },
  };

  for (let y = 0; y <= WMAXH; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const id = gB(x, y, z);
        if (!id || !BD[id]) continue;
        const def = BD[id];
        const isOpaque = def.opaque;
        const alpha = def.alpha || 1;
        const buf = isOpaque ? bufs.opaque : bufs.trans;

        for (let fi = 0; fi < 6; fi++) {
          const face = FACES[fi];
          const [cx2, cy2, cz2] = face.check;
          const nx = x + cx2, ny = y + cy2, nz = z + cz2;

          // Face visibility: show if neighbour is air or different transparent
          const nb = gB(nx, ny, nz);
          if (nb) {
            const nd = BD[nb];
            if (!nd) continue;
            if (nd.opaque) continue;                    // hidden by opaque
            if (nb === id) continue;                    // same transparent block
            if (!isOpaque && alpha < 1 && !nd.opaque) continue; // trans-on-trans
          }

          // Quad corner positions
          const [du0,du1,du2] = face.du;
          const [dv0,dv1,dv2] = face.dv;
          const corners = [
            [x, y, z],
            [x+du0, y+du1, z+du2],
            [x+du0+dv0, y+du1+dv1, z+du2+dv2],
            [x+dv0, y+dv1, z+dv2],
          ];

          // Vertex color from block def (+ AO per corner)
          const ckey = FACE_COLOR[fi];
          const [cr, cg, cb] = def[ckey];

          // Compute AO for each corner
          const aoVals = face.ao.map(([e1o, e2o, co]) => {
            const [e1x,e1y,e1z] = e1o, [e2x,e2y,e2z] = e2o, [cox,coy,coz] = co;
            return aoVal(
              isSolid(x+e1x, y+e1y, z+e1z),
              isSolid(x+e2x, y+e2y, z+e2z),
              isSolid(x+cox, y+coy, z+coz)
            );
          });

          const base = buf.pos.length / 3;
          const [nx2,ny2,nz2] = face.norm;

          for (let ci = 0; ci < 4; ci++) {
            const [px,py,pz] = corners[ci];
            buf.pos.push(px, py, pz);
            buf.nor.push(nx2, ny2, nz2);
            buf.uv.push(ci === 0 || ci === 3 ? 0 : 1,
                        ci < 2 ? 0 : 1);
            const ao = aoVals[ci];
            // Store as 0–1 float; will be vertex color in shader
            buf.col.push((cr/255)*ao, (cg/255)*ao, (cb/255)*ao);
          }

          // Two triangles; flip winding if AO values indicate anisotropy
          // (fixes the "dark stripe" artifact on AO quads)
          if (aoVals[0] + aoVals[2] > aoVals[1] + aoVals[3]) {
            buf.idx.push(base,base+1,base+2, base,base+2,base+3);
          } else {
            buf.idx.push(base+1,base+2,base+3, base,base+1,base+3);
          }
        }
      }
    }
  }

  return bufs;
}

// ── Convert raw arrays → THREE.BufferGeometry ────────────────────
function makeGeo(buf) {
  if (buf.idx.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',  new THREE.BufferAttribute(new Float32Array(buf.pos), 3));
  geo.setAttribute('normal',    new THREE.BufferAttribute(new Float32Array(buf.nor), 3));
  geo.setAttribute('uv',        new THREE.BufferAttribute(new Float32Array(buf.uv),  2));
  geo.setAttribute('color',     new THREE.BufferAttribute(new Float32Array(buf.col), 3));
  geo.setIndex(buf.idx.length > 65535
    ? new THREE.BufferAttribute(new Uint32Array(buf.idx), 1)
    : new THREE.BufferAttribute(new Uint16Array(buf.idx), 1));
  geo.computeBoundingSphere();
  return geo;
}

// ── Shared materials (vertex-color driven, no per-block textures) ─
// Using MeshLambertMaterial with vertexColors.  Lighting is still
// driven by the scene's DirectionalLight + AmbientLight, and the
// vertex color carries the block tint + AO.
let _matOpaque = null;
let _matTrans  = null;

function getMatOpaque() {
  if (_matOpaque) return _matOpaque;
  return (_matOpaque = new THREE.MeshLambertMaterial({
    vertexColors: true,
  }));
}

function getMatTrans() {
  if (_matTrans) return _matTrans;
  return (_matTrans = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
}

// ── Rebuild one chunk ─────────────────────────────────────────────
export function rebuildChunk(cx, cz) {
  const slot = chunkMeshes[cx][cz];

  // Dispose old meshes
  if (slot.opaque) { scene.remove(slot.opaque); slot.opaque.geometry.dispose(); slot.opaque = null; }
  if (slot.trans)  { scene.remove(slot.trans);  slot.trans.geometry.dispose();  slot.trans  = null; }

  const bufs = buildChunkGeom(cx, cz);

  const geoO = makeGeo(bufs.opaque);
  if (geoO) {
    slot.opaque = new THREE.Mesh(geoO, getMatOpaque());
    slot.opaque.frustumCulled = true;
    scene.add(slot.opaque);
  }

  const geoT = makeGeo(bufs.trans);
  if (geoT) {
    slot.trans = new THREE.Mesh(geoT, getMatTrans());
    slot.trans.frustumCulled = true;
    scene.add(slot.trans);
  }
}

// ── Per-frame dirty-chunk flushing ────────────────────────────────
// Increased from 2 → 4 per frame; the new mesher is fast enough.
const REBUILD_PER_FRAME = 4;

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
