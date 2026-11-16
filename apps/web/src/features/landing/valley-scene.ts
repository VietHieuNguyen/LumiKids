import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CAMERA_SHOTS, STORY, progressToShot } from "./camera-path";
import type { CameraShot } from "./camera-path";
import { ANIMAL_PLACEMENT, BIRCH_PLACEMENT, CATTAIL_CLUSTERS, CHARACTER_PLACEMENT, FERN_PLACEMENT, FROG, LANDING_ASSETS, LILY_PADS, SUMMIT_FRIENDS } from "./landing-assets";
import type { AnimalId, CharacterId } from "./landing-assets";
import { createSharedUniforms, patchSurface, setTerrainLite, surfaceForMaterial, tuneMaterial } from "./valley-materials";
import type { FernUniforms, SharedUniforms, SurfaceKind } from "./valley-materials";
import { clamp, lerp } from "./scroll-math";

export type StageQuality = "high" | "low";

export type ScreenAnchor = { x: number; y: number; visible: boolean };

/** Every animal a visitor can tap. */
export type FriendId = CharacterId | AnimalId | "duck" | "frog";

/** A tappable animal: where it is, how big, and what to nudge when it reacts. */
type Friend = {
  id: FriendId;
  /** World position comes from here (the ducks' moves every frame). */
  anchor: THREE.Object3D;
  /** Node that hops and squashes; nothing else animates its transform. */
  object: THREE.Object3D;
  height: number;
  baseY: number;
  baseRotY: number;
  baseScale: THREE.Vector3;
  mixer: THREE.AnimationMixer | null;
  /** Its own extra move when tapped (the ducks quack or flap); without one the idle clip just speeds up. */
  onPoke: (() => void) | null;
  /** The tap reaction moves it on its own (the frog hops to another pad), so skip the generic bounce. */
  ownMotion: boolean;
  /** Seconds (render clock) when the current reaction began, or -1. */
  started: number;
  shown: () => boolean;
};

const REACTION_SECONDS = 0.95;
/** One frog hop: crouch, arc to the next pad, land (the Jump clip is stretched to fit). */
const FROG_HOP_SECONDS = 0.8;
/** Top of a lily pad above the lake surface (y = 0). */
const PAD_Y = 0.012;

type LilyPad = { root: THREE.Group; base: THREE.Vector3; radius: number; phase: number; kicked: number };

type FrogRig = {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction | null;
  jump: THREE.AnimationAction | null;
  /** Index into FROG.route of the pad it sits on (or is leaving). */
  step: number;
  hopStart: number;
  fromHeading: number;
  toHeading: number;
};

type CharacterRig = {
  root: THREE.Group;
  body: THREE.Group;
  height: number;
  phase: number;
};

type Bird = { root: THREE.Group; left: THREE.Mesh; right: THREE.Mesh; radius: number; height: number; speed: number; phase: number };

type Duck = {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  radius: number;
  speed: number;
  phase: number;
};

const SKY_FOG = new THREE.Color("#e4f2f4");
/** Evening palette for the farewell shot (matches the page's dusk gradient). */
const DUSK_FOG = new THREE.Color("#f2dfcb");
const KEY_DAY = new THREE.Color("#fff5de");
const KEY_DUSK = new THREE.Color("#ffc58c");
const HEMI_SKY_DAY = new THREE.Color("#f1faff");
const HEMI_SKY_DUSK = new THREE.Color("#f6e2d2");
/** Scroll progress over which the light turns to evening (the climb past the summit). */
const DUSK_RANGE = [STORY.duskStart, STORY.farewellHold[0]] as const;
/** Birds circle here: in the evening sky of the farewell shot (above the island as seen from that camera). */
const FLOCK_CENTRE = new THREE.Vector3(-7.5, 0, -6);
/** Direction from the scene towards the key light (upper left, slightly in front). */
const KEY_LIGHT_DIR = new THREE.Vector3(-14, 22, 12).normalize();
/** Ducks paddle in slow loops on the pond below the twin waterfalls (lake surface is y = 0). */
const POND = { center: new THREE.Vector3(3.7, 0, 7.7), scale: 0.44, ducks: [
  { radius: 0.85, speed: 0.17, phase: 0 },
  { radius: 0.85, speed: 0.17, phase: 0.7 },
  { radius: 0.45, speed: -0.22, phase: 2.1 },
] } as const;
/** Where the two lake waterfalls hit the water (centroid of the lowest cascade vertices, from Blender). */
const PLUNGE: readonly { point: THREE.Vector3; radius: number }[] = [
  { point: new THREE.Vector3(6.93, 0.02, 4.34), radius: 0.95 },
  { point: new THREE.Vector3(1.53, 0.02, 6.92), radius: 0.72 },
];
const CHARACTER_IDS: readonly CharacterId[] = ["rabbit", "bear"];

type Animal = {
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
};

/** Small deterministic PRNG so cattail clumps look hand-placed but never change between loads. */
function mulberry32(seed: number): () => number {
  let a = seed * 0x9e3779b1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Fern = {
  uniforms: FernUniforms;
  base: THREE.Vector3;
  height: number;
  push: THREE.Vector3;
  velocity: THREE.Vector3;
};

function toVector(v: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]);
}

function makeContactShadowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(24,56,41,0.55)");
    g.addColorStop(0.45, "rgba(24,56,41,0.28)");
    g.addColorStop(1, "rgba(24,56,41,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Owns the Three.js renderer, the valley, Rabbit/Bear and the scroll-driven camera.
 * The React layer only feeds progress/pointer and reads screen anchors back.
 */
export class ValleyStage {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 160);
  private readonly uniforms: SharedUniforms = createSharedUniforms(
    PLUNGE.map((p) => p.point),
    new THREE.Vector3(POND.center.x, POND.center.z, 1.35),
    POND.ducks.length,
  );
  private readonly ferns: Fern[] = [];
  private readonly animals = new Map<AnimalId, Animal>();
  private readonly friends: Friend[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickSphere = new THREE.Sphere();
  private readonly lastCamera = new THREE.Vector3();
  private readonly cameraVelocity = new THREE.Vector3();
  private readonly positionCurve: THREE.CatmullRomCurve3;
  private readonly targetCurve: THREE.CatmullRomCurve3;
  /** Phone framing: same path, with per-shot overrides where a narrow screen needs a different angle. */
  private readonly portraitPositionCurve: THREE.CatmullRomCurve3;
  private readonly portraitTargetCurve: THREE.CatmullRomCurve3;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly characters = new Map<CharacterId, CharacterRig>();
  private readonly ducks: Duck[] = [];
  private readonly lilyPads: LilyPad[] = [];
  private frog: FrogRig | null = null;
  private readonly mist: { sprite: THREE.Sprite; base: THREE.Vector3; radius: number; phase: number; drift: number }[] = [];
  private mistTexture: THREE.Texture | null = null;
  /** Ending: Rabbit and Bear waving at the summit, birds over the evening sky, fireflies, glowing windows. */
  private readonly summitFriends: (CharacterRig & { id: CharacterId })[] = [];
  private readonly birds: Bird[] = [];
  private readonly windowMaterials: THREE.MeshStandardMaterial[] = [];
  private fireflies: THREE.Points | null = null;
  private fireflyBase: Float32Array | null = null;
  private dusk = 0;
  private ending = false;
  private lastTime = -1;
  private shadowHalf = 0;
  private readonly groundMeshes: THREE.Mesh[] = [];
  private readonly lookTarget = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly shadowTexture: THREE.Texture;
  private width = 1;
  private height = 1;
  private desktop = true;
  private disposed = false;
  private pmrem: THREE.PMREMGenerator | null = null;
  private readonly terrainMaterials: THREE.Material[] = [];

  constructor(canvas: HTMLCanvasElement, private readonly quality: StageQuality) {
    // MSAA stays on for every tier: edge aliasing is what made the valley look soft and "jaggy".
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping keeps the pastel hues and contrast crisp while still rolling off highlights (no glare).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.fog = new THREE.Fog(SKY_FOG, 30, 80);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = this.pmrem.fromScene(room, 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    room.dispose();

    // Sky/ground bounce: cool mint from above, warm clay from below.
    this.hemiLight = new THREE.HemisphereLight(HEMI_SKY_DAY, "#e2cc9e", 1.35);
    this.scene.add(this.hemiLight);

    // Key light from the upper left, slightly warm, casting soft shadows around the trail.
    this.keyLight = new THREE.DirectionalLight("#fff1d6", 2.2);
    this.keyLight.position.copy(KEY_LIGHT_DIR).multiplyScalar(30);
    this.keyLight.target.position.set(-0.4, 2.6, 1.2);
    this.keyLight.castShadow = true;
    const mapSize = quality === "high" ? 2048 : 1024;
    this.keyLight.shadow.mapSize.set(mapSize, mapSize);
    const s = this.keyLight.shadow.camera;
    s.left = -13; s.right = 13; s.top = 13; s.bottom = -13; s.near = 1; s.far = 70;
    this.keyLight.shadow.bias = -0.0006;
    this.keyLight.shadow.normalBias = 0.035;
    this.keyLight.shadow.radius = 2.5;
    this.scene.add(this.keyLight, this.keyLight.target);

    // Cool fill from the right so shadow sides stay readable, never black.
    const fill = new THREE.DirectionalLight("#d6ecf2", 0.45);
    fill.position.set(16, 8, -6);
    this.scene.add(fill);

    // Uniform Catmull-Rom is C1 at every keyframe when sampled per segment, so speed never jumps between shots.
    this.positionCurve = new THREE.CatmullRomCurve3(CAMERA_SHOTS.map((shot) => toVector(shot.position)), false, "catmullrom", 0.5);
    this.targetCurve = new THREE.CatmullRomCurve3(CAMERA_SHOTS.map((shot) => toVector(shot.target)), false, "catmullrom", 0.5);
    this.portraitPositionCurve = new THREE.CatmullRomCurve3(CAMERA_SHOTS.map((shot) => toVector(shot.portrait.position ?? shot.position)), false, "catmullrom", 0.5);
    this.portraitTargetCurve = new THREE.CatmullRomCurve3(CAMERA_SHOTS.map((shot) => toVector(shot.portrait.target ?? shot.target)), false, "catmullrom", 0.5);
    this.shadowTexture = makeContactShadowTexture();
  }

  async load(onValleyReady: () => void): Promise<{ missing: string[] }> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const missing: string[] = [];

    const valley = await loader.loadAsync(LANDING_ASSETS.valley);
    if (this.disposed) return { missing };
    this.prepareValley(valley.scene);
    this.scene.add(valley.scene);
    this.addLilyPads();
    this.addFerns();
    onValleyReady();

    const duckLoad = loader.loadAsync(LANDING_ASSETS.duck).then((gltf) => {
      if (!this.disposed) this.addDucks(gltf.scene, gltf.animations);
    }).catch((error: unknown) => {
      missing.push(LANDING_ASSETS.duck);
      console.error(`[LumiKids landing] Không tải được mô hình vịt: ${LANDING_ASSETS.duck}`, error);
    });


    const extras = ([
      [LANDING_ASSETS.elephant, (gltf) => this.addAnimal("elephant", gltf.scene, gltf.animations), "voi"],
      [LANDING_ASSETS.dog, (gltf) => this.addAnimal("dog", gltf.scene, gltf.animations), "chó"],
      [LANDING_ASSETS.deer, (gltf) => this.addAnimal("deer", gltf.scene, gltf.animations), "hươu"],
      [LANDING_ASSETS.frog, (gltf) => this.addFrog(gltf.scene, gltf.animations), "ếch"],
      [LANDING_ASSETS.cattail, (gltf) => this.addCattails(gltf.scene), "cỏ đuôi nến"],
      [LANDING_ASSETS.birch, (gltf) => this.addBirches(gltf.scene), "cây bạch dương"],
    ] as const satisfies readonly (readonly [string, (gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }) => void, string])[]).map(([url, add, label]) =>
      loader.loadAsync(url).then((gltf) => {
        if (!this.disposed) add(gltf);
      }).catch((error: unknown) => {
        missing.push(url);
        console.error(`[LumiKids landing] Không tải được mô hình ${label}: ${url}`, error);
      }));

    await Promise.all(CHARACTER_IDS.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(LANDING_ASSETS[id]);
        if (this.disposed) return;
        this.addCharacter(id, gltf.scene);
      } catch (error) {
        missing.push(LANDING_ASSETS[id]);
        console.error(`[LumiKids landing] Không tải được mô hình ${id}: ${LANDING_ASSETS[id]}`, error);
      }
    }));
    await Promise.all([duckLoad, ...extras]);
    return { missing };
  }

  private prepareValley(root: THREE.Object3D): void {
    const remove: THREE.Object3D[] = [];
    const tuned = new Map<string, THREE.Material>();
    root.traverse((object) => {
      // GLTFLoader sanitises node names (spaces → underscores); compare against the Blender names.
      const name = object.name.replace(/_/g, " ");
      // The Blender hero camera and the built-in "Little Explorer" figure are not part of the
      // landing story (Rabbit and Bear are the characters), so they are left out at runtime.
      if (object instanceof THREE.Camera || name.startsWith("Little Explorer")) remove.push(object);
      if (!(object instanceof THREE.Mesh)) return;
      const source = object.material as THREE.MeshStandardMaterial;
      let kind: SurfaceKind | null = surfaceForMaterial(source.name);
      // Highlights on the streams carry baked flow coordinates; the lake's own highlights do not.
      if (kind === "waterHighlight" && name.startsWith("Streams and Waterfalls")) kind = "streamHighlight";
      if (kind) {
        const key = `${source.uuid}:${kind}`;
        let material = tuned.get(key);
        if (!material) {
          const next = tuneMaterial(kind === "streamHighlight" ? source.clone() : source, kind);
          patchSurface(next, kind, this.uniforms);
          if (kind === "windowLight") this.windowMaterials.push(next as THREE.MeshStandardMaterial);
          if (kind === "terrain") {
            this.terrainMaterials.push(next);
            if (this.quality === "low") setTerrainLite(next, true);
          }
          tuned.set(key, next);
          material = next;
        }
        object.material = material;
      }
      const isWater = kind === "water" || kind === "cascade" || kind === "waterHighlight" || kind === "streamHighlight";
      object.castShadow = !isWater && kind !== "meadow";
      object.receiveShadow = true;
      if (name.startsWith("Cliffs and Terraces") || name.startsWith("Winding Footpath") || name.startsWith("Elephant Bank")) this.groundMeshes.push(object);
    });
    remove.forEach((object) => object.removeFromParent());
    root.updateMatrixWorld(true);
    this.addPlungeFoam();
  }

  /** Churning foam where each lake waterfall lands; the lake shader spreads rings outward from the same points. */
  private addPlungeFoam(): void {
    PLUNGE.forEach(({ point, radius }, index) => {
      const material = new THREE.MeshStandardMaterial({ color: "#f4fbf8", transparent: true, depthWrite: false, roughness: 0.7, metalness: 0, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
      patchSurface(material, "foam", this.uniforms);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), material);
      disc.name = `plunge-foam-${index}`;
      disc.rotation.x = -Math.PI / 2;
      disc.position.copy(point).setY(0.03);
      disc.renderOrder = 2;
      disc.receiveShadow = true;
      this.scene.add(disc);
    });
    this.addPlungeMist();
    this.addFireflies();
    this.addBirds();
  }

  /** Spray mist at each plunge: soft puffs that rise, swell and fade on a loop, hiding the hard foot of the fall. */
  private addPlungeMist(): void {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.45)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    this.mistTexture = new THREE.CanvasTexture(canvas);
    this.mistTexture.colorSpace = THREE.SRGBColorSpace;
    PLUNGE.forEach(({ point, radius }, plungeIndex) => {
      const puffs = 7;
      for (let i = 0; i < puffs; i += 1) {
        const material = new THREE.SpriteMaterial({ map: this.mistTexture, color: "#f6fcfa", transparent: true, depthWrite: false, opacity: 0, fog: true });
        const sprite = new THREE.Sprite(material);
        sprite.name = `plunge-mist-${plungeIndex}-${i}`;
        sprite.renderOrder = 3;
        const angle = (i / puffs) * Math.PI * 2 + plungeIndex;
        const base = new THREE.Vector3(point.x + Math.cos(angle) * radius * 0.28, 0.05, point.z + Math.sin(angle) * radius * 0.28);
        this.mist.push({ sprite, base, radius, phase: i / puffs, drift: angle });
        this.scene.add(sprite);
      }
    });
  }

  private updateMist(timeSeconds: number): void {
    for (const puff of this.mist) {
      // Each puff lives 3.2 s: rises ~0.55 r, swells, drifts outward, fades in then out.
      const life = (timeSeconds / 3.2 + puff.phase) % 1;
      const r = puff.radius;
      puff.sprite.position.set(
        puff.base.x + Math.cos(puff.drift) * life * r * 0.35,
        puff.base.y + life * r * 0.55,
        puff.base.z + Math.sin(puff.drift) * life * r * 0.35,
      );
      puff.sprite.scale.setScalar(r * (0.55 + life * 0.9));
      (puff.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(life * Math.PI) ** 1.5 * 0.42;
    }
  }

  /** Low-poly fern clumps generated in code (faceted, vertex-coloured fronds), each its own seeded shape. */
  private addFerns(): void {
    FERN_PLACEMENT.forEach((place, index) => {
      const ground = this.groundHeight(place.x, place.z);
      const uniforms: FernUniforms = {
        uFernBase: { value: new THREE.Vector4(place.x, ground, place.z, place.height) },
        uPush: { value: new THREE.Vector3() },
      };
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.86, metalness: 0, envMapIntensity: 0.3 });
      patchSurface(material, "fern", this.uniforms, uniforms);
      const fern = new THREE.Mesh(makeLowPolyFern(index + 1), material);
      fern.name = `fern-${index}`;
      fern.castShadow = true;
      fern.receiveShadow = true;
      fern.scale.setScalar(place.height);
      fern.position.set(place.x, ground - 0.02, place.z);
      fern.rotation.y = THREE.MathUtils.degToRad(place.yawDeg);
      this.scene.add(fern);
      this.ferns.push({ uniforms, base: new THREE.Vector3(place.x, ground, place.z), height: place.height, push: new THREE.Vector3(), velocity: new THREE.Vector3() });
    });
  }

  /**
   * Ferns lean away as the camera brushes past and swing with the scroll (a damped spring),
   * on top of the time-driven wind sway in the vertex shader.
   */
  private updateFerns(dt: number): void {
    if (dt <= 0) return;
    const target = new THREE.Vector3();
    const away = new THREE.Vector3();
    for (const fern of this.ferns) {
      away.subVectors(fern.base, this.camera.position);
      const distance = away.length();
      away.y = 0;
      const reach = fern.height * 6;
      const near = clamp(1 - (distance - fern.height) / reach, 0, 1);
      if (away.lengthSq() > 1e-6) away.normalize();
      target.copy(away).multiplyScalar(near * near * fern.height * 0.5);
      // Drag from the camera's motion: fronds trail behind as the view sweeps past.
      target.addScaledVector(this.cameraVelocity, -fern.height * 0.05 * (0.35 + near));
      target.y = 0;
      const maxLean = fern.height * 0.6;
      if (target.length() > maxLean) target.setLength(maxLean);
      fern.velocity.addScaledVector(target.sub(fern.push), 26 * dt);
      fern.velocity.multiplyScalar(Math.exp(-5.5 * dt));
      fern.push.addScaledVector(fern.velocity, dt);
      fern.uniforms.uPush.value.copy(fern.push);
    }
  }

  private groundHeight(x: number, z: number, fallback = 2.7): number {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(this.groundMeshes, false)[0];
    return hit ? hit.point.y : fallback;
  }

  private addCharacter(id: CharacterId, model: THREE.Object3D): void {
    const place = CHARACTER_PLACEMENT[id];
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.material = materials.map((m: THREE.Material) => {
        const material = m instanceof THREE.MeshStandardMaterial ? m : new THREE.MeshStandardMaterial({ color: "#f3e6da" });
        material.metalness = 0;
        material.envMapIntensity = 0.35;
        patchSurface(material, "character", this.uniforms);
        return material;
      });
      if (materials.length === 1) object.material = (object.material as THREE.Material[])[0];
    });

    // Normalise: base on the ground, centred on X/Z, scaled to the target height.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = place.height / Math.max(size.y, 1e-6);
    model.scale.multiplyScalar(scale);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    const body = new THREE.Group();
    body.add(model);
    const root = new THREE.Group();
    root.name = `character-${id}`;
    root.add(body);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    const footprint = Math.max(size.x, size.z) * scale;
    shadow.scale.set(footprint * 1.25, footprint * 1.05, 1);
    shadow.renderOrder = 1;
    root.add(shadow);

    root.position.set(place.x, this.groundHeight(place.x, place.z), place.z);
    // Face the encounter camera, then nudge so the two characters angle slightly toward each other.
    const encounter = (CAMERA_SHOTS.find((shot) => shot.name === "characters") ?? CAMERA_SHOTS[0]).position;
    const yaw = Math.atan2(encounter[0] - place.x, encounter[2] - place.z);
    root.rotation.y = yaw + THREE.MathUtils.degToRad(place.faceOffsetDeg);
    this.scene.add(root);
    this.characters.set(id, { root, body, height: place.height, phase: id === "rabbit" ? 0 : 1.7 });
    this.addFriend(id, root, root, place.height, null);
    this.addSummitFriend(id, root, place.height);
  }

  /** A copy of the character (shared geometry/materials) on the summit rock, facing the summit camera. */
  private addSummitFriend(id: CharacterId, source: THREE.Group, height: number): void {
    const spot = SUMMIT_FRIENDS[id];
    const root = source.clone(true);
    root.name = `summit-${id}`;
    const body = root.children.find((child) => child instanceof THREE.Group) as THREE.Group | undefined;
    if (!body) return;
    root.position.set(spot.x, this.footprintHeight(spot.x, spot.z, height * 0.3), spot.z);
    const summit = (CAMERA_SHOTS.find((shot) => shot.name === "summit") ?? CAMERA_SHOTS[0]).position;
    root.rotation.y = Math.atan2(summit[0] - spot.x, summit[2] - spot.z) + (id === "rabbit" ? -0.25 : 0.25);
    root.visible = false;
    this.scene.add(root);
    this.summitFriends.push({ id, root, body, height, phase: id === "rabbit" ? 0.4 : 1.9 });
    this.addFriend(id, root, root, height, null, () => root.visible);
  }

  /** Stylised birds (two flapping wing triangles each) circling high over the valley at dusk. */
  private addBirds(): void {
    const wing = new THREE.BufferGeometry();
    // Wing from the body (origin) out along +X, swept slightly back.
    wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.07, 0, 0, -0.06, 0.42, 0, -0.14], 3));
    wing.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({ color: "#8c7884", side: THREE.DoubleSide, fog: true, transparent: true, opacity: 0 });
    const random = mulberry32(11);
    for (let i = 0; i < 9; i += 1) {
      const root = new THREE.Group();
      root.name = `bird-${i}`;
      const left = new THREE.Mesh(wing, material);
      const right = new THREE.Mesh(wing, material);
      right.scale.x = -1;
      root.add(left, right);
      root.scale.setScalar(0.85 + random() * 0.45);
      root.visible = false;
      this.scene.add(root);
      this.birds.push({ root, left, right, radius: 2.5 + random() * 2.5, height: 13.4 + random() * 1.6, speed: 0.22 + random() * 0.08, phase: (i < 5 ? 0 : 0.9) + random() * 0.5 });
    }
  }

  /** Warm specks drifting over the meadow, cabin and lake shore; they appear as the light turns to evening. */
  private addFireflies(): void {
    if (!this.mistTexture) return;
    const centres: [number, number, number, number][] = [[-0.6, 0, 1.4, 2.4], [0.2, 0, 3.6, 2.0], [-2.0, 0, 0.5, 1.8], [3.6, 0, 7.4, 1.6], [6.6, 0, 5.8, 1.4], [-2.6, 0, 6.2, 1.4]];
    const random = mulberry32(23);
    const count = 90;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const [cx, , cz, r] = centres[i % centres.length];
      const a = random() * Math.PI * 2;
      const d = Math.sqrt(random()) * r;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      positions.set([x, Math.max(0.05, this.groundHeight(x, z, 0)) + 0.15 + random() * 0.9, z], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
    const material = new THREE.PointsMaterial({ map: this.mistTexture, color: "#fff2b8", size: 8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.fireflies = new THREE.Points(geometry, material);
    this.fireflies.name = "fireflies";
    this.fireflies.visible = false;
    this.fireflyBase = positions;
    this.scene.add(this.fireflies);
  }

  private updateEnding(timeSeconds: number): void {
    const show = this.ending;
    for (const rig of this.summitFriends) {
      rig.root.visible = show;
      if (!show) continue;
      const t = timeSeconds + rig.phase;
      // Waving goodbye: a happy side-to-side rock with a little bounce, in bursts.
      const burst = Math.max(0, Math.sin(t * 1.4));
      rig.body.rotation.z = Math.sin(t * 7.5) * 0.16 * burst;
      rig.body.position.y = Math.abs(Math.sin(t * 7.5)) * rig.height * 0.06 * burst;
      const breathe = Math.sin(t * 2.1) * 0.018;
      rig.body.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
    }
    const birdOpacity = smoothRange(this.dusk, 0.0, 0.5);
    for (const bird of this.birds) {
      bird.root.visible = show && birdOpacity > 0.01;
      if (!bird.root.visible) continue;
      (bird.left.material as THREE.MeshBasicMaterial).opacity = birdOpacity;
      const a = bird.phase * 6.283 + timeSeconds * bird.speed;
      bird.root.position.set(FLOCK_CENTRE.x + Math.cos(a) * bird.radius, bird.height + Math.sin(timeSeconds * 0.7 + bird.phase * 9) * 0.4, FLOCK_CENTRE.z + Math.sin(a) * bird.radius);
      bird.root.rotation.set(0, -a, Math.sin(timeSeconds * 0.5 + bird.phase) * 0.15);
      const flap = Math.sin(timeSeconds * 7 + bird.phase * 13) * 0.55;
      bird.left.rotation.z = flap;
      bird.right.rotation.z = -flap;
    }
    if (this.fireflies && this.fireflyBase) {
      const material = this.fireflies.material as THREE.PointsMaterial;
      material.opacity = smoothRange(this.dusk, 0.25, 1) * (0.75 + 0.25 * Math.sin(timeSeconds * 3.1));
      material.size = 8 * this.renderer.getPixelRatio();
      this.fireflies.visible = show && material.opacity > 0.01;
      if (this.fireflies.visible) {
        const attr = this.fireflies.geometry.getAttribute("position") as THREE.BufferAttribute;
        const base = this.fireflyBase;
        for (let i = 0; i < attr.count; i += 1) {
          const s = i * 1.7;
          attr.setXYZ(i, base[i * 3] + Math.sin(timeSeconds * 0.6 + s) * 0.12, base[i * 3 + 1] + Math.sin(timeSeconds * 0.9 + s * 1.3) * 0.08, base[i * 3 + 2] + Math.cos(timeSeconds * 0.5 + s) * 0.12);
        }
        attr.needsUpdate = true;
      }
    }
  }

  /** Average ground height under a footprint, so four legs settle on a gentle slope without floating. */
  private footprintHeight(x: number, z: number, radius: number): number {
    const samples = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]].map(([dx, dz]) => this.groundHeight(x + dx, z + dz));
    return samples.reduce((sum, h) => sum + h, 0) / samples.length;
  }

  /** Shadows, no culling pops and the soft pastel treatment for a skinned animal model. */
  private prepareCreature(model: THREE.Object3D): void {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      // Skinned bounds come from the bind pose; never let the idle loop pop at frame edges.
      object.frustumCulled = false;
      const material = object.material as THREE.MeshStandardMaterial;
      material.metalness = 0;
      material.envMapIntensity = 0.35;
      // Eyes are small blended layers; leave them untouched. Skin and fur get the soft pastel treatment.
      if (!material.transparent) patchSurface(material, "character", this.uniforms);
    });
  }

  private addAnimal(id: AnimalId, model: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    const place = ANIMAL_PLACEMENT[id];
    this.prepareCreature(model);

    // Normalise in the bind pose: base on the ground, centred on X/Z, scaled to the target height.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = place.height / Math.max(size.y, 1e-6);
    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    const root = new THREE.Group();
    root.name = `animal-${id}`;
    root.add(model);
    const footprint = Math.max(size.x, size.z) * scale;
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    shadow.scale.set(footprint * 1.1, footprint * 0.8, 1);
    shadow.renderOrder = 1;
    root.add(shadow);

    root.position.set(place.x, this.footprintHeight(place.x, place.z, footprint * 0.22), place.z);
    const shot = (CAMERA_SHOTS.find((s) => s.name === place.faceShot) ?? CAMERA_SHOTS[0]).position;
    const toCamera = Math.atan2(shot[0] - place.x, shot[2] - place.z);
    // Models face +Z (dog) or +X (elephant); turn that axis towards the shot camera.
    root.rotation.y = toCamera - (place.forward === "x" ? Math.PI / 2 : 0) + THREE.MathUtils.degToRad(place.faceOffsetDeg);
    this.scene.add(root);

    let mixer: THREE.AnimationMixer | null = null;
    const idle = clips.find((clip) => clip.name === place.clip) ?? clips.find((clip) => /idle/i.test(clip.name)) ?? clips[0];
    if (idle) {
      mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(idle).play();
    }
    this.animals.set(id, { root, mixer });
    this.addFriend(id, root, root, place.height, mixer);
  }

  /** Cattail clumps in the pond shallows; they reuse the fern sway (wind + lean as the camera passes). */
  private addCattails(model: THREE.Object3D): void {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    for (const cluster of CATTAIL_CLUSTERS) {
      const random = mulberry32(cluster.seed);
      // Rooted in the shallows: on the shore if it is above the water, otherwise just under the surface.
      // No terrain hit means open water (the lake bed below the surface is not part of the mesh).
      const ground = Math.min(Math.max(this.groundHeight(cluster.x, cluster.z, -0.04), -0.04), 0.35);
      const uniforms: FernUniforms = {
        uFernBase: { value: new THREE.Vector4(cluster.x, ground, cluster.z, cluster.height) },
        uPush: { value: new THREE.Vector3() },
      };
      const materials = new Map<THREE.Material, THREE.Material>();
      for (let i = 0; i < cluster.count; i += 1) {
        const stem = model.clone(true);
        stem.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
          const source = object.material as THREE.MeshStandardMaterial;
          let material = materials.get(source);
          if (!material) {
            const next = source.clone();
            next.side = THREE.DoubleSide;
            next.alphaTest = 0.45;
            next.metalness = 0;
            next.envMapIntensity = 0.3;
            patchSurface(next, "fern", this.uniforms, uniforms);
            materials.set(source, next);
            material = next;
          }
          object.material = material;
        });
        const height = cluster.height * (0.72 + random() * 0.45);
        const s = height / Math.max(size.y, 1e-6);
        const angle = random() * Math.PI * 2;
        const reach = i === 0 ? 0 : 0.08 + random() * 0.16;
        const holder = new THREE.Group();
        holder.position.set(cluster.x + Math.cos(angle) * reach, ground - 0.015, cluster.z + Math.sin(angle) * reach);
        holder.rotation.set((random() - 0.5) * 0.12, random() * Math.PI * 2, (random() - 0.5) * 0.12);
        stem.scale.setScalar(s);
        stem.position.set(-center.x * s, -box.min.y * s, -center.z * s);
        holder.add(stem);
        this.scene.add(holder);
      }
      this.ferns.push({ uniforms, base: new THREE.Vector3(cluster.x, ground, cluster.z), height: cluster.height, push: new THREE.Vector3(), velocity: new THREE.Vector3() });
    }
  }

  /** Birches: wind sway only (they are too tall to lean away from the camera like the ferns). */
  private addBirches(model: THREE.Object3D): void {
    model.updateMatrixWorld(true);
    for (const place of BIRCH_PLACEMENT) {
      const source = model.getObjectByName(place.node.replace(/ /g, "_")) ?? model.getObjectByName(place.node);
      if (!source) continue;
      const tree = source.clone(true);
      // Bake the parent chain (Sketchfab's FBX root scale/rotation) into the clone, then drop its own offset.
      source.parent?.updateWorldMatrix(true, false);
      tree.applyMatrix4(source.parent?.matrixWorld ?? new THREE.Matrix4());
      tree.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(tree);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const ground = this.groundHeight(place.x, place.z);
      const uniforms: FernUniforms = {
        uFernBase: { value: new THREE.Vector4(place.x, ground, place.z, place.height * 0.35) },
        uPush: { value: new THREE.Vector3() },
      };
      tree.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const material = (object.material as THREE.MeshStandardMaterial).clone();
        material.metalness = 0;
        material.envMapIntensity = 0.3;
        patchSurface(material, "fern", this.uniforms, uniforms);
        object.material = material;
      });
      const holder = new THREE.Group();
      holder.name = `birch-${place.node}`;
      const scale = place.height / Math.max(size.y, 1e-6);
      holder.scale.setScalar(scale);
      tree.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
      holder.add(tree);
      holder.position.set(place.x, ground - 0.03, place.z);
      holder.rotation.y = THREE.MathUtils.degToRad(place.yawDeg);
      this.scene.add(holder);
    }
  }

  /**
   * Compile every shader and upload every texture up front, including objects that only appear later
   * (summit friends, birds, fireflies), so scrolling into a new part of the valley never stalls on a compile.
   */
  async warmUp(): Promise<void> {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((object) => {
      if (!object.visible) { hidden.push(object); object.visible = true; }
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          for (const value of Object.values(material as unknown as Record<string, unknown>)) {
            if (value instanceof THREE.Texture) this.renderer.initTexture(value);
          }
        }
      }
    });
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } finally {
      for (const object of hidden) object.visible = false;
    }
  }

  /** Last step of the adaptive quality ladder (after resolution): no dynamic shadows, lighter terrain detail. */
  degrade(): void {
    this.keyLight.castShadow = false;
    for (const material of this.terrainMaterials) setTerrainLite(material, true);
  }

  private addDucks(model: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = POND.scale / Math.max(size.x, size.y, size.z, 1e-6);
    const swim = clips.find((clip) => clip.name === "Swim") ?? clips[0];
    POND.ducks.forEach((spec, index) => {
      const duck = cloneSkinned(model);
      duck.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        // A skinned mesh's bounds come from its bind pose; disable culling so it never pops at frame edges.
        object.frustumCulled = false;
        const material = object.material as THREE.MeshStandardMaterial;
        material.envMapIntensity = 0.45;
      });
      // The ducklings are a little smaller than the parent.
      const s = scale * (index === 2 ? 0.72 : 1);
      duck.scale.setScalar(s);
      const root = new THREE.Group();
      root.name = `duck-${index}`;
      // Float with the belly just below the water line; the draft scales with the bird, or the duckling sinks.
      duck.position.y = -box.min.y * s - 0.2 * POND.scale * (s / scale);
      root.add(duck);
      this.scene.add(root);
      const mixer = new THREE.AnimationMixer(duck);
      if (swim) {
        const action = mixer.clipAction(swim);
        action.timeScale = 0.85 + index * 0.12;
        action.time = index * 0.4;
        action.play();
      }
      this.ducks.push({ root, mixer, radius: spec.radius, speed: spec.speed, phase: spec.phase });
      // The root is steered around the pond every frame, so the reaction moves the model inside it.
      this.addFriend("duck", root, duck, size.y * s, mixer, () => true, this.duckCall(mixer, clips, swim));
    });
  }

  /** A tapped duck quacks, and on the next tap flaps its wings, then goes back to paddling. */
  private duckCall(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[], swim: THREE.AnimationClip | undefined): (() => void) | null {
    const calls = ["Quack", "Flap"].flatMap((name) => {
      const clip = clips.find((candidate) => candidate.name === name);
      if (!clip) return [];
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      return [action];
    });
    if (!swim || calls.length === 0) return null;
    const paddle = mixer.clipAction(swim);
    mixer.addEventListener("finished", (event) => {
      event.action.fadeOut(0.25);
      paddle.fadeIn(0.25);
    });
    let turn = 0;
    return () => {
      const call = calls[turn % calls.length];
      turn += 1;
      for (const other of calls) if (other !== call) other.stop();
      paddle.fadeOut(0.15);
      call.reset().fadeIn(0.15).play();
    };
  }

  private addFriend(id: FriendId, anchor: THREE.Object3D, object: THREE.Object3D, height: number, mixer: THREE.AnimationMixer | null, shown: () => boolean = () => true, onPoke: (() => void) | null = null, ownMotion = false): void {
    this.friends.push({ id, anchor, object, height, baseY: object.position.y, baseRotY: object.rotation.y, baseScale: object.scale.clone(), mixer, onPoke, ownMotion, started: -1, shown });
  }

  /** Low-poly lily pads (a cupped disc with the notch) drifting on the pond; the smallest carries a lotus. */
  private addLilyPads(): void {
    const padMaterial = new THREE.MeshStandardMaterial({ color: "#8cc274", roughness: 0.78, metalness: 0, flatShading: true, envMapIntensity: 0.35 });
    const rimMaterial = new THREE.MeshStandardMaterial({ color: "#64a057", roughness: 0.85, metalness: 0, flatShading: true, envMapIntensity: 0.3 });
    LILY_PADS.forEach((spec, index) => {
      const root = new THREE.Group();
      root.name = `lily-pad-${index}`;
      const pad = new THREE.Mesh(makeLilyPadGeometry(spec.radius), padMaterial);
      pad.receiveShadow = true;
      // A thin darker underside peeks out at the rim, so the pad reads as a leaf, not a sticker.
      const rim = new THREE.Mesh(makeLilyPadGeometry(spec.radius * 1.04), rimMaterial);
      rim.position.y = -0.006;
      root.add(rim, pad);
      if (index === LILY_PADS.length - 1) root.add(makeLotus(spec.radius));
      root.position.set(spec.x, PAD_Y, spec.z);
      root.rotation.y = THREE.MathUtils.degToRad(spec.yawDeg);
      this.scene.add(root);
      this.lilyPads.push({ root, base: root.position.clone(), radius: spec.radius, phase: index * 1.9, kicked: -1 });
    });
  }

  /** The frog sits on the first pad, facing the pond camera; a tap sends it hopping along FROG.route. */
  private addFrog(model: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    const start = this.lilyPads[FROG.route[0]];
    if (!start) return;
    this.prepareCreature(model);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.multiplyScalar(FROG.height / Math.max(size.y, 1e-6));
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    const root = new THREE.Group();
    root.name = "frog";
    root.add(model);
    root.position.copy(start.root.position);
    const shot = (CAMERA_SHOTS.find((s) => s.name === "pond") ?? CAMERA_SHOTS[0]).position;
    // The model faces +Z; turn it towards the pond camera.
    root.rotation.y = Math.atan2(shot[0] - root.position.x, shot[2] - root.position.z);
    this.scene.add(root);

    const mixer = new THREE.AnimationMixer(model);
    const idleClip = clips.find((clip) => /idle/i.test(clip.name));
    const jumpClip = clips.find((clip) => /jump/i.test(clip.name));
    const idle = idleClip ? mixer.clipAction(idleClip) : null;
    idle?.play();
    let jump: THREE.AnimationAction | null = null;
    if (jumpClip) {
      jump = mixer.clipAction(jumpClip);
      jump.setLoop(THREE.LoopOnce, 1);
      jump.clampWhenFinished = true;
      jump.timeScale = jumpClip.duration / FROG_HOP_SECONDS;
    }
    this.frog = { root, mixer, idle, jump, step: 0, hopStart: -1, fromHeading: root.rotation.y, toHeading: root.rotation.y };
    this.addFriend("frog", root, root, size.y * (FROG.height / Math.max(size.y, 1e-6)) * 1.6, mixer, () => true, () => this.hopFrog(), true);
  }

  /** Start a hop to the next pad on the route (ignored while one is already under way). */
  private hopFrog(): void {
    const frog = this.frog;
    if (!frog || frog.hopStart >= 0) return;
    const from = this.lilyPads[FROG.route[frog.step]];
    const to = this.lilyPads[FROG.route[(frog.step + 1) % FROG.route.length]];
    if (!from || !to) return;
    frog.hopStart = Math.max(0, this.lastTime);
    frog.fromHeading = frog.root.rotation.y;
    const target = Math.atan2(to.base.x - from.base.x, to.base.z - from.base.z);
    // Turn the short way round.
    frog.toHeading = frog.fromHeading + Math.atan2(Math.sin(target - frog.fromHeading), Math.cos(target - frog.fromHeading));
    if (frog.jump) {
      frog.idle?.fadeOut(0.1);
      frog.jump.reset().fadeIn(0.1).play();
    }
  }

  /** Pads bob on the water and dip when the frog pushes off or lands; the frog rides its pad or flies its arc. */
  private updatePond(timeSeconds: number, dt: number): void {
    for (const pad of this.lilyPads) {
      const age = pad.kicked < 0 ? Infinity : timeSeconds - pad.kicked;
      const dip = Number.isFinite(age) ? -0.018 * Math.exp(-age * 4) * Math.cos(age * 13) : 0;
      pad.root.position.y = pad.base.y + Math.sin(timeSeconds * 1.2 + pad.phase) * 0.003 + dip;
      pad.root.rotation.x = Math.sin(timeSeconds * 0.9 + pad.phase) * 0.025;
      pad.root.rotation.z = Math.cos(timeSeconds * 0.8 + pad.phase) * 0.025;
    }
    const frog = this.frog;
    if (!frog) return;
    frog.mixer.update(dt);
    const from = this.lilyPads[FROG.route[frog.step]];
    if (!from) return;
    if (frog.hopStart < 0) {
      frog.root.position.set(from.root.position.x, from.root.position.y, from.root.position.z);
      return;
    }
    const to = this.lilyPads[FROG.route[(frog.step + 1) % FROG.route.length]];
    const t = (timeSeconds - frog.hopStart) / FROG_HOP_SECONDS;
    // The clip crouches first and settles last; the body only travels in the middle of it.
    const travel = smoothRange(t, 0.18, 0.82);
    if (t >= 0.18 && from.kicked < frog.hopStart) from.kicked = timeSeconds;
    frog.root.rotation.y = lerp(frog.fromHeading, frog.toHeading, smoothRange(t, 0, 0.3));
    frog.root.position.set(
      lerp(from.root.position.x, to.root.position.x, travel),
      lerp(from.root.position.y, to.root.position.y, travel) + Math.sin(travel * Math.PI) * 0.2,
      lerp(from.root.position.z, to.root.position.z, travel),
    );
    if (t >= 0.82 && to.kicked < frog.hopStart) to.kicked = timeSeconds;
    if (t >= 1) {
      frog.step = (frog.step + 1) % FROG.route.length;
      frog.hopStart = -1;
      frog.jump?.fadeOut(0.2);
      frog.idle?.reset().fadeIn(0.2).play();
    }
  }

  /** The animal under a point of the canvas (CSS pixels), nearest first. Small or distant ones get a generous target. */
  private findFriend(x: number, y: number): Friend | null {
    this.pointer.set((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    let best: Friend | null = null;
    let bestDistance = Infinity;
    for (const friend of this.friends) {
      if (!friend.shown()) continue;
      friend.anchor.getWorldPosition(this.pickSphere.center);
      this.pickSphere.center.y += friend.height * 0.5;
      const distance = this.pickSphere.center.distanceTo(this.camera.position);
      this.pickSphere.radius = Math.max(friend.height * 0.62, distance * 0.022);
      if (distance < bestDistance && this.raycaster.ray.intersectsSphere(this.pickSphere)) {
        best = friend;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Which animal is under the pointer, if any (for the hover cursor). */
  friendAt(x: number, y: number): FriendId | null {
    return this.findFriend(x, y)?.id ?? null;
  }

  /** Tap an animal: it hops and wiggles. Returns who it was and where its head is on screen. */
  poke(x: number, y: number): { id: FriendId; x: number; y: number } | null {
    const friend = this.findFriend(x, y);
    if (!friend) return null;
    friend.started = Math.max(0, this.lastTime);
    friend.onPoke?.();
    friend.anchor.getWorldPosition(this.scratch);
    this.scratch.y += friend.height * 1.15;
    this.scratch.project(this.camera);
    return { id: friend.id, x: (this.scratch.x * 0.5 + 0.5) * this.width, y: (-this.scratch.y * 0.5 + 0.5) * this.height };
  }

  /** Two quick bounces with squash and stretch and a wiggle, while the idle clip (ears, tail, paddling) speeds up. */
  private updateFriends(timeSeconds: number): void {
    for (const friend of this.friends) {
      if (friend.started < 0) continue;
      if (friend.ownMotion) {
        friend.started = -1;
        continue;
      }
      const t = (timeSeconds - friend.started) / REACTION_SECONDS;
      const fade = t >= 1 ? 0 : 1 - t;
      const squash = Math.sin(t * Math.PI * 4) * 0.1 * fade;
      friend.object.position.y = friend.baseY + Math.abs(Math.sin(t * Math.PI * 2)) * fade * friend.height * 0.3;
      friend.object.rotation.y = friend.baseRotY + Math.sin(t * Math.PI * 3) * 0.22 * fade;
      friend.object.scale.set(friend.baseScale.x * (1 - squash * 0.5), friend.baseScale.y * (1 + squash), friend.baseScale.z * (1 - squash * 0.5));
      if (friend.mixer && !friend.onPoke) friend.mixer.timeScale = 1 + 2 * fade;
      if (t >= 1) friend.started = -1;
    }
  }

  hasCharacter(id: CharacterId): boolean {
    return this.characters.has(id);
  }

  pixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  resize(width: number, height: number, dpr: number, desktop: boolean): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.desktop = desktop;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, false);
  }

  /** Pose the camera for scroll progress `p` (0–1) and pointer parallax in pixels. */
  /** Warm, lower evening light for the farewell; fully daytime before the summit. */
  private applyDusk(p: number): void {
    const t = clamp((p - DUSK_RANGE[0]) / (DUSK_RANGE[1] - DUSK_RANGE[0]));
    const k = t * t * (3 - 2 * t);
    this.keyLight.color.copy(KEY_DAY).lerp(KEY_DUSK, k);
    this.keyLight.intensity = lerp(2.35, 1.9, k);
    this.hemiLight.color.copy(HEMI_SKY_DAY).lerp(HEMI_SKY_DUSK, k);
    for (const material of this.windowMaterials) material.emissiveIntensity = lerp(0.55, 1.7, k);
    this.dusk = k;
    this.ending = p > 0.7;
    (this.scene.fog as THREE.Fog).color.copy(SKY_FOG).lerp(DUSK_FOG, k);
  }

  private poseCamera(p: number, parallaxX: number, parallaxY: number): void {
    const u = progressToShot(p) / (CAMERA_SHOTS.length - 1);
    const portraitView = this.width / this.height < 0.9;
    (portraitView ? this.portraitPositionCurve : this.positionCurve).getPoint(u, this.camera.position);
    (portraitView ? this.portraitTargetCurve : this.targetCurve).getPoint(u, this.lookTarget);
    this.camera.lookAt(this.lookTarget);

    const f = u * (CAMERA_SHOTS.length - 1);
    const i = Math.min(CAMERA_SHOTS.length - 2, Math.floor(f));
    const t = f - i;
    const a: CameraShot = CAMERA_SHOTS[i];
    const b: CameraShot = CAMERA_SHOTS[i + 1];
    const aspect = this.width / this.height;
    let fov = lerp(a.fov, b.fov, t);
    // Portrait screens: widen vertically so the horizontal view stays close to the desktop framing.
    const referenceAspect = 1.6;
    if (aspect < referenceAspect) {
      const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * referenceAspect);
      const portraitFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf * 0.8) / aspect));
      fov = Math.min(78, Math.max(fov, portraitFov));
    }
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.near = 0.1;
    this.camera.far = 160;

    const portrait = aspect < 0.9;
    let shiftX = 0;
    let shiftY = 0;
    if (portrait) {
      shiftX = lerp(a.portrait.shiftX, b.portrait.shiftX, t);
      shiftY = lerp(a.portrait.shiftY, b.portrait.shiftY, t);
    } else if (this.desktop) {
      shiftX = lerp(a.shiftX, b.shiftX, t);
    }
    const offsetX = -shiftX * this.width + parallaxX;
    const offsetY = -shiftY * this.height + parallaxY;
    if (offsetX !== 0 || offsetY !== 0) {
      this.camera.setViewOffset(this.width, this.height, offsetX, offsetY, this.width, this.height);
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();

    // Keep the shadow map tight around what the camera looks at: crisp shadows up close, full coverage at the vista.
    const focusDistance = this.camera.position.distanceTo(this.lookTarget);
    const half = clamp(focusDistance * 0.62, 3.5, 14);
    this.keyLight.target.position.copy(this.lookTarget);
    this.keyLight.position.copy(this.lookTarget).addScaledVector(KEY_LIGHT_DIR, 30);
    if (Math.abs(half - this.shadowHalf) > 0.05) {
      this.shadowHalf = half;
      const sc = this.keyLight.shadow.camera;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
      sc.updateProjectionMatrix();
    }

    const fog = this.scene.fog as THREE.Fog;
    fog.near = lerp(a.fogNear, b.fogNear, t);
    fog.far = lerp(a.fogFar, b.fogFar, t);
  }

  render(p: number, timeSeconds: number, parallaxX: number, parallaxY: number, animate: boolean): void {
    if (this.disposed) return;
    this.uniforms.uTime.value = animate ? timeSeconds : 0;
    this.poseCamera(p, parallaxX, parallaxY);
    this.applyDusk(p);

    const dt = this.lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, timeSeconds - this.lastTime));
    this.lastTime = timeSeconds;
    if (animate) {
      for (const duck of this.ducks) {
        const angle = duck.phase + timeSeconds * duck.speed;
        const dir = Math.sign(duck.speed);
        duck.root.position.set(POND.center.x + Math.cos(angle) * duck.radius, Math.sin(timeSeconds * 1.7 + duck.phase) * 0.008, POND.center.z + Math.sin(angle) * duck.radius);
        // Heading = tangent of the loop (models face +Z).
        duck.root.rotation.y = Math.atan2(-Math.sin(angle) * dir, Math.cos(angle) * dir);
        duck.mixer.update(dt);
      }
      this.ducks.forEach((duck, index) => this.uniforms.uDucks.value[index]?.copy(duck.root.position));
      if (dt > 0) {
        this.cameraVelocity.subVectors(this.camera.position, this.lastCamera).divideScalar(dt);
        if (this.cameraVelocity.length() > 12) this.cameraVelocity.setLength(12);
      }
      this.lastCamera.copy(this.camera.position);
      this.updateFerns(dt);
      this.updateMist(timeSeconds);
      this.updateEnding(timeSeconds);
      for (const animal of this.animals.values()) animal.mixer?.update(dt);
      this.updateFriends(timeSeconds);
      this.updatePond(timeSeconds, dt);
      for (const [id, rig] of this.characters) {
        const t = timeSeconds + rig.phase;
        const breathe = Math.sin(t * 2.1) * 0.018;
        rig.body.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
        if (id === "rabbit") {
          // A small hop every few seconds.
          const cycle = (t % 3.4) / 3.4;
          const hop = cycle > 0.82 ? Math.sin(((cycle - 0.82) / 0.18) * Math.PI) : 0;
          rig.body.position.y = hop * rig.height * 0.16;
          rig.body.rotation.z = Math.sin(t * 1.3) * 0.03;
        } else {
          rig.body.rotation.z = Math.sin(t * 0.9) * 0.035;
          rig.body.rotation.y = Math.sin(t * 0.55) * 0.08;
        }
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Screen-space anchor above a character's head, in CSS pixels relative to the canvas. */
  anchor(id: CharacterId): ScreenAnchor {
    const rig = this.characters.get(id);
    if (!rig) return { x: 0, y: 0, visible: false };
    this.scratch.copy(rig.root.position);
    this.scratch.y += rig.height * 1.12;
    this.scratch.project(this.camera);
    const visible = this.scratch.z < 1 && Math.abs(this.scratch.x) < 0.96 && Math.abs(this.scratch.y) < 0.96;
    return {
      x: (this.scratch.x * 0.5 + 0.5) * this.width,
      y: (-this.scratch.y * 0.5 + 0.5) * this.height,
      visible,
    };
  }

  /** Debug helper (?debug=1): camera pose for progress p without rendering, to audit path smoothness. */
  sample(p: number): number[] {
    this.poseCamera(p, 0, 0);
    return [...this.camera.position.toArray(), ...this.lookTarget.toArray()];
  }

  /** Debug helper used by the QA screenshot script (?debug=1). */
  describe(): { position: number[]; target: number[]; fov: number; fernLean: number } {
    const fernLean = this.ferns.reduce((max, fern) => Math.max(max, fern.push.length()), 0);
    return { position: this.camera.position.toArray(), target: this.lookTarget.toArray(), fov: clamp(this.camera.fov, 0, 180), fernLean };
  }

  dispose(): void {
    this.disposed = true;
    for (const puff of this.mist) puff.sprite.material.dispose();
    if (this.fireflies) { this.fireflies.geometry.dispose(); (this.fireflies.material as THREE.Material).dispose(); }
    this.mistTexture?.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((m: THREE.Material) => m.dispose());
      }
    });
    this.shadowTexture.dispose();
    this.scene.environment?.dispose();
    this.pmrem?.dispose();
    this.renderer.dispose();
  }
}

