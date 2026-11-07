import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Geometry cache
// ---------------------------------------------------------------------------
const geometryCache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const existing = geometryCache.get(key);
  if (existing) return existing;
  const geo = factory();
  geometryCache.set(key, geo);
  return geo;
}

/** Dispose every cached geometry and clear the cache. */
export function disposeGeometryCache(): void {
  geometryCache.forEach((g) => g.dispose());
  geometryCache.clear();
}

// ---------------------------------------------------------------------------
// Helper: 2D rounded rectangle shape
// ---------------------------------------------------------------------------
function roundedRectShape(w: number, d: number, r: number): THREE.Shape {
  const hw = w / 2;
  const hd = d / 2;
  r = Math.min(r, hw, hd);
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}

// ---------------------------------------------------------------------------
// Helper: 2D chamfered rectangle shape (octagon-like)
// ---------------------------------------------------------------------------
function chamferedRectShape(w: number, d: number, c: number): THREE.Shape {
  const hw = w / 2;
  const hd = d / 2;
  c = Math.min(c, hw, hd);
  const s = new THREE.Shape();
  s.moveTo(-hw + c, -hd);
  s.lineTo(hw - c, -hd);
  s.lineTo(hw, -hd + c);
  s.lineTo(hw, hd - c);
  s.lineTo(hw - c, hd);
  s.lineTo(-hw + c, hd);
  s.lineTo(-hw, hd - c);
  s.lineTo(-hw, -hd + c);
  s.closePath();
  return s;
}

// ---------------------------------------------------------------------------
// 1. roundedBox
// ---------------------------------------------------------------------------
/**
 * Box with rounded (filleted) edges and corners.
 * Uses ExtrudeGeometry with a rounded-rectangle cross-section.
 */
export function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius = 0.02,
  segments = 3,
): THREE.BufferGeometry {
  const key = `rbox_${width}_${height}_${depth}_${radius}_${segments}`;
  return cached(key, () => {
    const shape = roundedRectShape(width - radius * 2, depth - radius * 2, radius);
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: height - radius * 2,
      bevelEnabled: true,
      bevelSize: radius,
      bevelThickness: radius,
      bevelSegments: segments,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // ExtrudeGeometry extrudes along +Z. We want height along Y.
    geo.rotateX(-Math.PI / 2);
    // Center the geometry so origin is at the box centre.
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    geo.translate(
      -(bb.min.x + bb.max.x) / 2,
      -(bb.min.y + bb.max.y) / 2,
      -(bb.min.z + bb.max.z) / 2,
    );
    return geo;
  });
}

// ---------------------------------------------------------------------------
// 2. chamferedBox
// ---------------------------------------------------------------------------
/**
 * Box with 45-degree chamfered edges (cheaper than rounded).
 */
export function chamferedBox(
  width: number,
  height: number,
  depth: number,
  chamfer: number,
): THREE.BufferGeometry {
  const key = `cbox_${width}_${height}_${depth}_${chamfer}`;
  return cached(key, () => {
    const shape = chamferedRectShape(width - chamfer * 2, depth - chamfer * 2, chamfer);
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: height - chamfer * 2,
      bevelEnabled: true,
      bevelSize: chamfer,
      bevelThickness: chamfer,
      bevelSegments: 1,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.rotateX(-Math.PI / 2);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    geo.translate(
      -(bb.min.x + bb.max.x) / 2,
      -(bb.min.y + bb.max.y) / 2,
      -(bb.min.z + bb.max.z) / 2,
    );
    return geo;
  });
}

// ---------------------------------------------------------------------------
// 3. panelBox
// ---------------------------------------------------------------------------
/**
 * Box with inset panel lines (sheet-metal panel seam appearance).
 * Combines a slightly extruded outer frame with a recessed inner panel face.
 */
