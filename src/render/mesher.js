// ════════════════════════════════════════════════════════════════
//  CHUNK MESHER  –  Face-Only BufferGeometry + Vertex-Color AO
//
//  Only visible faces are emitted. Each face is a quad with
//  per-corner AO (ambient occlusion) baked into vertex color.
//  Result: 1–2 draw calls per chunk, 10–50× fewer triangles.
// ════════════════════════════════════════════════════════════════

/* global THREE */

import { WSIZ, WMAXH, CHUNK, CX, CZ, gB, chunkDirty, chunkIdx } from '../world/world.js';
import { BD } from '../world/blocks.js';

let scene = null;

export const chunkMeshes = Array.from({length: CX}, () =>
  Array.from({length: CZ}, () => ({ opaque: null, trans: null }))
);

export function initMesher(sceneRef) { scene = sceneRef; }

// ── AO ───────────────────────────────────────────────────────────
function isSolid(x, y, z) {
  if (y < 0 || y > WMAXH) return false;
  const b = gB(x, y, z);
  return b !== 0 && !!BD[b] && BD[b].opaque;
}
function aoCorner(e1, e2, c) {
  const s1 = e1?1:0, s2 = e2?1:0, sc = c?1:0;
  if (s1 && s2) return 0.50;
  return 1.0 - (s1 + s2 + sc) * 0.15;
}

// ── Face table ───────────────────────────────────────────────────
// origin : block-local offset to the quad's (u=0,v=0) corner
//          (i.e. which corner of the unit cube the face starts at)
// du/dv  : unit steps that sweep across the face
// check  : neighbour offset to test visibility
// colKey : 'top' | 'bot' | 'side'
// aoN    : 4 corners × [edge1, edge2, diag] world-relative offsets
const FACES = [
  // +X right  (face on the x+1 side)
  { norm:[ 1,0,0], origin:[1,0,0], du:[0,0,1], dv:[0,1,0], check:[ 1,0,0], colKey:'side',
    aoN:[ [[ 1,-1, 0],[ 1, 0,-1],[ 1,-1,-1]],
          [[ 1,-1, 1],[ 1, 0, 1],[ 1,-1, 1]],
          [[ 1, 1, 1],[ 1, 0, 1],[ 1, 1, 1]],
          [[ 1, 1, 0],[ 1, 0,-1],[ 1, 1,-1]] ] },
  // -X left
  { norm:[-1,0,0], origin:[0,0,1], du:[0,0,-1], dv:[0,1,0], check:[-1,0,0], colKey:'side',
    aoN:[ [[-1,-1, 1],[-1, 0, 1],[-1,-1, 1]],
          [[-1,-1, 0],[-1, 0,-1],[-1,-1,-1]],
          [[-1, 1, 0],[-1, 0,-1],[-1, 1,-1]],
          [[-1, 1, 1],[-1, 0, 1],[-1, 1, 1]] ] },
  // +Y top
  { norm:[0, 1,0], origin:[0,1,0], du:[1,0,0], dv:[0,0,1], check:[0, 1,0], colKey:'top',
    aoN:[ [[-1, 1, 0],[ 0, 1,-1],[-1, 1,-1]],
          [[ 1, 1, 0],[ 0, 1,-1],[ 1, 1,-1]],
          [[ 1, 1, 1],[ 0, 1, 1],[ 1, 1, 1]],
          [[-1, 1, 1],[ 0, 1, 1],[-1, 1, 1]] ] },
  // -Y bottom
  { norm:[0,-1,0], origin:[0,0,1], du:[1,0,0], dv:[0,0,-1], check:[0,-1,0], colKey:'bot',
    aoN:[ [[-1,-1, 1],[ 0,-1, 1],[-1,-1, 1]],
          [[ 1,-1, 1],[ 0,-1, 1],[ 1,-1, 1]],
          [[ 1,-1, 0],[ 0,-1,-1],[ 1,-1,-1]],
          [[-1,-1, 0],[ 0,-1,-1],[-1,-1,-1]] ] },
  // +Z front
  { norm:[0,0, 1], origin:[1,0,1], du:[-1,0,0], dv:[0,1,0], check:[0,0, 1], colKey:'side',
    aoN:[ [[ 1,-1, 1],[ 0,-1, 1],[ 1,-1, 1]],
          [[-1,-1, 1],[ 0,-1, 1],[-1,-1, 1]],
          [[-1, 1, 1],[ 0, 1, 1],[-1, 1, 1]],
          [[ 1, 1, 1],[ 0, 1, 1],[ 1, 1, 1]] ] },
  // -Z back
  { norm:[0,0,-1], origin:[0,0,0], du:[1,0,0], dv:[0,1,0], check:[0,0,-1], colKey:'side',
    aoN:[ [[-1,-1,-1],[ 0,-1,-1],[-1,-1,-1]],
          [[ 1,-1,-1],[ 0,-1,-1],[ 1,-1,-1]],
          [[ 1, 1,-1],[ 0, 1,-1],[ 1, 1,-1]],
          [[-1, 1,-1],[ 0, 1,-1],[-1, 1,-1]] ] },
];

