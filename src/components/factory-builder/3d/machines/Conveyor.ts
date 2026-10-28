import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Belt/Roller Conveyor
 * Welded steel C-channel frame with drive roller, idler roller,
 * slat belt, support rollers, adjustable legs, guide rails,
 * emergency pull cord, and chain guard.
 * Footprint: ~2.0 x 0.6 units, height ~0.55 units
 */
export function buildConveyor(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mFrame     = mat(0x3a3e48, 0.75, 0.4);           // steel C-channel
  const mBelt      = mat(0x1a1e22, 0.1, 0.9);            // dark belt surface
  const mSlat      = mat(0x2a2e36, 0.4, 0.7);            // belt slat lines
  const mDrive     = mat(0x505868, 0.8, 0.3);            // drive roller
  const mMotor     = mat(0x2c3040, 0.6, 0.5);            // gearmotor housing
  const mIdler     = mat(0x606878, 0.85, 0.25);          // idler roller
  const mSupport   = mat(0x555d68, 0.8, 0.3);            // support rollers
  const mLeg       = mat(0x404550, 0.7, 0.45);           // leg tubing
  const mFoot      = mat(0x333840, 0.6, 0.6);            // leveling feet
  const mGuide     = mat(0x484e58, 0.7, 0.4);            // side guide rails
  const mCord      = mat(0xcc2222, 0.05, 0.7);           // emergency pull cord
  const mChainGrd  = mat(0x444a54, 0.5, 0.5);            // chain guard cover
  const mMotorCap  = mat(0xddaa00, 0.3, 0.5);            // yellow motor cap

  const L = 1.8;    // conveyor length (X)
  const W = 0.5;    // conveyor width (Z)
  const H = 0.45;   // belt height (Y, to top of belt)
  const railH = 0.06;
  const railW = 0.03;

  // --- Side rails (C-channel frame) ---
  // Left rail
  g.add(box(L, railH, railW, mFrame, 0, H - railH / 2, -W / 2));
  g.add(box(L, railH, railW, mFrame, 0, H - railH / 2,  W / 2));
  // Bottom chord of C-channel
  g.add(box(L, 0.015, railW, mFrame, 0, H - railH - 0.06, -W / 2));
  g.add(box(L, 0.015, railW, mFrame, 0, H - railH - 0.06,  W / 2));
  // C-channel web (vertical)
  g.add(box(L, 0.06, 0.008, mFrame, 0, H - railH - 0.03, -W / 2 + railW / 2));
  g.add(box(L, 0.06, 0.008, mFrame, 0, H - railH - 0.03,  W / 2 - railW / 2));

  // --- Drive roller at +X end ---
  const driveX = L / 2 - 0.04;
  const driveR = 0.04;
  g.add(cyl(driveR, driveR, W - railW * 2, 16, mDrive,
    driveX, H - railH - 0.005, 0,
    Math.PI / 2, 0, 0,
  ));
  // Drive shaft caps
  g.add(cyl(driveR * 0.5, driveR * 0.5, 0.02, 12, mIdler,
    driveX, H - railH - 0.005, -W / 2 - 0.01,
    Math.PI / 2, 0, 0,
  ));

  // --- Gearmotor box on drive end ---
  const motorX = driveX + 0.02;
  g.add(box(0.12, 0.1, 0.1, mMotor, motorX, H - railH - 0.08, W / 2 + 0.06));
  // Motor shaft
  g.add(cyl(0.015, 0.015, 0.06, 8, mDrive,
    motorX, H - railH - 0.005, W / 2 + 0.015,
    Math.PI / 2, 0, 0,
  ));
  // Motor cap / warning stripe
  g.add(box(0.12, 0.015, 0.1, mMotorCap, motorX, H - railH - 0.025, W / 2 + 0.06));
  // Motor mounting flange
  g.add(box(0.02, 0.1, 0.1, mFrame, driveX - 0.01, H - railH - 0.08, W / 2 + 0.06));

  // --- Idler roller at -X end ---
  const idlerX = -L / 2 + 0.04;
  const idlerR = 0.03;
  g.add(cyl(idlerR, idlerR, W - railW * 2, 16, mIdler,
    idlerX, H - railH - 0.005, 0,
    Math.PI / 2, 0, 0,
  ));

  // --- Belt surface (flat dark box on top) ---
  const beltLen = L - 0.12;
  g.add(box(beltLen, 0.012, W - railW * 3, mBelt, 0, H - 0.006, 0));

  // --- Visible slat lines on belt ---
  const slatCount = Math.floor(beltLen / 0.15);
  for (let i = 0; i <= slatCount; i++) {
    const sx = -beltLen / 2 + (beltLen / slatCount) * i;
    g.add(box(0.006, 0.014, W - railW * 4, mSlat, sx, H - 0.004, 0));
  }

  // --- Intermediate support rollers underneath ---
  const supportCount = 5;
  const supportR = 0.015;
  for (let i = 1; i <= supportCount; i++) {
    const sx = -L / 2 + (L / (supportCount + 1)) * i;
    g.add(cyl(supportR, supportR, W - railW * 2, 8, mSupport,
      sx, H - railH - 0.04, 0,
      Math.PI / 2, 0, 0,
    ));
  }

  // --- 4 adjustable legs with leveling feet ---
  const legR = 0.02;
  const legH = H - railH - 0.07;
  const legPositions: [number, number][] = [
    [-L / 2 + 0.15, -W / 2],
    [-L / 2 + 0.15,  W / 2],
    [ L / 2 - 0.15, -W / 2],
    [ L / 2 - 0.15,  W / 2],
  ];
  for (const [lx, lz] of legPositions) {
    // Leg tube
    g.add(cyl(legR, legR, legH, 8, mLeg, lx, legH / 2, lz));
    // Leveling foot disc
    g.add(cyl(0.04, 0.04, 0.01, 12, mFoot, lx, 0.005, lz));
    // Threaded adjustment collar
    g.add(cyl(legR + 0.005, legR + 0.005, 0.03, 8, mFrame, lx, 0.03, lz));
  }

  // --- Cross braces between legs ---
  g.add(box(0.015, 0.015, W, mFrame, -L / 2 + 0.15, legH * 0.4, 0));
  g.add(box(0.015, 0.015, W, mFrame,  L / 2 - 0.15, legH * 0.4, 0));

  // --- Side guide rails (thin raised strips along edges) ---
  const guideHeight = 0.03;
  g.add(box(beltLen - 0.1, guideHeight, 0.008, mGuide, 0, H + guideHeight / 2, -W / 2 + railW + 0.01));
  g.add(box(beltLen - 0.1, guideHeight, 0.008, mGuide, 0, H + guideHeight / 2,  W / 2 - railW - 0.01));

  // --- Emergency pull cord along one side ---
  const cordY = H - railH / 2 + 0.02;
  // Main cord run
  g.add(cyl(0.004, 0.004, L - 0.1, 6, mCord,
    0, cordY, -W / 2 - 0.02,
    0, 0, Math.PI / 2,
  ));
  // Cord brackets (3 along the side)
  for (let i = 0; i < 3; i++) {
    const bx = -L / 2 + 0.2 + (L - 0.4) / 2 * i;
    g.add(box(0.015, 0.025, 0.015, mFrame, bx, cordY, -W / 2 - 0.015));
  }
  // E-stop pull handle at one end
  g.add(box(0.025, 0.04, 0.02, M.red, -L / 2 + 0.06, cordY, -W / 2 - 0.02));

  // --- Chain guard on drive end ---
  g.add(box(0.1, 0.1, 0.08, mChainGrd, driveX - 0.02, H - railH - 0.08, -W / 2 - 0.04));
  // Guard ventilation slot
  g.add(box(0.06, 0.04, 0.002, mat(0x222222, 0.0, 0.9),
    driveX - 0.02, H - railH - 0.07, -W / 2 - 0.08 + 0.002,
  ));

  // --- End plates ---
  g.add(box(0.008, railH + 0.06, W, mFrame, -L / 2 + 0.004, H - railH - 0.03, 0));
  g.add(box(0.008, railH + 0.06, W, mFrame,  L / 2 - 0.004, H - railH - 0.03, 0));

  // --- Status light on drive end ---
  const statusLightGroup = createStatusLight(driveX - 0.05, H, W / 2);
  g.add(statusLightGroup);

  return g;
}