export function panelBox(
  width: number,
  height: number,
  depth: number,
  inset: number,
  panelDepth: number,
): THREE.BufferGeometry {
  const key = `pbox_${width}_${height}_${depth}_${inset}_${panelDepth}`;
  return cached(key, () => {
    // Outer shell
    const outer = new THREE.BoxGeometry(width, height, depth);

    // Front recessed panel (-Z face)
    const panelW = width - inset * 2;
    const panelH = height - inset * 2;
    const frontPanel = new THREE.PlaneGeometry(panelW, panelH);
    frontPanel.translate(0, 0, -(depth / 2 - panelDepth));

    // Back recessed panel (+Z face)
    const backPanel = new THREE.PlaneGeometry(panelW, panelH);
    backPanel.rotateY(Math.PI);
    backPanel.translate(0, 0, depth / 2 - panelDepth);

    // Left recessed panel (-X face)
    const sideH = height - inset * 2;
    const sideD = depth - inset * 2;
    const leftPanel = new THREE.PlaneGeometry(sideD, sideH);
    leftPanel.rotateY(Math.PI / 2);
    leftPanel.translate(-(width / 2 - panelDepth), 0, 0);

    // Right recessed panel (+X face)
    const rightPanel = new THREE.PlaneGeometry(sideD, sideH);
    rightPanel.rotateY(-Math.PI / 2);
    rightPanel.translate(width / 2 - panelDepth, 0, 0);

    const merged = mergeGeometries([outer, frontPanel, backPanel, leftPanel, rightPanel]);
    if (!merged) return outer;

    // Clean up temporaries
    outer.dispose();
    frontPanel.dispose();
    backPanel.dispose();
    leftPanel.dispose();
    rightPanel.dispose();

    return merged;
  });
}

// ---------------------------------------------------------------------------
// 4. roundedCylinder
// ---------------------------------------------------------------------------
/**
 * Cylinder with filleted top and bottom edges via LatheGeometry.
 */
export function roundedCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments = 16,
  filletRadius = 0.01,
): THREE.BufferGeometry {
  const key = `rcyl_${radiusTop}_${radiusBottom}_${height}_${radialSegments}_${filletRadius}`;
  return cached(key, () => {
    const hh = height / 2;
    const fr = Math.min(filletRadius, hh, radiusTop, radiusBottom);
    const arcSegs = 5;

    const points: THREE.Vector2[] = [];

    // Bottom centre -> bottom outer edge with fillet
    points.push(new THREE.Vector2(0, -hh));
    // Bottom fillet arc
    for (let i = 0; i <= arcSegs; i++) {
      const a = Math.PI / 2 + (Math.PI / 2) * (i / arcSegs);
      const px = radiusBottom - fr + Math.cos(a) * fr;
      const py = -hh + fr + Math.sin(a) * fr;
      points.push(new THREE.Vector2(Math.max(0, px), py));
    }

    // Straight wall (bottom to top)
    points.push(new THREE.Vector2(radiusBottom, -hh + fr));
    points.push(new THREE.Vector2(radiusTop, hh - fr));

    // Top fillet arc
    for (let i = 0; i <= arcSegs; i++) {
      const a = -Math.PI / 2 * (i / arcSegs);
      const px = radiusTop - fr + Math.cos(a) * fr;
      const py = hh - fr + Math.sin(a) * fr;
      points.push(new THREE.Vector2(Math.max(0, px), py));
    }

    // Top centre
    points.push(new THREE.Vector2(0, hh));

    const geo = new THREE.LatheGeometry(points, radialSegments);
    return geo;
  });
}

// ---------------------------------------------------------------------------
// 5. tubeRail
// ---------------------------------------------------------------------------
/**
 * Extruded C-channel / rectangular tube profile.
 */
