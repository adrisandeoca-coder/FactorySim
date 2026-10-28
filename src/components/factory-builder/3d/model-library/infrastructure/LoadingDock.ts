import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildLoadingDock(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const concrete = mat(0x888888, 0.1, 0.95);
  const concreteDark = mat(0x666666, 0.1, 0.95);
  const dockPlate = mat(0x5a6070, 0.7, 0.35);
  const steelFrame = mat(0x4a5060, 0.75, 0.35);
  const doorPanel = mat(0xcccccc, 0.5, 0.45);
  const doorTrack = mat(0x555555, 0.7, 0.3);
  const bumperRubber = mat(0x1a1a1a, 0.0, 0.92);
  const shelterFoam = mat(0x222222, 0.0, 0.9);
  const shelterFabric = mat(0x1a1a2a, 0.0, 0.85);
  const bollardYellow = mat(0xddaa00, 0.2, 0.5);
  const stripingYellow = mat(0xeecc00, 0.1, 0.4, { emissive: 0x332200, emissiveIntensity: 0.15 });
  const restraintMat = mat(0xff4400, 0.3, 0.5);
  const lightArm = mat(0x444444, 0.6, 0.4);
  const ledWhite = mat(0xffffff, 0.0, 0.3, { emissive: 0xffffee, emissiveIntensity: 1.5 });
  const trafficRed = mat(0xff0000, 0.1, 0.4, { emissive: 0x880000, emissiveIntensity: 0.8 });
  const trafficOff = mat(0x222222, 0.1, 0.7);
  const chockOrange = mat(0xff6600, 0.1, 0.6);

  // ── Dimensions ──
  const dockW = 3.0;
  const dockD = 1.8;
  const dockH = 1.2;
  const doorW = 2.6;
  const doorH = 3.2;

  // ── Raised Concrete Dock Platform ──
  g.add(box(dockW, dockH, dockD, concrete, 0, dockH / 2, 0));
  // Platform edge lip
  g.add(box(dockW + 0.04, 0.06, 0.06, concreteDark, 0, dockH + 0.03, -dockD / 2));
  // Platform surface texture lines
  for (let i = -4; i <= 4; i++) {
    g.add(box(0.005, 0.005, dockD, concreteDark, i * 0.3, dockH + 0.003, 0));
  }

  // ── Safety Yellow Striping on edges ──
  g.add(box(dockW + 0.05, 0.01, 0.08, stripingYellow, 0, dockH + 0.006, -dockD / 2 + 0.04));
  // Diagonal hazard stripes on front face
  for (let i = -6; i <= 6; i++) {
    g.add(box(0.05, 0.15, 0.01, stripingYellow, i * 0.2, dockH - 0.08, -dockD / 2 - 0.005, 0, 0, 0.7));
  }

  // ── Dock Leveler (hydraulic bridge plate) ──
  const levelerW = 2.0;
  const levelerD = 1.4;
  // Main plate (angled slightly down at front)
  g.add(box(levelerW, 0.04, levelerD, dockPlate, 0, dockH - 0.01, -dockD / 2 - levelerD / 2, -0.08, 0, 0));
  // Leveler hinge at dock edge
  g.add(cyl(0.03, 0.03, levelerW, 8, steelFrame, 0, dockH - 0.03, -dockD / 2, 0, 0, Math.PI / 2));
  // Lip plate at end of leveler
  g.add(box(levelerW - 0.1, 0.02, 0.2, dockPlate, 0, dockH - levelerD * 0.08 - 0.06, -dockD / 2 - levelerD + 0.1, -0.3, 0, 0));
  // Hydraulic cylinders underneath
  for (const lx of [-0.5, 0.5]) {
    g.add(cyl(0.03, 0.025, 0.5, 8, M.chrome, lx, dockH - 0.25, -dockD / 2 - 0.3, 0.4, 0, 0));
    g.add(cyl(0.02, 0.02, 0.3, 8, M.darkChrome, lx, dockH - 0.15, -dockD / 2 - 0.15, 0.4, 0, 0));
  }
  // Diamond tread pattern on leveler surface
  for (let ix = -4; ix <= 4; ix++) {
    for (let iz = -3; iz <= 3; iz++) {
      g.add(box(0.04, 0.005, 0.04, steelFrame, ix * 0.2, dockH + 0.01, -dockD / 2 - 0.2 - iz * 0.18, -0.08, Math.PI / 4, 0));
    }
  }

  // ── Dock Bumpers (rubber blocks on face) ──
  for (const bx of [-0.8, 0.8]) {
    // Main rubber bumper block
    g.add(box(0.25, 0.4, 0.12, bumperRubber, bx, dockH / 2 + 0.2, -dockD / 2 - 0.06));
    // Bumper mounting plate
    g.add(box(0.3, 0.45, 0.01, steelFrame, bx, dockH / 2 + 0.2, -dockD / 2 - 0.005));
    // Bumper bolt heads
    for (const [dx, dy] of [[-0.08, -0.12], [0.08, -0.12], [-0.08, 0.12], [0.08, 0.12]] as [number, number][]) {
      g.add(cyl(0.01, 0.01, 0.13, 6, M.darkChrome, bx + dx, dockH / 2 + 0.2 + dy, -dockD / 2 - 0.06));
    }
    // Horizontal grooves in rubber
    for (let rh = -0.12; rh <= 0.12; rh += 0.06) {
      g.add(box(0.24, 0.008, 0.005, M.bodyDark, bx, dockH / 2 + 0.2 + rh, -dockD / 2 - 0.12));
    }
  }

  // ── Dock Shelter (3-sided foam/fabric seal) ──
  const shelterW = doorW + 0.5;
  const shelterH = doorH + 0.3;
  const shelterD = 0.5;
  const shelterBase = dockH;
  // Top header pad
  g.add(box(shelterW, 0.3, shelterD, shelterFoam, 0, shelterBase + shelterH - 0.15, -dockD / 2 - shelterD / 2));
  g.add(box(shelterW + 0.02, 0.05, shelterD + 0.02, shelterFabric, 0, shelterBase + shelterH - 0.02, -dockD / 2 - shelterD / 2));
  // Left side pad
  g.add(box(0.3, shelterH, shelterD, shelterFoam, -shelterW / 2 + 0.15, shelterBase + shelterH / 2, -dockD / 2 - shelterD / 2));
  g.add(box(0.05, shelterH + 0.02, shelterD + 0.02, shelterFabric, -shelterW / 2 - 0.01, shelterBase + shelterH / 2, -dockD / 2 - shelterD / 2));
  // Right side pad
  g.add(box(0.3, shelterH, shelterD, shelterFoam, shelterW / 2 - 0.15, shelterBase + shelterH / 2, -dockD / 2 - shelterD / 2));
  g.add(box(0.05, shelterH + 0.02, shelterD + 0.02, shelterFabric, shelterW / 2 + 0.01, shelterBase + shelterH / 2, -dockD / 2 - shelterD / 2));
  // Shelter steel frame
  for (const sx of [-shelterW / 2, shelterW / 2]) {
    g.add(box(0.04, shelterH + 0.1, 0.04, steelFrame, sx, shelterBase + shelterH / 2, -dockD / 2 - 0.02));
  }
  g.add(box(shelterW, 0.04, 0.04, steelFrame, 0, shelterBase + shelterH + 0.02, -dockD / 2 - 0.02));

  // ── Overhead Sectional Door (partially raised) ──
  const doorRaisedY = dockH + doorH * 0.6; // partially open
  const panelCount = 5;
  const panelH = doorH / panelCount;
  // Visible raised panels (upper portion)
  for (let i = 0; i < 3; i++) {
    const py = doorRaisedY + i * panelH;
    g.add(box(doorW, panelH - 0.02, 0.05, doorPanel, 0, py, -dockD / 2 + 0.02));
    // Panel horizontal line
    g.add(box(doorW, 0.005, 0.055, doorTrack, 0, py - panelH / 2 + 0.01, -dockD / 2 + 0.02));
    // Window inserts on top panel
    if (i === 2) {
      for (let wx = -3; wx <= 3; wx++) {
        g.add(box(0.2, panelH * 0.5, 0.005, M.glass, wx * 0.32, py, -dockD / 2 - 0.005));
      }
    }
  }
  // Door tracks (vertical rails)
  for (const tx of [-doorW / 2 - 0.03, doorW / 2 + 0.03]) {
    g.add(box(0.04, doorH + 0.5, 0.06, doorTrack, tx, dockH + doorH / 2, -dockD / 2 + 0.02));
    // Track curve at top
    g.add(box(0.04, 0.04, 0.3, doorTrack, tx, dockH + doorH + 0.2, -dockD / 2 + 0.17));
  }

  // ── Dock Light (adjustable LED arm) ──
  const lightX = doorW / 2 + 0.4;
  const lightMountY = dockH + doorH - 0.3;
  // Mount bracket
  g.add(box(0.08, 0.08, 0.04, steelFrame, lightX, lightMountY, -dockD / 2 + 0.02));
  // Arm (articulated)
  g.add(cyl(0.02, 0.02, 0.6, 8, lightArm, lightX, lightMountY - 0.05, -dockD / 2 - 0.25, 0.3, 0, 0));
  // Joint
  g.add(sph(0.03, lightArm, lightX, lightMountY - 0.2, -dockD / 2 - 0.4));
  // Light head
  g.add(box(0.15, 0.06, 0.08, lightArm, lightX, lightMountY - 0.35, -dockD / 2 - 0.55));
  // LED face
  g.add(box(0.13, 0.04, 0.005, ledWhite, lightX, lightMountY - 0.35, -dockD / 2 - 0.59));

  // ── Vehicle Restraint Hook ──
  const restraintX = -doorW / 2 - 0.4;
  g.add(box(0.06, 0.15, 0.04, restraintMat, restraintX, dockH * 0.3, -dockD / 2 - 0.02));
  // Hook shape
  g.add(cyl(0.02, 0.02, 0.1, 8, restraintMat, restraintX, dockH * 0.15, -dockD / 2 - 0.06, 0.5, 0, 0));
  // Latch mechanism
  g.add(box(0.04, 0.06, 0.03, steelFrame, restraintX, dockH * 0.35, -dockD / 2 - 0.03));
  // Restraint label
  g.add(box(0.08, 0.04, 0.003, mat(0xeeeeee, 0, 0.9), restraintX, dockH * 0.5, -dockD / 2 - 0.003));

  // ── Wheel Chock Holder on wall ──
  const chockX = doorW / 2 + 0.5;
  const chockY = dockH + 0.6;
  // Holder bracket
  g.add(box(0.06, 0.2, 0.04, steelFrame, chockX, chockY, -dockD / 2 + 0.03));
  // Chock (wedge shape approximated)
  g.add(box(0.12, 0.08, 0.08, chockOrange, chockX, chockY - 0.04, -dockD / 2 + 0.08));
  g.add(box(0.12, 0.04, 0.06, chockOrange, chockX, chockY - 0.07, -dockD / 2 + 0.1));
  // Chock chain
  for (let ci = 0; ci < 5; ci++) {
    g.add(sph(0.008, M.darkChrome, chockX, chockY + 0.05 + ci * 0.025, -dockD / 2 + 0.06));
  }

  // ── Traffic Light (red/green for truck approach) ──
  const tlX = -doorW / 2 - 0.6;
  const tlY = dockH + 2.5;
  // Pole
  g.add(cyl(0.03, 0.03, 2.0, 8, steelFrame, tlX, dockH + 1.0, -dockD / 2 - 0.8));
  // Light housing
  g.add(box(0.12, 0.3, 0.1, M.bodyDark, tlX, tlY, -dockD / 2 - 0.8));
  // Visor/hood on top
  g.add(box(0.14, 0.02, 0.12, M.bodyDark, tlX, tlY + 0.16, -dockD / 2 - 0.82));
  // Red light (active)
  g.add(cyl(0.04, 0.04, 0.02, 12, trafficRed, tlX, tlY + 0.06, -dockD / 2 - 0.85));
  // Green light (off)
  g.add(cyl(0.04, 0.04, 0.02, 12, trafficOff, tlX, tlY - 0.06, -dockD / 2 - 0.85));

  // ── Bollards (truck protection at sides) ──
  for (const bx of [-dockW / 2 - 0.15, dockW / 2 + 0.15]) {
    // Bollard post
    g.add(cyl(0.06, 0.06, 0.9, 10, bollardYellow, bx, 0.45, -dockD / 2 - 0.6));
    // Bollard cap
    g.add(cyl(0.065, 0.06, 0.03, 10, bollardYellow, bx, 0.91, -dockD / 2 - 0.6));
    // Bollard base plate
    g.add(cyl(0.1, 0.1, 0.02, 10, steelFrame, bx, 0.01, -dockD / 2 - 0.6));
    // Reflective band
    g.add(cyl(0.062, 0.062, 0.04, 10, mat(0xffffff, 0.1, 0.3, { emissive: 0x333333, emissiveIntensity: 0.3 }), bx, 0.75, -dockD / 2 - 0.6));
    // Anchor bolts
    for (const [dx, dz] of [[0.06, 0], [-0.06, 0], [0, 0.06], [0, -0.06]] as [number, number][]) {
      g.add(cyl(0.007, 0.007, 0.015, 6, M.darkChrome, bx + dx, 0.025, -dockD / 2 - 0.6 + dz));
    }
  }

  // ── Dock Number Sign ──
  g.add(box(0.25, 0.25, 0.02, mat(0x2244aa, 0.1, 0.5), 0, dockH + doorH + 0.3, -dockD / 2 + 0.01));
  g.add(box(0.15, 0.15, 0.005, mat(0xffffff, 0, 0.8), 0, dockH + doorH + 0.3, -dockD / 2 - 0.001));

  // ── Status Light ──
  g.add(createStatusLight(dockW / 2 + 0.15, dockH + doorH - 0.5, -dockD / 2 + 0.04));

  return g;
}
