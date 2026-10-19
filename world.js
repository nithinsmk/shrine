// shrine: a photoscanned patch of Australian termite mounds as the world, tuned to Radio alHara.
// The tallest mound is the shrine; the camera comes down to it from high above and drifts around
// it, the way Küchenwetter drifts around the cutlery holder. The cat and the mousedeer come later.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const SCAN = 'scans/mounds.glb';
const STREAM = 'https://stream.radioalhara.net/ra';
const PAPER = 0xbbbbbb;
const $ = (id) => document.getElementById(id);

// --- stage ---
const canvas = $('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAPER);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.46; // never under the ground

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// --- the scan ---
let shrine = null; // { base, peak, height, reach } once the scan is in

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(SCAN, (e) => {
  if (e.lengthComputable) $('progress').textContent = `${Math.round((e.loaded / e.total) * 100)}%`;
}).then((gltf) => {
  const world = gltf.scene;
  // the photo is the light: show the scan's own colours unlit, fading into the paper at the edges
  world.traverse((o) => {
    if (!o.isMesh) return;
    const map = o.material.map;
    o.material.dispose();
    o.material = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
  });
  scene.add(world);
  world.updateMatrixWorld(true);
  shrine = findShrine(world);
  const size = new THREE.Box3().setFromObject(world).getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z);
  // clear around the shrine, thickening out to the scan's ragged edges
  scene.fog = new THREE.Fog(PAPER, shrine.reach * 1.5, Math.max(shrine.reach * 5, span * 0.6));
  camera.near = span / 2000;
  camera.far = span * 4;
  camera.updateProjectionMatrix();
  controls.minDistance = shrine.height * 0.6;
  controls.maxDistance = span * 0.55;
  arrive();
  $('loading').classList.add('gone');
}).catch((err) => {
  console.error(err);
  $('loading').textContent = 'the mounds did not load. Try reloading.';
});

// The shrine is the tallest mound: the highest point of the scan, with the ground taken as
// the low tenth of everything around it.
function findShrine(world) {
  const v = new THREE.Vector3();
  const ys = [];
  let peak = null;
  world.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 7) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      ys.push(v.y);
      if (!peak || v.y > peak.y) peak = v.clone();
    }
  });
  ys.sort((a, b) => a - b);
  const ground = ys[Math.floor(ys.length * 0.1)];
  const height = peak.y - ground;
  const base = new THREE.Vector3(peak.x, ground + height * 0.4, peak.z);
  return { base, peak, height, reach: height * 2.6 };
}

// --- the camera: come down from high above, then drift round the shrine ---
const view = (where) => {
  const dir = where === 'high' ? new THREE.Vector3(0.25, 2.4, 0.5) : new THREE.Vector3(0.7, 0.42, 1);
  const k = where === 'high' ? 3.2 : 1;
  return { from: shrine.base.clone().add(dir.normalize().multiplyScalar(shrine.reach * k)), to: shrine.base.clone() };
};

let flight = null;
let sway = null;
let resumeSway = null;

function flyTo(v, ms, after) {
  sway = null;
  clearTimeout(resumeSway);
  flight = { from: camera.position.clone(), to: v.from, fromT: controls.target.clone(), toT: v.to, t0: performance.now(), ms, after };
}

function arrive() {
  const high = view('high');
  camera.position.copy(high.from);
  controls.target.copy(high.to);
  flyTo(view('home'), 7000, startSway);
}

function startSway() {
  const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  sway = { s, t0: performance.now(), theta: s.theta, phi: s.phi, radius: s.radius };
}

// one slow lap every ~3 minutes, breathing a little closer and further
function swayFrame(now) {
  if (!sway) return;
  const t = (now - sway.t0) / 1000;
  sway.s.theta = sway.theta + t * ((2 * Math.PI) / 180);
  sway.s.phi = sway.phi + 0.04 * Math.sin(t * ((2 * Math.PI) / 53));
  sway.s.radius = sway.radius * (1 + 0.06 * Math.sin(t * ((2 * Math.PI) / 71)));
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sway.s));
}

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
function flyFrame(now) {
  if (!flight) return;
  const k = Math.min(1, (now - flight.t0) / flight.ms);
  const e = ease(k);
  camera.position.lerpVectors(flight.from, flight.to, e);
  controls.target.lerpVectors(flight.fromT, flight.toT, e);
  if (k === 1) { const after = flight.after; flight = null; after?.(); }
}

// a visitor taking the camera stops the drift; it picks up again after a quiet while
controls.addEventListener('start', () => { flight = null; sway = null; clearTimeout(resumeSway); });
controls.addEventListener('end', () => { clearTimeout(resumeSway); resumeSway = setTimeout(startSway, 15000); });
$('home').addEventListener('click', () => shrine && flyTo(view('home'), 2200, startSway));

renderer.setAnimationLoop((now) => {
  flyFrame(now);
  swayFrame(now);
  controls.update();
  renderer.render(scene, camera);
});

// --- the radio ---
const audio = new Audio();
audio.crossOrigin = 'anonymous'; // so the cat's eyes can listen to it later
audio.preload = 'none';
let retried = false;
let stallTimer = null;

function setButton() { $('tune').textContent = audio.paused ? '▶ tune in' : '❚❚ tune out'; }
function say(text) { $('notice').textContent = text; }

$('tune').addEventListener('click', () => {
  if (!audio.paused) { audio.pause(); audio.removeAttribute('src'); audio.load(); setButton(); return; }
  retried = false;
  play();
});

function play() {
  say('tuning in…');
  audio.src = STREAM;
  audio.play().catch(() => say('tap again to tune in'));
}

audio.addEventListener('playing', () => {
  retried = false; clearTimeout(stallTimer); stallTimer = null;
  say(''); $('onair').hidden = false; setButton();
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: 'Radio alHara', artist: 'live from Bethlehem', album: 'shrine' });
});
audio.addEventListener('pause', () => { $('onair').hidden = true; setButton(); });

// a stream that stalls: wait a moment, try once more, then say so
function stalled() {
  if (!audio.src || audio.paused || stallTimer) return;
  const from = audio.currentTime;
  stallTimer = setTimeout(() => {
    stallTimer = null;
    if (audio.currentTime > from + 1) return; // it's moving: fine
    if (!retried) { retried = true; play(); return; }
    say("Radio alHara isn't coming through right now. Try again in a bit.");
  }, 4000);
}
for (const e of ['error', 'stalled', 'waiting']) audio.addEventListener(e, stalled);
