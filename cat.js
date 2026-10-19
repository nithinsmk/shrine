// The cat: a paper cutout of Nano Banana drawings standing in the scan, always turned to the
// camera. It sleeps at the foot of the shrine, wakes, stretches, wanders between open spots
// around the mounds, sits, and always comes back to curl up and sleep again.
// The sheets are cut up here, in the browser: panels are found by their dark gutters, the grey
// paper is keyed out and the green fire kept. The flames get a glow that flares on the beat.

import * as THREE from 'three';

const ART = 'art/cat/';

// Each pose: which image, which panels, which way the drawn head faces, and how tall it
// stands as a share of the cat's height (the walk with its tail up is 1).
const POSES = {
  walk: { src: 'walk_sheet.png', panels: [0, 1, 2, 3, 4, 5], faces: 'R', h: 1, fps: 7, union: true },
  trot: { src: 'trot_sheet.webp', panels: [0, 1, 2, 3, 4, 5], faces: 'R', h: 1, fps: 12, union: true },
  sit: { src: 'sit.webp', panels: [0], faces: 'L', h: 1.1 },
  loaf: { src: 'sit_to_curl_sheet.webp', panels: [1], faces: 'R', h: 0.6 },
  lie: { src: 'sit_to_curl_sheet.webp', panels: [2], faces: 'R', h: 0.45 },
  curl: { src: 'sit_to_curl_sheet.webp', panels: [5], faces: 'L', h: 0.5 },
  sleep: { src: 'sleep.webp', panels: [0], faces: 'L', h: 0.55 },
  bow: { src: 'stretches.webp', panels: [0], faces: 'R', h: 1.15 },  // front stretch
  arch: { src: 'stretches.webp', panels: [1], faces: 'L', h: 1.1 },  // back arch
};

// --- cutting the drawings ---

const loadImage = (src) => new Promise((ok, fail) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = fail;
  img.src = src;
});

function pixels(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

// panels sit between dark gutter lines (or fill the whole image when there are none)
function findPanels({ data, width, height }) {
  const lum = (x, y) => { const i = (y * width + x) * 4; return (data[i] + data[i + 1] + data[i + 2]) / 3; };
  const darkRuns = (n, m, at) => {
    const dark = [];
    for (let a = 0; a < n; a++) {
      let d = 0;
      for (let b = 0; b < m; b += 4) if (at(a, b) < 90) d++;
      dark.push(d / Math.ceil(m / 4) > 0.85);
    }
    const spans = [];
    let start = null;
    for (let a = 0; a <= n; a++) {
      if (a < n && !dark[a]) { if (start === null) start = a; } else if (start !== null) {
        if (a - start > 40) spans.push([start + 3, a - 3]);
        start = null;
      }
    }
    return spans;
  };
  const cols = darkRuns(width, height, (x, y) => lum(x, y));
  const rows = darkRuns(height, width, (y, x) => lum(x, y));
  const out = [];
  for (const [y0, y1] of rows) for (const [x0, x1] of cols) out.push({ x0, y0, x1, y1 });
  return out;
}

// key one panel off its paper: ink stays black, the green fire keeps its colour
function keyPanel(src, p) {
  const w = p.x1 - p.x0, h = p.y1 - p.y0;
  const out = new ImageData(w, h);
  const s = src.data, d = out.data;
  // the paper colour: the median of the panel's border
  const border = [];
  for (let x = 0; x < w; x += 7) for (const y of [2, h - 3]) border.push((p.y0 + y) * src.width + p.x0 + x);
  const bg = [0, 1, 2].map((k) => border.map((i) => s[i * 4 + k]).sort((a, b) => a - b)[border.length >> 1]);
  const bgL = (bg[0] + bg[1] + bg[2]) / 3;
  let gx = 0, gy = 0, gw = 0;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((p.y0 + y) * src.width + p.x0 + x) * 4, o = (y * w + x) * 4;
      const r = s[i], g = s[i + 1], b = s[i + 2];
      const L = (r + g + b) / 3;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const aInk = Math.min(1, Math.max(0, (bgL - L - 18) / (bgL * 0.55)));
      const aFire = Math.min(1, Math.max(0, (sat - 22) / 70));
      const aCore = Math.min(1, Math.max(0, (L - bgL - 12) / 35)); // the white-hot core, brighter than the paper
      const a = Math.max(aInk, aFire, aCore);
      if (a <= 0.02) continue;
      // un-mix the paper out of the edge pixels
      for (let k = 0; k < 3; k++) d[o + k] = Math.min(255, Math.max(0, (s[i + k] - bg[k] * (1 - a)) / a));
      d[o + 3] = a * 255;
      if (a > 0.3) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      if (aFire > 0.8 && g > 180) { gx += x * aFire; gy += y * aFire; gw += aFire; }
    }
  }
  return { image: out, box: { minX, minY, maxX, maxY }, fire: gw > 20 ? { x: gx / gw, y: gy / gw } : null };
}

