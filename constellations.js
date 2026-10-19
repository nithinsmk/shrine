// The collectives behind Psychopomps, written into the sky: each logo traced into stars and the
// lines between them, set among the real stars so they turn with the sky. Always faintly there;
// hovering one (a tap on phones) pauses the sky and opens an 8-bit window about the collective.

import * as THREE from 'three';

// texts: DRAFTS from the collectives' own pages and listings, waiting for Nithin's approval
export const COLLECTIVES = [
  {
    id: 'chinabot', name: 'CHINABOT', src: 'party/logos/chinabot.png', mask: 'alpha', colour: 0xfff04a,
    az: -24, alt: 22, width: 34,
    text: 'A label and collective started in 2017 by Cambodian-born artist Saphy Vong (LAFIDKI). Chinabot gathers experimental electronic and club music from across Asia and its diasporas, music that does not need to come from Berlin, London or Paris to matter.',
    link: { href: 'https://chinabot.bandcamp.com/', label: 'chinabot.bandcamp.com' },
  },
  {
    id: 'sxse', name: 'SXSE · SOUTHXSOUTHEAST', src: 'party/logos/sxse.jpg', mask: 'light', colour: 0xf2f2ea,
    az: 95, alt: 18, width: 30,
    text: 'A monthly community DJ hangout in Berlin for South and Southeast Asian diasporas, their musics and their issues. Beginners try out the decks; seasoned selectors test new mixes and share what they know.',
  },
  {
    id: 'subkontinent', name: '_SUBKONTINENT', src: 'party/logos/subkontinent.png', mask: 'alpha', colour: 0xf2f2ea,
    az: 180, alt: 16, width: 50, grid: 90,
    text: 'A space in Berlin-Neukölln for critical and artistic engagement with South Asia: to play, to organise, to gather.',
    link: { href: 'https://www.instagram.com/_subkontinent/', label: 'instagram @_subkontinent' },
  },
  {
    id: 'wbf', name: 'RADIO WBF', src: 'party/logos/wbf.png', mask: 'dark', colour: 0xf2f2ea,
    az: -100, alt: 20, width: 20, grid: 34,
    text: 'Wearebornfree Community Radio, live from Berlin. DJ sets, talk shows and an open call: radio for all, with shows on reboot.fm.',
    link: { href: 'https://wearebornfree.de/', label: 'wearebornfree.de' },
  },
];

const loadImage = (src) => new Promise((ok, fail) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = fail;
  img.src = src;
});

