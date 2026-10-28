import * as THREE from 'three';
import { box, cyl } from '../../shared/helpers';
import { M, mat } from '../../shared/materials';

export function buildElectricalPanel(): THREE.Group {
  const g = new THREE.Group();

  // ── Materials ──
  const cabinetGray = mat(0x6a7080, 0.6, 0.45);
  const cabinetInner = mat(0x4a5060, 0.5, 0.5);
  const doorMat = mat(0x727a88, 0.6, 0.4);
  const handleMat = mat(0x888888, 0.75, 0.25);
  const hingeMat = mat(0x555555, 0.7, 0.35);
  const louverMat = mat(0x5a6270, 0.55, 0.5);
  const disconnectRed = mat(0xcc0000, 0.2, 0.5);
  const disconnectYellow = mat(0xddaa00, 0.2, 0.5);
  const warningSign = mat(0xffdd00, 0.1, 0.5);
  const signText = mat(0x111111, 0.0, 0.9);
  const cableMat = mat(0x333333, 0.2, 0.7);
  const copperBus = mat(0xbb7733, 0.7, 0.3);
  const glandMat = mat(0x777777, 0.6, 0.4);
  const conduitMat = mat(0x606870, 0.65, 0.35);
  const nameplateWhite = mat(0xeeeeee, 0.05, 0.8);
  const dripShield = mat(0x7a8090, 0.6, 0.4);
  const lockMat = mat(0x444444, 0.7, 0.3);
  const ledGreen = mat(0x00ff00, 0.1, 0.3, { emissive: 0x00ff00, emissiveIntensity: 1.2 });
  const ledRed = mat(0xff0000, 0.1, 0.3, { emissive: 0xff0000, emissiveIntensity: 0.4 });
  const ledBlue = mat(0x0088ff, 0.1, 0.3, { emissive: 0x0088ff, emissiveIntensity: 0.8 });

  // ── Dimensions ──
  const panelW = 0.8;
  const panelH = 2.0;
  const panelD = 0.5;

  // ── Main Enclosure ──
  // Back panel
  g.add(box(panelW, panelH, 0.03, cabinetGray, 0, panelH / 2, panelD / 2 - 0.015));
  // Top panel
  g.add(box(panelW, 0.03, panelD, cabinetGray, 0, panelH - 0.015, 0));
  // Bottom panel
  g.add(box(panelW, 0.03, panelD, cabinetGray, 0, 0.015, 0));
  // Left side panel
  g.add(box(0.03, panelH, panelD, cabinetGray, -panelW / 2 + 0.015, panelH / 2, 0));
  // Right side panel
  g.add(box(0.03, panelH, panelD, cabinetGray, panelW / 2 - 0.015, panelH / 2, 0));
  // Inner mounting plate
  g.add(box(panelW - 0.1, panelH - 0.1, 0.01, cabinetInner, 0, panelH / 2, panelD / 2 - 0.06));

  // ── Double Doors ──
  const doorW = (panelW - 0.06) / 2;
  const doorH = panelH - 0.06;
  for (const side of [-1, 1]) {
    const dx = side * (doorW / 2 + 0.005);
    // Door panel
    g.add(box(doorW, doorH, 0.025, doorMat, dx, panelH / 2, -panelD / 2 + 0.012));
    // Door edge return (lip)
    g.add(box(0.015, doorH, 0.04, doorMat, dx + side * (doorW / 2 - 0.007), panelH / 2, -panelD / 2 + 0.03));

    // Hinges (3 per door)
    const hingeX = dx - side * (doorW / 2 - 0.01);
    for (const hy of [panelH * 0.2, panelH * 0.5, panelH * 0.8]) {
      g.add(cyl(0.01, 0.01, 0.04, 8, hingeMat, hingeX, hy, -panelD / 2 + 0.01));
      g.add(box(0.03, 0.05, 0.01, hingeMat, hingeX, hy, -panelD / 2 + 0.005));
      // Hinge pin
      g.add(cyl(0.004, 0.004, 0.05, 6, handleMat, hingeX, hy, -panelD / 2 + 0.01));
    }

    // Door reinforcement emboss (pressed panel detail)
    g.add(box(doorW - 0.06, doorH * 0.35, 0.005, doorMat, dx, panelH * 0.3, -panelD / 2 - 0.002));
    g.add(box(doorW - 0.06, doorH * 0.35, 0.005, doorMat, dx, panelH * 0.72, -panelD / 2 - 0.002));
  }

  // ── Door Handles ──
  for (const side of [-1, 1]) {
    const hx = side * 0.02;
    // Handle bar
    g.add(cyl(0.008, 0.008, 0.12, 8, handleMat, hx, panelH * 0.5, -panelD / 2 - 0.02));
    // Handle mounts
    g.add(cyl(0.012, 0.012, 0.02, 8, handleMat, hx, panelH * 0.5 - 0.05, -panelD / 2 - 0.01, Math.PI / 2, 0, 0));
    g.add(cyl(0.012, 0.012, 0.02, 8, handleMat, hx, panelH * 0.5 + 0.05, -panelD / 2 - 0.01, Math.PI / 2, 0, 0));
  }

  // ── Door Latch / Lock ──
  // Three-point latch handle (right door)
  g.add(box(0.03, 0.06, 0.015, lockMat, 0.02, panelH * 0.42, -panelD / 2 - 0.01));
  // Key lock cylinder
  g.add(cyl(0.008, 0.008, 0.015, 8, handleMat, 0.02, panelH * 0.38, -panelD / 2 - 0.02));
  // Lock escutcheon plate
  g.add(box(0.025, 0.025, 0.003, handleMat, 0.02, panelH * 0.38, -panelD / 2 - 0.014));
  // Latch rods (vertical, inside door edges)
  for (const ly of [panelH * 0.15, panelH * 0.85]) {
    g.add(cyl(0.004, 0.004, 0.06, 6, handleMat, 0.01, ly, -panelD / 2 + 0.015));
  }

  // ── Ventilation Louvers on sides ──
  for (const sx of [-panelW / 2 + 0.015, panelW / 2 - 0.015]) {
    // Louver sets (upper and lower)
    for (const [ly, lh] of [[panelH * 0.2, 0.2], [panelH * 0.75, 0.25]] as [number, number][]) {
      // Louver frame
      g.add(box(0.005, lh + 0.02, 0.2, louverMat, sx, ly, -0.05));
      // Individual slats
      const slotCount = Math.floor(lh / 0.02);
      for (let s = 0; s < slotCount; s++) {
        const sy = ly - lh / 2 + s * (lh / slotCount) + 0.01;
        g.add(box(0.007, 0.008, 0.18, louverMat, sx, sy, -0.05, 0.5, 0, 0));
      }
    }
  }

  // ── Main Disconnect Handle (red/yellow) ──
  const discX = -0.2;
  const discY = panelH * 0.82;
  // Handle housing
  g.add(box(0.08, 0.1, 0.025, disconnectYellow, discX, discY, -panelD / 2 - 0.015));
  // Handle lever (rotary)
  g.add(box(0.05, 0.06, 0.02, disconnectRed, discX, discY + 0.02, -panelD / 2 - 0.03));
  // Handle grip
  g.add(cyl(0.012, 0.012, 0.04, 8, M.rubber, discX, discY + 0.04, -panelD / 2 - 0.035));
  // ON/OFF label plate
  g.add(box(0.04, 0.015, 0.003, nameplateWhite, discX, discY - 0.06, -panelD / 2 - 0.014));
  // "OFF" text bar
  g.add(box(0.025, 0.006, 0.004, signText, discX, discY - 0.06, -panelD / 2 - 0.016));
  // Lockout hasp hole
  g.add(cyl(0.005, 0.005, 0.025, 6, lockMat, discX + 0.025, discY + 0.05, -panelD / 2 - 0.03));

  // ── Warning High Voltage Sign ──
  const signX = 0;
  const signY = panelH * 0.65;
  // Yellow triangle background
  g.add(box(0.12, 0.1, 0.004, warningSign, signX, signY, -panelD / 2 - 0.014));
  // Sign border
  g.add(box(0.13, 0.002, 0.005, signText, signX, signY + 0.051, -panelD / 2 - 0.015));
  g.add(box(0.13, 0.002, 0.005, signText, signX, signY - 0.051, -panelD / 2 - 0.015));
  g.add(box(0.002, 0.1, 0.005, signText, signX - 0.065, signY, -panelD / 2 - 0.015));
  g.add(box(0.002, 0.1, 0.005, signText, signX + 0.065, signY, -panelD / 2 - 0.015));
  // Lightning bolt symbol (simplified)
  g.add(box(0.008, 0.04, 0.005, signText, signX - 0.005, signY + 0.01, -panelD / 2 - 0.017, 0, 0, 0.3));
  g.add(box(0.008, 0.04, 0.005, signText, signX + 0.005, signY - 0.01, -panelD / 2 - 0.017, 0, 0, 0.3));
  // "DANGER" text bar
  g.add(box(0.08, 0.01, 0.005, signText, signX, signY - 0.035, -panelD / 2 - 0.017));
  // "HIGH VOLTAGE" text bar
  g.add(box(0.06, 0.006, 0.005, signText, signX, signY - 0.045, -panelD / 2 - 0.017));

  // ── Cable Entry Glands on bottom ──
  for (let ci = -3; ci <= 3; ci++) {
    const cx = ci * 0.09;
    // Gland body
    g.add(cyl(0.018, 0.022, 0.04, 8, glandMat, cx, -0.02, -0.08));
    // Gland nut
    g.add(cyl(0.024, 0.024, 0.01, 6, glandMat, cx, -0.025, -0.08));
    // Cable stub going down
    g.add(cyl(0.012, 0.012, 0.1, 8, cableMat, cx, -0.08, -0.08));
    // Strain relief grommet
    g.add(cyl(0.015, 0.015, 0.008, 8, M.rubber, cx, -0.04, -0.08));
  }

  // ── Grounding Bus Bar at base ──
  g.add(box(panelW - 0.12, 0.02, 0.015, copperBus, 0, 0.08, panelD / 2 - 0.06));
  // Grounding lugs
  for (let gi = -4; gi <= 4; gi++) {
    g.add(cyl(0.005, 0.005, 0.02, 6, copperBus, gi * 0.07, 0.08, panelD / 2 - 0.05));
    g.add(cyl(0.008, 0.008, 0.005, 6, handleMat, gi * 0.07, 0.08, panelD / 2 - 0.04));
  }
  // Ground wire (green/yellow)
  g.add(cyl(0.008, 0.008, 0.15, 8, mat(0x44aa00, 0.1, 0.6), -panelW / 2 + 0.08, 0.08, panelD / 2 - 0.03, 0, 0, Math.PI / 2));

  // ── Conduit Connections on top ──
  for (let pi = -2; pi <= 2; pi++) {
    const px = pi * 0.15;
    // Conduit pipe going up
    g.add(cyl(0.02, 0.02, 0.5, 8, conduitMat, px, panelH + 0.25, 0));
    // Conduit connector at top of panel
    g.add(cyl(0.028, 0.028, 0.03, 8, glandMat, px, panelH + 0.01, 0));
    // Lock nut
    g.add(cyl(0.03, 0.03, 0.01, 6, glandMat, px, panelH - 0.02, 0));
    // Conduit elbow (90 degree) at top
    g.add(cyl(0.02, 0.02, 0.06, 8, conduitMat, px, panelH + 0.5, -0.03, 0.5, 0, 0));
  }

  // ── Status Indicator LEDs on door (power, fault, comm) ──
  const ledX = 0.2;
  const ledBaseY = panelH * 0.88;
  // LED housings
  for (let li = 0; li < 3; li++) {
    const ly = ledBaseY + li * 0.035;
    g.add(cyl(0.008, 0.008, 0.008, 8, M.bodyDark, ledX, ly, -panelD / 2 - 0.014));
    // LED bezel
    g.add(cyl(0.01, 0.01, 0.003, 10, handleMat, ledX, ly, -panelD / 2 - 0.017));
  }
  // Power LED (green, on)
  g.add(cyl(0.006, 0.006, 0.004, 10, ledGreen, ledX, ledBaseY, -panelD / 2 - 0.019));
  // Fault LED (red, dim/off)
  g.add(cyl(0.006, 0.006, 0.004, 10, ledRed, ledX, ledBaseY + 0.035, -panelD / 2 - 0.019));
  // Comm LED (blue, on)
  g.add(cyl(0.006, 0.006, 0.004, 10, ledBlue, ledX, ledBaseY + 0.07, -panelD / 2 - 0.019));
  // LED labels
  for (let li = 0; li < 3; li++) {
    g.add(box(0.04, 0.008, 0.003, nameplateWhite, ledX + 0.04, ledBaseY + li * 0.035, -panelD / 2 - 0.014));
    g.add(box(0.03, 0.004, 0.004, signText, ledX + 0.04, ledBaseY + li * 0.035, -panelD / 2 - 0.016));
  }

  // ── Nameplate ──
  g.add(box(0.12, 0.05, 0.003, nameplateWhite, 0, panelH * 0.93, -panelD / 2 - 0.014));
  g.add(box(0.1, 0.008, 0.004, signText, 0, panelH * 0.935, -panelD / 2 - 0.016));
  g.add(box(0.07, 0.006, 0.004, signText, 0, panelH * 0.925, -panelD / 2 - 0.016));
  // Nameplate rivets
  for (const [nx, ny] of [[-0.05, 0.02], [0.05, 0.02], [-0.05, -0.02], [0.05, -0.02]] as [number, number][]) {
    g.add(cyl(0.003, 0.003, 0.004, 6, handleMat, nx, panelH * 0.93 + ny, -panelD / 2 - 0.016));
  }

  // ── Drip Shield on top ──
  g.add(box(panelW + 0.06, 0.015, panelD + 0.08, dripShield, 0, panelH + 0.008, -0.02));
  // Front lip of drip shield (angled)
  g.add(box(panelW + 0.06, 0.03, 0.02, dripShield, 0, panelH + 0.0, -panelD / 2 - 0.03, -0.3, 0, 0));
  // Side lips
  for (const sx of [-(panelW + 0.06) / 2, (panelW + 0.06) / 2]) {
    g.add(box(0.015, 0.025, panelD + 0.08, dripShield, sx, panelH + 0.005, -0.02));
  }

  // ── Internal Components (visible detail through ventilation) ──
  // Busbar rails (horizontal copper bars inside)
  for (let bi = 0; bi < 3; bi++) {
    g.add(box(panelW - 0.1, 0.015, 0.005, copperBus, 0, panelH * 0.5 + bi * 0.06, panelD / 4));
  }
  // DIN rail sections
  for (const ry of [panelH * 0.3, panelH * 0.6]) {
    g.add(box(panelW - 0.12, 0.025, 0.01, handleMat, 0, ry, panelD / 2 - 0.07));
  }

  return g;
}
