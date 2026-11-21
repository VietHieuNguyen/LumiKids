import * as THREE from "three";

export type PickSphere = { center: THREE.Vector3; radius: number };

const hit = new THREE.Vector3();
const globe = new THREE.Sphere(new THREE.Vector3(), 1);
const probe = new THREE.Sphere();

/**
 * Index of the nearest sphere the ray enters, or null. Spheres are deliberately larger than the
 * animals (small fingers); the globe body (radius `globeRadius` at the origin) hides anything behind
 * or inside it.
 */
export function pickFriend(ray: THREE.Ray, spheres: readonly PickSphere[], globeRadius: number): number | null {
  globe.radius = globeRadius;
  const blocked = ray.intersectSphere(globe, hit) ? hit.distanceTo(ray.origin) : Infinity;
  let best: number | null = null;
  let bestDistance = Infinity;
  spheres.forEach((sphere, index) => {
    if (!ray.intersectSphere(probe.set(sphere.center, sphere.radius), hit)) return;
    const distance = hit.distanceTo(ray.origin);
    if (distance < bestDistance && distance < blocked) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
