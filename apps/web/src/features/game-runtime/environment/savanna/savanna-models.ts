import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SavannaRig } from "./savanna-scene-config";

export type SavannaPartName = "body" | "head" | "tail";
export const savannaPartName = (part: SavannaPartName) => `savanna-part:${part}`;

export interface SavannaTemplate {
  /** Y-up, base on y = 0, source origin (trunk / body centre) on x = z = 0, facing +Z. Clone per instance. */
  object: THREE.Group;
  size: THREE.Vector3;
}

type Bucket = { part: SavannaPartName; material: THREE.Material; geometries: THREE.BufferGeometry[] };

/**
 * Converts one Z-up savanna GLB into a reusable template without touching its materials or colours.
 * Static meshes are merged per part and material (59 giraffe meshes become 3 draw calls), while the
 * optional head/tail parts get their own pivot so they can move without a skeleton.
 */
export function buildSavannaTemplate(source: THREE.Object3D, rig?: SavannaRig): SavannaTemplate {
  source.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(source);
  const owner = new Map<string, SavannaPartName>();
  for (const part of ["head", "tail"] as const) for (const name of rig?.[part]?.meshes ?? []) owner.set(name, part);

  const buckets = new Map<string, Bucket>();
  const loose: { part: SavannaPartName; mesh: THREE.Mesh }[] = [];
  source.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const part = owner.get(node.name) ?? "body";
    const geometry = (node.geometry as THREE.BufferGeometry).clone().applyMatrix4(node.matrixWorld);
    if (Array.isArray(node.material)) {
      // Multi-material meshes keep their groups; they are rare and are simply not merged.
      loose.push({ part, mesh: new THREE.Mesh(geometry, node.material) });
      return;
    }
    const signature = [part, node.material.uuid, geometry.index ? "indexed" : "flat", Object.keys(geometry.attributes).sort().join(",")].join("|");
    const bucket: Bucket = buckets.get(signature) ?? { part, material: node.material, geometries: [] };
    bucket.geometries.push(geometry);
    buckets.set(signature, bucket);
  });

  const inner = new THREE.Group();
  inner.position.z = -sourceBounds.min.z;
  const parts = new Map<SavannaPartName, THREE.Group>();
  const partGroup = (part: SavannaPartName) => {
    let group = parts.get(part);
    if (!group) {
      group = new THREE.Group();
      group.name = savannaPartName(part);
      const pivot = part === "body" ? undefined : rig?.[part]?.pivot;
      if (pivot) group.position.set(pivot[0], pivot[1], pivot[2]);
      parts.set(part, group);
      inner.add(group);
    }
    return group;
  };
  const place = (part: SavannaPartName, mesh: THREE.Mesh) => {
    const group = partGroup(part);
    mesh.position.copy(group.position).negate();
    group.add(mesh);
  };
  for (const bucket of buckets.values()) {
    const merged = bucket.geometries.length > 1 ? mergeGeometries(bucket.geometries) : bucket.geometries[0];
    if (merged && merged !== bucket.geometries[0]) bucket.geometries.forEach((geometry) => geometry.dispose());
    if (merged) place(bucket.part, new THREE.Mesh(merged, bucket.material));
    else bucket.geometries.forEach((geometry) => place(bucket.part, new THREE.Mesh(geometry, bucket.material)));
  }
  loose.forEach(({ part, mesh }) => place(part, mesh));

  // Z-up source -> Y-up scene: (x, y, z) becomes (x, z, -y), so the -Y face looks at the camera (+Z).
  const upright = new THREE.Group();
  upright.rotation.x = -Math.PI / 2;
  upright.add(inner);
  const object = new THREE.Group();
  object.add(upright);
  object.updateMatrixWorld(true);
  return { object, size: new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()) };
}

let loader: GLTFLoader | undefined;
const templates = new Map<string, Promise<SavannaTemplate>>();

/** One download/parse per URL for the page lifetime; instances clone the template and share GPU data. */
export function loadSavannaTemplate(url: string, rig?: SavannaRig): Promise<SavannaTemplate> {
  let pending = templates.get(url);
  if (!pending) {
    loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    pending = loader.loadAsync(url).then((gltf) => buildSavannaTemplate(gltf.scene, rig));
    pending.catch(() => templates.delete(url));
    templates.set(url, pending);
  }
  return pending;
}
