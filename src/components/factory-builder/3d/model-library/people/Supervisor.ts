import * as THREE from 'three';
import { box, cyl, sph } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildSupervisor(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const skinMat = M.skin;
  const shirtWhite = mat(0xeeeeee, 0.0, 0.75);
  const pantsMat = mat(0x2a3050, 0.0, 0.85);
  const bootMat = mat(0x1a1a1a, 0.1, 0.9);
  const hardHatWhite = mat(0xf0f0f0, 0.1, 0.5);
  const glassesMat = mat(0x222222, 0.3, 0.4);
  const clipboardBrown = mat(0x8b6930, 0.0, 0.8);
  const paperWhite = mat(0xfafafa, 0.0, 0.9);
  const radioBlack = mat(0x1a1a1a, 0.2, 0.7);
  const beltMat = mat(0x3a2a1a, 0.1, 0.8);
  const steelFrame = mat(0x4a5060, 0.75, 0.35);
  const penMat = mat(0x111111, 0.3, 0.5);

  // ── Person offset (slight observational stance) ──
  const pX = 0.1;
  const pZ = 0;

  // ── Legs (slightly apart, one forward) ──
  const legH = 0.45;
  const legR = 0.045;
  g.add(cyl(legR, legR, legH, 8, pantsMat, pX - 0.08, legH / 2, pZ));
  g.add(cyl(legR, legR, legH, 8, pantsMat, pX + 0.08, legH / 2, pZ + 0.04));

  // ── Boots ──
  g.add(box(0.09, 0.06, 0.14, bootMat, pX - 0.08, 0.03, pZ + 0.02));
  g.add(box(0.09, 0.06, 0.14, bootMat, pX + 0.08, 0.03, pZ + 0.06));
  // Steel toe caps
  g.add(box(0.07, 0.04, 0.03, steelFrame, pX - 0.08, 0.04, pZ + 0.08));
  g.add(box(0.07, 0.04, 0.03, steelFrame, pX + 0.08, 0.04, pZ + 0.12));

  // ── Torso (white shirt) ──
  const torsoY = legH + 0.2;
  g.add(box(0.28, 0.36, 0.16, shirtWhite, pX, torsoY, pZ));

  // Collar detail
  g.add(box(0.12, 0.03, 0.12, shirtWhite, pX, torsoY + 0.19, pZ - 0.03));

  // Shirt pocket with pen
  g.add(box(0.05, 0.05, 0.005, shirtWhite, pX - 0.08, torsoY + 0.1, pZ - 0.082));
  g.add(cyl(0.004, 0.004, 0.04, 6, penMat, pX - 0.08, torsoY + 0.14, pZ - 0.085));
  // Pocket flap
  g.add(box(0.055, 0.008, 0.005, shirtWhite, pX - 0.08, torsoY + 0.125, pZ - 0.084));

  // ── Belt ──
  g.add(box(0.30, 0.03, 0.17, beltMat, pX, torsoY - 0.16, pZ));
  // Belt buckle
  g.add(box(0.04, 0.025, 0.01, steelFrame, pX, torsoY - 0.16, pZ - 0.09));

  // ── Radio on belt (right hip) ──
  g.add(box(0.04, 0.08, 0.025, radioBlack, pX + 0.16, torsoY - 0.14, pZ));
  // Radio antenna
  g.add(cyl(0.004, 0.003, 0.06, 6, radioBlack, pX + 0.16, torsoY - 0.06, pZ));
  // Radio clip
  g.add(box(0.02, 0.04, 0.01, steelFrame, pX + 0.16, torsoY - 0.12, pZ + 0.02));
  // Radio speaker grille
  g.add(box(0.025, 0.03, 0.003, mat(0x333333, 0.2, 0.6), pX + 0.16, torsoY - 0.14, pZ - 0.015));

  // ── Arms ──
  const armR = 0.035;

  // Left arm (holding clipboard, bent at elbow)
  // Upper arm
  g.add(cyl(armR, armR, 0.18, 8, shirtWhite, pX - 0.18, torsoY + 0.05, pZ, 0.15, 0, 0));
  // Forearm (bent holding clipboard in front)
  g.add(cyl(armR, armR, 0.18, 8, skinMat, pX - 0.18, torsoY - 0.1, pZ - 0.12, 1.1, 0, 0.1));
  // Left hand
  g.add(sph(0.025, skinMat, pX - 0.16, torsoY - 0.15, pZ - 0.25));

  // Right arm hanging relaxed
  g.add(cyl(armR, armR, 0.32, 8, shirtWhite, pX + 0.18, torsoY - 0.02, pZ, 0.05, 0, 0));
  // Right hand
  g.add(sph(0.025, skinMat, pX + 0.18, torsoY - 0.2, pZ + 0.02));

  // ── Clipboard ──
  const cbX = pX - 0.16;
  const cbY = torsoY - 0.12;
  const cbZ = pZ - 0.28;
  // Clipboard board
  g.add(box(0.16, 0.22, 0.01, clipboardBrown, cbX, cbY, cbZ, 0.3, 0, 0));
  // Paper on clipboard
  g.add(box(0.14, 0.19, 0.002, paperWhite, cbX, cbY + 0.01, cbZ - 0.007, 0.3, 0, 0));
  // Clipboard clip (metal)
  g.add(box(0.06, 0.02, 0.015, steelFrame, cbX, cbY + 0.11, cbZ - 0.01, 0.3, 0, 0));
  // Text lines on paper (visual suggestion)
  for (let i = 0; i < 5; i++) {
    g.add(box(0.10, 0.003, 0.002, mat(0x333333, 0, 0.9), cbX, cbY + 0.06 - i * 0.03, cbZ - 0.009, 0.3, 0, 0));
  }

  // ── Head ──
  const headY = torsoY + 0.3;
  g.add(sph(0.09, skinMat, pX, headY, pZ));

  // ── Neck ──
  g.add(cyl(0.035, 0.035, 0.06, 8, skinMat, pX, torsoY + 0.2, pZ));

  // ── Safety glasses ──
  g.add(box(0.14, 0.02, 0.04, glassesMat, pX, headY + 0.01, pZ - 0.08));
  g.add(box(0.05, 0.015, 0.005, mat(0x334455, 0.2, 0.3, { transparent: true, opacity: 0.5 }), pX - 0.03, headY + 0.01, pZ - 0.1));
  g.add(box(0.05, 0.015, 0.005, mat(0x334455, 0.2, 0.3, { transparent: true, opacity: 0.5 }), pX + 0.03, headY + 0.01, pZ - 0.1));

  // ── Hard hat (white - supervisor) ──
  g.add(cyl(0.10, 0.10, 0.04, 12, hardHatWhite, pX, headY + 0.09, pZ));
  g.add(cyl(0.11, 0.09, 0.06, 12, hardHatWhite, pX, headY + 0.11, pZ));
  // Hat brim
  g.add(cyl(0.12, 0.12, 0.01, 16, hardHatWhite, pX, headY + 0.08, pZ));

  // ── ID badge on lanyard ──
  // Lanyard
  g.add(cyl(0.005, 0.005, 0.15, 6, mat(0x0044aa, 0.0, 0.7), pX + 0.04, torsoY + 0.08, pZ - 0.085, 0.2, 0, 0));
  // Badge
  g.add(box(0.04, 0.055, 0.003, paperWhite, pX + 0.04, torsoY - 0.02, pZ - 0.09));
  // Badge photo placeholder
  g.add(box(0.025, 0.025, 0.004, mat(0xaabbcc, 0, 0.8), pX + 0.04, torsoY - 0.005, pZ - 0.092));

  return g;
}
