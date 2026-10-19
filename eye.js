// The standing cat with a hollow chartreuse eye that flickers on the beat of Radio al Hara.
// The drawing stays pure ink; the glow is drawn here so it is the same green in every pose.
// ?tune lets you drag the eyes into place (wheel = size, shift+wheel = turn) and prints their numbers.

const STREAM = 'https://stream.radioalhara.net/ra';
const GREEN = [212, 242, 60];

// eye positions in the drawing's own pixels (1131 × 1600)
const EYES = [
  { x: 205, y: 845, w: 34, h: 15, rot: -0.15 },
  { x: 300, y: 870, w: 34, h: 15, rot: 0.1 },
];

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const tuning = new URLSearchParams(location.search).has('tune');
let dpr = 1, view = { s: 1, ox: 0, oy: 0 };
let cat = null;               // keyed drawing (transparent where the paper was)

// --- the drawing: lift the ink off the grey paper ---
const img = new Image();
img.src = 'assets/cat-standing.jpg';
img.onload = () => {
  const off = document.createElement('canvas');
  off.width = img.width; off.height = img.height;
  const o = off.getContext('2d');
  o.drawImage(img, 0, 0);
  const d = o.getImageData(0, 0, off.width, off.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const lum = (p[i] + p[i + 1] + p[i + 2]) / 3;
    const a = Math.max(0, Math.min(1, (150 - lum) / 90));   // paper ≈ 187 → 0, ink ≈ 0 → 1
    p[i] = p[i + 1] = p[i + 2] = 0;
    p[i + 3] = a * 255;
  }
  o.putImageData(d, 0, 0);
  cat = off;
  resize();
};

function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  if (!cat) return;
  const s = Math.min(innerWidth / cat.width, innerHeight / cat.height) * 0.95;
  view = { s, ox: (innerWidth - cat.width * s) / 2, oy: (innerHeight - cat.height * s) / 2 };
}
addEventListener('resize', resize);

// --- listening: beat flicker from the low end of the stream ---
const audio = new Audio();
audio.crossOrigin = 'anonymous';
let analyser = null, bins = null, prev = null;
const fluxHist = [];
let lastBeat = 0;
let flare = 0;          // 0..1, jumps on a beat and decays
let flickerUntil = 0;   // the tube "catching" just after a beat

function startAudio() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const src = ac.createMediaElementSource(audio);
  analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.2;
  src.connect(analyser); analyser.connect(ac.destination);
  bins = new Uint8Array(analyser.frequencyBinCount);
  prev = new Float32Array(analyser.frequencyBinCount);
}

function listen(now) {
  if (!analyser) return;
  analyser.getByteFrequencyData(bins);
  // spectral flux over ~40–300 Hz (kick and bass onsets)
  const hz = analyser.context.sampleRate / analyser.fftSize;
  const lo = Math.floor(40 / hz), hi = Math.ceil(300 / hz);
  let flux = 0;
  for (let i = lo; i <= hi; i++) {
    const v = bins[i] / 255;
    flux += Math.max(0, v - prev[i]);
    prev[i] = v;
  }
  for (let i = hi + 1; i < bins.length; i++) prev[i] = bins[i] / 255;
  fluxHist.push(flux); if (fluxHist.length > 50) fluxHist.shift();
  const mean = fluxHist.reduce((a, b) => a + b, 0) / fluxHist.length;
  const sd = Math.sqrt(fluxHist.reduce((a, b) => a + (b - mean) ** 2, 0) / fluxHist.length);
  if (flux > mean + 1.7 * sd && flux > 0.15 && now - lastBeat > 280) {
    lastBeat = now;
    flare = 1;
    flickerUntil = now + 90 + Math.random() * 70;
  }
}

// --- drawing ---
function almond(e) {
  ctx.beginPath();
  ctx.moveTo(-e.w, 0);
  ctx.quadraticCurveTo(0, -e.h * 1.6, e.w, 0);
  ctx.quadraticCurveTo(0, e.h * 1.6, -e.w, 0);
  ctx.closePath();
}

