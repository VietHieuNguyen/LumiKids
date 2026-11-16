/**
 * Landing-page asset manifest. Each GLB under /models/landing is the optimised (meshopt/webp)
 * copy of the editable source with the same name in /models/source (e.g. source/valley.glb ->
 * landing/valley.glb); source/valley-kit and source/duck-pack hold the original asset packs.
 */
export const LANDING_ASSETS = {
  valley: "/models/landing/valley.glb",
  rabbit: "/models/landing/rabbit.glb",
  bear: "/models/landing/bear.glb",
  /** Liray 3D "Mallard Duck" (Fab Standard licence), LOD1 decimated to ~9k tris with Idle/Swim/Quack/Flap/Blink. */
  duck: "/models/landing/duck.glb",
  /** LumiKids Deep Forest Fern, decimated in Blender to ~20k tris (webp textures). */
  fern: "/models/landing/fern.glb",
  /** "Elephant" by Ozor (Sketchfab, CC BY 4.0): decimated 526k → 26k tris; Walking replaced by a baked Idle loop. */
  elephant: "/models/landing/elephant.glb",
  /** "Dog Puppy" by kenchoo (Sketchfab, CC BY 4.0): its idle clip plus a baked tail wag. */
  dog: "/models/landing/dog.glb",
  /** "Cattail Plant" by SXuno (Sketchfab, CC BY 4.0), webp textures. */
  cattail: "/models/landing/cattail.glb",
  /** LumiKids low-poly birches ("Tree 1", "Tree 2"): generated flat-shaded trunks and leaf blobs, vertex colours only. */
  birch: "/models/landing/birch.glb",
  /** "Deer" by Quaternius (Poly Pizza, CC0): reshaped into a fawn (bigger head and eyes, white spots), Idle/Eating/Jump_toIdle. */
  deer: "/models/landing/deer.glb",
  /** "Frog" by Quaternius (Poly Pizza, CC0): decimated to ~2k flat-shaded tris, new round eyes and cheeks, Idle/Jump. */
  frog: "/models/landing/frog.glb",
  poster: "/models/landing/poster.webp",
  gameImages: {
    shadowMatch: { subject: "/game-demo/cat.svg", shadow: "/game-demo/cat-shadow.svg", other: "/game-demo/dog-shadow.svg" },
    counting: { item: "/game-demo/apple.svg" },
    classification: { red: "/game-demo/ball-red.svg", blue: "/game-demo/ball-blue.svg", basketRed: "/game-demo/basket-red.svg", basketBlue: "/game-demo/basket-blue.svg" },
  },
} as const;

export type CharacterId = "rabbit" | "bear";

/** Where each character stands on the trail plateau (world X/Z; Y is raycast onto the ground). */
export const CHARACTER_PLACEMENT: Record<CharacterId, { x: number; z: number; height: number; faceOffsetDeg: number }> = {
  rabbit: { x: 0.25, z: 3.45, height: 0.5, faceOffsetDeg: -10 },
  bear: { x: -1.0, z: 2.65, height: 0.66, faceOffsetDeg: 14 },
};

/**
 * Rabbit and Bear again at the summit, on the flat rock beside the top spring (sampled in Blender: level,
 * unobstructed from the summit camera). They turn to the camera and wave goodbye.
 */
export const SUMMIT_FRIENDS: Record<CharacterId, { x: number; z: number }> = {
  rabbit: { x: 5.5, z: -8.5 },
  // Clear of the pine at (4.9, -8.1), which hid half of Bear from the summit camera.
  bear: { x: 4.25, z: -7.7 },
};

/**
 * Fern clumps (world X/Z; Y is raycast onto the ground). Positions are flat ground sampled in
 * Blender: the plateau rim either side of the duck-pond waterfall, the low islet beside the pond,
 * and the front of the trail where the camera brushes past them on the way to Rabbit and Bear.
 */
