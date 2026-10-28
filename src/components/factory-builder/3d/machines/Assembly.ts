import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Assembly Workbench
 * Heavy steel workbench with pegboard/shadow board, tools,
 * work fixture, overhead light, part bins, monitor arm,
 * and anti-fatigue mat.
 * Footprint: ~1.4 x 0.8 units, height ~1.6 units (to top of pegboard)
 */
export function buildAssembly(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mBenchFrame = mat(0x3a4050, 0.75, 0.4);          // heavy steel frame
  const mSurface    = mat(0x4a5568, 0.6, 0.5);           // bench top (machined steel)
  const mPegboard   = mat(0x6e6e5e, 0.05, 0.85);         // pegboard (MDF gray-tan)
  const mShadow     = mat(0x2a2a28, 0.0, 0.95);          // tool shadow outlines
  const mToolSteel  = mat(0x808890, 0.8, 0.3);           // chrome tool bodies
  const mToolGrip   = mat(0x222228, 0.0, 0.85);          // rubber grips
  const mFixture    = mat(0x505a68, 0.7, 0.4);           // work fixture
  const mPart       = mat(0x3388cc, 0.2, 0.5);           // part being assembled
  const mLight      = mat(0xeeeeee, 0.1, 0.3, {
    emissive: 0xfff8e0, emissiveIntensity: 1.5,
  });
  const mBinGreen   = mat(0x22aa55, 0.15, 0.6);
  const mBinBlue    = mat(0x2266cc, 0.15, 0.6);
  const mBinYellow  = mat(0xddaa22, 0.15, 0.6);
  const mBinRed     = mat(0xcc3333, 0.15, 0.6);
  const mBinOrange  = mat(0xee7722, 0.15, 0.6);
  const mMat        = mat(0x1a1a1a, 0.0, 0.95);          // anti-fatigue mat
  const mArm        = mat(0x404550, 0.7, 0.4);           // monitor arm
  const mScreen     = mat(0x0a1520, 0.0, 0.9, {
    emissive: 0x002244, emissiveIntensity: 0.8,
  });
  const mRail       = mat(0x555d68, 0.7, 0.4);           // bin rail

  const BW = 1.4;   // bench width (X)
  const BD = 0.7;   // bench depth (Z)
  const BH = 0.65;  // bench surface height (Y)
  const legW = 0.05;

  // --- Bench frame: 4 legs ---
  const legPositions: [number, number][] = [
    [-BW / 2 + legW, -BD / 2 + legW],
    [ BW / 2 - legW, -BD / 2 + legW],
    [-BW / 2 + legW,  BD / 2 - legW],
    [ BW / 2 - legW,  BD / 2 - legW],
  ];
  for (const [lx, lz] of legPositions) {
    g.add(box(legW, BH, legW, mBenchFrame, lx, BH / 2, lz));
  }

  // --- Lower cross braces ---
  g.add(box(BW - legW * 2, 0.03, 0.03, mBenchFrame, 0, 0.15, -BD / 2 + legW));
  g.add(box(BW - legW * 2, 0.03, 0.03, mBenchFrame, 0, 0.15,  BD / 2 - legW));
  g.add(box(0.03, 0.03, BD - legW * 2, mBenchFrame, -BW / 2 + legW, 0.15, 0));
  g.add(box(0.03, 0.03, BD - legW * 2, mBenchFrame,  BW / 2 - legW, 0.15, 0));

  // --- Bench surface (thick steel top) ---
  g.add(box(BW, 0.04, BD, mSurface, 0, BH + 0.02, 0));

  // --- Pegboard / shadow board behind bench ---
  const pegH = 0.85;
  const pegY = BH + 0.04 + pegH / 2;
  g.add(box(BW - 0.04, pegH, 0.02, mPegboard, 0, pegY, BD / 2 - 0.01));

  // --- Pegboard mounting brackets ---
  g.add(box(0.03, 0.08, 0.04, mBenchFrame, -BW / 2 + 0.08, BH + 0.08, BD / 2 - 0.02));
  g.add(box(0.03, 0.08, 0.04, mBenchFrame,  BW / 2 - 0.08, BH + 0.08, BD / 2 - 0.02));

  // --- Tool shadow outlines on pegboard ---
  // Wrench shadow
  g.add(box(0.18, 0.04, 0.005, mShadow, -0.35, pegY + 0.15, BD / 2 - 0.025));
  // Gun shadow (L-shape)
  g.add(box(0.08, 0.12, 0.005, mShadow, -0.05, pegY + 0.12, BD / 2 - 0.025));
  g.add(box(0.12, 0.04, 0.005, mShadow, 0.01, pegY + 0.2, BD / 2 - 0.025));
  // Screwdriver shadow
  g.add(box(0.04, 0.2, 0.005, mShadow, 0.3, pegY + 0.1, BD / 2 - 0.025));

  // --- Actual tools hanging ---
  // Torque wrench (thin steel box with rubber grip)
  g.add(box(0.16, 0.025, 0.025, mToolSteel, -0.35, pegY + 0.15, BD / 2 - 0.04));
  g.add(box(0.06, 0.028, 0.028, mToolGrip,  -0.42, pegY + 0.15, BD / 2 - 0.04));

  // Pneumatic gun (L-shaped assembly)
  g.add(box(0.05, 0.09, 0.04, mToolGrip, -0.05, pegY + 0.08, BD / 2 - 0.04));
  g.add(box(0.1,  0.035, 0.035, mToolSteel, 0.01, pegY + 0.18, BD / 2 - 0.04));
  // Air hose connector
  g.add(cyl(0.01, 0.01, 0.04, 8, mToolSteel, -0.05, pegY + 0.02, BD / 2 - 0.04));

  // Screwdriver (thin cylinder + grip)
  g.add(cyl(0.008, 0.008, 0.12, 8, mToolSteel, 0.3, pegY + 0.16, BD / 2 - 0.04));
  g.add(cyl(0.015, 0.015, 0.07, 8, mToolGrip,  0.3, pegY + 0.06, BD / 2 - 0.04));

  // --- Tool hook pegs (small cylinders sticking out of pegboard) ---
  const hookPositions = [-0.35, -0.05, 0.3];
  for (const hx of hookPositions) {
    g.add(cyl(0.006, 0.006, 0.03, 6, mBenchFrame,
      hx, pegY + 0.25, BD / 2 - 0.03,
      Math.PI / 2, 0, 0,
    ));
  }

  // --- Work fixture on bench surface ---
  const fixtureX = -0.1;
  const fixtureZ = -0.05;
  const fixtureBase = BH + 0.04;
  // Fixture base plate
  g.add(box(0.2, 0.02, 0.18, mFixture, fixtureX, fixtureBase + 0.01, fixtureZ));
  // Locating pins (4 thin cylinders)
  const pinPositions: [number, number][] = [
    [fixtureX - 0.06, fixtureZ - 0.05],
    [fixtureX + 0.06, fixtureZ - 0.05],
    [fixtureX - 0.06, fixtureZ + 0.05],
    [fixtureX + 0.06, fixtureZ + 0.05],
  ];
  for (const [px, pz] of pinPositions) {
    g.add(cyl(0.006, 0.006, 0.04, 8, mToolSteel, px, fixtureBase + 0.04, pz));
  }
  // Clamping lever
  g.add(box(0.1, 0.015, 0.015, mBenchFrame, fixtureX + 0.12, fixtureBase + 0.05, fixtureZ));

  // --- Part being assembled in fixture ---
  g.add(box(0.1, 0.05, 0.08, mPart, fixtureX, fixtureBase + 0.05, fixtureZ));

  // --- Overhead light bar ---
  const lightY = BH + 0.04 + pegH + 0.08;
  // Light bar housing
  g.add(box(BW - 0.2, 0.025, 0.06, mBenchFrame, 0, lightY, 0.1));
  // Light emissive surface (underside)
  g.add(box(BW - 0.25, 0.008, 0.04, mLight, 0, lightY - 0.015, 0.1));
  // Light mounting arms from pegboard
  g.add(box(0.02, 0.02, 0.2, mBenchFrame, -BW / 2 + 0.15, lightY, BD / 2 - 0.1));
  g.add(box(0.02, 0.02, 0.2, mBenchFrame,  BW / 2 - 0.15, lightY, BD / 2 - 0.1));

  // --- Bin rail at back of bench ---
  const railY = BH + 0.04 + 0.02;
  g.add(box(BW - 0.1, 0.015, 0.03, mRail, 0, railY + 0.008, BD / 2 - 0.08));

  // --- Part bins (6 small colored bins on rail) ---
  const binColors = [mBinGreen, mBinBlue, mBinYellow, mBinRed, mBinOrange, mBinGreen];
  const binCount = 6;
  const binW2 = 0.1;
  const binH2 = 0.06;
  const binD2 = 0.08;
  const binStartX = -BW / 2 + 0.12;
  const binSpacing = (BW - 0.24) / (binCount - 1);

  for (let i = 0; i < binCount; i++) {
    const bx = binStartX + binSpacing * i;
    g.add(box(binW2, binH2, binD2, binColors[i],
      bx, railY + 0.015 + binH2 / 2, BD / 2 - 0.08,
    ));
    // Bin lip (front edge)
    g.add(box(binW2, 0.01, 0.005, binColors[i],
      bx, railY + 0.015 + binH2, BD / 2 - 0.08 - binD2 / 2,
    ));
  }

  // --- Monitor arm + screen ---
  const armX = BW / 2 - 0.12;
  const armBaseY = BH + 0.04;
  // Arm clamp at bench edge
  g.add(box(0.04, 0.03, 0.06, mArm, armX, armBaseY + 0.015, -BD / 2 + 0.05));
  // Vertical arm post
  g.add(cyl(0.012, 0.012, 0.35, 8, mArm, armX, armBaseY + 0.2, -BD / 2 + 0.05));
  // Horizontal arm extension
  g.add(box(0.2, 0.02, 0.02, mArm, armX - 0.1, armBaseY + 0.38, -BD / 2 + 0.05));
  // Tilt joint
  g.add(cyl(0.015, 0.015, 0.025, 8, mArm,
    armX - 0.2, armBaseY + 0.38, -BD / 2 + 0.05,
    0, 0, Math.PI / 2,
  ));
  // Screen (flat panel, angled slightly)
  const screenMesh = box(0.28, 0.18, 0.012, mScreen,
    armX - 0.2, armBaseY + 0.38, -BD / 2 + 0.03,
    -0.15, 0, 0,
  );
  g.add(screenMesh);
  // Screen bezel
  g.add(box(0.3, 0.2, 0.008, mArm,
    armX - 0.2, armBaseY + 0.38, -BD / 2 + 0.035,
    -0.15, 0, 0,
  ));

  // --- Anti-fatigue mat at base ---
  g.add(box(BW * 0.8, 0.015, 0.5, mMat, 0, 0.0075, -BD / 2 - 0.3));

  // --- Bench edge trim strip (rubber bumper) ---
  g.add(box(BW, 0.015, 0.008, M.rubber, 0, BH + 0.04 + 0.008, -BD / 2));

  // --- Drawer unit under bench (left side) ---
  const drwX = -BW / 2 + 0.18;
  g.add(box(0.28, 0.28, BD - legW * 2 - 0.04, mBenchFrame, drwX, 0.32, 0));
  // Drawer pulls (3 drawers)
  for (let d = 0; d < 3; d++) {
    const dy = 0.2 + d * 0.09;
    g.add(box(0.08, 0.008, 0.015, mToolSteel, drwX, dy, -BD / 2 + legW + 0.01));
    // Drawer line
    g.add(box(0.27, 0.002, 0.001, mShadow, drwX, dy + 0.04, -BD / 2 + legW + 0.005));
  }

  // --- Status light on pole attached to pegboard ---
  const statusLightGroup = createStatusLight(BW / 2 - 0.08, pegY + pegH / 2 + 0.05, BD / 2 + 0.02);
  g.add(statusLightGroup);

  return g;
}
