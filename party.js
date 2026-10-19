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

// --- the crawl: the invitation as a plane of text standing on the horizon, tilted back like the
// Star Wars opening, off to one side of the shrine so it never covers the hill ---

const CRAWL = [
  { text: '31 · 10 · 2026', head: true },
  { text: 'PSYCHOPOMPS', title: true },
  { text: 'SXSE × Chinabot × _Subkontinent welcome you to a night of mediation between infra and ultra, nether and heavens, truths and majicks.' },
  { text: 'At sandhya, the hour that belongs to neither day nor night, the membranes grow porous twixt the living and their ancestors, the waking and the dreaming, this world and the one just beside it. Allow the pilandok, the mouse-deer, shapeshifter and crosser of boundaries, to escort you through voids and shines. Follow close, but never too close, and trust the path it takes.' },
  { text: 'Come sway with us on a night that yearns for transformation, transition and trickery.' },
  { text: 'Leave your reds at home, lest you are lost before you reach the temporary shrine of our collective making.' },
  { text: 'Memeshift · Leng Seong · HWXXNG · Sabiwa · Thiên · mobin · nischal · Rana Ghose · fugitive radio · NaN', lineup: true },
];

function crawlCanvas() {
  const W = 1024, PAD = 48, LINE = 84;
  const fontFor = (b) => (b.title ? 'bold 96px ui-monospace, Menlo, monospace' : b.head ? '600 52px ui-monospace, Menlo, monospace' : '600 58px ui-monospace, Menlo, monospace');
  const g0 = document.createElement('canvas').getContext('2d');
  const lines = [];
  for (const b of CRAWL) {
    g0.font = fontFor(b);
    const words = b.text.split(' ');
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (g0.measureText(next).width > W - PAD * 2 && line) { lines.push({ t: line, b }); line = w; } else line = next;
    }
    lines.push({ t: line, b }, { t: '', b }); // a blank line after each paragraph
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Math.min(8192, lines.length * LINE + 2 * PAD);
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.fillStyle = GLOW;
  g.shadowColor = 'rgba(212,242,60,.6)';
  g.shadowBlur = 18;
  lines.forEach((l, i) => { g.font = fontFor(l.b); g.fillText(l.t, W / 2, PAD + i * LINE); });
  return c;
}

// the far end fades into the sky
function fadeMap() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#000'); gr.addColorStop(0.4, '#000'); gr.addColorStop(0.75, '#fff'); gr.addColorStop(0.97, '#fff'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
}

export function makeCrawl(scene) {
  const text = crawlCanvas();
  const tex = new THREE.CanvasTexture(text);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaMap: fadeMap(), transparent: true, depthWrite: false, fog: false, opacity: 0 });
  const group = new THREE.Group();
  let mesh = null, win = 1, speed = 0;
  scene.add(group);

  let rounds = 0, played = 0, onRound = null, fade = 0;
  const ROUND = 52; // seconds for the whole text to pass

  return {
    // stand it at `at` (its bottom edge on the horizon), turned to face `from`, `width` wide
    place(at, from, width, tilt = 0.75) {
      const length = width * 1.5;
      if (mesh) { group.remove(mesh); mesh.geometry.dispose(); }
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length).translate(0, length / 2, 0), mat);
      mesh.rotation.x = -tilt; // lean back, away from the viewer
      mesh.renderOrder = 4;
      group.add(mesh);
      group.position.copy(at);
      group.rotation.y = Math.atan2(from.x - at.x, from.z - at.z);
      // the plane shows a win of the text; the win slides down it so the words rise and recede
      win = length / (text.height * (width / text.width));
      tex.repeat.set(1, win);
      tex.offset.y = 1;
      speed = (1 + win) / ROUND;
    },
    play(n, cb) { rounds = n; played = 0; onRound = cb; tex.offset.y = 1; fade = 1; },
    stop() { rounds = 0; fade = 0; },
    get playing() { return rounds > 0; },
    update(dt) {
      mat.opacity += (fade - mat.opacity) * Math.min(1, dt * 2);
      if (!rounds) return;
      tex.offset.y -= speed * dt;
      if (tex.offset.y < -win) {
        played++;
        tex.offset.y = 1;
        if (played >= rounds) { rounds = 0; fade = 0; }
        onRound?.(played, rounds === 0);
      }
    },
  };
}
