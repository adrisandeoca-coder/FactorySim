import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * Long Pallet Conveyor — chain/roller style
 * Dramatically longer and lower than any other machine.
 * Footprint: ~2.5w x ~0.25h x ~0.7d
 */
export function buildPalletConveyor(): THREE.Group {
  const g = new THREE.Group();

  const L = 2.5;
  const W = 0.7;
  const H = 0.25;

  // ── Heavy steel frame base ──
  g.add(box(L, 0.04, W, M.bodyDark, 0, 0.02, 0));

  // ── Floor-mounted support legs every ~0.6 units ──
  const legSpacing = 0.5;
  const legCount = Math.floor(L / legSpacing) + 1;
  for (let i = 0; i < legCount; i++) {
    const lx = -L / 2 + 0.1 + i * ((L - 0.2) / (legCount - 1));
    g.add(box(0.05, H - 0.04, 0.05, M.darkChrome, lx, (H - 0.04) / 2 + 0.02, -W / 2 + 0.06));
    g.add(box(0.05, H - 0.04, 0.05, M.darkChrome, lx, (H - 0.04) / 2 + 0.02,  W / 2 - 0.06));
  }

  // ── Conveyor bed at top of legs ──
  g.add(box(L, 0.03, W - 0.12, M.bodyDark, 0, H - 0.015, 0));

  // ── Rollers across the length ──
  const rollerCount = 14;
  const rollerR = 0.018;
  const rollerLen = W - 0.18;
  for (let i = 0; i < rollerCount; i++) {
    const rx = -L / 2 + 0.08 + i * ((L - 0.16) / (rollerCount - 1));
    g.add(cyl(rollerR, rollerR, rollerLen, 8, M.chrome,
      rx, H + rollerR, 0, Math.PI / 2, 0, 0));
  }

  // ── Side guide rails ──
  g.add(cyl(0.015, 0.015, L, 8, M.pipe, 0, H + 0.04, -W / 2 + 0.06, 0, 0, Math.PI / 2));
  g.add(cyl(0.015, 0.015, L, 8, M.pipe, 0, H + 0.04,  W / 2 - 0.06, 0, 0, Math.PI / 2));

  // ── Safety yellow stripe on side rails ──
  const yellowStripe = mat(0xffcc00, 0.2, 0.6);
  g.add(box(L, 0.008, 0.008, yellowStripe, 0, H + 0.06, -W / 2 + 0.06));
  g.add(box(L, 0.008, 0.008, yellowStripe, 0, H + 0.06,  W / 2 - 0.06));

  // ── Chain guard covers along sides below roller height ──
  g.add(box(L - 0.2, 0.06, 0.02, M.bodyDark, 0, H - 0.05, -W / 2 + 0.08));
  g.add(box(L - 0.2, 0.06, 0.02, M.bodyDark, 0, H - 0.05,  W / 2 - 0.08));

  // ── 2 pallets on the conveyor ──
  const palletW = 0.5;
  const palletH = 0.04;
  const palletD = 0.4;
  const palletY = H + rollerR * 2 + palletH / 2;

  // Pallet 1 (near drive end)
  g.add(box(palletW, palletH, palletD, M.pallet, -L / 2 + 0.5, palletY, 0));
  // Pallet slats
  for (let s = 0; s < 4; s++) {
    const sz = -palletD / 2 + 0.05 + s * (palletD - 0.1) / 3;
    g.add(box(palletW, 0.005, 0.04, M.pallet, -L / 2 + 0.5, palletY + palletH / 2 + 0.003, sz));
  }

  // Pallet 2 (center-right)
  g.add(box(palletW, palletH, palletD, M.pallet, L / 2 - 0.7, palletY, 0));
  for (let s = 0; s < 4; s++) {
    const sz = -palletD / 2 + 0.05 + s * (palletD - 0.1) / 3;
    g.add(box(palletW, 0.005, 0.04, M.pallet, L / 2 - 0.7, palletY + palletH / 2 + 0.003, sz));
  }

  // ── Drive motor housing at one end ──
  const motorX = -L / 2 + 0.08;
  g.add(box(0.14, 0.1, 0.18, M.bodyGray, motorX, H / 2 + 0.02, 0));
  // Motor shaft
  g.add(cyl(0.02, 0.02, 0.12, 8, M.chrome, motorX + 0.07, H / 2 + 0.02, 0, 0, 0, Math.PI / 2));

  // ── Status light at drive end ──
  g.add(createStatusLight(-L / 2 + 0.15, H + 0.04, -W / 2 + 0.1));

  return g;
}