// trace a logo: the edge of its shape, sampled on a coarse grid, one star per cell,
// with lines to the neighbouring stars
async function trace(entry) {
  const img = await loadImage(entry.src);
  const W = 320, H = Math.max(8, Math.round((img.height / img.width) * W));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const p = g.getImageData(0, 0, W, H).data;
  const inside = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = (y * W + x) * 4, L = (p[i] + p[i + 1] + p[i + 2]) / 3;
    if (entry.mask === 'alpha') return p[i + 3] > 110;
    if (entry.mask === 'light') return L > 70;
    return p[i + 3] > 110 && L < 110; // dark ink on light paper
  };
  const step = Math.max(3, Math.round(W / (entry.grid || 64)));
  const cols = Math.ceil(W / step), rows = Math.ceil(H / step);
  const cells = new Map();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
      if (!edge) continue;
      const k = Math.floor(y / step) * cols + Math.floor(x / step);
      const cell = cells.get(k) || { x: 0, y: 0, n: 0 };
      cell.x += x; cell.y += y; cell.n++;
      cells.set(k, cell);
    }
  }
  const stars = [];
  const index = new Map();
  for (const [k, cell] of cells) {
    if (cell.n < 2) continue;
    index.set(k, stars.length);
    stars.push({ x: cell.x / cell.n, y: cell.y / cell.n, k });
  }
  const links = [];
  for (const s of stars) {
    const cx = s.k % cols, cy = Math.floor(s.k / cols);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const n = index.get((cy + dy) * cols + cx + dx);
      if (n === undefined || cx + dx < 0 || cx + dx >= cols || cy + dy >= rows) continue;
      const o = stars[n];
      if (Math.hypot(o.x - s.x, o.y - s.y) < step * 1.6) links.push([index.get(s.k), n]);
    }
  }
  return { stars, links, W, H };
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.3, 'rgba(255,255,255,.7)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export async function makeConstellations({ spin, radius, facing, up }) {
  const dot = dotTexture();
  const made = [];
  spin.updateWorldMatrix(true, true); // with the tilt above it, or they land in the wrong place
  const centre = new THREE.Vector3().setFromMatrixPosition(spin.matrixWorld);
  for (const entry of COLLECTIVES) {
    let traced;
    try { traced = await trace(entry); } catch (err) { console.error('could not trace', entry.id, err); continue; }
    const { stars, links, W, H } = traced;
    // where it hangs now, in the world, then fixed among the stars from there on
    const az = THREE.MathUtils.degToRad(entry.az), alt = THREE.MathUtils.degToRad(entry.alt);
    const dir = facing.clone().applyAxisAngle(up, az).multiplyScalar(Math.cos(alt)).addScaledVector(up, Math.sin(alt)).normalize();
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();   // screen-right, seen from inside
    const upOnSky = new THREE.Vector3().crossVectors(right, dir).normalize();
    const scale = (2 * radius * Math.tan(THREE.MathUtils.degToRad(entry.width) / 2)) / W;
    const world = stars.map((s) => centre.clone()
      .addScaledVector(dir, radius)
      .addScaledVector(right, (s.x - W / 2) * scale)
      .addScaledVector(upOnSky, (H / 2 - s.y) * scale)
      .sub(centre).setLength(radius).add(centre));
    const local = world.map((w) => spin.worldToLocal(w.clone()));

    const pts = new THREE.BufferGeometry().setFromPoints(local);
    const colour = new THREE.Color(entry.colour);
    const starMat = new THREE.PointsMaterial({ map: dot, color: colour, size: 4, sizeAttenuation: false, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const points = new THREE.Points(pts, starMat);
    const seg = [];
    for (const [a, b] of links) seg.push(local[a], local[b]);
    const lineMat = new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), lineMat);
    points.renderOrder = lines.renderOrder = 0;
    spin.add(points, lines);
    made.push({ entry, points, lines, starMat, lineMat, local, glow: 0, target: 0 });
  }

  const v = new THREE.Vector3();
  return {
    // which collective is under this screen point (in CSS pixels), if any
    pick(x, y, camera, width, height) {
      for (const m of made) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, behind = false;
        for (let i = 0; i < m.local.length; i += 3) {
          v.copy(m.local[i]).applyMatrix4(spin.matrixWorld).project(camera);
          if (v.z > 1) { behind = true; break; }
          const sx = (v.x + 1) / 2 * width, sy = (1 - v.y) / 2 * height;
          minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
        }
        if (behind) continue;
        const pad = 14;
        if (x > minX - pad && x < maxX + pad && y > minY - pad && y < maxY + pad) {
          return { entry: m.entry, box: { minX, minY, maxX, maxY } };
        }
      }
      return null;
    },
    // for ?debug: where each one hangs right now
    centres() { return made.map((m) => ({ id: m.entry.id, n: m.local.length, at: m.local[0].clone().applyMatrix4(spin.matrixWorld) })); },
    highlight(id) { for (const m of made) m.target = m.entry.id === id ? 1 : 0; },
    update(dt, now) {
      for (const m of made) {
        m.glow += (m.target - m.glow) * Math.min(1, dt * 3);
        const twinkle = 0.06 * Math.sin(now / 900 + m.entry.az);
        m.starMat.opacity = 0.45 + twinkle + 0.55 * m.glow;
        m.starMat.size = 4 + 2.5 * m.glow;
        m.lineMat.opacity = 0.12 + 0.75 * m.glow;
      }
    },
  };
}