export function tubeRail(
  length: number,
  profileWidth: number,
  profileHeight: number,
  wallThickness: number,
): THREE.BufferGeometry {
  const key = `trail_${length}_${profileWidth}_${profileHeight}_${wallThickness}`;
  return cached(key, () => {
    const hw = profileWidth / 2;
    const hh = profileHeight / 2;
    const t = wallThickness;

    // Outer rectangle shape with inner hole (C-channel: open on +X side)
    const shape = new THREE.Shape();
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, -hh + t);
    shape.lineTo(-hw + t, -hh + t);
    shape.lineTo(-hw + t, hh - t);
    shape.lineTo(hw, hh - t);
    shape.lineTo(hw, hh);
    shape.lineTo(-hw, hh);
    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: length,
      bevelEnabled: false,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Extrude along Z; centre the geometry
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    geo.translate(
      -(bb.min.x + bb.max.x) / 2,
      -(bb.min.y + bb.max.y) / 2,
      -(bb.min.z + bb.max.z) / 2,
    );
    return geo;
  });
}

// ---------------------------------------------------------------------------
// 6. boltHead
// ---------------------------------------------------------------------------
/**
 * Hexagonal bolt head (6-sided prism with a slight chamfer ring on top).
 */
export function boltHead(radius: number, height: number): THREE.BufferGeometry {
  const key = `bolt_${radius}_${height}`;
  return cached(key, () => {
    const chamfer = height * 0.15;
    // Main hex body
    const body = new THREE.CylinderGeometry(radius, radius, height - chamfer, 6);
    body.translate(0, -(chamfer / 2), 0);

    // Top chamfer ring (tapered hex)
    const cap = new THREE.CylinderGeometry(radius * 0.85, radius, chamfer, 6);
    cap.translate(0, (height - chamfer) / 2, 0);

    const merged = mergeGeometries([body, cap]);
    body.dispose();
    cap.dispose();

    if (!merged) {
      return new THREE.CylinderGeometry(radius, radius, height, 6);
    }

    // Centre
    merged.computeBoundingBox();
    const bb = merged.boundingBox!;
    merged.translate(0, -(bb.min.y + bb.max.y) / 2, 0);
    return merged;
  });
}

// ---------------------------------------------------------------------------
// 7. knurledCylinder
// ---------------------------------------------------------------------------
/**
 * Cylinder with diamond knurl pattern (like adjustment knobs).
 * Displaces vertices in a diamond pattern on the outer wall.
 */
export function knurledCylinder(
  radius: number,
  height: number,
  knurlCount = 20,
): THREE.BufferGeometry {
  const key = `knurl_${radius}_${height}_${knurlCount}`;
  return cached(key, () => {
    const heightSegments = knurlCount;
    const radialSegments = knurlCount * 2;
    const geo = new THREE.CylinderGeometry(radius, radius, height, radialSegments, heightSegments);

    const pos = geo.attributes.position;
    const depth = radius * 0.06;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      // Skip top/bottom cap vertices (approximately)
      const dist = Math.sqrt(x * x + z * z);
      if (dist < radius * 0.1) continue;

      const angle = Math.atan2(z, x);
      const yNorm = (y / height + 0.5) * knurlCount * Math.PI;
      const pattern = Math.sin(angle * knurlCount + yNorm) * Math.sin(angle * knurlCount - yNorm);
      const displacement = pattern * depth;

      const newDist = dist + displacement;
      const scale = newDist / dist;
      pos.setX(i, x * scale);
      pos.setZ(i, z * scale);
    }

    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  });
}

// ---------------------------------------------------------------------------
// Convenience mesh builders (drop-in replacements for box/cyl in helpers.ts)
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for `box()` from helpers.ts but with rounded edges.
 * Fillet radius = min(w, h, d) * 0.06.
 */
export function rbox(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const r = Math.min(w, h, d) * 0.06;
  const m = new THREE.Mesh(roundedBox(w, h, d, r), mat);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Drop-in replacement for `cyl()` from helpers.ts but with filleted edges.
 */
export function rcyl(
  rt: number,
  rb: number,
  h: number,
  seg: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const fr = Math.min(rt, rb, h / 2) * 0.06;
  const m = new THREE.Mesh(roundedCylinder(rt, rb, h, seg, fr), mat);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
