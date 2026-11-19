import * as THREE from "three";
import { birdFlight } from "./scenery-motion";

/** Small code-native low-poly decorations; no image or model downloads. */
export function createSkyAccents(camera: THREE.Camera) {
  const group = new THREE.Group();
  group.name = "forest-sky-accents";
  const sun = new THREE.Group();
  sun.name = "smiling-sun";
  sun.quaternion.copy(camera.quaternion);
  const gold = new THREE.MeshBasicMaterial({ color: "#ffd26d" });
  const rayMaterial = new THREE.MeshBasicMaterial({ color: "#ffe5a2" });
  const ink = new THREE.MeshBasicMaterial({ color: "#7a5940" });
  const blush = new THREE.MeshBasicMaterial({ color: "#f5a581" });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), gold);
  core.scale.z = 0.30;
  sun.add(core);
  const rays = new THREE.Group();
  const rayGeometry = new THREE.ConeGeometry(0.085, 0.30, 5);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const ray = new THREE.Mesh(rayGeometry, rayMaterial);
    ray.position.set(Math.cos(a) * 1.26, Math.sin(a) * 1.26, 0);
    ray.rotation.z = a - Math.PI / 2;
    rays.add(ray);
  }
  sun.add(rays);
  const eyeGeometry = new THREE.CircleGeometry(0.055, 12);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, ink);
    eye.position.set(side * 0.27, 0.12, 0.32);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), blush);
    cheek.position.set(side * 0.47, -0.12, 0.30);
    sun.add(eye, cheek);
  }
  const smile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.23, -0.14, 0.33), new THREE.Vector3(0, -0.29, 0.33), new THREE.Vector3(0.23, -0.14, 0.33),
  ]);
  sun.add(new THREE.Mesh(new THREE.TubeGeometry(smile, 16, 0.022, 5, false), ink));
  group.add(sun);

  const wing = new THREE.BufferGeometry();
  wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.45, 0.18, 0, 0.30, -0.055, 0], 3));
  const birdMaterial = new THREE.MeshBasicMaterial({ color: "#577783", side: THREE.DoubleSide });
  const birds = Array.from({ length: 3 }, (_, index) => {
    const root = new THREE.Group(); root.name = `passing-bird-${index}`;
    root.quaternion.copy(camera.quaternion);
    const left = new THREE.Mesh(wing, birdMaterial);
    const right = new THREE.Mesh(wing, birdMaterial); right.scale.x = -1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 5), birdMaterial);
    body.scale.set(1.5, 0.7, 0.65);
    root.add(left, right, body); root.visible = false; group.add(root);
    return { root, left, right };
  });

  function update(width: number, height: number, time: number, reduced: boolean) {
    // Project at a far depth so tree crowns can occlude the sun and birds naturally.
    const tilt = THREE.MathUtils.degToRad(12);
    const depth = -180;
    const put = (object: THREE.Object3D, x: number, y: number) => {
      object.position.set((x - 0.5) * width, ((0.5 - y) * height + Math.sin(tilt) * depth) / Math.cos(tilt), depth);
    };
    const radius = Math.min(height * 0.043, width * 0.060);
    sun.scale.setScalar(radius);
    put(sun, width < 650 ? 0.83 : 0.88, 0.073 + (reduced ? 0 : Math.sin(time * 0.35) * 0.002));
    rays.rotation.z = reduced ? 0 : Math.sin(time * 0.12) * 0.08;
    birds.forEach((bird, index) => {
      const pose = birdFlight(time, index);
      bird.root.visible = !reduced && pose.visible;
      put(bird.root, pose.x, pose.y);
      bird.root.scale.setScalar(Math.min(height * 0.037, width * 0.065));
      bird.left.rotation.z = pose.flap;
      bird.right.rotation.z = -pose.flap;
    });
  }
  return { group, update };
}
