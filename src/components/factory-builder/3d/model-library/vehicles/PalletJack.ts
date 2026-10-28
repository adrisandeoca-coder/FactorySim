import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Manual Pallet Jack / Pump Truck
 * Two long forks, hydraulic pump handle, small fork-tip rollers,
 * larger steering wheels, hydraulic cylinder, pump housing, release lever.
 * Footprint: ~1.2 x 0.6 units, height ~1.0 (handle up)
 */
export function buildPalletJack(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mFrame   = mat(0x3a4050, 0.75, 0.35);   // structural steel
  const mFork    = mat(0x556070, 0.7, 0.3);      // fork steel
  const mHandle  = mat(0x444c58, 0.65, 0.4);     // handle tube
  const mPump    = mat(0x2c3040, 0.6, 0.5);      // pump housing
  const mHydro   = mat(0xb0b8c0, 0.85, 0.15);    // hydraulic cylinder
  const mGrip    = mat(0x222222, 0.0, 0.85);      // rubber grip
  const mRelease = mat(0xcc2222, 0.2, 0.5);       // release lever (red)
  const mAxle    = mat(0x606878, 0.8, 0.25);      // axle steel

  // Faces +X direction (forks extend forward)
  // Fork ground clearance: ~0.02, fork top ~0.06

  // ============ FORKS (two long flat prongs) ============
  const forkLen = 0.7;
  const forkW = 0.08;
  const forkH = 0.04;
  const forkY = 0.04;
  const forkSpacing = 0.18;

  // Left fork
  g.add(box(forkLen, forkH, forkW, mFork, 0.1, forkY, forkSpacing));
  // Left fork top plate (slightly wider)
  g.add(box(forkLen, 0.005, forkW + 0.01, mFrame, 0.1, forkY + forkH / 2 + 0.002, forkSpacing));
  // Left fork taper at tip
  g.add(box(0.04, 0.02, forkW, mFork, 0.1 + forkLen / 2 + 0.02, 0.03, forkSpacing));
  // Left fork inner stiffener rib
  g.add(box(forkLen - 0.1, 0.015, 0.01, mFrame, 0.1, forkY + 0.01, forkSpacing - forkW / 2 + 0.005));

  // Right fork
  g.add(box(forkLen, forkH, forkW, mFork, 0.1, forkY, -forkSpacing));
  g.add(box(forkLen, 0.005, forkW + 0.01, mFrame, 0.1, forkY + forkH / 2 + 0.002, -forkSpacing));
  g.add(box(0.04, 0.02, forkW, mFork, 0.1 + forkLen / 2 + 0.02, 0.03, -forkSpacing));
  g.add(box(forkLen - 0.1, 0.015, 0.01, mFrame, 0.1, forkY + 0.01, -forkSpacing + forkW / 2 - 0.005));

  // ============ FORK TIP ROLLERS (single wheel at each fork end) ============
  const tipX = 0.1 + forkLen / 2 - 0.02;
  const rollerR = 0.018;

  // Left fork roller
  g.add(cyl(rollerR, rollerR, 0.05, 10, M.darkChrome, tipX, 0.018, forkSpacing, Math.PI / 2, 0, 0));
  g.add(cyl(0.008, 0.008, 0.06, 8, mAxle, tipX, 0.018, forkSpacing, Math.PI / 2, 0, 0));

  // Right fork roller
  g.add(cyl(rollerR, rollerR, 0.05, 10, M.darkChrome, tipX, 0.018, -forkSpacing, Math.PI / 2, 0, 0));
  g.add(cyl(0.008, 0.008, 0.06, 8, mAxle, tipX, 0.018, -forkSpacing, Math.PI / 2, 0, 0));

  // ============ FORK ENTRY ROLLERS (at base of forks) ============
  const entryX = -0.22;

  // Left entry roller
  g.add(cyl(0.022, 0.022, forkW + 0.01, 10, M.darkChrome, entryX, 0.04, forkSpacing, Math.PI / 2, 0, 0));

  // Right entry roller
  g.add(cyl(0.022, 0.022, forkW + 0.01, 10, M.darkChrome, entryX, 0.04, -forkSpacing, Math.PI / 2, 0, 0));

  // ============ CROSS MEMBERS (connecting forks to body) ============
  // Front cross member
  g.add(box(0.04, 0.05, forkSpacing * 2 + forkW, mFrame, -0.2, 0.05, 0));
  // Rear cross member
  g.add(box(0.04, 0.05, forkSpacing * 2 + forkW, mFrame, -0.25, 0.05, 0));

  // ============ PUMP BODY / HOUSING ============
  g.add(box(0.14, 0.1, 0.2, mPump, -0.3, 0.1, 0));
  // Pump top cover
  g.add(box(0.15, 0.01, 0.21, mFrame, -0.3, 0.155, 0));
  // Pump side plates
  g.add(box(0.14, 0.08, 0.01, mat(0x3a3a44, 0.5, 0.5), -0.3, 0.1, 0.105));
  g.add(box(0.14, 0.08, 0.01, mat(0x3a3a44, 0.5, 0.5), -0.3, 0.1, -0.105));

  // ============ HYDRAULIC CYLINDER ============
  // Main cylinder body
  g.add(cyl(0.02, 0.02, 0.12, 10, mHydro, -0.28, 0.08, 0, 0, 0, Math.PI / 2));
  // Cylinder rod (extending forward into fork linkage)
  g.add(cyl(0.01, 0.01, 0.1, 8, M.chrome, -0.2, 0.08, 0, 0, 0, Math.PI / 2));
  // Cylinder end cap
  g.add(cyl(0.025, 0.025, 0.015, 10, mFrame, -0.34, 0.08, 0, 0, 0, Math.PI / 2));
  // Hydraulic line fittings
  g.add(cyl(0.006, 0.006, 0.03, 6, M.chrome, -0.34, 0.1, 0.03));
  g.add(cyl(0.006, 0.006, 0.03, 6, M.chrome, -0.34, 0.1, -0.03));

  // ============ STEERING WHEELS (larger, at handle end) ============
  const steerX = -0.35;
  const steerY = 0.06;
  const steerR = 0.045;

  // Left steering wheel
  g.add(cyl(steerR, steerR, 0.04, 14, M.rubber, steerX, steerY, 0.14, Math.PI / 2, 0, 0));
  g.add(cyl(0.025, 0.025, 0.03, 10, M.darkChrome, steerX, steerY, 0.14, Math.PI / 2, 0, 0));
  g.add(cyl(0.01, 0.01, 0.005, 8, M.chrome, steerX, steerY, 0.163, Math.PI / 2, 0, 0));

  // Right steering wheel
  g.add(cyl(steerR, steerR, 0.04, 14, M.rubber, steerX, steerY, -0.14, Math.PI / 2, 0, 0));
  g.add(cyl(0.025, 0.025, 0.03, 10, M.darkChrome, steerX, steerY, -0.14, Math.PI / 2, 0, 0));
  g.add(cyl(0.01, 0.01, 0.005, 8, M.chrome, steerX, steerY, -0.163, Math.PI / 2, 0, 0));

  // Steering axle
  g.add(cyl(0.012, 0.012, 0.28, 8, mAxle, steerX, steerY, 0, Math.PI / 2, 0, 0));

  // Steering yoke/pivot
  g.add(box(0.04, 0.06, 0.08, mFrame, steerX, 0.09, 0));
  g.add(cyl(0.015, 0.015, 0.05, 8, mAxle, steerX, 0.13, 0));

  // ============ HANDLE / TILLER (upright pump lever) ============
  // Handle pivot at pump body

  // Lower handle tube (angled back)
  g.add(cyl(0.015, 0.015, 0.35, 8, mHandle, -0.42, 0.35, 0, 0.3, 0, 0));

  // Upper handle tube
  g.add(cyl(0.015, 0.015, 0.25, 8, mHandle, -0.46, 0.6, 0, 0.3, 0, 0));

  // Handle crossbar (T-bar grip)
  g.add(cyl(0.012, 0.012, 0.22, 8, mHandle, -0.49, 0.73, 0, Math.PI / 2, 0, 0));

  // Rubber grips on crossbar
  g.add(cyl(0.018, 0.018, 0.07, 8, mGrip, -0.49, 0.73, 0.08, Math.PI / 2, 0, 0));
  g.add(cyl(0.018, 0.018, 0.07, 8, mGrip, -0.49, 0.73, -0.08, Math.PI / 2, 0, 0));

  // ============ RELEASE LEVER (on handle) ============
  // Lever pivot
  g.add(cyl(0.008, 0.008, 0.04, 6, mFrame, -0.45, 0.55, 0.03));
  // Lever arm (red)
  g.add(box(0.015, 0.06, 0.02, mRelease, -0.45, 0.58, 0.05));
  // Lever knob
  g.add(sph(0.012, mRelease, -0.45, 0.61, 0.05));

  // ============ PUMP MECHANISM LINKAGE ============
  // Pump lever link rod
  g.add(cyl(0.008, 0.008, 0.15, 6, mFrame, -0.38, 0.22, 0.06, 0.4, 0, 0));
  g.add(cyl(0.008, 0.008, 0.15, 6, mFrame, -0.38, 0.22, -0.06, 0.4, 0, 0));

  // Pivot pins
  g.add(cyl(0.006, 0.006, 0.04, 6, M.chrome, -0.36, 0.16, 0, Math.PI / 2, 0, 0));
  g.add(cyl(0.006, 0.006, 0.04, 6, M.chrome, -0.38, 0.3, 0, Math.PI / 2, 0, 0));

  // ============ FORK LIFT LINKS (connecting pump to fork raise) ============
  // Push rods under forks
  g.add(cyl(0.008, 0.008, 0.4, 6, mFrame, 0.0, 0.065, forkSpacing, 0, 0, Math.PI / 2));
  g.add(cyl(0.008, 0.008, 0.4, 6, mFrame, 0.0, 0.065, -forkSpacing, 0, 0, Math.PI / 2));

  // ============ LABEL / BRANDING PLATE ============
  g.add(box(0.06, 0.03, 0.005, mat(0x888822, 0.3, 0.5), -0.3, 0.12, 0.107));

  // ============ SAFETY DETAILS ============
  // Yellow warning stripes on handle base
  g.add(box(0.04, 0.015, 0.22, mat(0xccaa00, 0.2, 0.6), -0.36, 0.16, 0));
  g.add(box(0.04, 0.008, 0.22, mat(0x222222, 0.1, 0.8), -0.36, 0.17, 0));

  return g;
}
