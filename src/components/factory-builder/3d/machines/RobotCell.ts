import * as THREE from 'three';

/**
 * Robot cells at real size (1 unit = 1 m), as in the reference layouts
 * (Process Simulate, DELMIA, Visual Components): a 6-axis industrial robot on
 * a pedestal, the cell equipment for its job, a controller cabinet and a
 * signal tower. The 3D view adds the yellow-post mesh fence around it.
 *
 * Three kinds:
 *  - 'handling' (orange, KUKA-like): picks parts at the in-feed, places them
 *    in a fixture, takes the finished part to the out-feed.
 *  - 'weld' (white, Fanuc/Yaskawa-like): MIG torch with hose package, two-
 *    station turntable positioner with a divider screen; the robot follows
 *    the seam with sparks while the operator side is loaded, then the table
 *    turns 180°.
 *  - 'pallet' (yellow): vacuum gripper stacking cartons on a pallet layer by
 *    layer.
 *
 * Motion is computed, not keyframed: the robot solves inverse kinematics for
 * its tool point every frame (base yaw, shoulder and elbow from the planar
 * two-link solution, wrist pitch keeps the tool vertical), moving between
 * waypoints with smooth acceleration. The cycle follows the station state:
 * processing runs the program, idle parks at home, blocked holds the part
 * over the out-feed, failed stops with the tower red.
 */

