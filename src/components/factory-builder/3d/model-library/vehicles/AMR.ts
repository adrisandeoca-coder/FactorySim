import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Autonomous Mobile Robot (AMR)
 * Low flat rectangular body, LIDAR domes, camera sensor, LED perimeter strip,
 * payload surface, omnidirectional wheels, e-stop, display screen,
 * charging contacts. Clean modern white/gray design.
 * Footprint: ~0.6 x 0.5 units, height ~0.2
 */
export function buildAMR(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mBody    = mat(0xe0e0e0, 0.15, 0.45);    // white/light gray body
  const mBodySd  = mat(0xc8c8c8, 0.2, 0.5);      // side panels
  const mBottom  = mat(0x2a2a2a, 0.3, 0.7);       // underside
  const mTop     = mat(0xd8d8d8, 0.1, 0.4);       // top payload surface
  const mLidar   = mat(0x1a1a2a, 0.3, 0.6);       // lidar housing
  const mLidarL  = mat(0x222244, 0.1, 0.3, { transparent: true, opacity: 0.6 }); // lidar lens
  const mCamera  = mat(0x111111, 0.2, 0.7);       // camera housing
  const mLens    = mat(0x334466, 0.1, 0.2, { transparent: true, opacity: 0.5 });
  const mLED     = mat(0x00ccff, 0.0, 0.2, { emissive: 0x00aadd, emissiveIntensity: 1.8 });
  const mLEDg    = mat(0x00ff88, 0.0, 0.2, { emissive: 0x00dd66, emissiveIntensity: 1.5 });
  const mEstop   = mat(0xdd0000, 0.1, 0.5);       // emergency stop
  const mEstopB  = mat(0xffcc00, 0.2, 0.5);       // e-stop base ring
  const mScreen  = mat(0x0a1520, 0.0, 0.9, { emissive: 0x004488, emissiveIntensity: 1.2 });
  const mCharge  = mat(0xb08020, 0.7, 0.3);       // charging contacts (brass)
  const mWheel   = mat(0x333333, 0.1, 0.8);       // wheel housing
  const mBumper  = mat(0x444444, 0.1, 0.7);       // bumper strip

  // Faces +X direction
  const bodyL = 0.5;
  const bodyW = 0.4;
  const bodyH = 0.12;
  const baseY = 0.08;  // ground clearance for wheels

  // ============ MAIN BODY ============
  // Core body box
  g.add(box(bodyL, bodyH, bodyW, mBody, 0, baseY + bodyH / 2, 0));

  // Rounded corners (cylinders at 4 corners)
  const cornerR = 0.04;
  const cxOff = bodyL / 2 - cornerR;
  const czOff = bodyW / 2 - cornerR;
  g.add(cyl(cornerR, cornerR, bodyH, 12, mBody, cxOff, baseY + bodyH / 2, czOff));
  g.add(cyl(cornerR, cornerR, bodyH, 12, mBody, cxOff, baseY + bodyH / 2, -czOff));
  g.add(cyl(cornerR, cornerR, bodyH, 12, mBody, -cxOff, baseY + bodyH / 2, czOff));
  g.add(cyl(cornerR, cornerR, bodyH, 12, mBody, -cxOff, baseY + bodyH / 2, -czOff));

  // Side panels (slightly darker)
  g.add(box(bodyL - 0.06, 0.08, 0.005, mBodySd, 0, baseY + bodyH / 2, bodyW / 2 + 0.002));
  g.add(box(bodyL - 0.06, 0.08, 0.005, mBodySd, 0, baseY + bodyH / 2, -bodyW / 2 - 0.002));
  // Front panel
  g.add(box(0.005, 0.08, bodyW - 0.06, mBodySd, bodyL / 2 + 0.002, baseY + bodyH / 2, 0));
  // Rear panel
  g.add(box(0.005, 0.08, bodyW - 0.06, mBodySd, -bodyL / 2 - 0.002, baseY + bodyH / 2, 0));

  // ============ TOP SURFACE (payload platform) ============
  g.add(box(bodyL - 0.04, 0.008, bodyW - 0.04, mTop, 0, baseY + bodyH + 0.004, 0));
  // Anti-slip texture ridges
  for (let x = -0.18; x <= 0.18; x += 0.06) {
    g.add(box(0.04, 0.003, bodyW - 0.08, mat(0xbbbbbb, 0.1, 0.5), x, baseY + bodyH + 0.01, 0));
  }

  // Bottom plate
  g.add(box(bodyL - 0.02, 0.005, bodyW - 0.02, mBottom, 0, baseY - 0.002, 0));

  // ============ LIDAR DOMES (front and rear, on corners) ============
  const lidarR = 0.03;
  const lidarH = 0.04;
  const lidarY = baseY + bodyH + 0.02;

  // Front-left LIDAR
  g.add(cyl(lidarR, lidarR + 0.005, lidarH, 16, mLidar, cxOff - 0.01, lidarY + lidarH / 2, czOff - 0.01));
  g.add(cyl(lidarR + 0.003, lidarR + 0.003, 0.02, 16, mLidarL, cxOff - 0.01, lidarY + lidarH - 0.005, czOff - 0.01));

  // Front-right LIDAR
  g.add(cyl(lidarR, lidarR + 0.005, lidarH, 16, mLidar, cxOff - 0.01, lidarY + lidarH / 2, -czOff + 0.01));
  g.add(cyl(lidarR + 0.003, lidarR + 0.003, 0.02, 16, mLidarL, cxOff - 0.01, lidarY + lidarH - 0.005, -czOff + 0.01));

  // Rear-left LIDAR
  g.add(cyl(lidarR, lidarR + 0.005, lidarH, 16, mLidar, -cxOff + 0.01, lidarY + lidarH / 2, czOff - 0.01));
  g.add(cyl(lidarR + 0.003, lidarR + 0.003, 0.02, 16, mLidarL, -cxOff + 0.01, lidarY + lidarH - 0.005, czOff - 0.01));

  // Rear-right LIDAR
  g.add(cyl(lidarR, lidarR + 0.005, lidarH, 16, mLidar, -cxOff + 0.01, lidarY + lidarH / 2, -czOff + 0.01));
  g.add(cyl(lidarR + 0.003, lidarR + 0.003, 0.02, 16, mLidarL, -cxOff + 0.01, lidarY + lidarH - 0.005, -czOff + 0.01));

  // ============ CAMERA / DEPTH SENSOR (front center) ============
  g.add(box(0.04, 0.025, 0.06, mCamera, bodyL / 2 + 0.01, baseY + bodyH / 2 + 0.02, 0));
  // Dual camera lenses
  g.add(cyl(0.008, 0.008, 0.005, 10, mLens, bodyL / 2 + 0.032, baseY + bodyH / 2 + 0.025, 0.015));
  g.add(cyl(0.008, 0.008, 0.005, 10, mLens, bodyL / 2 + 0.032, baseY + bodyH / 2 + 0.025, -0.015));
  // IR emitter dot
  g.add(sph(0.004, mat(0x880000, 0.0, 0.3, { emissive: 0x660000, emissiveIntensity: 0.6 }), bodyL / 2 + 0.032, baseY + bodyH / 2 + 0.01, 0));

  // ============ LED STRIP (perimeter) ============
  const ledY = baseY + bodyH * 0.75;

  // Front LED strip
  g.add(box(bodyL - 0.06, 0.008, 0.005, mLED, 0, ledY, bodyW / 2 + 0.005));
  g.add(box(bodyL - 0.06, 0.008, 0.005, mLED, 0, ledY, -bodyW / 2 - 0.005));
  // Side LED strips
  g.add(box(0.005, 0.008, bodyW - 0.06, mLEDg, bodyL / 2 + 0.005, ledY, 0));
  g.add(box(0.005, 0.008, bodyW - 0.06, mLEDg, -bodyL / 2 - 0.005, ledY, 0));

  // ============ OMNIDIRECTIONAL WHEELS (visible underneath) ============
  const wheelR = 0.025;
  const wheelPositions = [
    { x: 0.14, z: 0.16 },
    { x: 0.14, z: -0.16 },
    { x: -0.14, z: 0.16 },
    { x: -0.14, z: -0.16 },
  ];
  for (const wp of wheelPositions) {
    // Wheel housing
    g.add(box(0.05, 0.03, 0.04, mWheel, wp.x, 0.035, wp.z));
    // Wheel
    g.add(cyl(wheelR, wheelR, 0.02, 12, M.rubber, wp.x, 0.025, wp.z, Math.PI / 2, 0, 0));
    // Caster swivel
    g.add(cyl(0.008, 0.008, 0.02, 8, M.darkChrome, wp.x, 0.05, wp.z));
  }

  // Center drive wheels (larger, 2 wheels)
  g.add(cyl(0.035, 0.035, 0.03, 12, M.rubber, 0, 0.035, 0.18, Math.PI / 2, 0, 0));
  g.add(cyl(0.02, 0.02, 0.02, 8, M.darkChrome, 0, 0.035, 0.18, Math.PI / 2, 0, 0));
  g.add(cyl(0.035, 0.035, 0.03, 12, M.rubber, 0, 0.035, -0.18, Math.PI / 2, 0, 0));
  g.add(cyl(0.02, 0.02, 0.02, 8, M.darkChrome, 0, 0.035, -0.18, Math.PI / 2, 0, 0));

  // ============ EMERGENCY STOP BUTTON (top) ============
  const estopX = -0.12;
  const estopY = baseY + bodyH + 0.01;
  // Yellow base ring
  g.add(cyl(0.022, 0.022, 0.01, 12, mEstopB, estopX, estopY, 0));
  // Red mushroom button
  g.add(cyl(0.018, 0.015, 0.015, 12, mEstop, estopX, estopY + 0.012, 0));
  g.add(sph(0.018, mEstop, estopX, estopY + 0.022, 0));

  // ============ DISPLAY SCREEN (front face) ============
  g.add(box(0.005, 0.04, 0.08, mScreen, bodyL / 2 + 0.003, baseY + bodyH / 2 - 0.01, 0));
  // Screen bezel
  g.add(box(0.004, 0.045, 0.085, mCamera, bodyL / 2 + 0.001, baseY + bodyH / 2 - 0.01, 0));

  // ============ CHARGING CONTACTS (rear) ============
  g.add(box(0.008, 0.02, 0.015, mCharge, -bodyL / 2 - 0.003, baseY + 0.03, 0.04));
  g.add(box(0.008, 0.02, 0.015, mCharge, -bodyL / 2 - 0.003, baseY + 0.03, -0.04));
  // Contact spring housings
  g.add(box(0.012, 0.025, 0.02, mBottom, -bodyL / 2 + 0.005, baseY + 0.03, 0.04));
  g.add(box(0.012, 0.025, 0.02, mBottom, -bodyL / 2 + 0.005, baseY + 0.03, -0.04));

  // ============ BUMPER STRIP (safety, around base) ============
  g.add(box(bodyL + 0.02, 0.025, 0.015, mBumper, 0, baseY + 0.02, bodyW / 2 + 0.008));
  g.add(box(bodyL + 0.02, 0.025, 0.015, mBumper, 0, baseY + 0.02, -bodyW / 2 - 0.008));
  g.add(box(0.015, 0.025, bodyW + 0.02, mBumper, bodyL / 2 + 0.008, baseY + 0.02, 0));
  g.add(box(0.015, 0.025, bodyW + 0.02, mBumper, -bodyL / 2 - 0.008, baseY + 0.02, 0));

  // ============ COMPANY LOGO SPOT (front) ============
  g.add(box(0.004, 0.02, 0.04, mat(0x0066cc, 0.1, 0.4, { emissive: 0x003366, emissiveIntensity: 0.4 }), bodyL / 2 + 0.004, baseY + bodyH / 2 + 0.04, 0));

  // ============ INTERNAL ELECTRONICS (visible through vents) ============
  // Vent grilles on sides
  for (let y = baseY + 0.04; y <= baseY + bodyH - 0.02; y += 0.015) {
    g.add(box(0.15, 0.005, 0.003, mat(0x555555, 0.3, 0.5), 0.08, y, bodyW / 2 + 0.004));
    g.add(box(0.15, 0.005, 0.003, mat(0x555555, 0.3, 0.5), 0.08, y, -bodyW / 2 - 0.004));
  }

  return g;
}
