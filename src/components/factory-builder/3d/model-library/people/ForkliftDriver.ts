import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildForkliftDriver(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const skinMat = M.skin;
  const vestOrange = mat(0xff6600, 0.0, 0.6);
  const vestStripe = mat(0xdddddd, 0.1, 0.6);
  const pantsMat = mat(0x2a3050, 0.0, 0.85);
  const bootMat = mat(0x1a1a1a, 0.1, 0.9);
  const hardHatBlue = mat(0x2266cc, 0.1, 0.5);
  const glassesMat = mat(0x222222, 0.3, 0.4);
  const seatBlack = mat(0x1a1a1a, 0.0, 0.85);
  const seatFrame = mat(0x4a5060, 0.75, 0.35);
  const steelFrame = mat(0x4a5060, 0.75, 0.35);
  const gloveMat = mat(0x8b6930, 0.0, 0.8);

  // ── Person positioning (seated) ──
  const pX = 0;
  const pZ = 0;
  const seatH = 0.45; // seat height

  // ═══════════════════════════════════
  // ── Seat block ──
  // ═══════════════════════════════════
  // Seat cushion
  g.add(box(0.36, 0.06, 0.36, seatBlack, pX, seatH, pZ));
  // Seat back
  g.add(box(0.36, 0.35, 0.04, seatBlack, pX, seatH + 0.22, pZ + 0.17, -0.1, 0, 0));
  // Seat back frame
  g.add(box(0.04, 0.40, 0.04, seatFrame, pX - 0.16, seatH + 0.20, pZ + 0.18));
  g.add(box(0.04, 0.40, 0.04, seatFrame, pX + 0.16, seatH + 0.20, pZ + 0.18));
  // Seat base / pedestal
  g.add(box(0.20, seatH - 0.06, 0.20, seatFrame, pX, (seatH - 0.06) / 2, pZ));
  // Seat mount plate
  g.add(box(0.30, 0.02, 0.30, seatFrame, pX, 0.01, pZ));
  // Seat adjustment lever
  g.add(cyl(0.008, 0.008, 0.10, 6, seatFrame, pX + 0.18, seatH - 0.02, pZ - 0.08, 0, 0, Math.PI / 4));
  g.add(sph(0.015, seatFrame, pX + 0.22, seatH + 0.02, pZ - 0.12));

  // ═══════════════════════════════════
  // ── Legs (bent at knees, seated) ──
  // ═══════════════════════════════════
  // Upper legs (thighs, horizontal on seat)
  const thighLen = 0.25;
  g.add(cyl(0.05, 0.05, thighLen, 8, pantsMat, pX - 0.08, seatH + 0.06, pZ - 0.10, Math.PI / 2.2, 0, 0));
  g.add(cyl(0.05, 0.05, thighLen, 8, pantsMat, pX + 0.08, seatH + 0.06, pZ - 0.10, Math.PI / 2.2, 0, 0));

  // Lower legs (hanging down from knees)
  const shinLen = 0.28;
  g.add(cyl(0.04, 0.04, shinLen, 8, pantsMat, pX - 0.08, seatH - 0.22, pZ - 0.22, 0.3, 0, 0));
  g.add(cyl(0.04, 0.04, shinLen, 8, pantsMat, pX + 0.08, seatH - 0.22, pZ - 0.22, 0.3, 0, 0));

  // ── Boots ──
  g.add(box(0.09, 0.06, 0.14, bootMat, pX - 0.08, seatH - 0.38, pZ - 0.28));
  g.add(box(0.09, 0.06, 0.14, bootMat, pX + 0.08, seatH - 0.38, pZ - 0.28));
  // Steel toe caps
  g.add(box(0.07, 0.04, 0.03, steelFrame, pX - 0.08, seatH - 0.37, pZ - 0.34));
  g.add(box(0.07, 0.04, 0.03, steelFrame, pX + 0.08, seatH - 0.37, pZ - 0.34));

  // ═══════════════════════════════════
  // ── Torso (leaning slightly forward) ──
  // ═══════════════════════════════════
  const torsoY = seatH + 0.26;
  g.add(box(0.28, 0.36, 0.16, pantsMat, pX, torsoY, pZ + 0.02, -0.1, 0, 0));

  // ── Hi-vis vest (orange) ──
  g.add(box(0.30, 0.30, 0.17, vestOrange, pX, torsoY + 0.03, pZ + 0.02, -0.1, 0, 0));
  // Reflective stripes
  g.add(box(0.31, 0.02, 0.175, vestStripe, pX, torsoY + 0.1, pZ + 0.02, -0.1, 0, 0));
  g.add(box(0.31, 0.02, 0.175, vestStripe, pX, torsoY - 0.05, pZ + 0.02, -0.1, 0, 0));
  // Vest shoulder stripes
  g.add(box(0.02, 0.30, 0.005, vestStripe, pX - 0.08, torsoY + 0.03, pZ - 0.065, -0.1, 0, 0));
  g.add(box(0.02, 0.30, 0.005, vestStripe, pX + 0.08, torsoY + 0.03, pZ - 0.065, -0.1, 0, 0));

  // ═══════════════════════════════════
  // ── Arms (extended, steering wheel position) ──
  // ═══════════════════════════════════
  const armR = 0.035;

  // Left arm (upper, reaching forward)
  g.add(cyl(armR, armR, 0.18, 8, vestOrange, pX - 0.18, torsoY + 0.06, pZ - 0.04, 0.5, 0, 0));
  // Left forearm
  g.add(cyl(armR, armR, 0.16, 8, skinMat, pX - 0.18, torsoY - 0.04, pZ - 0.18, 0.8, 0, 0.15));
  // Left glove/hand
  g.add(sph(0.028, gloveMat, pX - 0.15, torsoY - 0.10, pZ - 0.30));

  // Right arm (upper, reaching forward)
  g.add(cyl(armR, armR, 0.18, 8, vestOrange, pX + 0.18, torsoY + 0.06, pZ - 0.04, 0.5, 0, 0));
  // Right forearm
  g.add(cyl(armR, armR, 0.16, 8, skinMat, pX + 0.18, torsoY - 0.04, pZ - 0.18, 0.8, 0, -0.15));
  // Right glove/hand
  g.add(sph(0.028, gloveMat, pX + 0.15, torsoY - 0.10, pZ - 0.30));

  // ── Steering wheel (implied position) ──
  // Wheel rim
  const swY = torsoY - 0.08;
  const swZ = pZ - 0.32;
  g.add(cyl(0.12, 0.12, 0.01, 16, seatFrame, pX, swY, swZ, Math.PI / 3, 0, 0));
  g.add(cyl(0.10, 0.10, 0.01, 16, mat(0x333333, 0.0, 0.9), pX, swY, swZ, Math.PI / 3, 0, 0));
  // Wheel center hub
  g.add(cyl(0.025, 0.025, 0.02, 8, seatFrame, pX, swY, swZ, Math.PI / 3, 0, 0));
  // Wheel spokes
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    const dx = Math.cos(ang) * 0.05;
    const dy = Math.sin(ang) * 0.05;
    g.add(box(0.015, 0.09, 0.01, seatFrame, pX + dx, swY + dy * 0.5, swZ - dy * 0.15, Math.PI / 3, 0, ang));
  }
  // Steering column
  g.add(cyl(0.02, 0.02, 0.25, 8, seatFrame, pX, swY - 0.15, swZ + 0.10, Math.PI / 3, 0, 0));

  // ═══════════════════════════════════
  // ── Head ──
  // ═══════════════════════════════════
  const headY = torsoY + 0.30;
  g.add(sph(0.09, skinMat, pX, headY, pZ - 0.01));

  // ── Neck ──
  g.add(cyl(0.035, 0.035, 0.06, 8, skinMat, pX, torsoY + 0.20, pZ + 0.01));

  // ── Safety glasses ──
  g.add(box(0.14, 0.02, 0.04, glassesMat, pX, headY + 0.01, pZ - 0.09));
  g.add(box(0.05, 0.015, 0.005, mat(0x334455, 0.2, 0.3, { transparent: true, opacity: 0.5 }), pX - 0.03, headY + 0.01, pZ - 0.11));
  g.add(box(0.05, 0.015, 0.005, mat(0x334455, 0.2, 0.3, { transparent: true, opacity: 0.5 }), pX + 0.03, headY + 0.01, pZ - 0.11));

  // ── Hard hat (blue) ──
  g.add(cyl(0.10, 0.10, 0.04, 12, hardHatBlue, pX, headY + 0.09, pZ - 0.01));
  g.add(cyl(0.11, 0.09, 0.06, 12, hardHatBlue, pX, headY + 0.11, pZ - 0.01));
  // Hat brim
  g.add(cyl(0.12, 0.12, 0.01, 16, hardHatBlue, pX, headY + 0.08, pZ - 0.01));

  return g;
}
