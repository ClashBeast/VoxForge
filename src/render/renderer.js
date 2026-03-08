// ════════════════════════════════════════════════════════════════
//  RENDERER
//  Three.js scene setup, day/night cycle, block highlight outline.
// ════════════════════════════════════════════════════════════════

/* global THREE */

export let scene, camera, renderer, sun, ambient;

// ── Smoothstep ───────────────────────────────────────────────────
function smoo(t) { return t * t * (3 - 2 * t); }

// ── Day / Night ──────────────────────────────────────────────────
export let dayTime = 0.3;

const SKY_NOON  = new THREE.Color(0x78b4f0);
const SKY_DAWN  = new THREE.Color(0xf0a060);
const SKY_NIGHT = new THREE.Color(0x080818);

export function updateDayNight(dt) {
  dayTime = (dayTime + dt / 180) % 1;
  const t     = dayTime;
  const angle = (t - 0.25) * Math.PI * 2;

  sun.position.set(Math.cos(angle) * 80, Math.sin(angle) * 80, 20);
  const brightness    = Math.max(0, Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5);
  sun.intensity       = 0.08 + brightness * 1.1;
  ambient.intensity   = 0.15 + brightness * 0.55;

  let sky;
  if      (t < 0.25) { const f = t / 0.25;          sky = SKY_NIGHT.clone().lerp(SKY_DAWN,  smoo(f)); }
  else if (t < 0.5)  { const f = (t-0.25) / 0.25;   sky = SKY_DAWN .clone().lerp(SKY_NOON,  smoo(f)); }
  else if (t < 0.75) { const f = (t-0.5)  / 0.25;   sky = SKY_NOON .clone().lerp(SKY_DAWN,  smoo(f)); }
  else               { const f = (t-0.75) / 0.25;   sky = SKY_DAWN .clone().lerp(SKY_NIGHT, smoo(f)); }

  scene.background = sky;
  if (scene.fog) scene.fog.color.copy(sky);
}

// ── Block highlight outline ──────────────────────────────────────
let hlBox = null;

function initHighlight() {
  const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.008, 1.008, 1.008));
  const em = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
  hlBox = new THREE.LineSegments(eg, em);
  hlBox.visible = false;
  scene.add(hlBox);
}

export function updateHighlight(hit) {
  if (!hit) { hlBox.visible = false; return; }
  hlBox.position.set(hit[0], hit[1], hit[2]);
  hlBox.visible = true;
}

// ── Init ─────────────────────────────────────────────────────────
export function initThree() {
  scene    = new THREE.Scene();
  scene.background = new THREE.Color(0x78b4f0);
  scene.fog        = new THREE.FogExp2(0x78b4f0, 0.018);

  camera   = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 200);
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);

  sun     = new THREE.DirectionalLight(0xfff8e8, 1.1);
  sun.position.set(40, 80, 20);
  scene.add(sun);

  ambient = new THREE.AmbientLight(0xaaccff, 0.6);
  scene.add(ambient);

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  initHighlight();
}
