// shrine: a photoscanned patch of Australian termite mounds as the world, tuned to Radio alHara.
// The tallest mound is the shrine; the camera comes down to it from high above and drifts around
// it, the way Küchenwetter drifts around the cutlery holder. The cat and the mousedeer come later.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { makeCat } from './cat.js?v=3';
import { makeSky } from './sky.js?v=1';

const SCAN = 'scans/mounds.glb';
const STREAM = 'https://stream.radioalhara.net/ra';
const PAPER = 0xbbbbbb;
const NIGHT = 0x05070d;  // where the ground fades into the dark
const $ = (id) => document.getElementById(id);

// --- stage ---
const canvas = $('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(NIGHT);
let sky = null;

// --- brightness: from deep night (0) to the photo's own daylight (1), remembered per visitor ---
const groundMats = [];
const DARK = new THREE.Color(0x2a3040), LIGHT = new THREE.Color(0xffffff);
function setBrightness(t) {
  const c = DARK.clone().lerp(LIGHT, t);
  for (const m of groundMats) m.color.copy(c);
  try { localStorage.setItem('shrine-brightness', t); } catch {}
}
let brightness = 0.35;
try { const saved = parseFloat(localStorage.getItem('shrine-brightness')); if (saved >= 0 && saved <= 1) brightness = saved; } catch {}
$('brightness').value = brightness;
$('brightness').addEventListener('input', (e) => setBrightness(+e.target.value));
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
let cat = null;

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(SCAN, (e) => {
  if (e.lengthComputable) $('progress').textContent = `${Math.round((e.loaded / e.total) * 100)}%`;
}).then((gltf) => {
  const world = gltf.scene;
  // the photo is the light: show the scan's own colours unlit, fading into the paper at the edges
  world.traverse((o) => {
    if (!o.isMesh) return;
    const map = o.material.map;
    o.material.dispose();
    // moonlight: the photo dimmed and cooled under the stars (the slider sets how much)
    o.material = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
    groundMats.push(o.material);
  });
  scene.add(world);
  setBrightness(brightness);
  world.updateMatrixWorld(true);
  shrine = findShrine(world);
  const size = new THREE.Box3().setFromObject(world).getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z);
  // clear around the shrine, thickening out to the scan's ragged edges
  scene.fog = new THREE.Fog(NIGHT, shrine.reach * 1.5, Math.max(shrine.reach * 5, span * 0.6));
  sky = makeSky(scene, span * 1.5);
  sky.centre(shrine.base);
  camera.near = span / 2000;
  camera.far = span * 4;
  camera.updateProjectionMatrix();
  controls.minDistance = shrine.height * 0.6;
  controls.maxDistance = span * 0.55;
  arrive();
  $('loading').classList.add('gone');
  makeCat({ scene, camera, world, shrine, beat: () => listen(performance.now()) })
    .then((c) => { cat = c; })
    .catch((err) => console.error('the cat did not come', err));
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
controls.addEventListener('start', () => {
  flight = null; sway = null; clearTimeout(resumeSway);
  if (follow) follow.touching = true;
});
controls.addEventListener('end', () => {
  clearTimeout(resumeSway);
  if (follow) { follow.touching = false; follow.idleUntil = performance.now() + 5000; return; }
  resumeSway = setTimeout(startSway, 15000);
});
$('home').addEventListener('click', () => { if (!shrine) return; if (follow) endFollow(); else flyTo(view('home'), 2200, startSway); });

// --- her view: a third-person camera behind the cat, a little to one side ---
let follow = null; // { last, touching, idleUntil } while following
const UP = new THREE.Vector3(0, 1, 0);

function behindHer() {
  const H = cat.height, p = cat.position, h = cat.heading;
  const ahead = new THREE.Vector3(h.x, 0, h.y).normalize();
  const side = new THREE.Vector3(-ahead.z, 0, ahead.x);
  const dist = H * (cat.resting ? 5 : 6.5);
  const a = 0.5; // about 30° off straight behind, so her outline still reads
  const from = p.clone().addScaledVector(ahead, -dist * Math.cos(a)).addScaledVector(side, dist * Math.sin(a)).addScaledVector(UP, H * 2);
  const to = p.clone().addScaledVector(UP, H * 0.55).addScaledVector(ahead, H * 1.2);
  return { from, to };
}

function keepAboveGround() {
  const g = cat.groundAt(camera.position.x, camera.position.z);
  if (!Number.isNaN(g)) camera.position.y = Math.max(camera.position.y, g + cat.height * 0.8);
}

function startFollow() {
  if (!cat) return;
  follow = { last: null, touching: false, idleUntil: 0 };
  sway = null; clearTimeout(resumeSway);
  controls.minDistance = cat.height * 1.5;
  flyTo(behindHer(), 1600, () => { if (follow) follow.last = cat.position.clone(); });
  $('follow').setAttribute('aria-pressed', 'true');
}

function endFollow() {
  follow = null;
  controls.minDistance = shrine.height * 0.6;
  flyTo(view('home'), 2200, startSway);
  $('follow').setAttribute('aria-pressed', 'false');
}

function followFrame(dt, now) {
  if (!follow || !follow.last || flight) return;
  // carry the camera along with her, so a visitor's own angle is kept while she moves
  const moved = cat.position.clone().sub(follow.last);
  camera.position.add(moved);
  controls.target.add(moved);
  follow.last.copy(cat.position);
  // when nobody is holding the camera, ease back round behind her
  if (!follow.touching && now > follow.idleUntil) {
    const want = behindHer();
    const k = 1 - Math.exp(-dt * 1.2);
    camera.position.lerp(want.from, k);
    controls.target.lerp(want.to, Math.min(1, k * 2));
  }
  keepAboveGround();
}

$('follow').addEventListener('click', () => (follow ? endFollow() : startFollow()));

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  flyFrame(now);
  swayFrame(now);
  cat?.update(dt, now);
  followFrame(dt, now);
  controls.update();
  sky?.update();
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
  hearing();
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

// --- listening: the low end of the stream, for the cat's eyes to flare on ---
let analyser = null, bins = null, prev = null, lastBeat = 0;
const fluxHist = [];
function hearing() {
  if (analyser) return;
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const src = ac.createMediaElementSource(audio);
  analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.2;
  src.connect(analyser);
  analyser.connect(ac.destination);
  bins = new Uint8Array(analyser.frequencyBinCount);
  prev = new Float32Array(analyser.frequencyBinCount);
}
// true on a kick or bass onset (spectral flux over ~40–300 Hz against its recent spread)
function listen(now) {
  if (!analyser || audio.paused) return false;
  analyser.getByteFrequencyData(bins);
  const hz = analyser.context.sampleRate / analyser.fftSize;
  const lo = Math.floor(40 / hz), hi = Math.ceil(300 / hz);
  let flux = 0;
  for (let i = lo; i <= hi; i++) { const v = bins[i] / 255; flux += Math.max(0, v - prev[i]); prev[i] = v; }
  fluxHist.push(flux);
  if (fluxHist.length > 50) fluxHist.shift();
  const mean = fluxHist.reduce((a, b) => a + b, 0) / fluxHist.length;
  const sd = Math.sqrt(fluxHist.reduce((a, b) => a + (b - mean) ** 2, 0) / fluxHist.length);
  if (flux > mean + 1.7 * sd && flux > 0.15 && now - lastBeat > 280) { lastBeat = now; return true; }
  return false;
}

// ?debug: a handle for looking at the cat from the console
if (new URLSearchParams(location.search).has('debug')) window.shrineDebug = { get cat() { return cat; }, get follow() { return follow; }, camera, controls, get shrine() { return shrine; }, flyTo };
