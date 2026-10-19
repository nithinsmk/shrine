// The night sky over Central Java (Yogyakarta), turning in real time: NASA's Deep Star Maps 2020
// wrapped round the world as a dome, tilted for the latitude and turned to the local sidereal time.

import * as THREE from 'three';

const LAT = -7.8;   // Yogyakarta
const LON = 110.4;

// local sidereal time in degrees: which part of the sky is overhead right now
function siderealDegrees(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  return (((280.46061837 + 360.98564736629 * (jd - 2451545) + LON) % 360) + 360) % 360;
}

export function makeSky(scene, radius) {
  const small = Math.max(innerWidth, innerHeight) * devicePixelRatio < 1800;
  const tex = new THREE.TextureLoader().load(`sky/stars_${small ? '4k' : '8k'}.jpg`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 96, 48),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  dome.scale.x = -1;            // seen from inside, so east and west aren't mirrored
  dome.renderOrder = -1;

  // tilt: the celestial pole stands at the latitude's height above the horizon;
  // spin: turns with the sidereal time, carrying the stars and anything set among them
  const tilt = new THREE.Group();
  tilt.rotation.x = -(Math.PI / 2 - THREE.MathUtils.degToRad(LAT));
  const spin = new THREE.Group();
  spin.add(dome);
  tilt.add(spin);
  scene.add(tilt);
  let paused = false;

  return {
    spin,
    centre(at) { tilt.position.copy(at); },
    set paused(on) { paused = on; },
    update() { if (!paused) spin.rotation.y = -THREE.MathUtils.degToRad(siderealDegrees()); },
  };
}