export type RobotCellKind = 'handling' | 'weld' | 'pallet';
export type CellState = 'processing' | 'idle' | 'starved' | 'blocked' | 'failed' | 'setup' | 'offshift';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
const MATS = new Map<string, THREE.MeshStandardMaterial>();
function m(color: number, rough = 0.5, metal = 0.2, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const k = `${color}:${rough}:${metal}:${JSON.stringify(extra)}`;
  let mat = MATS.get(k);
  if (!mat) { mat = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }); MATS.set(k, mat); }
  return mat;
}
function bx(p: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const o = new THREE.Mesh(BOX, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true; p.add(o); return o;
}
/** Cylinder along Y (axis 'y'), X or Z. */
function cy(p: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, r: number, h: number, axis: 'x' | 'y' | 'z' = 'y') {
  const o = new THREE.Mesh(CYL, mat); o.position.set(x, y, z); o.scale.set(r * 2, h, r * 2);
  if (axis === 'x') o.rotation.z = Math.PI / 2; else if (axis === 'z') o.rotation.x = Math.PI / 2;
  o.castShadow = true; p.add(o); return o;
}

const PAINT: Record<RobotCellKind, number> = { handling: 0xe8701a, weld: 0xe9ecef, pallet: 0xf2c200 };

// Robot geometry (m): base height, shoulder offset, upper arm, elbow offset, forearm, wrist→flange
const R = { base: 0.2, j2h: 0.33, a1: 0.16, a2: 0.78, a3: 0.14, d4: 0.8, d6: 0.1 };

interface Robot {
  root: THREE.Group;          // pedestal top, faces +Z
  j1: THREE.Object3D; j2: THREE.Object3D; j3: THREE.Object3D; j5: THREE.Object3D; j6: THREE.Object3D;
  tool: THREE.Object3D;
  toolLen: number;
  grip: [THREE.Object3D, THREE.Object3D] | null;
  load: THREE.Mesh;           // part / carton on the tool
}

function buildRobot(kind: RobotCellKind): Robot {
  const paint = m(PAINT[kind], 0.42, 0.25);
  const dark = m(0x2b2f35, 0.55, 0.4);
  const grey = m(0x6a7078, 0.45, 0.55);
  const root = new THREE.Group();
  // Base
  cy(root, dark, 0, 0.03, 0, 0.3, 0.06);
  cy(root, paint, 0, 0.13, 0, 0.24, 0.14);
  // J1 turret
  const j1 = new THREE.Object3D(); j1.position.y = R.base; root.add(j1);
  cy(j1, paint, 0, 0.06, 0, 0.23, 0.12);
  bx(j1, paint, 0, 0.2, R.a1 * 0.5, 0.36, 0.3, 0.42);
  cy(j1, grey, -0.2, 0.18, -0.1, 0.09, 0.18, 'x');            // J2 motor
  cy(j1, dark, 0.19, R.j2h, R.a1, 0.13, 0.06, 'x');           // J2 cover
  cy(j1, dark, -0.19, R.j2h, R.a1, 0.13, 0.06, 'x');
  // J2 shoulder (rotation.x tilts the upper arm forward)
  const j2 = new THREE.Object3D(); j2.position.set(0, R.j2h, R.a1); j1.add(j2);
  bx(j2, paint, 0, R.a2 / 2, 0, 0.17, R.a2 + 0.1, 0.22);       // upper arm casting
  bx(j2, m(PAINT[kind], 0.5, 0.2), 0.095, R.a2 / 2, 0, 0.02, R.a2 * 0.7, 0.16); // side cover
  cy(j2, dark, 0.11, R.a2, 0, 0.1, 0.04, 'x');
  // J3 elbow
  const j3 = new THREE.Object3D(); j3.position.y = R.a2; j2.add(j3);
  bx(j3, paint, 0, 0.0, -0.05, 0.24, 0.26, 0.3);              // elbow housing
  cy(j3, grey, -0.12, 0.05, -0.18, 0.075, 0.2, 'x');           // J3 motor
  // Forearm along +Y from the elbow (offset a3 forward)
  cy(j3, paint, 0, R.d4 * 0.45, R.a3 * 0.4, 0.075, R.d4 * 0.75);
  cy(j3, paint, 0, R.d4 * 0.12, R.a3 * 0.2, 0.1, 0.22);         // J4 housing
  // Wrist J5 at the end of the forearm
  const j5 = new THREE.Object3D(); j5.position.set(0, R.d4, R.a3 * 0.4); j3.add(j5);
  cy(j5, paint, 0, 0, 0, 0.065, 0.15, 'x');
  const j6 = new THREE.Object3D(); j6.position.y = R.d6; j5.add(j6);
  cy(j6, dark, 0, -R.d6 / 2, 0, 0.045, R.d6);
  cy(j6, grey, 0, 0.0, 0, 0.055, 0.02);                          // flange
  const tool = new THREE.Object3D(); j6.add(tool);
  let toolLen = 0.12;
  let grip: [THREE.Object3D, THREE.Object3D] | null = null;
  const load = new THREE.Mesh(BOX, m(0x8a929c, 0.4, 0.6));
  load.castShadow = true;
  load.visible = false;
  if (kind === 'weld') {
    // MIG torch: body, swan neck, nozzle, hose package along the arm
    const torchMat = m(0x30343a, 0.4, 0.6), copper = m(0xc07a3a, 0.35, 0.8);
    cy(tool, torchMat, 0, 0.07, 0, 0.035, 0.12);
    const neck = cy(tool, torchMat, 0.0, 0.17, 0.035, 0.022, 0.12); neck.rotation.x = 0.55;
    cy(tool, copper, 0, 0.245, 0.075, 0.016, 0.05).rotation.x = 0.55;
    toolLen = 0.27;
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.05, -0.06), new THREE.Vector3(0, -0.35, -0.2), new THREE.Vector3(0, -0.75, -0.16),
    ]), 12, 0.022, 8), m(0x1d1f22, 0.8, 0));
    j6.add(hose);
  } else if (kind === 'pallet') {
    // Vacuum gripper plate with cups
    bx(tool, grey, 0, 0.06, 0, 0.5, 0.05, 0.36);
    for (const x of [-0.17, 0, 0.17]) for (const z of [-0.11, 0.11]) cy(tool, dark, x, 0.1, z, 0.03, 0.04);
    toolLen = 0.12;
    load.scale.set(0.48, 0.3, 0.34);
    load.material = m(0xc4934a, 0.9, 0);
    load.position.y = toolLen + 0.15;
  } else {
    // Servo gripper: body + two fingers
    bx(tool, grey, 0, 0.05, 0, 0.16, 0.08, 0.1);
    const f1 = new THREE.Object3D(), f2 = new THREE.Object3D();
    bx(f1, m(0xa8b0b8, 0.3, 0.7), 0, 0.06, 0, 0.02, 0.12, 0.06);
    bx(f2, m(0xa8b0b8, 0.3, 0.7), 0, 0.06, 0, 0.02, 0.12, 0.06);
    f1.position.set(-0.05, 0.09, 0); f2.position.set(0.05, 0.09, 0);
    tool.add(f1, f2);
    grip = [f1, f2];
    toolLen = 0.2;
    load.scale.set(0.2, 0.12, 0.26);
    load.position.y = toolLen;
  }
  tool.add(load);
  root.traverse((o) => { (o as THREE.Mesh).raycast = () => {}; });
  return { root, j1, j2, j3, j5, j6, tool, toolLen, grip, load };
}

