import * as THREE from "three";

/** `underwater`: the animal swims under the near surface and is seen through the water (the orca). */
export type PickSphere = { center: THREE.Vector3; radius: number; underwater?: boolean };

const hit = new THREE.Vector3();
const globe = new THREE.Sphere(new THREE.Vector3(), 1);
const core = new THREE.Sphere(new THREE.Vector3(), 1);
const probe = new THREE.Sphere();

/**
 * Index of the nearest sphere the ray enters, or null. Spheres are deliberately larger than the
 * animals (small fingers); the globe body (radius `globeRadius` at the origin) hides anything behind
 * or inside it. Underwater swimmers are seen through the water, so for them only the globe's inner core
 * (60% of the radius) hides what lies beyond: one under the near surface is tappable, one under the far side not.
 */
export function pickFriend(ray: THREE.Ray, spheres: readonly PickSphere[], globeRadius: number): number | null {
  globe.radius = globeRadius;
  const blocked = ray.intersectSphere(globe, hit) ? hit.distanceTo(ray.origin) : Infinity;
  core.radius = globeRadius * 0.6;
  const blockedUnder = ray.intersectSphere(core, hit) ? hit.distanceTo(ray.origin) : Infinity;
  let best: number | null = null;
  let bestDistance = Infinity;
  spheres.forEach((sphere, index) => {
    if (!ray.intersectSphere(probe.set(sphere.center, sphere.radius), hit)) return;
    const distance = hit.distanceTo(ray.origin);
    if (distance < bestDistance && distance < (sphere.underwater ? blockedUnder : blocked)) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
