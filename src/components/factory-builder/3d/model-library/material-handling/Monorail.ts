import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Overhead Monorail Hoist System
 * I-beam rail, support brackets, motorized trolley, chain hoist,
 * hook, drive motor, trolley wheels, power conductor bar,
 * end stops, pendant control, status light.
 * Footprint: ~2.5 x 0.3 units, height ~2.5 (from floor to ceiling mount)
 */
export function buildMonorail(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mBeam    = mat(0x556070, 0.75, 0.3);      // I-beam steel
  const mBeamH   = mat(0xb0b8c0, 0.85, 0.15);     // running surface
  const mBrack   = mat(0x4a5060, 0.7, 0.35);      // support brackets
  const mTrolley = mat(0x3a4050, 0.65, 0.4);      // trolley frame
  const mMotor   = mat(0x2c3040, 0.6, 0.5);       // motor housing
  const mChain   = mat(0x555555, 0.6, 0.4);       // chain
  const mHook    = mat(0xb0b8c0, 0.85, 0.15);     // hook steel
  const mCond    = mat(0xcc4400, 0.3, 0.5);       // conductor bar
  const mEndstop = mat(0xdd2222, 0.1, 0.5);       // end stop red
  const mPend    = mat(0xddaa00, 0.2, 0.5);       // pendant
  const mCable   = mat(0x333333, 0.3, 0.6);       // cable
  const mHoist   = mat(0x3a4a5a, 0.5, 0.5);       // hoist body
  const mCeiling = mat(0x888888, 0.3, 0.7);       // ceiling mount

  const railLen = 2.2;
  const railY = 2.2;   // rail height from floor
  const ceilY = 2.5;   // ceiling height

  // ============ OVERHEAD I-BEAM RAIL ============
  // Top flange
  g.add(box(railLen, 0.02, 0.12, mBeam, 0, railY + 0.06, 0));
  // Web
  g.add(box(railLen, 0.1, 0.015, mBeam, 0, railY, 0));
  // Bottom flange
  g.add(box(railLen, 0.02, 0.1, mBeam, 0, railY - 0.06, 0));
  // Running surface (on bottom flange)
  g.add(box(railLen, 0.008, 0.04, mBeamH, 0, railY - 0.045, 0.025));
  g.add(box(railLen, 0.008, 0.04, mBeamH, 0, railY - 0.045, -0.025));

  // ============ SUPPORT BRACKETS (inverted T-brackets from ceiling) ============
  const bracketCount = 4;
  for (let i = 0; i < bracketCount; i++) {
    const bx = -railLen / 2 + 0.3 + i * (railLen - 0.6) / (bracketCount - 1);

    // Ceiling plate
    g.add(box(0.15, 0.02, 0.15, mCeiling, bx, ceilY, 0));

    // Vertical stem
    g.add(box(0.04, ceilY - railY - 0.07, 0.04, mBrack, bx, (ceilY + railY + 0.07) / 2, 0));

    // Horizontal bracket flanges (inverted T bottom)
    g.add(box(0.04, 0.03, 0.12, mBrack, bx, railY + 0.08, 0));

    // Gusset plates (triangular stiffeners, approximated)
    g.add(box(0.03, 0.08, 0.01, mBrack, bx, railY + 0.15, 0.04, 0, 0, 0.2));
    g.add(box(0.03, 0.08, 0.01, mBrack, bx, railY + 0.15, -0.04, 0, 0, -0.2));

    // Bolt heads on ceiling plate
    g.add(cyl(0.008, 0.008, 0.01, 6, M.chrome, bx + 0.04, ceilY + 0.01, 0.04));
    g.add(cyl(0.008, 0.008, 0.01, 6, M.chrome, bx - 0.04, ceilY + 0.01, -0.04));
  }

  // ============ MOTORIZED TROLLEY ON RAIL ============
  const trolleyX = 0.3;
  const trolleyY = railY - 0.06;

  // Trolley frame plate
  g.add(box(0.25, 0.03, 0.16, mTrolley, trolleyX, trolleyY - 0.04, 0));

  // Trolley side plates
  g.add(box(0.2, 0.08, 0.015, mTrolley, trolleyX, trolleyY - 0.04, 0.075));
  g.add(box(0.2, 0.08, 0.015, mTrolley, trolleyX, trolleyY - 0.04, -0.075));

  // Trolley wheels on rail flange (4 wheels)
  for (const xOff of [-0.07, 0.07]) {
    for (const zOff of [-0.03, 0.03]) {
      g.add(cyl(0.02, 0.02, 0.02, 10, M.darkChrome,
        trolleyX + xOff, railY - 0.05, zOff, Math.PI / 2, 0, 0));
    }
  }
  // Wheel axles
  g.add(cyl(0.006, 0.006, 0.08, 8, M.chrome, trolleyX - 0.07, railY - 0.05, 0, Math.PI / 2, 0, 0));
  g.add(cyl(0.006, 0.006, 0.08, 8, M.chrome, trolleyX + 0.07, railY - 0.05, 0, Math.PI / 2, 0, 0));

  // ============ DRIVE MOTOR ON TROLLEY ============
  g.add(box(0.1, 0.08, 0.08, mMotor, trolleyX + 0.12, trolleyY - 0.06, 0));
  // Motor end cap
  g.add(cyl(0.03, 0.03, 0.02, 10, M.darkChrome, trolleyX + 0.12, trolleyY - 0.06, 0.05, Math.PI / 2, 0, 0));
  // Motor cooling fins
  for (let i = 0; i < 4; i++) {
    g.add(box(0.01, 0.07, 0.09, mTrolley, trolleyX + 0.09 + i * 0.02, trolleyY - 0.06, 0));
  }
  // Drive gear housing
  g.add(box(0.04, 0.04, 0.06, mMotor, trolleyX + 0.06, trolleyY - 0.03, 0));

  // ============ CHAIN HOIST BODY (hanging from trolley) ============
  const hoistY = trolleyY - 0.12;

  // Hoist housing
  g.add(box(0.12, 0.15, 0.1, mHoist, trolleyX, hoistY - 0.08, 0));
  // Hoist top mounting plate
  g.add(box(0.15, 0.01, 0.12, mTrolley, trolleyX, hoistY, 0));
  // Hoist motor (side-mounted)
  g.add(cyl(0.04, 0.04, 0.08, 12, mMotor, trolleyX, hoistY - 0.06, 0.08, Math.PI / 2, 0, 0));
  // Motor end cap
  g.add(cyl(0.025, 0.025, 0.01, 10, M.darkChrome, trolleyX, hoistY - 0.06, 0.125, Math.PI / 2, 0, 0));

  // Chain sprocket (inside hoist, partially visible)
  g.add(cyl(0.03, 0.03, 0.02, 12, M.darkChrome, trolleyX, hoistY - 0.12, 0, Math.PI / 2, 0, 0));

  // Hoist label plate
  g.add(box(0.06, 0.04, 0.005, mat(0xddaa00, 0.2, 0.5), trolleyX, hoistY - 0.06, 0.055));

  // ============ CHAIN (hanging from hoist) ============
  const chainTop = hoistY - 0.16;
  const chainBot = 0.5;
  const chainLen = chainTop - chainBot;

  // Load chain (2 falls)
  g.add(cyl(0.008, 0.008, chainLen, 6, mChain, trolleyX - 0.02, chainBot + chainLen / 2, 0));
  g.add(cyl(0.008, 0.008, chainLen, 6, mChain, trolleyX + 0.02, chainBot + chainLen / 2, 0));

  // Chain link detail segments
  for (let y = chainBot; y < chainTop; y += 0.06) {
    g.add(box(0.015, 0.005, 0.01, mChain, trolleyX - 0.02, y, 0));
    g.add(box(0.015, 0.005, 0.01, mChain, trolleyX + 0.02, y + 0.03, 0));
  }

  // ============ HOOK AT BOTTOM ============
  const hookY = chainBot;

  // Hook block
  g.add(box(0.08, 0.05, 0.06, mTrolley, trolleyX, hookY, 0));
  // Sheave
  g.add(cyl(0.025, 0.025, 0.02, 12, M.chrome, trolleyX, hookY + 0.02, 0, Math.PI / 2, 0, 0));
  // Hook shank
  g.add(cyl(0.012, 0.01, 0.1, 8, mHook, trolleyX, hookY - 0.08, 0));
  // Hook curve
  g.add(sph(0.025, mHook, trolleyX, hookY - 0.13, 0));
  g.add(cyl(0.01, 0.01, 0.04, 8, mHook, trolleyX + 0.025, hookY - 0.13, 0, 0, 0, Math.PI / 2));
  // Safety latch
  g.add(box(0.004, 0.03, 0.02, M.red, trolleyX - 0.015, hookY - 0.12, 0));

  // ============ POWER CONDUCTOR BAR (along rail) ============
  const condY = railY + 0.09;
  g.add(box(railLen - 0.1, 0.015, 0.02, mCond, 0, condY, 0.08));
  // Conductor bar mounting brackets
  for (let i = 0; i < 5; i++) {
    const cx = -railLen / 2 + 0.3 + i * 0.45;
    g.add(box(0.02, 0.03, 0.04, mBrack, cx, condY - 0.01, 0.08));
  }
  // Current collector on trolley
  g.add(box(0.03, 0.02, 0.04, mTrolley, trolleyX, condY, 0.08));
  g.add(box(0.01, 0.01, 0.02, M.chrome, trolleyX, condY, 0.1));

  // ============ END STOPS (both ends of rail) ============
  // Front end stop
  g.add(box(0.04, 0.1, 0.12, mEndstop, railLen / 2 - 0.01, railY, 0));
  g.add(box(0.02, 0.06, 0.1, M.rubber, railLen / 2 + 0.01, railY, 0));
  // Rear end stop
  g.add(box(0.04, 0.1, 0.12, mEndstop, -railLen / 2 + 0.01, railY, 0));
  g.add(box(0.02, 0.06, 0.1, M.rubber, -railLen / 2 - 0.01, railY, 0));

  // ============ PENDANT CONTROL (hanging down) ============
  const pendX = trolleyX - 0.08;
  const pendCableY = hoistY - 0.15;

  // Pendant cable
  g.add(cyl(0.005, 0.005, 0.6, 6, mCable, pendX, pendCableY - 0.3, -0.06));
  // Pendant box
  g.add(box(0.04, 0.1, 0.03, mPend, pendX, pendCableY - 0.65, -0.06));
  // Buttons (up/down/left/right/stop)
  g.add(sph(0.007, mat(0x00aa00, 0.1, 0.5), pendX + 0.015, pendCableY - 0.61, -0.076));
  g.add(sph(0.007, mat(0xdd0000, 0.1, 0.5), pendX + 0.015, pendCableY - 0.63, -0.076));
  g.add(sph(0.007, mat(0x0066cc, 0.1, 0.5), pendX + 0.015, pendCableY - 0.65, -0.076));
  g.add(sph(0.007, mat(0xdddd00, 0.1, 0.5), pendX + 0.015, pendCableY - 0.67, -0.076));
  // Emergency stop on pendant
  g.add(cyl(0.012, 0.012, 0.01, 10, mEndstop, pendX, pendCableY - 0.69, -0.076));
  // Cable strain relief
  g.add(cyl(0.008, 0.005, 0.02, 8, M.rubber, pendX, pendCableY, -0.06));

  // ============ STATUS LIGHT ============
  g.add(createStatusLight(trolleyX, trolleyY - 0.02, -0.12));

  return g;
}
