import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Overhead Gantry Crane
 * Two tall support columns on floor rails, horizontal bridge beam,
 * trolley/hoist carriage, wire rope, hook block, motor housings,
 * warning stripes, cable festoon, operator cabin, status light.
 * Footprint: ~3.0 x 2.4 units, height ~2.8 units
 */
export function buildGantryCrane(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mFrame    = mat(0x4a5060, 0.75, 0.35);   // structural steel
  const mBeam     = mat(0x556070, 0.7, 0.3);      // bridge beam
  const mRail     = mat(0x606878, 0.85, 0.2);     // rail steel
  const mMotor    = mat(0x2c3040, 0.6, 0.5);      // motor housing
  const mTrolley  = mat(0x3a4050, 0.65, 0.4);     // trolley plate
  const mCable    = mat(0x555555, 0.3, 0.6);       // wire rope
  const mHook     = mat(0xb0b8c0, 0.85, 0.15);    // hook - polished steel
  const mStripe   = mat(0xddaa00, 0.2, 0.6);      // warning yellow
  const mStripeB  = mat(0x222222, 0.1, 0.8);       // warning black
  const mCabin    = mat(0x3a4a5a, 0.5, 0.5);      // cabin body
  const mFestoon  = mat(0x333333, 0.3, 0.7);       // festoon cable carrier

  // Dimensions
  const spanW = 2.4;     // bridge span (Z)
  const bridgeH = 2.5;   // bridge height (Y)
  const legW = 0.2;      // leg column width
  const legD = 0.25;     // leg column depth
  const bridgeLen = 2.0; // bridge length (X)
  const railLen = 3.0;   // floor rail length (X)

  // === Floor Rails (I-beam profile) ===
  for (const zSign of [-1, 1]) {
    const rz = zSign * (spanW / 2);
    // Top flange
    g.add(box(railLen, 0.02, 0.12, mRail, 0, 0.04, rz));
    // Web
    g.add(box(railLen, 0.05, 0.02, mRail, 0, 0.015, rz));
    // Bottom flange
    g.add(box(railLen, 0.02, 0.14, mRail, 0, -0.01, rz));
    // Rail head (running surface)
    g.add(box(railLen, 0.015, 0.06, mHook, 0, 0.055, rz));
    // Rail clips (every 0.5 units)
    for (let i = -2; i <= 2; i++) {
      g.add(box(0.04, 0.02, 0.14, mFrame, i * 0.6, 0.0, rz));
    }
  }

  // === Support Legs/Columns (two A-frame legs) ===
  for (const zSign of [-1, 1]) {
    const lz = zSign * (spanW / 2);

    // Main vertical column
    g.add(box(legD, bridgeH, legW, mFrame, 0, bridgeH / 2, lz));

    // Warning stripes on legs (alternating yellow/black)
    for (let s = 0; s < 6; s++) {
      const stripeMat = s % 2 === 0 ? mStripe : mStripeB;
      g.add(box(legD + 0.005, 0.06, legW + 0.005, stripeMat, 0, 0.15 + s * 0.06, lz));
    }

    // Leg base plate
    g.add(box(0.4, 0.03, 0.35, mFrame, 0, 0.015, lz));

    // Wheel bogies on rails (2 per leg)
    for (const xOff of [-0.12, 0.12]) {
      // Wheel housing
      g.add(box(0.08, 0.06, 0.1, mMotor, xOff, 0.06, lz));
      // Wheel
      g.add(cyl(0.035, 0.035, 0.06, 12, M.darkChrome, xOff, 0.055, lz, Math.PI / 2, 0, 0));
    }

    // Diagonal stiffener brace on leg
    g.add(box(0.03, 0.8, 0.03, mFrame, 0.08, bridgeH * 0.3, lz, 0, 0, 0.3 * zSign));

    // Upper gusset plate
    g.add(box(0.35, 0.04, legW + 0.02, mFrame, 0, bridgeH - 0.02, lz));
  }

  // === Bridge Beam (horizontal, spanning between legs) ===
  // Main box girder
  g.add(box(bridgeLen, 0.2, spanW + 0.1, mBeam, 0, bridgeH + 0.1, 0));
  // Top plate
  g.add(box(bridgeLen, 0.02, spanW + 0.15, mFrame, 0, bridgeH + 0.21, 0));
  // Bottom flange
  g.add(box(bridgeLen, 0.02, spanW - 0.1, mFrame, 0, bridgeH, 0));

  // Bridge web stiffeners
  for (let i = -3; i <= 3; i++) {
    g.add(box(0.02, 0.18, 0.02, mFrame, i * 0.25, bridgeH + 0.1, spanW / 2 + 0.04));
    g.add(box(0.02, 0.18, 0.02, mFrame, i * 0.25, bridgeH + 0.1, -spanW / 2 - 0.04));
  }

  // Bridge top rails (for trolley travel)
  g.add(box(bridgeLen - 0.1, 0.03, 0.04, mRail, 0, bridgeH + 0.225, -0.35));
  g.add(box(bridgeLen - 0.1, 0.03, 0.04, mRail, 0, bridgeH + 0.225, 0.35));

  // === Trolley / Hoist Carriage ===
  const trolleyX = 0.2;
  const trolleyY = bridgeH + 0.28;

  // Trolley frame plate
  g.add(box(0.4, 0.04, 0.8, mTrolley, trolleyX, trolleyY, 0));

  // Trolley wheels (4 - ride on bridge rails)
  for (const xOff of [-0.12, 0.12]) {
    for (const zOff of [-0.35, 0.35]) {
      g.add(cyl(0.03, 0.03, 0.04, 10, M.darkChrome,
        trolleyX + xOff, bridgeH + 0.24, zOff, Math.PI / 2, 0, 0));
    }
  }

  // Hoist motor housing (large box on trolley)
  g.add(box(0.25, 0.15, 0.3, mMotor, trolleyX, trolleyY + 0.1, 0));
  // Motor end cap
  g.add(cyl(0.06, 0.06, 0.04, 12, mStripe, trolleyX + 0.13, trolleyY + 0.1, 0, 0, 0, Math.PI / 2));
  // Motor cooling fins
  for (let i = 0; i < 5; i++) {
    g.add(box(0.01, 0.12, 0.32, mFrame, trolleyX - 0.1 + i * 0.05, trolleyY + 0.1, 0));
  }

  // Wire rope drum
  g.add(cyl(0.06, 0.06, 0.25, 12, M.chrome, trolleyX, trolleyY - 0.01, 0.2, Math.PI / 2, 0, 0));
  // Drum flanges
  g.add(cyl(0.08, 0.08, 0.01, 12, mFrame, trolleyX, trolleyY - 0.01, 0.33));
  g.add(cyl(0.08, 0.08, 0.01, 12, mFrame, trolleyX, trolleyY - 0.01, 0.07));

  // Travel motor (trolley traverse)
  g.add(box(0.1, 0.1, 0.12, mMotor, trolleyX - 0.15, trolleyY + 0.02, -0.3));

  // === Wire Rope / Cable ===
  const ropeTop = trolleyY - 0.03;
  const ropeBottom = 0.6;
  const ropeLength = ropeTop - ropeBottom;
  g.add(cyl(0.008, 0.008, ropeLength, 6, mCable, trolleyX, ropeBottom + ropeLength / 2, 0.2));
  g.add(cyl(0.008, 0.008, ropeLength, 6, mCable, trolleyX, ropeBottom + ropeLength / 2, 0.15));

  // === Hook Block ===
  const hookY = ropeBottom;
  // Block housing
  g.add(box(0.1, 0.08, 0.12, mFrame, trolleyX, hookY, 0.175));
  // Sheave (pulley wheel)
  g.add(cyl(0.05, 0.05, 0.03, 16, M.chrome, trolleyX, hookY + 0.04, 0.175, Math.PI / 2, 0, 0));
  // Hook shank
  g.add(cyl(0.015, 0.012, 0.15, 8, mHook, trolleyX, hookY - 0.12, 0.175));
  // Hook curve (approximated with sphere + cyl)
  g.add(sph(0.03, mHook, trolleyX, hookY - 0.2, 0.175));
  g.add(cyl(0.012, 0.012, 0.06, 8, mHook, trolleyX + 0.03, hookY - 0.2, 0.175, 0, 0, Math.PI / 2));
  // Safety latch
  g.add(box(0.005, 0.04, 0.03, M.red, trolleyX - 0.02, hookY - 0.18, 0.175));

  // === Cable Festoon System (along bridge) ===
  const festoonY = bridgeH + 0.25;
  // Festoon track
  g.add(box(bridgeLen - 0.3, 0.02, 0.03, mFestoon, 0, festoonY, -spanW / 2 + 0.1));
  // Festoon carriers (hanging cable loops)
  for (let i = 0; i < 6; i++) {
    const fx = -bridgeLen / 2 + 0.3 + i * 0.28;
    // Carrier trolley
    g.add(box(0.04, 0.03, 0.04, mFrame, fx, festoonY - 0.02, -spanW / 2 + 0.1));
    // Hanging cable loop
    g.add(cyl(0.006, 0.006, 0.15, 6, M.wire, fx, festoonY - 0.1, -spanW / 2 + 0.1));
  }

  // === Operator Cabin ===
  const cabinX = -bridgeLen / 2 + 0.2;
  const cabinY = bridgeH - 0.4;
  const cabinZ = -spanW / 2 + legW / 2;

  // Cabin body
  g.add(box(0.35, 0.4, 0.35, mCabin, cabinX, cabinY, cabinZ));
  // Cabin floor
  g.add(box(0.38, 0.02, 0.38, mFrame, cabinX, cabinY - 0.21, cabinZ));
  // Glass windows (front + sides)
  g.add(box(0.36, 0.2, 0.005, M.glass, cabinX, cabinY + 0.05, cabinZ + 0.175));
  g.add(box(0.005, 0.2, 0.36, M.glass, cabinX + 0.175, cabinY + 0.05, cabinZ));
  g.add(box(0.005, 0.2, 0.36, M.glass, cabinX - 0.175, cabinY + 0.05, cabinZ));
  // Window frames
  g.add(box(0.36, 0.015, 0.015, mFrame, cabinX, cabinY + 0.15, cabinZ + 0.175));
  g.add(box(0.36, 0.015, 0.015, mFrame, cabinX, cabinY - 0.05, cabinZ + 0.175));
  // Cabin roof
  g.add(box(0.38, 0.02, 0.38, mFrame, cabinX, cabinY + 0.21, cabinZ));
  // Cabin mounting bracket
  g.add(box(0.06, 0.3, 0.06, mFrame, cabinX, cabinY + 0.35, cabinZ + 0.1));

  // Control panel inside cabin (visible through glass)
  g.add(box(0.15, 0.08, 0.02, M.screen, cabinX, cabinY - 0.05, cabinZ + 0.16));

  // === End Stops on bridge ===
  g.add(box(0.06, 0.06, 0.8, M.red, bridgeLen / 2 - 0.02, bridgeH + 0.24, 0));
  g.add(box(0.06, 0.06, 0.8, M.red, -bridgeLen / 2 + 0.02, bridgeH + 0.24, 0));

  // === Walkway / Maintenance Platform on bridge top ===
  g.add(box(bridgeLen - 0.2, 0.01, 0.3, mat(0x555555, 0.4, 0.7, { transparent: true, opacity: 0.6 }),
    0, bridgeH + 0.22, -spanW / 2 + 0.2));
  // Handrail
  g.add(cyl(0.01, 0.01, bridgeLen - 0.2, 6, mFrame,
    0, bridgeH + 0.45, -spanW / 2 + 0.1, 0, 0, Math.PI / 2));
  // Handrail posts
  for (let i = -3; i <= 3; i++) {
    g.add(cyl(0.008, 0.008, 0.22, 6, mFrame,
      i * 0.28, bridgeH + 0.34, -spanW / 2 + 0.1));
  }

  // === Warning Beacon on bridge ===
  g.add(cyl(0.04, 0.04, 0.03, 12, M.orange, bridgeLen / 2 - 0.15, bridgeH + 0.24, 0));

  // === Status Light ===
  g.add(createStatusLight(trolleyX + 0.2, trolleyY + 0.18, 0));

  return g;
}
