// Psychopomps, 31 Oct 2026 at ACUD: the party's three signs in the world.
// - the masthead orbits the sky like a satellite
// - a ticker of the basics turns round the foot of the shrine
// - the invitation rolls over the sky like a Star Wars opening crawl

import * as THREE from 'three';

const TICKER = 'PSYCHOPOMPS  ·  SAT 31 OCT 2026  ·  20:00 – 06:00  ·  ACUD MACHT NEU  ·  VETERANENSTRASSE 21, 10119 BERLIN  ·  ';
const GLOW = '#d4f23c';

// --- the satellite: the logo lifted off its white paper ---

// flood the white in from the edges (and any big white pocket), so the chrome highlights stay
function liftLogo(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const p = d.data, w = c.width, h = c.height;
  const white = (i) => p[i * 4] > 232 && p[i * 4 + 1] > 232 && p[i * 4 + 2] > 232;
  const seen = new Uint8Array(w * h);
  const clear = new Uint8Array(w * h);
  const flood = (start) => {
    const stack = [start], region = [];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      region.push(i);
      const x = i % w, y = (i / w) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (!seen[n] && white(n)) { seen[n] = 1; stack.push(n); }
      }
    }
    return region;
  };
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !white(i)) continue;
    const x = i % w, y = (i / w) | 0;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    const region = flood(i);
    if (edge || region.length > 1800) for (const j of region) clear[j] = 1; // paper, or a letter's open counter
  }
  for (let i = 0; i < w * h; i++) {
    if (clear[i]) { p[i * 4 + 3] = 0; continue; }
    // soften the edge against the paper a little
    const L = (p[i * 4] + p[i * 4 + 1] + p[i * 4 + 2]) / 3;
    let nearPaper = false;
    const x = i % w, y = (i / w) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && clear[ny * w + nx]) nearPaper = true;
    }
    if (nearPaper && L > 200) p[i * 4 + 3] = 255 * (1 - (L - 200) / 55);
  }
  g.putImageData(d, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, aspect: w / h };
}

export function makeSatellite(scene, centre, radius) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, fog: false, depthWrite: false, opacity: 0 }));
  sprite.renderOrder = 1;
  scene.add(sprite);
  // a glint that travels with it, like sunlight catching a satellite
  const glintCanvas = document.createElement('canvas');
  glintCanvas.width = glintCanvas.height = 64;
  const gg = glintCanvas.getContext('2d');
  const rg = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.2, 'rgba(230,255,180,.6)'); rg.addColorStop(1, 'rgba(230,255,180,0)');
  gg.fillStyle = rg; gg.fillRect(0, 0, 64, 64);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glintCanvas), blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true }));
  glint.renderOrder = 2;
  scene.add(glint);

  let aspect = 3.4;
  const img = new Image();
  img.onload = () => {
    const lifted = liftLogo(img);
    sprite.material.map = lifted.tex;
    sprite.material.needsUpdate = true;
    aspect = lifted.aspect;
  };
  img.src = 'party/logo-source.png';

  const PERIOD = 75;                         // seconds for one lap of the sky
  const ELEV = THREE.MathUtils.degToRad(6);  // how high it rides above the horizon
  const TILT = THREE.MathUtils.degToRad(3);  // the orbit leans, so it climbs and dips a little

  return {
    sprite,
    update(now) {
      const t = (now / 1000 / PERIOD) * Math.PI * 2;
      const elev = ELEV + TILT * Math.sin(t);
      const x = Math.cos(t) * Math.cos(elev), z = Math.sin(t) * Math.cos(elev), y = Math.sin(elev);
      sprite.position.set(centre.x + x * radius, centre.y + y * radius, centre.z + z * radius);
      const width = radius * 0.42;           // about 24° across: readable whenever it's in view
      sprite.scale.set(width, width / aspect, 1);
      if (sprite.material.map) sprite.material.opacity = 1;
      // a glint on the leading tip now and then
      const flash = Math.max(0, Math.sin(now / 1000 * 1.7)) ** 24;
      glint.position.copy(sprite.position);
      glint.scale.setScalar(width * (0.08 + 0.25 * flash));
      glint.material.opacity = 0.3 + 0.7 * flash;
    },
  };
}

// --- the ticker round the foot of the shrine ---

export function makeTicker(scene, { x, z, groundY, radius, height }) {
  const font = 'bold 150px ui-monospace, Menlo, monospace';
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const textW = probe.measureText(TICKER).width;
  // fit a whole number of repeats round the ring, so it closes without a seam
  const around = 2 * Math.PI * radius;
  const repeats = Math.max(1, Math.round(around / (height * 0.9) / (textW / 200)));
  const c = document.createElement('canvas');
  c.width = Math.min(16384, Math.ceil(textW));
  c.height = 200;
  const g = c.getContext('2d');
  g.font = font;
  g.textBaseline = 'middle';
  g.shadowColor = GLOW;
  g.shadowBlur = 24;
  g.fillStyle = GLOW;
  g.fillText(TICKER, 0, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(repeats, 1);
  tex.anisotropy = 8;

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 128, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.FrontSide, depthWrite: false, fog: false }),
  );
  band.position.set(x, groundY + height * 1.4, z);
  band.renderOrder = 3;
  scene.add(band);
  return {
    update(dt) { tex.offset.x += dt * 0.035; }, // the words run right to left across the front
  };
}

// --- the crawl ---

export function mountCrawl() {
  const crawl = document.getElementById('crawl');
  const inner = crawl.querySelector('.crawl-text');
  const call = document.getElementById('invitation');
  const skip = document.getElementById('crawl-skip');

  function minimise() {
    crawl.classList.remove('rolling');
    crawl.hidden = true;
    call.hidden = false;
  }
  function roll(rounds) {
    call.hidden = true;
    crawl.hidden = false;
    inner.style.animation = 'none';
    void inner.offsetWidth; // restart the animation
    inner.style.animation = '';
    inner.style.animationIterationCount = rounds;
    crawl.classList.add('rolling');
  }
  inner.addEventListener('animationend', minimise);
  skip.addEventListener('click', minimise);
  call.addEventListener('click', () => roll(1));
  roll(3); // three rounds on arrival
}
