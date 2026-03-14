import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Shipping Dock
 * Large dock with platform, bumpers, roll-up door, pallet with stacked boxes,
 * warning light, and floor markings.
 * Footprint: ~1.5w x 0.8h x 1.0d — the largest node type.
 */
export function buildSink(): THREE.Group {
  const g = new THREE.Group();

  const dockW = 1.5;
  const dockD = 1.0;

  // --- Dock platform base (wide flat slab) ---
  const platformH = 0.08;
  g.add(box(dockW, platformH, dockD, mat(0x3a2e24, 0.4, 0.6), 0, platformH / 2, 0));

  // Platform edge lip (slightly raised front edge)
  g.add(box(dockW, 0.02, 0.04, M.darkChrome, 0, platformH + 0.01, -dockD / 2 + 0.02));

  // --- Dock bumpers (2 rubber cylinders at front edge) ---
  const bumperMat = M.rubber;
  g.add(cyl(0.05, 0.05, 0.12, 8, bumperMat, -0.4, platformH + 0.06, -dockD / 2 + 0.02, 0, 0, Math.PI / 2));
  g.add(cyl(0.05, 0.05, 0.12, 8, bumperMat, 0.4, platformH + 0.06, -dockD / 2 + 0.02, 0, 0, Math.PI / 2));

  // --- Roll-up dock door (tall rectangle at back with groove lines) ---
  const doorW = 1.2;
  const doorH = 0.65;
  const doorMat = mat(0x302418, 0.5, 0.5);
  g.add(box(doorW, doorH, 0.03, doorMat, 0, platformH + doorH / 2, dockD / 2 - 0.015));

  // Horizontal groove lines on door (simulate roll-up segments)
  const grooveMat = mat(0x1a1d22, 0.6, 0.5);
  const grooveCount = 8;
  for (let i = 1; i < grooveCount; i++) {
    const gy = platformH + (doorH / grooveCount) * i;
    g.add(box(doorW - 0.02, 0.006, 0.005, grooveMat, 0, gy, dockD / 2 + 0.001));
  }

  // Door frame (vertical posts and header)
  const frameMat = mat(0x3a3e48, 0.7, 0.4);
  g.add(box(0.05, doorH + 0.05, 0.05, frameMat, -doorW / 2 - 0.025, platformH + (doorH + 0.05) / 2, dockD / 2 - 0.015));
  g.add(box(0.05, doorH + 0.05, 0.05, frameMat,  doorW / 2 + 0.025, platformH + (doorH + 0.05) / 2, dockD / 2 - 0.015));
  g.add(box(doorW + 0.1, 0.05, 0.05, frameMat, 0, platformH + doorH + 0.025, dockD / 2 - 0.015));

  // --- Pallet area (wooden pallet in front center) ---
  const palletX = 0;
  const palletZ = -0.1;
  const palletBaseY = platformH;

  // Pallet bottom boards
  g.add(box(0.5, 0.02, 0.02, M.pallet, palletX, palletBaseY + 0.01, palletZ - 0.12));
  g.add(box(0.5, 0.02, 0.02, M.pallet, palletX, palletBaseY + 0.01, palletZ + 0.12));
  // Pallet stringers (3 blocks)
  for (let i = -1; i <= 1; i++) {
    g.add(box(0.08, 0.05, 0.3, M.pallet, palletX + i * 0.18, palletBaseY + 0.04, palletZ));
  }
  // Pallet top boards (slats)
  for (let i = -2; i <= 2; i++) {
    g.add(box(0.5, 0.015, 0.055, M.pallet, palletX, palletBaseY + 0.075, palletZ + i * 0.065));
  }

  // --- Stacked cardboard boxes on pallet ---
  const cardMat = M.cardboard;
  // Bottom layer: 2 boxes
  g.add(box(0.2, 0.14, 0.22, cardMat, palletX - 0.1, palletBaseY + 0.075 + 0.07, palletZ));
  g.add(box(0.2, 0.14, 0.22, cardMat, palletX + 0.12, palletBaseY + 0.075 + 0.07, palletZ));
  // Top layer: 1 box offset
  g.add(box(0.22, 0.12, 0.2, cardMat, palletX + 0.02, palletBaseY + 0.075 + 0.14 + 0.06, palletZ));

  // Tape strips on boxes (thin lines across top)
  const tapeMat = mat(0x8B6914, 0.0, 0.7);
  g.add(box(0.005, 0.003, 0.22, tapeMat, palletX - 0.1, palletBaseY + 0.075 + 0.141, palletZ));
  g.add(box(0.005, 0.003, 0.22, tapeMat, palletX + 0.12, palletBaseY + 0.075 + 0.141, palletZ));
  g.add(box(0.005, 0.003, 0.2, tapeMat, palletX + 0.02, palletBaseY + 0.075 + 0.14 + 0.121, palletZ));

  // --- Floor marking stripe (yellow line on ground at dock edge) ---
  g.add(box(dockW + 0.2, 0.003, 0.04, M.yellow, 0, 0.002, -dockD / 2 - 0.04));

  // --- Counter display on front face of dock ---
  const counterDisplay = box(0.2, 0.12, 0.02, M.screen, 0, platformH + doorH * 0.6, -dockD / 2 + 0.03);
  counterDisplay.name = 'counterDisplay';
  g.add(counterDisplay);

  // --- Amber warning / dock light on frame ---
  const dockLightMat = mat(0xff8800, 0.1, 0.4, { emissive: 0xff6600, emissiveIntensity: 0.8 });
  const dockLight = cyl(0.04, 0.04, 0.05, 8, dockLightMat, doorW / 2 + 0.025, platformH + doorH + 0.08, dockD / 2 - 0.015);
  dockLight.name = 'dockLight';
  g.add(dockLight);

  // --- Fill group: growing pallet stack inside dock ---
  const fillGroup = new THREE.Group();
  fillGroup.name = 'fillGroup';
  const sinkPalletMat = M.pallet;
  const sinkCardMat = M.cardboard;
  const stackX = -0.45;
  const stackZ = 0.1;
  const stackBaseY = platformH;

  // 10 layers of alternating pallet slats + cardboard boxes
  for (let i = 0; i < 10; i++) {
    const layerY = stackBaseY + 0.02 + i * 0.08;
    const layerMat = i % 2 === 0 ? sinkCardMat : sinkPalletMat;
    const layerMesh = box(0.28, 0.06, 0.24, layerMat, stackX, layerY + 0.03, stackZ);
    layerMesh.name = `bin_${i}`;
    layerMesh.visible = false;
    fillGroup.add(layerMesh);
  }
  g.add(fillGroup);

  // --- Completed orders pile area ---
  const orderPile = new THREE.Group();
  orderPile.name = 'orderPile';
  const orderCardMat = M.cardboard;
  const orderBaseY = platformH + 0.01;
  const orderX = -0.55;
  const orderZ = -0.15;

  const order0 = box(0.12, 0.08, 0.10, orderCardMat, orderX, orderBaseY + 0.04, orderZ);
  order0.name = 'order_0';
  order0.visible = false;
  orderPile.add(order0);

  const order1 = box(0.12, 0.08, 0.10, orderCardMat, orderX + 0.14, orderBaseY + 0.04, orderZ + 0.02);
  order1.name = 'order_1';
  order1.visible = false;
  orderPile.add(order1);

  const order2 = box(0.10, 0.07, 0.09, orderCardMat, orderX + 0.07, orderBaseY + 0.08 + 0.035, orderZ + 0.01);
  order2.name = 'order_2';
  order2.visible = false;
  orderPile.add(order2);

  g.add(orderPile);

  // --- Status light ---
  const statusLight = createStatusLight(-dockW / 2 + 0.1, platformH + doorH + 0.05, dockD / 2 - 0.1);
  statusLight.name = 'statusLight';
  g.add(statusLight);

  // --- Spindle placeholder (required by animation system) ---
  const spindle = new THREE.Group();
  spindle.name = 'spindle';
  spindle.position.set(0, platformH + 0.3, 0);
  g.add(spindle);

  return g;
}