/**
 * Inverse kinematics for a tool point (robot-root frame) with the tool pointing
 * straight down. Elbow-up solution, like an industrial robot working over a table.
 */
function solve(rb: Robot, p: THREE.Vector3, toolSpin = 0) {
  const yaw = Math.atan2(p.x, p.z);
  rb.j1.rotation.y = yaw;
  // Wrist centre: above the tool point by tool length + flange
  const wy = p.y + rb.toolLen + R.d6;
  const r = Math.max(0.05, Math.hypot(p.x, p.z) - R.a1);
  const h = wy - (R.base + R.j2h);
  const a = R.a2, b = Math.hypot(R.d4, R.a3 * 0.4);
  const D = Math.min(Math.max(Math.hypot(r, h), Math.abs(a - b) + 0.02), a + b - 0.01);
  const gamma = Math.atan2(r, h);                       // from vertical, toward +Z
  const alpha = Math.acos((a * a + D * D - b * b) / (2 * a * D));
  const phi1 = gamma - alpha;                           // upper arm from vertical (elbow up)
  const ex = a * Math.sin(phi1), ey = a * Math.cos(phi1);
  const phi2 = Math.atan2(r - ex, h - ey);              // forearm from vertical
  const off = Math.atan2(R.a3 * 0.4, R.d4);             // forearm is drawn slightly offset
  rb.j2.rotation.x = phi1;
  rb.j3.rotation.x = phi2 - phi1 - off;
  // Tool straight down: total pitch π from vertical
  rb.j5.rotation.x = Math.PI - phi2 + off;
  rb.j6.rotation.y = toolSpin;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Step { to: THREE.Vector3; dur: number; grip?: boolean; weld?: boolean; spin?: number }

export interface RobotCellController {
  update(dt: number, state: CellState): void;
}

export function buildRobotCell(kind: RobotCellKind = 'handling'): THREE.Group {
  const g = new THREE.Group();
  g.name = 'robotCell';
  const floor = m(0x8f979f, 0.9, 0.05), yellow = m(0xf2c200, 0.5, 0.1), dark = m(0x2b2f35, 0.55, 0.4);
  const blue = m(0x2f62d0, 0.45, 0.3), steel = m(0xa8b0b8, 0.35, 0.65), tableMat = m(0x5a6068, 0.5, 0.4);

  // Floor plate with yellow/black hatch border (robot working envelope)
  bx(g, floor, 0, 0.005, 0, 3.4, 0.01, 3.0);
  for (const [x, z, sx, sz] of [[0, -1.5, 3.4, 0.08], [0, 1.5, 3.4, 0.08], [-1.7, 0, 0.08, 3.0], [1.7, 0, 0.08, 3.0]] as const) bx(g, yellow, x, 0.012, z, sx, 0.006, sz);

  // Robot on a pedestal at the back of the cell, facing the fixture (+Z)
  const ped = new THREE.Group(); ped.position.set(0, 0, -0.75); g.add(ped);
  bx(ped, m(0x7a828c, 0.5, 0.35), 0, 0.25, 0, 0.6, 0.5, 0.6);
  bx(ped, dark, 0, 0.51, 0, 0.66, 0.03, 0.66);
  const rb = buildRobot(kind);
  rb.root.position.y = 0.52;
  ped.add(rb.root);

  // Controller cabinet + teach pendant holder (outside the robot's sweep, back-left)
  bx(g, m(0xd9dde2, 0.5, 0.2), -1.35, 0.6, -1.2, 0.5, 1.2, 0.45);
  bx(g, dark, -1.35, 1.0, -0.97, 0.36, 0.2, 0.01);
  bx(g, m(0x1a1d20, 0.4, 0.3), -1.05, 0.95, -1.2, 0.08, 0.25, 0.14);

  // Signal tower on the cabinet
  const tower = new THREE.Group(); tower.position.set(-1.2, 1.2, -1.05); g.add(tower);
  cy(tower, dark, 0, 0.1, 0, 0.012, 0.2);
  const lamps: Record<'red' | 'amber' | 'green', THREE.Mesh> = {
    green: cy(tower, m(0x1f8f3a, 0.3, 0.1), 0, 0.24, 0, 0.035, 0.07),
    amber: cy(tower, m(0xc98a00, 0.3, 0.1), 0, 0.31, 0, 0.035, 0.07),
    red: cy(tower, m(0xb3261e, 0.3, 0.1), 0, 0.38, 0, 0.035, 0.07),
  };
  for (const l of Object.values(lamps)) l.material = (l.material as THREE.MeshStandardMaterial).clone();
  const setLamp = (on: 'red' | 'amber' | 'green' | null) => {
    (Object.keys(lamps) as ('red' | 'amber' | 'green')[]).forEach((k) => {
      const mat = lamps[k].material as THREE.MeshStandardMaterial;
      mat.emissive.set(k === 'red' ? 0xff2a1a : k === 'amber' ? 0xffb000 : 0x22dd55);
      mat.emissiveIntensity = k === on ? 1.6 : 0;
    });
  };

  // Job equipment and waypoints (cell frame; converted to robot frame for IK)
  const toRobot = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.y - 0.52, v.z + 0.75);
  const steps: Step[] = [];
  const sparks = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(60 * 3), 3)),
    new THREE.PointsMaterial({ color: 0xffd27a, size: 0.035, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  sparks.visible = false;
  g.add(sparks);
  let turntable: THREE.Object3D | null = null;
  let pallet: { boxes: THREE.Mesh[]; n: number } | null = null;
  const inPt = new THREE.Vector3(-1.25, 0.85, 0.15), outPt = new THREE.Vector3(1.25, 0.85, 0.15);
  const up = (v: THREE.Vector3, d = 0.25) => v.clone().setY(v.y + d);
  const home = new THREE.Vector3(0, 1.45, 0.05);

  // In-feed and out-feed: short roller conveyors ending in a stop, where the cell's conveyors arrive
  for (const p of [inPt, outPt]) {
    const top = p.y - 0.07;
    for (const dz of [-0.27, 0.27]) bx(g, m(0x9aa3ad, 0.4, 0.6), p.x, top, p.z + dz, 0.7, 0.08, 0.04);   // side rails
    for (let i = 0; i < 7; i++) cy(g, steel, p.x - 0.3 + i * 0.1, top + 0.02, p.z, 0.025, 0.52, 'z');  // rollers
    for (const dx of [-0.3, 0.3]) for (const dz of [-0.25, 0.25]) bx(g, dark, p.x + dx, top / 2, p.z + dz, 0.04, top, 0.04);
    bx(g, yellow, p.x + Math.sign(p.x) * 0.36, top + 0.08, p.z, 0.03, 0.12, 0.5);  // end stop
  }

  if (kind === 'weld') {
    // Two-station turntable positioner: divider screen across the table, robot
    // side at the back (−Z), operator loading side at the front (+Z)
    const base = new THREE.Group(); base.position.set(0, 0, 0.75); g.add(base);
    cy(base, dark, 0, 0.3, 0, 0.35, 0.6);
    turntable = new THREE.Group(); turntable.position.y = 0.62; base.add(turntable);
    bx(turntable, m(0x2a7fb8, 0.45, 0.3), 0, 0.03, 0, 1.8, 0.06, 1.4);
    // Divider: steel frame with a translucent orange welding curtain
    for (const x of [-0.88, 0.88]) bx(turntable, m(0x5b6470, 0.6, 0.3), x, 0.45, 0, 0.05, 0.84, 0.05);
    bx(turntable, m(0x5b6470, 0.6, 0.3), 0, 0.86, 0, 1.8, 0.05, 0.05);
    bx(turntable, m(0xe8641a, 0.6, 0.0, { transparent: true, opacity: 0.55, depthWrite: false }), 0, 0.46, 0, 1.72, 0.76, 0.01);
    for (const sz of [-1, 1]) {
      bx(turntable, blue, 0, 0.12, sz * 0.38, 1.2, 0.08, 0.45);                    // fixture frame
      for (const cx of [-0.5, 0.5]) bx(turntable, m(0x1d2329, 0.4, 0.5), cx, 0.2, sz * 0.38, 0.06, 0.1, 0.06);
      bx(turntable, m(0x9aa2ab, 0.35, 0.7), 0, 0.2, sz * 0.38, 0.9, 0.06, 0.3);    // part
    }
    const y = 0.62 + 0.24, z = 0.75 - 0.38;
    const seam = [new THREE.Vector3(-0.42, y, z - 0.13), new THREE.Vector3(0.42, y, z - 0.13), new THREE.Vector3(0.42, y, z + 0.13), new THREE.Vector3(-0.42, y, z + 0.13)];
    steps.push({ to: up(seam[0], 0.15), dur: 1.2 });
    steps.push({ to: seam[0], dur: 0.5 });
    for (let i = 1; i < seam.length; i++) steps.push({ to: seam[i], dur: 1.4, weld: true });
    steps.push({ to: up(seam[seam.length - 1], 0.2), dur: 0.5 });
    steps.push({ to: home, dur: 1.0 });
    steps.push({ to: home, dur: 1.6, spin: 1 });   // table turns while the robot waits
  } else if (kind === 'pallet') {
    // Pallet with cartons building up in layers
    bx(g, m(0x8b5e3c, 0.9, 0), 0, 0.075, 0.85, 1.2, 0.15, 0.8);
    const boxes: THREE.Mesh[] = [];
    for (let l = 0; l < 3; l++) for (let i = 0; i < 6; i++) {
      const b = bx(g, m(0xc4934a, 0.9, 0), (i % 3 - 1) * 0.38, 0.15 + 0.15 + l * 0.3, 0.85 + (Math.floor(i / 3) - 0.5) * 0.36, 0.36, 0.28, 0.34);
      b.visible = false; boxes.push(b);
    }
    pallet = { boxes, n: 0 };
    steps.push({ to: up(inPt, 0.3), dur: 1.0 });
    steps.push({ to: inPt.clone().setY(inPt.y + 0.3), dur: 0.4, grip: true });
    // Place target is filled in each cycle from the next box slot
    steps.push({ to: new THREE.Vector3(), dur: 1.4 });
    steps.push({ to: new THREE.Vector3(), dur: 0.4, grip: false });
    steps.push({ to: home, dur: 1.0 });
  } else {
    // Fixture table: steel top on a welded frame, blue toggle clamps
    bx(g, m(0x7d858e, 0.45, 0.55), 0, 0.84, 0.8, 1.1, 0.04, 0.7);
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.3, 0.3]) bx(g, tableMat, dx, 0.41, 0.8 + dz, 0.06, 0.82, 0.06);
    bx(g, tableMat, 0, 0.15, 0.8, 1.0, 0.04, 0.6);
    for (const x of [-0.3, 0.3]) bx(g, blue, x, 0.92, 0.8, 0.08, 0.12, 0.3);
    const fix = new THREE.Vector3(0, 0.9, 0.8);
    steps.push({ to: up(inPt), dur: 1.0 });
    steps.push({ to: inPt.clone().setY(inPt.y + 0.06), dur: 0.5, grip: true });
    steps.push({ to: up(inPt), dur: 0.4 });
    steps.push({ to: up(fix), dur: 1.0 });
    steps.push({ to: fix.clone().setY(fix.y + 0.06), dur: 0.5, grip: false });
    steps.push({ to: up(fix), dur: 0.9 });          // process while the part is clamped
    steps.push({ to: fix.clone().setY(fix.y + 0.06), dur: 0.5, grip: true });
    steps.push({ to: up(fix), dur: 0.4 });
    steps.push({ to: up(outPt), dur: 1.0 });
    steps.push({ to: outPt.clone().setY(outPt.y + 0.06), dur: 0.5, grip: false });
    steps.push({ to: up(outPt), dur: 0.4 });
    steps.push({ to: home, dur: 1.0 });
  }

  // Part resting in the fixture / nests (handling): visible when not on the tool
  let fixturePart: THREE.Mesh | null = null;
  if (kind === 'handling') {
    fixturePart = bx(g, m(0x8a929c, 0.4, 0.6), 0, 0.92, 0.8, 0.2, 0.12, 0.26);
    fixturePart.visible = false;
  }

  // ── Controller ─────────────────────────────────────────────
  let stepIdx = steps.length - 1, stepT = 0, holding = false, spinAngle = 0;
  const cur = toRobot(home);
  const from = cur.clone();
  const sparkPos = sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
  const sparkVel = new Float32Array(60 * 3);
  const sparkLife = new Float32Array(60);
  const tipWorld = new THREE.Vector3();
  solve(rb, cur);

  const nextTarget = (s: Step) => {
    if (kind === 'pallet' && pallet && s.to.lengthSq() === 0) {
      const b = pallet.boxes[pallet.n % pallet.boxes.length];
      const top = b.position.clone().setY(b.position.y + 0.15);
      return toRobot(steps.indexOf(s) === 2 ? top.clone().setY(top.y + 0.25) : top);
    }
    return toRobot(s.to);
  };

  const controller: RobotCellController = {
    update(dt: number, state: CellState) {
      const run = state === 'processing' || state === 'setup';
      setLamp(state === 'failed' ? 'red' : state === 'blocked' || state === 'starved' ? 'amber' : run ? 'green' : null);
      let target: THREE.Vector3;
      let welding = false;
      if (state === 'failed') {
        // Stopped where it was
        target = cur.clone();
      } else if (!run) {
        // Idle: back home; blocked: hold the part over the out-feed
        target = state === 'blocked' && kind !== 'weld' ? toRobot(up(outPt, 0.15)) : toRobot(home);
        cur.lerp(target, 1 - Math.exp(-dt * 2.2));
        from.copy(cur);
      } else {
        stepT += dt;
        const s = steps[stepIdx];
        const tgt = nextTarget(s);
        const u = Math.min(1, stepT / s.dur);
        cur.lerpVectors(from, tgt, s.weld ? u : ease(u));
        welding = !!s.weld;
        if (s.spin && turntable) turntable.rotation.y = spinAngle + Math.PI * ease(u);
        if (u >= 1) {
          if (s.grip !== undefined) {
            holding = s.grip;
            if (fixturePart) fixturePart.visible = !holding && stepIdx >= 4 && stepIdx < 9;
            if (pallet && !s.grip) {
              pallet.boxes[pallet.n % pallet.boxes.length].visible = true;
              pallet.n++;
              if (pallet.n % pallet.boxes.length === 0) pallet.boxes.forEach((b) => (b.visible = false));
            }
          }
          if (s.spin && turntable) spinAngle += Math.PI;
          from.copy(tgt);
          stepT = 0;
          stepIdx = (stepIdx + 1) % steps.length;
        }
        target = cur;
      }
      solve(rb, cur, kind === 'pallet' ? -rb.j1.rotation.y : 0);
      rb.load.visible = holding && kind !== 'weld';
      if (rb.grip) {
        const open = holding ? 0.035 : 0.06;
        rb.grip[0].position.x += (-open - rb.grip[0].position.x) * Math.min(1, dt * 10);
        rb.grip[1].position.x += (open - rb.grip[1].position.x) * Math.min(1, dt * 10);
      }
      // Sparks at the torch tip while welding
      sparks.visible = welding || sparkLife.some((l) => l > 0);
      if (sparks.visible) {
        rb.tool.updateWorldMatrix(true, false);
        tipWorld.set(0, rb.toolLen, 0.09).applyMatrix4(rb.tool.matrixWorld);
        g.worldToLocal(tipWorld);
        for (let i = 0; i < 60; i++) {
          if (sparkLife[i] <= 0 && welding && Math.random() < 0.5) {
            sparkLife[i] = 0.2 + Math.random() * 0.35;
            sparkPos.setXYZ(i, tipWorld.x, tipWorld.y, tipWorld.z);
            sparkVel[i * 3] = (Math.random() - 0.5) * 2.4; sparkVel[i * 3 + 1] = Math.random() * 1.8; sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
          }
          if (sparkLife[i] > 0) {
            sparkLife[i] -= dt;
            sparkVel[i * 3 + 1] -= 9.8 * dt;
            sparkPos.setXYZ(i, sparkPos.getX(i) + sparkVel[i * 3] * dt, Math.max(0.62, sparkPos.getY(i) + sparkVel[i * 3 + 1] * dt), sparkPos.getZ(i) + sparkVel[i * 3 + 2] * dt);
            if (sparkLife[i] <= 0) sparkPos.setXYZ(i, 0, -10, 0);
          }
        }
        sparkPos.needsUpdate = true;
      }
      void target;
    },
  };
  g.userData.robotCell = controller;
  g.userData.robotKind = kind;
  setLamp(null);
  g.traverse((o) => { (o as THREE.Mesh).raycast = () => {}; });
  return g;
}
