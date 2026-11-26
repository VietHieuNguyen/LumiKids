import * as THREE from "three";

/** A small low-poly penguin for the ocean edge; decoration, never a counted learning object. */
export function createOceanPenguin(): THREE.Group {
  const root = new THREE.Group();
  root.name = "OceanPenguin";
  const dark = new THREE.MeshStandardMaterial({
    color: 0x263441,
    roughness: 0.9,
  });
  const white = new THREE.MeshStandardMaterial({
    color: 0xfffbec,
    roughness: 0.9,
  });
  const orange = new THREE.MeshStandardMaterial({
    color: 0xf3aa43,
    roughness: 0.8,
  });
  const sphere = new THREE.SphereGeometry(1, 10, 7);
  const part = (
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) => {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    root.add(mesh);
    return mesh;
  };
  part(dark, 0, 0.92, 0, 0.61, 0.86, 0.5);
  part(white, 0, 0.91, 0.42, 0.47, 0.72, 0.13);
  part(dark, 0, 1.75, 0.02, 0.46, 0.46, 0.43);
  part(white, -0.17, 1.76, 0.35, 0.23, 0.29, 0.1);
  part(white, 0.17, 1.76, 0.35, 0.23, 0.29, 0.1);
  part(dark, -0.18, 1.83, 0.45, 0.055, 0.065, 0.035);
  part(dark, 0.18, 1.83, 0.45, 0.055, 0.065, 0.035);
  part(white, -0.19, 1.85, 0.48, 0.015, 0.02, 0.01);
  part(white, 0.17, 1.85, 0.48, 0.015, 0.02, 0.01);
  part(dark, -0.62, 0.95, 0, 0.14, 0.5, 0.19).rotation.z = -0.3;
  part(dark, 0.62, 0.95, 0, 0.14, 0.5, 0.19).rotation.z = 0.3;
  part(orange, -0.25, 0.08, 0.17, 0.24, 0.08, 0.32);
  part(orange, 0.25, 0.08, 0.17, 0.24, 0.08, 0.32);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 5), orange);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 1.69, 0.51);
  root.add(beak);
  return root;
}