function crop(keyed, box) {
  const pad = 6;
  const x0 = Math.max(0, box.minX - pad), y0 = Math.max(0, box.minY - pad);
  const x1 = Math.min(keyed.image.width, box.maxX + pad), y1 = Math.min(keyed.image.height, box.maxY + pad);
  const c = document.createElement('canvas');
  c.width = x1 - x0; c.height = y1 - y0;
  c.getContext('2d').putImageData(keyed.image, -x0, -y0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // where the fire burns, in the frame's own 0..1 (from bottom-left), for the glow
  const fire = keyed.fire ? { u: (keyed.fire.x - x0) / c.width, v: 1 - (keyed.fire.y - y0) / c.height } : null;
  return { tex, aspect: c.width / c.height, fire };
}

async function cutPoses() {
  const sheets = {};
  const poses = {};
  for (const [name, pose] of Object.entries(POSES)) {
    if (!sheets[pose.src]) {
      const px = pixels(await loadImage(ART + pose.src));
      sheets[pose.src] = { px, panels: findPanels(px) };
    }
    const { px, panels } = sheets[pose.src];
    const keyed = pose.panels.map((n) => keyPanel(px, panels[n]));
    let frames;
    if (pose.union) {
      // a cycle keeps one box for all its frames, so the feet don't jump
      const u = keyed.reduce((a, k) => ({
        minX: Math.min(a.minX, k.box.minX), minY: Math.min(a.minY, k.box.minY),
        maxX: Math.max(a.maxX, k.box.maxX), maxY: Math.max(a.maxY, k.box.maxY),
      }), { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 });
      frames = keyed.map((k) => crop(k, u));
    } else frames = keyed.map((k) => crop(k, k.box));
    poses[name] = { ...pose, frames };
  }
  return poses;
}

// --- where the cat can walk: a height map of the scan ---

function heightMap(world, N = 160) {
  const box = new THREE.Box3().setFromObject(world);
  const sum = new Float32Array(N * N), count = new Uint16Array(N * N);
  const v = new THREE.Vector3();
  const sx = (box.max.x - box.min.x) / N, sz = (box.max.z - box.min.z) / N;
  world.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 2) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const cx = Math.min(N - 1, Math.floor((v.x - box.min.x) / sx));
      const cz = Math.min(N - 1, Math.floor((v.z - box.min.z) / sz));
      sum[cz * N + cx] += v.y; count[cz * N + cx]++;
    }
  });
  const h = new Float32Array(N * N).fill(NaN);
  for (let i = 0; i < N * N; i++) if (count[i]) h[i] = sum[i] / count[i];
  const cell = (x, z) => {
    const cx = Math.max(0, Math.min(N - 1, x)), cz = Math.max(0, Math.min(N - 1, z));
    return h[cz * N + cx];
  };
  return {
    box,
    // bilinear height at a world x/z (NaN off the scan)
    at(x, z) {
      const fx = (x - box.min.x) / sx - 0.5, fz = (z - box.min.z) / sz - 0.5;
      const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
      const a = cell(x0, z0), b = cell(x0 + 1, z0), c = cell(x0, z0 + 1), d = cell(x0 + 1, z0 + 1);
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    },
  };
}

