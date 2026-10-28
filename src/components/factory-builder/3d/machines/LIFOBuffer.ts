import * as THREE from 'three';
import { box, cyl, createStatusLight } from '../shared/helpers';
import { M, mat } from '../shared/materials';

/**
 * LIFO (Last-In-First-Out) Stack Buffer
 * Vertical column/tower with guide posts and stacked parts.
 * Footprint: ~0.5w x ~1.1h x ~0.5d
 */
export function buildLIFOBuffer(): THREE.Group {
  const g = new THREE.Group();

  // ── Square base platform ──
  g.add(box(0.5, 0.04, 0.5, M.bodyDark, 0, 0.02, 0));

  // ── 4 corner guide posts ──
  const postR = 0.03;
  const postH = 0.9;
  const postOffset = 0.18;
  const postPositions: [number, number][] = [
    [-postOffset, -postOffset],
    [ postOffset, -postOffset],
    [-postOffset,  postOffset],
    [ postOffset,  postOffset],
  ];
  for (const [px, pz] of postPositions) {
    g.add(cyl(postR, postR, postH, 8, M.pipe, px, 0.04 + postH / 2, pz));
  }

  // ── Cross braces at top between posts ──
  const braceY = 0.04 + postH;
  // Front and back braces
  g.add(cyl(0.012, 0.012, postOffset * 2, 6, M.pipe,
    0, braceY, -postOffset, 0, 0, Math.PI / 2));
  g.add(cyl(0.012, 0.012, postOffset * 2, 6, M.pipe,
    0, braceY, postOffset, 0, 0, Math.PI / 2));
  // Left and right braces
  g.add(cyl(0.012, 0.012, postOffset * 2, 6, M.pipe,
    -postOffset, braceY, 0, Math.PI / 2, 0, 0));
  g.add(cyl(0.012, 0.012, postOffset * 2, 6, M.pipe,
    postOffset, braceY, 0, Math.PI / 2, 0, 0));

  // ── Stack of parts (fillGroup) ──
  const fillGroup = new THREE.Group();
  fillGroup.name = 'fillGroup';

  const binColors = [
    mat(0x3b82f6, 0.2, 0.6),  // blue
    mat(0x22aa55, 0.15, 0.6), // green
    mat(0xcc8822, 0.15, 0.6), // amber
    mat(0xdd2222, 0.1, 0.5),  // red
    mat(0x8b5cf6, 0.2, 0.6),  // purple
  ];
  const binW = 0.3;
  const binH = 0.08;
  const binD = 0.3;

  for (let i = 0; i < 5; i++) {
    const by = 0.04 + 0.02 + binH / 2 + i * (binH + 0.02);
    const binMesh = box(binW, binH, binD, binColors[i], 0, by, 0);
    binMesh.name = `bin_${i}`;
    fillGroup.add(binMesh);
  }
  g.add(fillGroup);

  // ── Push plate at top ──
  const plateY = 0.04 + 0.02 + 5 * (binH + 0.02) + 0.02;
  g.add(box(0.32, 0.02, 0.32, M.chrome, 0, plateY, 0));

  // ── Status light on one corner post top ──
  g.add(createStatusLight(postOffset, 0.04 + postH, -postOffset));

  return g;
}
