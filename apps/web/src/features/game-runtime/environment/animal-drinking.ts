import * as THREE from "three";

export type Drinker = {
  joints: THREE.Bone[];
  base: THREE.Quaternion[];
  target: THREE.Vector3;
  contact: { mesh: THREE.SkinnedMesh; index: number };
};

/** Locate the actual muzzle/trunk end from the skinned mesh, rather than guessing a screen coordinate. */
export function createDrinker(model: THREE.Object3D, root: THREE.Group, kind: "deer" | "elephant"): Drinker | undefined {
  const names = kind === "deer" ? ["Head", "Neck3", "Neck2", "Neck1", "Torso3"] : ["Bone023_Armature", "Bone012_Armature", "Bone024_Armature", "Bone016_Armature", "Bone011_Armature"];
  const joints = names.map((name) => model.getObjectByName(name)).filter((node): node is THREE.Bone => node instanceof THREE.Bone);
  if (joints.length !== names.length) return;
  root.updateMatrixWorld(true);
  const points: { point: THREE.Vector3; mesh: THREE.SkinnedMesh; index: number }[] = [];
  model.traverse((node) => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    node.skeleton.update();
    const bone = node.skeleton.bones.indexOf(joints[0]);
    const indices = node.geometry.getAttribute("skinIndex"), weights = node.geometry.getAttribute("skinWeight");
    for (let i = 0; i < node.geometry.getAttribute("position").count; i++) {
      for (let j = 0; j < 4; j++) {
        if (indices.getComponent(i, j) !== bone || weights.getComponent(i, j) < 0.5) continue;
        points.push({ point: node.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(node.matrixWorld), mesh: node, index: i });
        break;
      }
    }
  });
  if (!points.length) return;
  // Deer faces +Z in its source model; the trunk endpoint is the lowest terminal-bone vertex.
  const forward = new THREE.Vector3(0, 0, 1).transformDirection(model.matrixWorld);
  points.sort(kind === "deer" ? (a, b) => b.point.dot(forward) - a.point.dot(forward) : (a, b) => a.point.y - b.point.y);
  const count = Math.max(1, Math.ceil(points.length * 0.06));
  const center = points.slice(0, count).reduce((sum, p) => sum.add(p.point), new THREE.Vector3()).divideScalar(count);
  const contact = points.slice(0, count).sort((a, b) => a.point.distanceToSquared(center) - b.point.distanceToSquared(center))[0];
  const point = contact.point;
  const target = point.clone().setY(0.002);
  const neck = joints.at(-1)!.getWorldPosition(new THREE.Vector3());
  target.x = THREE.MathUtils.lerp(target.x, neck.x, kind === "deer" ? 0.32 : 0.55);
  target.z = THREE.MathUtils.lerp(target.z, neck.z, kind === "deer" ? 0.32 : 0.55);
  const drinker: Drinker = { joints, base: joints.map((joint) => joint.quaternion.clone()), target: new THREE.Vector3(), contact };
  solveDrinkingPose(drinker, target, 1, 20);
  // A reachable endpoint becomes the near bank of the stream; feet/root never move during this calibration.
  const reached = drinkingTipPosition(drinker, new THREE.Vector3());
  drinker.target.copy(root.worldToLocal(reached)).setY(0.002);
  restoreDrinkingPose(drinker);
  return drinker;
}

/** Endpoint skin weights can span several bones; use the deformed vertex, not a rigid bone marker. */
export function drinkingTipPosition(drinker: Drinker, out: THREE.Vector3) {
  drinker.joints.at(-1)!.updateWorldMatrix(true, true);
  const { mesh, index } = drinker.contact;
  mesh.updateWorldMatrix(true, false);
  // SkinnedMesh updates its attached bind inverse in updateMatrixWorld (not updateWorldMatrix).
  // Resizes and body turns happen before rendering, so refresh it before measuring deformed vertices.
  mesh.updateMatrixWorld(true); mesh.skeleton.update();
  return mesh.getVertexPosition(index, out).applyMatrix4(mesh.matrixWorld);
}

export function restoreDrinkingPose(drinker: Drinker) {
  drinker.joints.forEach((joint, i) => joint.quaternion.copy(drinker.base[i]));
}

export function rememberDrinkingPose(drinker: Drinker) {
  drinker.joints.forEach((joint, i) => drinker.base[i].copy(joint.quaternion));
}

/** Short CCD chain only affects neck/head or trunk. Legs, ground placement and body stay intact. */
export function solveDrinkingPose(drinker: Drinker, target: THREE.Vector3, weight: number, iterations = 14) {
  if (weight <= 0) return;
  const tip = new THREE.Vector3(), pivot = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), parent = new THREE.Quaternion(), local = new THREE.Quaternion();
  for (let step = 0; step < iterations; step++) {
    if (drinkingTipPosition(drinker, tip).distanceToSquared(target) < 0.00001) break;
    for (const joint of drinker.joints) {
      joint.getWorldPosition(pivot); drinkingTipPosition(drinker, tip);
      a.subVectors(tip, pivot).normalize(); b.subVectors(target, pivot).normalize();
      rotation.setFromUnitVectors(a, b);
      const angle = 2 * Math.acos(THREE.MathUtils.clamp(rotation.w, -1, 1));
      rotation.slerp(new THREE.Quaternion(), 1 - Math.min(1, 0.12 / Math.max(angle, 0.00001)) * weight);
      joint.parent!.getWorldQuaternion(parent);
      local.copy(parent).invert().multiply(rotation).multiply(parent);
      joint.quaternion.premultiply(local);
      joint.updateWorldMatrix(false, true);
    }
  }
}
