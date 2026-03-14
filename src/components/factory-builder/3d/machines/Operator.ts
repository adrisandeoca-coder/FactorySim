import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Human Operator Figure
 * Clearly a person at any zoom: boots, legs, torso with safety vest,
 * arms posed forward, hard hat, safety glasses, tool belt.
 * Scale: ~1.0 units tall, ~0.3 wide.
 */
export function buildOperator(): THREE.Group {
  const g = new THREE.Group();

  const skinMat    = M.skin;
  const fabricMat  = M.fabric;
  const bootMat    = M.rubber;
  const vestMat    = M.vest;
  const reflective = M.chrome;
  const glassesMat = M.darkChrome;
  const beltMat    = mat(0x1a1a1a, 0.1, 0.85);
  const hatMat     = M.safety;   // orange hard hat

  // ── Figure group (everything except status light post) ──
  const figure = new THREE.Group();
  figure.name = 'figure';

  // ── Boots (2 small dark boxes at base) ──
  figure.add(box(0.07, 0.05, 0.10, bootMat, -0.06, 0.025, 0.01));
  figure.add(box(0.07, 0.05, 0.10, bootMat,  0.06, 0.025, 0.01));

  // ── Legs (2 cylinders) ──
  figure.add(cyl(0.035, 0.032, 0.30, 8, fabricMat, -0.06, 0.20, 0));
  figure.add(cyl(0.035, 0.032, 0.30, 8, fabricMat,  0.06, 0.20, 0));

  // ── Tool belt at waist ──
  figure.add(box(0.20, 0.03, 0.10, beltMat, 0, 0.37, 0));
  // Belt buckle
  figure.add(box(0.025, 0.02, 0.015, M.chrome, 0, 0.37, 0.055));
  // Tool pouch on side
  figure.add(box(0.04, 0.05, 0.04, beltMat, -0.11, 0.37, 0.02));
  figure.add(box(0.03, 0.04, 0.03, beltMat,  0.11, 0.37, 0.02));

  // ── Torso (wider box) ──
  figure.add(box(0.18, 0.26, 0.10, fabricMat, 0, 0.52, 0));

  // ── Safety vest OVER torso (slightly larger, bright yellow-green) ──
  figure.add(box(0.19, 0.24, 0.005, vestMat, 0, 0.53, 0.053));   // front panel
  figure.add(box(0.19, 0.24, 0.005, vestMat, 0, 0.53, -0.053));  // back panel
  // Side strips connecting front and back
  figure.add(box(0.005, 0.24, 0.10, vestMat, -0.095, 0.53, 0));
  figure.add(box(0.005, 0.24, 0.10, vestMat,  0.095, 0.53, 0));

  // Reflective strips on vest (2 horizontal chrome strips, front and back)
  figure.add(box(0.18, 0.012, 0.006, reflective, 0, 0.47, 0.056));
  figure.add(box(0.18, 0.012, 0.006, reflective, 0, 0.58, 0.056));
  figure.add(box(0.18, 0.012, 0.006, reflective, 0, 0.47, -0.056));
  figure.add(box(0.18, 0.012, 0.006, reflective, 0, 0.58, -0.056));

  // ── Shoulders ──
  figure.add(box(0.24, 0.04, 0.10, fabricMat, 0, 0.67, 0));

  // ── Arms group (for animation rotation) ──
  const arms = new THREE.Group();
  arms.name = 'arms';

  // Left arm (side = -1)
  const armLeft = new THREE.Group();
  armLeft.name = 'armLeft';
  armLeft.add(cyl(0.028, 0.025, 0.18, 8, fabricMat, -0.14, 0.57, 0.03, 0.25, 0, 0));
  armLeft.add(cyl(0.025, 0.022, 0.16, 8, skinMat, -0.14, 0.44, 0.12, 0.55, 0, 0));
  armLeft.add(box(0.03, 0.04, 0.025, skinMat, -0.14, 0.37, 0.18));
  arms.add(armLeft);

  // Right arm (side = 1)
  const armRight = new THREE.Group();
  armRight.name = 'armRight';
  armRight.add(cyl(0.028, 0.025, 0.18, 8, fabricMat, 0.14, 0.57, 0.03, 0.25, 0, 0));
  armRight.add(cyl(0.025, 0.022, 0.16, 8, skinMat, 0.14, 0.44, 0.12, 0.55, 0, 0));
  armRight.add(box(0.03, 0.04, 0.025, skinMat, 0.14, 0.37, 0.18));
  arms.add(armRight);

  figure.add(arms);

  // ── Neck ──
  figure.add(cyl(0.025, 0.025, 0.04, 8, skinMat, 0, 0.71, 0));

  // ── Head (sphere) ──
  figure.add(sph(0.065, skinMat, 0, 0.79, 0));

  // ── Ears ──
  figure.add(sph(0.015, skinMat, -0.065, 0.78, 0));
  figure.add(sph(0.015, skinMat,  0.065, 0.78, 0));

  // ── Safety glasses (dark strip across face) ──
  figure.add(box(0.09, 0.018, 0.015, glassesMat, 0, 0.80, 0.06));
  // Lens tint
  const lensMat = mat(0x222244, 0.2, 0.3, { transparent: true, opacity: 0.6 });
  figure.add(box(0.03, 0.016, 0.008, lensMat, -0.025, 0.80, 0.065));
  figure.add(box(0.03, 0.016, 0.008, lensMat,  0.025, 0.80, 0.065));

  // ── Hard hat ──
  // Brim (wider disc below dome)
  figure.add(cyl(0.09, 0.09, 0.012, 16, hatMat, 0, 0.85, 0));
  // Dome
  figure.add(cyl(0.075, 0.08, 0.05, 16, hatMat, 0, 0.88, 0));
  figure.add(cyl(0.04, 0.075, 0.03, 16, hatMat, 0, 0.92, 0));
  // Top button
  figure.add(cyl(0.01, 0.01, 0.008, 8, hatMat, 0, 0.94, 0));

  g.add(figure);

  // ── Status light on a short post next to operator (not on figure) ──
  // Post base
  g.add(cyl(0.025, 0.025, 0.01, 8, M.bodyDark, 0.28, 0.005, -0.12));
  const statusLight = createStatusLight(0.28, 0.01, -0.12);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  return g;
}