// ── Build raw geometry buffers ───────────────────────────────────
function buildChunkGeom(cx, cz) {
  const x0 = cx * CHUNK, x1 = Math.min(x0 + CHUNK, WSIZ);
  const z0 = cz * CHUNK, z1 = Math.min(z0 + CHUNK, WSIZ);
  const opq = { pos:[], nor:[], uv:[], col:[], idx:[] };
  const trn = { pos:[], nor:[], uv:[], col:[], idx:[] };

  for (let y = 0; y <= WMAXH; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const id = gB(x, y, z);
        if (!id || !BD[id]) continue;
        const def   = BD[id];
        const alpha = def.alpha || 1;
        const buf   = def.opaque ? opq : trn;

        for (let fi = 0; fi < 6; fi++) {
          const f = FACES[fi];
          const [ck0,ck1,ck2] = f.check;
          const nb = gB(x+ck0, y+ck1, z+ck2);

          if (nb) {
            const nd = BD[nb];
            if (!nd) continue;
            if (nd.opaque) continue;
            if (nb === id) continue;
            if (alpha < 1 && !nd.opaque) continue;
          }

          const [cr,cg,cb] = def[f.colKey];
          const [o0,o1,o2] = f.origin;
          const ox = x+o0, oy = y+o1, oz = z+o2;
          const [du0,du1,du2] = f.du;
          const [dv0,dv1,dv2] = f.dv;

          // 4 corners of the face quad
          const px = [ox,       ox+du0,       ox+du0+dv0, ox+dv0];
          const py = [oy,       oy+du1,       oy+du1+dv1, oy+dv1];
          const pz = [oz,       oz+du2,       oz+du2+dv2, oz+dv2];

          const aoV = f.aoN.map(([e1,e2,c]) =>
            aoCorner(
              isSolid(x+e1[0], y+e1[1], z+e1[2]),
              isSolid(x+e2[0], y+e2[1], z+e2[2]),
              isSolid(x+ c[0], y+ c[1], z+ c[2])
            )
          );

          const base = buf.pos.length / 3;
          const [nx,ny,nz] = f.norm;

          for (let ci = 0; ci < 4; ci++) {
            buf.pos.push(px[ci], py[ci], pz[ci]);
            buf.nor.push(nx, ny, nz);
            buf.uv.push(ci===1||ci===2 ? 1 : 0, ci===2||ci===3 ? 1 : 0);
            const a = aoV[ci];
            buf.col.push((cr/255)*a, (cg/255)*a, (cb/255)*a);
          }

          // Flip triangle diagonal to prevent AO dark-stripe artifact
          if (aoV[0]+aoV[2] > aoV[1]+aoV[3]) {
            buf.idx.push(base,base+1,base+2, base,base+2,base+3);
          } else {
            buf.idx.push(base+1,base+2,base+3, base,base+1,base+3);
          }
        }
      }
    }
  }
  return { opq, trn };
}

// ── Arrays → BufferGeometry ──────────────────────────────────────
function makeGeo(buf) {
  if (buf.idx.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf.pos), 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(buf.nor), 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(buf.uv),  2));
  geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(buf.col), 3));
  geo.setIndex(buf.idx.length > 65535
    ? new THREE.BufferAttribute(new Uint32Array(buf.idx),  1)
    : new THREE.BufferAttribute(new Uint16Array(buf.idx), 1));
  geo.computeBoundingSphere();
  return geo;
}

// ── Shared materials ─────────────────────────────────────────────
let _matO = null, _matT = null;
const matOpaque = () => _matO || (_matO = new THREE.MeshLambertMaterial({ vertexColors: true }));
const matTrans  = () => _matT || (_matT = new THREE.MeshLambertMaterial({
  vertexColors: true, transparent: true, opacity: 0.72,
  depthWrite: false, side: THREE.DoubleSide,
}));

// ── Rebuild one chunk ─────────────────────────────────────────────
export function rebuildChunk(cx, cz) {
  const slot = chunkMeshes[cx][cz];
  if (slot.opaque) { scene.remove(slot.opaque); slot.opaque.geometry.dispose(); slot.opaque = null; }
  if (slot.trans)  { scene.remove(slot.trans);  slot.trans.geometry.dispose();  slot.trans  = null; }

  const { opq, trn } = buildChunkGeom(cx, cz);
  const gO = makeGeo(opq);
  if (gO) { slot.opaque = new THREE.Mesh(gO, matOpaque()); slot.opaque.frustumCulled = true; scene.add(slot.opaque); }
  const gT = makeGeo(trn);
  if (gT) { slot.trans  = new THREE.Mesh(gT, matTrans());  slot.trans.frustumCulled  = true; scene.add(slot.trans);  }
}

// ── Flush dirty chunks (4 per frame) ────────────────────────────
const REBUILD_PER_FRAME = 4;
export function flushDirtyChunks() {
  let n = 0;
  for (let cz = 0; cz < CZ && n < REBUILD_PER_FRAME; cz++)
    for (let cx = 0; cx < CX && n < REBUILD_PER_FRAME; cx++)
      if (chunkDirty[chunkIdx(cx, cz)]) {
        rebuildChunk(cx, cz);
        chunkDirty[chunkIdx(cx, cz)] = 0;
        n++;
      }
}
