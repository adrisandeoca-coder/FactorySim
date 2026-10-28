import * as THREE from 'three';

/**
 * WorkObject helpers — re-parent products between frames while preserving
 * world transform. This is the "snap-on" parenting that makes pick-and-place
 * look real: a part moves from a station's surface to a robot tool flange to
 * a conveyor TCP to an AGV bed without teleporting.
 *
 * Pattern matches Visual Components' "Component containers" / Unity's transform
 * reparenting with world-space preservation.
 */

const _matrixWorld = new THREE.Matrix4();
const _parentInv = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

/**
 * Move `child` so its current world transform is preserved, but its parent
 * becomes `newParent`. If `newParent` is null, the child is detached and
 * placed at world origin (the caller can re-add it elsewhere).
 */
export function reparent(child: THREE.Object3D, newParent: THREE.Object3D | null): void {
  // Cache child world transform.
  child.updateWorldMatrix(true, false);
  _matrixWorld.copy(child.matrixWorld);

  // Detach.
  if (child.parent) child.parent.remove(child);

  if (newParent) {
    // Compute child's local transform in newParent's frame.
    newParent.updateWorldMatrix(true, false);
    _parentInv.copy(newParent.matrixWorld).invert();
    _local.multiplyMatrices(_parentInv, _matrixWorld);
    _local.decompose(_pos, _quat, _scale);
    child.position.copy(_pos);
    child.quaternion.copy(_quat);
    child.scale.copy(_scale);
    newParent.add(child);
  } else {
    _matrixWorld.decompose(_pos, _quat, _scale);
    child.position.copy(_pos);
    child.quaternion.copy(_quat);
    child.scale.copy(_scale);
  }

  child.updateMatrix();
  child.updateWorldMatrix(false, true);
}

/**
 * Snap `payload` onto a tool/TCP frame at a local offset (e.g. gripper holds
 * the part 0.05 m above its flange). Equivalent to reparent + setting local
 * transform directly — useful when you don't care about preserving prior pose.
 */
export function snapTo(
  payload: THREE.Object3D,
  frame: THREE.Object3D,
  localOffset?: THREE.Vector3,
  localRotation?: THREE.Euler,
): void {
  if (payload.parent) payload.parent.remove(payload);
  frame.add(payload);
  payload.position.copy(localOffset ?? new THREE.Vector3(0, 0, 0));
  if (localRotation) payload.rotation.copy(localRotation);
  else payload.rotation.set(0, 0, 0);
  payload.scale.set(1, 1, 1);
  payload.updateMatrix();
  payload.updateWorldMatrix(false, true);
}
