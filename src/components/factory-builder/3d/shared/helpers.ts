import * as THREE from 'three';

export function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cyl(rt: number, rb: number, h: number, seg: number, material: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function sph(r: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function tor(r: number, tube: number, material: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, 24), material);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}

/** Create a status light stack (3-color andon lamp) */
export function createStatusLight(x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);

  // Pole
  g.add(cyl(0.02, 0.02, 0.4, 8, new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.3 }), 0, 0.2, 0));

  // Housing
  g.add(cyl(0.06, 0.06, 0.04, 12, new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 }), 0, 0.42, 0));

  // Green lamp
  const greenLamp = cyl(0.05, 0.05, 0.06, 12, new THREE.MeshStandardMaterial({ color: 0x004400, roughness: 0.4 }), 0, 0.48, 0);
  greenLamp.name = 'lamp_green';
  g.add(greenLamp);

  // Yellow lamp
  const yellowLamp = cyl(0.05, 0.05, 0.06, 12, new THREE.MeshStandardMaterial({ color: 0x443300, roughness: 0.4 }), 0, 0.55, 0);
  yellowLamp.name = 'lamp_yellow';
  g.add(yellowLamp);

  // Red lamp
  const redLamp = cyl(0.05, 0.05, 0.06, 12, new THREE.MeshStandardMaterial({ color: 0x440000, roughness: 0.4 }), 0, 0.62, 0);
  redLamp.name = 'lamp_red';
  g.add(redLamp);

  // Cap
  g.add(cyl(0.06, 0.04, 0.04, 12, new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 }), 0, 0.67, 0));

  // Status light indicator (tiny, hidden inside cap — used by animation system)
  const statusLight = sph(0.015, new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4 }), 0, 0.68, 0);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}

/** Set status lamp colors based on state */
export function setStatusLampState(group: THREE.Group, state: string) {
  const colors: Record<string, { green: number; yellow: number; red: number; emG: number; emY: number; emR: number }> = {
    processing:  { green: 0x00ff80, yellow: 0x443300, red: 0x440000, emG: 1.5, emY: 0, emR: 0 },
    starved:     { green: 0x004400, yellow: 0xffcc00, red: 0x440000, emG: 0, emY: 1.5, emR: 0 },
    blocked:     { green: 0x004400, yellow: 0x443300, red: 0xff2222, emG: 0, emY: 0, emR: 1.5 },
    idle:        { green: 0x004400, yellow: 0x443300, red: 0x440000, emG: 0, emY: 0, emR: 0 },
    failed:      { green: 0x004400, yellow: 0x443300, red: 0xff0000, emG: 0, emY: 0, emR: 2.0 },
    setup:       { green: 0x004400, yellow: 0xffaa00, red: 0x440000, emG: 0, emY: 1.0, emR: 0 },
    off_shift:   { green: 0x004400, yellow: 0x443300, red: 0x440000, emG: 0, emY: 0, emR: 0 },
    batch_wait:  { green: 0x004400, yellow: 0xffcc00, red: 0x440000, emG: 0, emY: 0.8, emR: 0 },
  };
  const c = colors[state] || colors.idle;

  group.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mesh.name === 'lamp_green') {
      mat.color.setHex(c.green);
      mat.emissive.setHex(c.green);
      mat.emissiveIntensity = c.emG;
    } else if (mesh.name === 'lamp_yellow') {
      mat.color.setHex(c.yellow);
      mat.emissive.setHex(c.yellow);
      mat.emissiveIntensity = c.emY;
    } else if (mesh.name === 'lamp_red') {
      mat.color.setHex(c.red);
      mat.emissive.setHex(c.red);
      mat.emissiveIntensity = c.emR;
    }
  });
}
