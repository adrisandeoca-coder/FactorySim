import * as THREE from 'three';
import { box, cyl } from '../../shared/helpers';
import { mat } from '../../shared/materials';

export function buildDrum(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const drumBlue = mat(0x2255AA, 0.5, 0.45);
  const hoopSteel = mat(0x556070, 0.7, 0.3);
  const chimeSteel = mat(0x505868, 0.65, 0.35);
  const lidMat = mat(0x3366BB, 0.55, 0.4);
  const bungMat = mat(0x888888, 0.7, 0.3);
  const bungCapMat = mat(0x777777, 0.6, 0.4);
  const labelBand = mat(0xdddddd, 0.0, 0.85);
  const labelText = mat(0x222222, 0.0, 0.9);
  const seamMat = mat(0x3a5a9a, 0.6, 0.4);
  const handleMat = mat(0x606878, 0.7, 0.3);

  // ── Drum Dimensions (55 gal: ~57cm dia x 88cm tall, scaled) ──
  const drumR = 0.145;   // radius
  const drumH = 0.44;    // height
  const drumRBulge = 0.15; // slightly wider at middle

  // ── Main Body (3 sections for barrel bulge) ──
  // Bottom third
  g.add(cyl(drumR + 0.002, drumR, drumH * 0.33, 24, drumBlue,
    0, drumH * 0.165, 0));
  // Middle third (bulge)
  g.add(cyl(drumRBulge, drumR + 0.002, drumH * 0.34, 24, drumBlue,
    0, drumH * 0.5, 0));
  // Top third
  g.add(cyl(drumR, drumRBulge, drumH * 0.33, 24, drumBlue,
    0, drumH * 0.835, 0));

  // ── Bottom Chime (rolled edge at bottom) ──
  g.add(cyl(drumR + 0.008, drumR + 0.008, 0.012, 24, chimeSteel, 0, 0.006, 0));
  // Bottom chime inner lip
  g.add(cyl(drumR + 0.005, drumR - 0.005, 0.006, 24, chimeSteel, 0, 0.001, 0));

  // ── Top Chime (rolled edge at top) ──
  g.add(cyl(drumR + 0.008, drumR + 0.008, 0.012, 24, chimeSteel, 0, drumH - 0.006, 0));
  // Top chime outer lip
  g.add(cyl(drumR + 0.012, drumR + 0.005, 0.006, 24, chimeSteel, 0, drumH - 0.001, 0));

  // ── Rolling Hoops (2 reinforcing rings) ──
  const hoopPositions = [drumH * 0.30, drumH * 0.70];
  for (const hy of hoopPositions) {
    // Calculate radius at hoop position for proper fit
    const t = hy / drumH;
    const hR = t < 0.5
      ? drumR + (drumRBulge - drumR) * (t / 0.5)
      : drumRBulge - (drumRBulge - drumR) * ((t - 0.5) / 0.5);
    g.add(cyl(hR + 0.006, hR + 0.006, 0.014, 24, hoopSteel, 0, hy, 0));
    // Inner ring detail
    g.add(cyl(hR + 0.003, hR + 0.003, 0.010, 24, hoopSteel, 0, hy, 0));
  }

  // ── Lid / Top Surface ──
  g.add(cyl(drumR - 0.005, drumR - 0.005, 0.005, 24, lidMat, 0, drumH - 0.01, 0));

  // ── Bung Holes (2 openings on top) ──
  // Large bung (2" / ~5cm)
  g.add(cyl(0.02, 0.02, 0.012, 12, bungMat, 0.05, drumH - 0.002, 0));
  // Bung cap (plug)
  g.add(cyl(0.018, 0.018, 0.008, 12, bungCapMat, 0.05, drumH + 0.002, 0));
  // Cap hex shape (6 raised edges)
  for (let a = 0; a < 6; a++) {
    const angle = (a / 6) * Math.PI * 2;
    g.add(box(0.003, 0.004, 0.012, bungCapMat,
      0.05 + Math.cos(angle) * 0.012, drumH + 0.005,
      Math.sin(angle) * 0.012));
  }

  // Small bung (3/4" / ~2cm)
  g.add(cyl(0.012, 0.012, 0.012, 12, bungMat, -0.05, drumH - 0.002, 0.04));
  // Small bung cap
  g.add(cyl(0.010, 0.010, 0.008, 10, bungCapMat, -0.05, drumH + 0.002, 0.04));
  // Small cap hex
  for (let a = 0; a < 6; a++) {
    const angle = (a / 6) * Math.PI * 2;
    g.add(box(0.002, 0.004, 0.008, bungCapMat,
      -0.05 + Math.cos(angle) * 0.007, drumH + 0.005,
      0.04 + Math.sin(angle) * 0.007));
  }

  // ── Vertical Body Seam ──
  g.add(box(0.003, drumH - 0.03, 0.003, seamMat, drumR - 0.002, drumH / 2, 0));

  // ── Label Band (white band around middle of drum) ──
  const labelY = drumH * 0.48;
  const labelH = drumH * 0.22;
  // Approximate label as flat panels on 8 sides
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    const lx = Math.cos(angle) * (drumRBulge + 0.002);
    const lz = Math.sin(angle) * (drumRBulge + 0.002);
    g.add(box(0.11, labelH, 0.003, labelBand,
      lx, labelY, lz,
      0, -angle + Math.PI / 2, 0));
  }

  // ── Label Text (on front face) ──
  // Hazard diamond
  g.add(box(0.04, 0.04, 0.004, mat(0xff4444, 0.0, 0.7),
    drumRBulge + 0.004, labelY + 0.04, 0, 0, 0, Math.PI / 4));
  // "UN" number line
  g.add(box(0.06, 0.008, 0.004, labelText, drumRBulge + 0.004, labelY - 0.01, 0));
  // Product name lines
  g.add(box(0.07, 0.006, 0.004, labelText, drumRBulge + 0.004, labelY - 0.025, 0));
  g.add(box(0.05, 0.006, 0.004, labelText, drumRBulge + 0.004, labelY - 0.038, 0));
  // GHS pictogram (small square)
  g.add(box(0.02, 0.02, 0.004, mat(0xcc0000, 0.0, 0.7),
    drumRBulge + 0.004, labelY - 0.06, 0.03, 0, 0, Math.PI / 4));

  // ── Bail Handle / Carrying Ring (torus on top) ──
  // Handle bail arch
  const handleR = 0.06;
  const handleTube = 0.005;
  // Approximate torus with segments
  const handleSegs = 12;
  for (let i = 0; i < handleSegs; i++) {
    const a1 = (i / handleSegs) * Math.PI;
    const a2 = ((i + 1) / handleSegs) * Math.PI;
    const x1 = Math.cos(a1) * handleR;
    const y1 = Math.sin(a1) * handleR;
    const x2 = Math.cos(a2) * handleR;
    const y2 = Math.sin(a2) * handleR;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    g.add(box(len, handleTube * 2, handleTube * 2, handleMat,
      mx, drumH + my + 0.005, 0,
      0, 0, ang));
  }

  // Handle pivot brackets
  g.add(cyl(0.008, 0.008, 0.015, 8, handleMat, -handleR, drumH + 0.005, 0));
  g.add(cyl(0.008, 0.008, 0.015, 8, handleMat, handleR, drumH + 0.005, 0));

  // ── Bottom surface ──
  g.add(cyl(drumR - 0.01, drumR - 0.01, 0.004, 24, chimeSteel, 0, 0.002, 0));

  // ── Bottom feet indentations (3 small rings for stability) ──
  for (let a = 0; a < 3; a++) {
    const angle = (a / 3) * Math.PI * 2;
    g.add(cyl(0.015, 0.015, 0.003, 8, hoopSteel,
      Math.cos(angle) * 0.08, 0.001, Math.sin(angle) * 0.08));
  }

  return g;
}