// --- the glow on the eyes ---

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(225,255,120,1)');
  r.addColorStop(0.25, 'rgba(160,240,60,0.55)');
  r.addColorStop(1, 'rgba(120,220,40,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(40,20,10,0.45)');
  r.addColorStop(1, 'rgba(40,20,10,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// --- the cat ---

export async function makeCat({ scene, camera, world, shrine, beat }) {
  const poses = await cutPoses();
  const ground = heightMap(world);
  const H = shrine.height * 0.18;              // real cat size: knee-high to the shrine
  const centre = new THREE.Vector2(shrine.peak.x, shrine.peak.z);

  // how wide the shrine stands at its foot: walk out from the peak until the ground levels
  const footY = ground.at(centre.x + shrine.height, centre.y + shrine.height);
  let footR = shrine.height * 0.1;
  for (let r = shrine.height * 0.05; r < shrine.height; r += shrine.height * 0.02) {
    let high = 0;
    for (let a = 0; a < 8; a++) {
      const y = ground.at(centre.x + Math.cos(a) * r, centre.y + Math.sin(a) * r);
      if (y - footY > shrine.height * 0.08) high++;
    }
    if (high <= 1) { footR = r; break; }
  }

  // the bed: at the shrine's foot, on the side the camera first comes down to
  const bedDir = new THREE.Vector2(0.7, 1).normalize();
  const bed = centre.clone().addScaledVector(bedDir, footR + H * 0.9);

  const isOpen = (p) => {
    const y = ground.at(p.x, p.y);
    if (Number.isNaN(y)) return false;
    const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ground.at(p.x + dx * H, p.y + dz * H));
    return around.every((a) => Math.abs(a - y) < H * 0.6);
  };
  const clearPath = (a, b) => {
    const n = Math.ceil(a.distanceTo(b) / (H * 0.5));
    let prev = ground.at(a.x, a.y);
    for (let i = 1; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      if (p.distanceTo(centre) < footR + H * 0.3) return false;   // never through the shrine
      const y = ground.at(p.x, p.y);
      if (Number.isNaN(y) || Math.abs(y - prev) > H * 0.5) return false;
      prev = y;
    }
    return true;
  };
  function pickSpot(from) {
    for (let tries = 0; tries < 60; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const r = footR + H * (2 + Math.random() * 14);
      const p = centre.clone().add(new THREE.Vector2(Math.cos(ang), Math.sin(ang)).multiplyScalar(r));
      if (isOpen(p) && clearPath(from, p)) return p;
    }
    return bed.clone();
  }

  // --- the cutout ---
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // origin at the feet
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, depthWrite: true });
  const body = new THREE.Mesh(plane, mat);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  const cat = new THREE.Group();
  cat.add(shadow, body, glow);
  scene.add(cat);

  // --- what it is doing ---
  const pos = bed.clone();
  let heading = new THREE.Vector2(-1, 0);  // the way it last walked, in the world
  let facing = 'R';                         // which way it faces on screen
  let plan = [];                            // the steps still to do
  let step = null;

  const rest = (pose, s) => ({ pose, secs: s });
  const walkTo = (to, pose = 'walk') => ({ pose, to });
  function newDay() {
    // wake, stretch, wander a few spots, come home, curl up, sleep
    const out = [rest('sleep', 40 + Math.random() * 50), rest('curl', 2), rest('loaf', 2.5), rest('sit', 4),
      rest('bow', 3), rest('arch', 2.5)];
    let at = pos.clone();
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const to = pickSpot(at);
      out.push(walkTo(to, Math.random() < 0.25 ? 'trot' : 'walk'));
      const pause = Math.random();
      if (pause < 0.5) out.push(rest('sit', 5 + Math.random() * 8));
      else if (pause < 0.75) out.push(rest('bow', 3), rest('sit', 4));
      else out.push(rest('loaf', 6 + Math.random() * 6));
      at = to;
    }
    if (!clearPath(at, bed)) {
      // go round the shrine by whichever side is nearer
      const side = new THREE.Vector2(-bedDir.y, bedDir.x);
      const s = Math.sign(at.clone().sub(centre).dot(side)) || 1;
      out.push(walkTo(centre.clone().addScaledVector(side, s * (footR + H * 2)).addScaledVector(bedDir, H)));
    }
    out.push(walkTo(bed.clone()), rest('sit', 3), rest('loaf', 2.5), rest('lie', 2.5), rest('curl', 2));
    return out;
  }

  function next() {
    if (!plan.length) plan = newDay();
    step = { ...plan.shift(), t: 0 };
  }
  // the first visit finds it asleep, part way into its nap
  plan = newDay();
  plan[0].secs = 15 + Math.random() * 25;
  next();

  const camRight = new THREE.Vector3();
  let frameClock = 0;
  let flare = 0, flickerUntil = 0;

  function update(dt, now) {
    step.t += dt;
    const pose = poses[step.pose];
    let moving = false;
    if (step.to) {
      const speed = H * (step.pose === 'trot' ? 2.4 : 0.9);
      const d = step.to.clone().sub(pos);
      const len = d.length();
      if (len < speed * dt || len < 1e-6) { pos.copy(step.to); next(); } else {
        d.multiplyScalar(1 / len);
        heading.lerp(d, Math.min(1, dt * 6)).normalize();
        pos.addScaledVector(d, speed * dt);
        moving = true;
      }
    } else if (step.t > step.secs) next();

    // the cutout always turns to the camera, standing upright on the ground
    const y = ground.at(pos.x, pos.y);
    cat.position.set(pos.x, Number.isNaN(y) ? shrine.peak.y - shrine.height : y, pos.y);
    body.rotation.y = Math.atan2(camera.position.x - cat.position.x, camera.position.z - cat.position.z);

    // left or right on screen, by where it's heading (with a little hysteresis)
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    const side = camRight.x * heading.x + camRight.z * heading.y;
    if (side > 0.15) facing = 'R'; else if (side < -0.15) facing = 'L';

    const frames = pose.frames;
    if (moving) frameClock += dt * pose.fps;
    const f = frames[Math.floor(frameClock) % frames.length];
    const show = moving || !pose.fps ? f : frames[0];
    if (mat.map !== show.tex) { mat.map = show.tex; mat.needsUpdate = true; }
    const flip = pose.faces === facing ? 1 : -1;
    const breathe = step.pose === 'sleep' || step.pose === 'curl' ? 1 + 0.025 * Math.sin(now / 700) : 1;
    const h = H * pose.h;
    body.scale.set(h * show.aspect * flip, h * breathe, 1);
    shadow.scale.set(h * show.aspect * 0.8, 1, H * 0.45);
    shadow.position.y = H * 0.02;
    shadow.rotation.y = body.rotation.y;

    // the glow sits on the burning eyes and flares on the beat
    if (beat()) { flare = 1; flickerUntil = now + 90 + Math.random() * 70; }
    flare *= Math.pow(0.04, dt);
    if (show.fire) {
      const lx = (show.fire.u - 0.5) * h * show.aspect * flip;
      const ly = show.fire.v * h * breathe;
      const toCam = new THREE.Vector3(Math.sin(body.rotation.y), 0, Math.cos(body.rotation.y));
      const sideways = new THREE.Vector3(toCam.z, 0, -toCam.x);
      glow.position.set(0, ly, 0).addScaledVector(sideways, lx).addScaledVector(toCam, H * 0.05);
      const asleep = step.pose === 'sleep' || step.pose === 'curl';
      let g = (asleep ? 0.12 : 0.22) + (asleep ? 0.35 : 0.75) * flare;
      if (now < flickerUntil && Math.random() < 0.45) g *= 0.3; // the fire stutters
      glow.material.opacity = g;
      const s = H * (0.5 + 0.35 * flare);
      glow.scale.set(s, s, 1);
    } else glow.material.opacity = 0;
  }

  return {
    update, get position() { return cat.position; }, height: H,
    // for ?debug
    get state() { return { pose: step.pose, to: step.to?.toArray(), left: plan.length, footR, bed: bed.toArray() }; },
    probe: () => { let open = 0, clear = 0; for (let i = 0; i < 200; i++) { const a = Math.random() * 6.28, r = footR + H * (2 + Math.random() * 14); const p = centre.clone().add(new THREE.Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(r)); if (isOpen(p)) { open++; if (clearPath(bed, p)) clear++; } } return { open, clear }; },
  };
}
