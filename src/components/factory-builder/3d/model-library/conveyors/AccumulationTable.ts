import * as THREE from 'three';
import { box, cyl, sph, createStatusLight } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

/**
 * Rotary Accumulation / Collection Table
 * Large circular rotating table surface (~1.5m diameter) with lip edge,
 * support pedestal, drive motor underneath, infeed roller section,
 * scattered product boxes, guard rail around ~270deg perimeter,
 * adjustable feet, status light.
 * Footprint: ~1.8 x 2.0 units, height ~0.55 units
 */
export function buildAccumulationTable(): THREE.Group {
  const g = new THREE.Group();

  // --- Materials ---
  const mTable    = mat(0x505a68, 0.70, 0.35);   // table surface (stainless)
  const mLip      = mat(0x5a6478, 0.75, 0.30);   // table edge lip
  const mPedestal = mat(0x3e4855, 0.75, 0.35);   // support pedestal
  const mMotor    = mat(0x2c3040, 0.60, 0.50);   // motor housing
  const mGuard    = mat(0xddaa00, 0.20, 0.55);   // guard rail yellow
  const mFrame    = mat(0x4a5060, 0.75, 0.35);   // frame steel
  const mRoller   = mat(0x555d68, 0.80, 0.25);   // infeed rollers
  const mBox1     = mat(0xC4934A, 0.00, 0.95);   // cardboard box
  const mBox2     = mat(0x3b82f6, 0.10, 0.70);   // blue product box
  const mBox3     = mat(0xdd4444, 0.10, 0.70);   // red product box
  const mFoot     = mat(0x404550, 0.65, 0.50);   // leveling feet
  const mBearing  = mat(0x707888, 0.85, 0.20);   // bearing

  // Dimensions
  const tableR    = 0.75;   // table radius (~1.5m diameter)
  const tableY    = 0.38;   // table surface height
  const pedestalR = 0.15;   // pedestal radius
  const infeedW   = 0.40;   // infeed conveyor width
  const infeedL   = 0.55;   // infeed conveyor length

  // === Base Floor Plate ===
  g.add(cyl(tableR + 0.10, tableR + 0.10, 0.02, 32, mFrame, 0, 0.01, 0));
  // Base mounting bolts (8 around perimeter)
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    g.add(cyl(0.008, 0.008, 0.025, 6, M.chrome,
      Math.cos(angle) * (tableR + 0.05), 0.035,
      Math.sin(angle) * (tableR + 0.05)));
    g.add(cyl(0.014, 0.014, 0.005, 8, M.darkChrome,
      Math.cos(angle) * (tableR + 0.05), 0.022,
      Math.sin(angle) * (tableR + 0.05)));
  }

  // === Support Pedestal / Column ===
  // Main pedestal column
  g.add(cyl(pedestalR, pedestalR + 0.03, tableY - 0.04, 16, mPedestal,
    0, (tableY - 0.04) / 2 + 0.02, 0));
  // Pedestal flange at top
  g.add(cyl(pedestalR + 0.06, pedestalR + 0.06, 0.025, 16, mFrame,
    0, tableY - 0.03, 0));
  // Pedestal flange at bottom
  g.add(cyl(pedestalR + 0.08, pedestalR + 0.08, 0.025, 16, mFrame,
    0, 0.03, 0));
  // Support gussets (4 radial plates)
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    g.add(box(pedestalR * 1.5, tableY * 0.5, 0.008, mFrame,
      Math.cos(angle) * pedestalR * 0.4, tableY * 0.3,
      Math.sin(angle) * pedestalR * 0.4, 0, angle, 0));
  }

  // === Bearing Assembly ===
  // Outer bearing race
  g.add(cyl(pedestalR + 0.05, pedestalR + 0.05, 0.02, 24, mBearing,
    0, tableY - 0.015, 0));
  // Inner bearing race
  g.add(cyl(pedestalR + 0.02, pedestalR + 0.02, 0.022, 24, mBearing,
    0, tableY - 0.015, 0));
  // Ball bearings (decorative)
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    g.add(sph(0.008, M.chrome,
      Math.cos(angle) * (pedestalR + 0.035), tableY - 0.015,
      Math.sin(angle) * (pedestalR + 0.035)));
  }

  // === Rotating Table Surface ===
  // Main table disc
  g.add(cyl(tableR, tableR, 0.015, 48, mTable, 0, tableY, 0));
  // Table top texture rings (concentric grooves for grip)
  g.add(cyl(tableR * 0.7, tableR * 0.7, 0.002, 32,
    mat(0x586272, 0.65, 0.40), 0, tableY + 0.009, 0));
  g.add(cyl(tableR * 0.4, tableR * 0.4, 0.002, 24,
    mat(0x586272, 0.65, 0.40), 0, tableY + 0.009, 0));

  // === Table Edge Lip ===
  // Outer rim/lip (ring of segments)
  for (let i = 0; i < 32; i++) {
    const angle1 = (i / 32) * Math.PI * 2;
    const angle2 = ((i + 1) / 32) * Math.PI * 2;
    const midAngle = (angle1 + angle2) / 2;
    const segLen = 2 * tableR * Math.sin(Math.PI / 32);
    g.add(cyl(0.01, 0.01, segLen, 4, mLip,
      Math.cos(midAngle) * (tableR - 0.005), tableY + 0.017,
      Math.sin(midAngle) * (tableR - 0.005),
      Math.PI / 2, midAngle + Math.PI / 2, 0));
  }

  // === Drive Motor Underneath ===
  // Motor body (horizontal, underneath table)
  g.add(cyl(0.06, 0.06, 0.14, 12, mMotor,
    0.25, 0.10, 0.25));
  // Motor shaft
  g.add(cyl(0.015, 0.015, 0.04, 8, M.chrome,
    0.25, 0.175, 0.25));
  // Motor end cap
  g.add(cyl(0.063, 0.063, 0.01, 12, mFrame,
    0.25, 0.03, 0.25));
  // Motor fan cover
  g.add(cyl(0.058, 0.058, 0.025, 12, mat(0x333338, 0.5, 0.6),
    0.25, 0.04, 0.25));
  // Gear reducer
  g.add(box(0.08, 0.06, 0.06, mMotor, 0.15, 0.20, 0.15));
  // Ring gear on underside of table
  g.add(cyl(pedestalR + 0.10, pedestalR + 0.10, 0.012, 32,
    mat(0x444444, 0.8, 0.3), 0, tableY - 0.03, 0));
  // Drive pinion
  g.add(cyl(0.02, 0.02, 0.015, 10, M.darkChrome,
    0.12, tableY - 0.03, 0.12));
  // Motor junction box
  g.add(box(0.04, 0.04, 0.04, mMotor, 0.25, 0.10, 0.32));
  // Power cable
  g.add(cyl(0.008, 0.008, 0.20, 6, M.wire,
    0.25, 0.10, 0.44, Math.PI / 2, 0, 0));

  // === Infeed Conveyor Section (short roller section, from +X direction) ===
  const infeedX = tableR + infeedL / 2 - 0.05;

  // Infeed frame sides
  g.add(box(infeedL, 0.05, 0.025, mFrame, infeedX, tableY - 0.01, -infeedW / 2));
  g.add(box(infeedL, 0.05, 0.025, mFrame, infeedX, tableY - 0.01, infeedW / 2));
  // Bottom channels
  g.add(box(infeedL, 0.01, 0.025, mFrame, infeedX, tableY - 0.04, -infeedW / 2));
  g.add(box(infeedL, 0.01, 0.025, mFrame, infeedX, tableY - 0.04, infeedW / 2));

  // Infeed rollers (7 rollers)
  for (let i = 0; i < 7; i++) {
    const rx = tableR - 0.03 + 0.02 + (infeedL - 0.04) / 6 * i;
    g.add(cyl(0.018, 0.018, infeedW - 0.04, 8, mRoller,
      rx, tableY + 0.005, 0, Math.PI / 2, 0, 0));
    // Shaft ends
    g.add(cyl(0.006, 0.006, 0.012, 6, M.chrome,
      rx, tableY + 0.005, -infeedW / 2 + 0.01, Math.PI / 2, 0, 0));
    g.add(cyl(0.006, 0.006, 0.012, 6, M.chrome,
      rx, tableY + 0.005, infeedW / 2 - 0.01, Math.PI / 2, 0, 0));
  }

  // Infeed support legs (2)
  g.add(box(0.025, tableY - 0.04, 0.025, mFrame,
    tableR + infeedL - 0.10, (tableY - 0.04) / 2, -infeedW / 2));
  g.add(box(0.025, tableY - 0.04, 0.025, mFrame,
    tableR + infeedL - 0.10, (tableY - 0.04) / 2, infeedW / 2));
  // Infeed feet
  g.add(cyl(0.02, 0.025, 0.01, 8, mFoot,
    tableR + infeedL - 0.10, 0.005, -infeedW / 2));
  g.add(cyl(0.02, 0.025, 0.01, 8, mFoot,
    tableR + infeedL - 0.10, 0.005, infeedW / 2));

  // === Products / Parts Scattered on Table Surface ===
  // Small cardboard boxes
  g.add(box(0.06, 0.04, 0.06, mBox1, 0.20, tableY + 0.028, -0.15));
  g.add(box(0.06, 0.04, 0.06, mBox1, -0.10, tableY + 0.028, 0.30));
  g.add(box(0.06, 0.04, 0.06, mBox1, -0.30, tableY + 0.028, -0.20));
  g.add(box(0.06, 0.04, 0.06, mBox1, 0.35, tableY + 0.028, 0.10));
  g.add(box(0.06, 0.04, 0.06, mBox1, 0.05, tableY + 0.028, -0.40));

  // Blue product boxes (smaller)
  g.add(box(0.045, 0.035, 0.045, mBox2, -0.25, tableY + 0.025, 0.10));
  g.add(box(0.045, 0.035, 0.045, mBox2, 0.40, tableY + 0.025, -0.25));
  g.add(box(0.045, 0.035, 0.045, mBox2, -0.05, tableY + 0.025, 0.50));

  // Red product boxes (smaller)
  g.add(box(0.05, 0.03, 0.04, mBox3, 0.15, tableY + 0.023, 0.35));
  g.add(box(0.05, 0.03, 0.04, mBox3, -0.40, tableY + 0.023, -0.05));
  g.add(box(0.05, 0.03, 0.04, mBox3, 0.10, tableY + 0.023, -0.55));

  // Stacked boxes (2 high)
  g.add(box(0.06, 0.04, 0.06, mBox1, -0.45, tableY + 0.028, 0.30));
  g.add(box(0.055, 0.035, 0.055, mBox2, -0.45, tableY + 0.065, 0.30));

  // === Guard Rail Around ~270deg of Perimeter (open at infeed, +X) ===
  const guardR = tableR + 0.05;
  const guardStartAngle = 0.3;          // skip infeed opening
  const guardEndAngle = Math.PI * 2 - 0.3;
  const guardPosts = 16;

  // Guard posts (vertical)
  for (let i = 0; i < guardPosts; i++) {
    const t = i / (guardPosts - 1);
    const angle = guardStartAngle + t * (guardEndAngle - guardStartAngle);
    const gx = Math.cos(angle) * guardR;
    const gz = Math.sin(angle) * guardR;
    g.add(cyl(0.012, 0.012, 0.20, 6, mGuard, gx, tableY + 0.10, gz));
  }

  // Guard top rail (segments connecting posts)
  for (let i = 0; i < guardPosts - 1; i++) {
    const t1 = i / (guardPosts - 1);
    const t2 = (i + 1) / (guardPosts - 1);
    const angle1 = guardStartAngle + t1 * (guardEndAngle - guardStartAngle);
    const angle2 = guardStartAngle + t2 * (guardEndAngle - guardStartAngle);
    const midAngle = (angle1 + angle2) / 2;
    const segLen = 2 * guardR * Math.sin((angle2 - angle1) / 2);
    g.add(cyl(0.008, 0.008, segLen, 4, mGuard,
      Math.cos(midAngle) * guardR, tableY + 0.20,
      Math.sin(midAngle) * guardR,
      Math.PI / 2, midAngle + Math.PI / 2, 0));
  }

  // Guard mid rail
  for (let i = 0; i < guardPosts - 1; i++) {
    const t1 = i / (guardPosts - 1);
    const t2 = (i + 1) / (guardPosts - 1);
    const angle1 = guardStartAngle + t1 * (guardEndAngle - guardStartAngle);
    const angle2 = guardStartAngle + t2 * (guardEndAngle - guardStartAngle);
    const midAngle = (angle1 + angle2) / 2;
    const segLen = 2 * guardR * Math.sin((angle2 - angle1) / 2);
    g.add(cyl(0.006, 0.006, segLen, 4, mGuard,
      Math.cos(midAngle) * guardR, tableY + 0.10,
      Math.sin(midAngle) * guardR,
      Math.PI / 2, midAngle + Math.PI / 2, 0));
  }

  // Guard warning stripes at entry (black/yellow on both sides of opening)
  g.add(box(0.04, 0.06, 0.008, mat(0x222222, 0.1, 0.8),
    Math.cos(guardStartAngle) * guardR, tableY + 0.10,
    Math.sin(guardStartAngle) * guardR));
  g.add(box(0.04, 0.06, 0.008, mat(0x222222, 0.1, 0.8),
    Math.cos(guardEndAngle) * guardR, tableY + 0.10,
    Math.sin(guardEndAngle) * guardR));

  // === Adjustable Feet (4 positions around base) ===
  const feetPositions: [number, number][] = [
    [-tableR + 0.10, -tableR + 0.10],
    [-tableR + 0.10,  tableR - 0.10],
    [ tableR - 0.10, -tableR + 0.10],
    [ tableR - 0.10,  tableR - 0.10],
  ];
  for (const [fx, fz] of feetPositions) {
    g.add(cyl(0.025, 0.028, 0.012, 8, mFoot, fx, 0.006, fz));
    g.add(cyl(0.008, 0.008, 0.02, 6, M.chrome, fx, 0.018, fz));
  }

  // === Proximity Sensor (detecting products near edge) ===
  g.add(cyl(0.012, 0.012, 0.03, 8, mat(0x0066cc, 0.3, 0.4),
    -tableR + 0.05, tableY + 0.02, 0));
  g.add(cyl(0.008, 0.008, 0.003, 6,
    mat(0x00ff00, 0.1, 0.3, { emissive: 0x00ff00, emissiveIntensity: 0.8 }),
    -tableR + 0.05, tableY + 0.037, 0));

  // === E-Stop Button on Guard Post ===
  g.add(cyl(0.018, 0.018, 0.015, 12, M.red,
    Math.cos(Math.PI) * guardR, tableY + 0.15,
    Math.sin(Math.PI) * guardR));
  g.add(cyl(0.025, 0.025, 0.005, 12, mGuard,
    Math.cos(Math.PI) * guardR, tableY + 0.14,
    Math.sin(Math.PI) * guardR));

  // === Status Light ===
  g.add(createStatusLight(
    Math.cos(Math.PI * 0.75) * (guardR + 0.03),
    tableY + 0.05,
    Math.sin(Math.PI * 0.75) * (guardR + 0.03)));

  return g;
}