export const FERN_PLACEMENT: readonly { x: number; z: number; height: number; yawDeg: number }[] = [
  { x: -2.5, z: 6.0, height: 0.36, yawDeg: 20 },
  { x: -2.15, z: 6.05, height: 0.27, yawDeg: 160 },
  { x: 0.5, z: 5.65, height: 0.38, yawDeg: 75 },
  { x: 2.3, z: 5.7, height: 0.34, yawDeg: 210 },
  { x: -0.4, z: 5.65, height: 0.3, yawDeg: 300 },
  { x: 2.9, z: 5.35, height: 0.36, yawDeg: 35 },
  { x: 3.4, z: 4.85, height: 0.3, yawDeg: 120 },
  { x: -1.2, z: 4.55, height: 0.4, yawDeg: 250 },
  { x: 0.55, z: 4.45, height: 0.36, yawDeg: 100 },
];

export type AnimalId = "elephant" | "dog" | "deer";

/**
 * Animals outside the interactive encounter. `forward` is the model's facing axis; `faceShot` names
 * the camera shot the animal turns towards (plus `faceOffsetDeg`), so it reads well when the camera settles.
 */
export const ANIMAL_PLACEMENT: Record<AnimalId, { x: number; z: number; height: number; forward: "x" | "z"; faceShot: string; faceOffsetDeg: number; clip?: string }> = {
  // On the low sandy bank at the foot of the right-hand waterfall (built in Blender as "Elephant Bank").
  elephant: { x: 7.15, z: 6.1, height: 0.8, forward: "x", faceShot: "elephant", faceOffsetDeg: -40 },
  // Beside the trail cabin, on the open side the cabin shot looks at.
  dog: { x: 0.55, z: 0.45, height: 0.34, forward: "z", faceShot: "cabin", faceOffsetDeg: 20 },
  // On the grass at the far bank of the stream on the terrace above the cabin. Seen from the climb shot its body
  // lies along the 11:45 line, head towards the water (and the camera), and it dips its head to drink.
  deer: { x: 3.96, z: -3.62, height: 0.62, forward: "z", faceShot: "climb", faceOffsetDeg: 7.5, clip: "Eating" },
};

/**
 * Lily pads in the calm water at the foot of the cliff behind the duck pond (lake surface y = 0): outside
 * the ducks' loops and the plunge foam, and inside both the landscape and the portrait pond framing.
 * The frog starts on the first and hops pad to pad when tapped; the last, smallest one carries a lotus.
 */
export const LILY_PADS: readonly { x: number; z: number; radius: number; yawDeg: number }[] = [
  { x: 3.65, z: 6.2, radius: 0.28, yawDeg: 30 },
  { x: 4.25, z: 6.05, radius: 0.24, yawDeg: 140 },
  { x: 3.15, z: 6.38, radius: 0.24, yawDeg: 250 },
  { x: 4.6, z: 6.45, radius: 0.19, yawDeg: 320 },
];

/** The frog's size (bind-pose height) and which pads it hops between, in order. */
export const FROG = { height: 0.15, route: [0, 1, 0, 2] } as const;

/**
 * Small cattail clumps in the shallows around the duck pond (terrain within a few cm of the water line,
 * sampled in Blender). They stay low and off the ducks' loop and the waterfall plunge.
 */
export const CATTAIL_CLUSTERS: readonly { x: number; z: number; count: number; height: number; seed: number }[] = [
  { x: 3.2, z: 5.85, count: 4, height: 0.5, seed: 1 },
  { x: 4.5, z: 5.45, count: 3, height: 0.42, seed: 2 },
  { x: 5.05, z: 5.3, count: 2, height: 0.36, seed: 3 },
  { x: -2.05, z: 6.45, count: 4, height: 0.46, seed: 4 },
  { x: -3.05, z: 6.5, count: 3, height: 0.4, seed: 5 },
  { x: 7.9, z: 5.25, count: 3, height: 0.48, seed: 7 },
];

/** The two birches in birch.glb ("Tree 1", "Tree 2"), at the back of the elephant's bank against the cliff. */
export const BIRCH_PLACEMENT: readonly { node: string; x: number; z: number; height: number; yawDeg: number }[] = [
  { node: "Tree 1", x: 7.95, z: 5.45, height: 1.9, yawDeg: 0 },
  { node: "Tree 2", x: 8.45, z: 5.95, height: 1.55, yawDeg: 70 },
];