function drawEye(e, glow) {
  const { s, ox, oy } = view;
  const dark = document.body.classList.contains('dark');
  const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
  ctx.save();
  ctx.translate(ox + e.x * s, oy + e.y * s);
  ctx.rotate(e.rot);
  ctx.scale(s, s);
  const [r, g, b] = GREEN;

  // halo spilling onto the fur
  const R = e.w * (2.2 + glow * 1.6);
  const halo = ctx.createRadialGradient(0, 0, e.w * 0.4, 0, 0, R);
  halo.addColorStop(0, `rgba(${r},${g},${b},${0.35 * glow})`);
  halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
  ctx.fillStyle = halo;
  ctx.fillRect(-R, -R, R * 2, R * 2);
  ctx.globalCompositeOperation = 'source-over';

  // the hollow: punched through to the paper
  almond(e);
  ctx.fillStyle = bg;
  ctx.fill();

  // light pooling inside the hollow, brightest at the rim
  almond(e);
  const inner = ctx.createRadialGradient(0, 0, 0, 0, 0, e.w);
  inner.addColorStop(0, `rgba(${r},${g},${b},${0.08 + 0.25 * glow})`);
  inner.addColorStop(1, `rgba(${r},${g},${b},${0.3 + 0.5 * glow})`);
  ctx.fillStyle = inner;
  ctx.fill();

  // the ring
  almond(e);
  ctx.shadowColor = `rgba(${r},${g},${b},${0.6 + 0.4 * glow})`;
  ctx.shadowBlur = (8 + 30 * glow) * s * dpr;
  ctx.strokeStyle = `rgb(${Math.min(255, r + 40 * glow)},${Math.min(255, g + 12 * glow)},${Math.min(255, b + 150 * glow)})`;
  ctx.lineWidth = 4 + 2 * glow;
  ctx.stroke();
  ctx.restore();
}

function frame(now) {
  listen(now);
  flare *= 0.9;
  let glow = 0.3 + 0.08 * Math.sin(now / 900) + 0.7 * flare;
  if (now < flickerUntil && Math.random() < 0.45) glow *= 0.25;  // the tube stutters
  if (!analyser) glow = 0.35 + 0.1 * Math.sin(now / 900);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (cat) {
    const { s, ox, oy } = view;
    if (document.body.classList.contains('dark')) {
      // ink becomes a faint green-black silhouette on the dark ground
      ctx.globalAlpha = 1;
      ctx.drawImage(cat, ox, oy, cat.width * s, cat.height * s);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = '#1c2614';
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.drawImage(cat, ox, oy, cat.width * s, cat.height * s);
    }
    EYES.forEach(e => drawEye(e, glow));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- controls ---
const playBtn = document.getElementById('play');
const nowEl = document.getElementById('now');
playBtn.onclick = () => {
  if (!analyser) { audio.src = STREAM; startAudio(); }
  if (audio.paused) {
    nowEl.textContent = 'tuning in…';
    audio.play().then(() => { nowEl.textContent = 'live from Bethlehem'; playBtn.textContent = '❚❚ Radio al Hara'; })
      .catch(err => { nowEl.textContent = 'could not reach the stream'; console.error(err); });
  } else {
    audio.pause(); playBtn.textContent = '▶ Radio al Hara'; nowEl.textContent = '';
  }
};
document.getElementById('bg').onclick = () => document.body.classList.toggle('dark');

// --- ?tune: drag eyes into place ---
if (tuning) {
  const out = document.getElementById('tune');
  out.style.display = 'block';
  const show = () => { out.textContent = 'EYES = ' + JSON.stringify(EYES.map(e => ({ ...e, rot: +e.rot.toFixed(2) })), null, 1); };
  show();
  const toImg = ev => [(ev.clientX - view.ox) / view.s, (ev.clientY - view.oy) / view.s];
  const nearest = ([x, y]) => EYES.reduce((a, e) => (Math.hypot(e.x - x, e.y - y) < Math.hypot(a.x - x, a.y - y) ? e : a));
  let drag = null;
  canvas.onpointerdown = ev => { drag = nearest(toImg(ev)); };
  canvas.onpointermove = ev => { if (!drag) return; [drag.x, drag.y] = toImg(ev).map(Math.round); show(); };
  addEventListener('pointerup', () => { drag = null; });
  canvas.onwheel = ev => {
    ev.preventDefault();
    const e = nearest(toImg(ev));
    if (ev.shiftKey) e.rot += Math.sign(ev.deltaY) * 0.05;
    else { const k = ev.deltaY < 0 ? 1.06 : 1 / 1.06; e.w = Math.round(e.w * k); e.h = Math.round(e.h * k); }
    show();
  };
}