/**
 * A low-poly fern clump of unit height: arching fronds radiating from the base, each a folded spine with
 * serrated leaflet pairs that shrink towards a drooping tip. Dark green at the heart, fresh green at the tips.
 */
function makeLowPolyFern(seed: number): THREE.BufferGeometry {
  const random = mulberry32(seed * 17 + 3);
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const base = new THREE.Color("#3f7a3a");
  const tip = new THREE.Color("#8fc85f");
  const color = new THREE.Color();
  const fronds = 7 + Math.floor(random() * 3);
  const segments = 10;
  const spine = (t: number, angle: number, reach: number, rise: number, out: THREE.Vector3) => {
    // Rises steeply, then arches outwards and droops a little at the tip.
    const r = reach * t;
    const y = rise * (Math.sin(t * Math.PI * 0.62) * 1.05) - rise * 0.22 * t * t * t;
    return out.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
  };
  const push = (p: THREE.Vector3, t: number, shade: number) => {
    positions.push(p.x, p.y, p.z);
    color.copy(base).lerp(tip, t).multiplyScalar(shade);
    colors.push(color.r, color.g, color.b);
    uvs.push(0, t);
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const side = new THREE.Vector3();
  const leaf = new THREE.Vector3();
  for (let f = 0; f < fronds; f += 1) {
    const angle = (f / fronds) * Math.PI * 2 + random() * 0.5;
    // Long, low-arching fronds that spread wide, like a real fern clump.
    const reach = 0.85 + random() * 0.3;
    const rise = 0.62 + random() * 0.25;
    const shade = 0.88 + random() * 0.2;
    for (let i = 0; i < segments; i += 1) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      spine(t0, angle, reach, rise, a);
      spine(t1, angle, reach, rise, b);
      side.set(-Math.sin(angle), 0, Math.cos(angle));
      // Leaflets are widest a third of the way up and taper to the tip.
      const width = 0.12 * Math.sin(Math.min(1, t0 * 1.5 + 0.3) * Math.PI) * (1 - t0 * 0.5) + 0.015;
      for (const s of [1, -1]) {
        // A leaflet: base on the spine, point swept forward and folded down (a shallow V along the frond).
        leaf.copy(a).lerp(b, 1.15).addScaledVector(side, s * width);
        leaf.y -= width * 0.45;
        push(a, t0, shade);
        push(leaf, (t0 + t1) / 2, shade * 1.06);
        push(b, t1, shade);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A lily pad: a flat-shaded fan with the leaf's notch, cupped up a little towards the rim
 * (y up, centred on the origin).
 */
function makeLilyPadGeometry(radius: number): THREE.BufferGeometry {
  const notch = 0.55;
  const segments = 11;
  const positions: number[] = [];
  const rim = (i: number): [number, number, number] => {
    const a = notch / 2 + (i / segments) * (Math.PI * 2 - notch);
    // Slightly uneven edge so the facets catch the light differently.
    const r = radius * (0.94 + 0.06 * Math.sin(i * 2.7));
    return [Math.cos(a) * r, radius * 0.1, Math.sin(a) * r];
  };
  for (let i = 0; i < segments; i += 1) {
    positions.push(0, 0, 0, ...rim(i + 1), ...rim(i));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A small low-poly lotus: two rings of pink petals around a yellow heart. */
function makeLotus(padRadius: number): THREE.Group {
  const flower = new THREE.Group();
  flower.name = "lotus";
  const outer = new THREE.MeshStandardMaterial({ color: "#ffb8cb", roughness: 0.6, metalness: 0, flatShading: true, envMapIntensity: 0.4 });
  const inner = new THREE.MeshStandardMaterial({ color: "#ff96b4", roughness: 0.6, metalness: 0, flatShading: true, envMapIntensity: 0.4 });
  const size = padRadius * 0.5;
  const petal = new THREE.ConeGeometry(size * 0.32, size, 4);
  petal.translate(0, size / 2, 0);
  const rings: readonly [THREE.Material, number, number, number][] = [[outer, 7, 1.0, 0.0], [inner, 5, 0.55, 0.5]];
  for (const [material, count, tilt, offset] of rings) {
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(petal, material);
      const a = ((i + offset) / count) * Math.PI * 2;
      mesh.rotation.set(0, -a, 0);
      mesh.rotateZ(-tilt * 0.75);
      mesh.castShadow = true;
      flower.add(mesh);
    }
  }
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 0.22, 0), new THREE.MeshStandardMaterial({ color: "#ffd45c", roughness: 0.6, metalness: 0, flatShading: true }));
  heart.position.y = size * 0.25;
  flower.add(heart);
  flower.position.set(padRadius * 0.15, padRadius * 0.08, -padRadius * 0.1);
  return flower;
}

/** Smoothstep of x between a and b. */
function smoothRange(x: number, a: number, b: number): number {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
