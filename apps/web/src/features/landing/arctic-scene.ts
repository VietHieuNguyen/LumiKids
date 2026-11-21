import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ARCTIC_GLOBE, ARCTIC_POINTS, arcticViewAt, arcticWarmth } from "./arctic-path";
import { ARCTIC_SEA, makeSchool, swimPose, uprightOn } from "./arctic-fish";
import type { Swimmer } from "./arctic-fish";
import { pickFriend } from "./arctic-pick";
import type { PickSphere } from "./arctic-pick";
import { STORY } from "./camera-path";
import { LANDING_ASSETS } from "./landing-assets";
import type { LandingStage, ScreenAnchor, StageQuality } from "./landing-stage";
import { clamp, lerp, seg, smooth } from "./scroll-math";

/** Which glTF node (by name prefix) answers to which friend key in the scene config. */
const FRIEND_NODES: readonly (readonly [prefix: string, id: string, height: number])[] = [
  ["ARC_Bear", "bear", 0.62],
  ["ARC_Husky", "husky", 0.42],
  ["ARC_Puffin_", "puffin", 0.3],
  ["SM_Bear_on_floe", "polarBear", 1.1],
  ["SM_Cub_on_floe", "polarBear", 0.6],
  ["SM_Fox_on_floe", "fox", 0.8],
  ["SM_Fox_Far_Fjord", "fox", 0.5],
  ["SM_Seal_on_ice", "seal", 0.6],
  ["SM_Seal_Far_Bay", "seal", 0.6],
  ["SM_Orca_below_surface", "orca", 1.4],
  ["SM_Walrus_on_ice", "walrus", 0.8],
];

const REACTION_SECONDS = 0.9;
const HEMI_DAY = new THREE.Color("#d8ecff");
const HEMI_DUSK = new THREE.Color("#ffd2b8");
const KEY_DAY = new THREE.Color("#fff6e8");
const KEY_DUSK = new THREE.Color("#ffb88a");

type Friend = {
  id: string;
  object: THREE.Object3D;
  height: number;
  basePosition: THREE.Vector3;
  baseQuaternion: THREE.Quaternion;
  /** The surface normal in the object's parent space: hops go "up" away from the globe. */
  up: THREE.Vector3;
  started: number;
};

type CampLight = { light: THREE.PointLight; base: number; phase: number };

/**
 * The Arctic globe (models/landing/arctic.glb) led by the valley's bear: scroll moves the camera
 * round the globe on the shared story timeline; camp lights warm up towards the campfire beat and
 * an aurora shows at the farewell. Same contract as ValleyStage, so landing-page treats both alike.
 */
export class ArcticStage implements LandingStage {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
  private readonly globe = new THREE.Group();
  private readonly hemi: THREE.HemisphereLight;
  private readonly key: THREE.DirectionalLight;
  private readonly campLights: CampLight[] = [];
  private readonly friends: Friend[] = [];
  private readonly fish: { mesh: THREE.Mesh; phase: number }[] = [];
  private orca: THREE.Mesh | null = null;
  /** Every fish (the file's and the extra clones) with its swim path, in globe-local space. */
  private readonly swimmers: { mesh: THREE.Mesh; swim: Swimmer; parentFromRoot: THREE.Matrix4; parentTurn: THREE.Quaternion }[] = [];
  /** Tuna and dolphins (built in code), each following its own slow swim path in globe-local space. */
  private readonly seaLife: { body: THREE.Group; mixer: THREE.AnimationMixer | null; swim: Swimmer; kind: "tuna" | "dolphins"; phase: number }[] = [];
  /** The orca's swim wrapper (so its greeting hop, which owns the orca's own transform, is untouched). */
  private orcaSwim: { group: THREE.Group; base: THREE.Vector3; forward: THREE.Vector3; up: THREE.Vector3; reach: number } | null = null;
  private readonly yawQuat = new THREE.Quaternion();
  private bubbles: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null;
  private readonly bubbleRise: number[] = [];
  private readonly basis = new THREE.Matrix4();
  private readonly fwd = new THREE.Vector3();
  private readonly upv = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  /** Blue haze once the camera dives under the surface (underwater beat). */
  private readonly fog = new THREE.FogExp2("#1f6f8c", 0);
  private readonly spinQuat = new THREE.Quaternion();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private spinAngle = 0;
  private mixer: THREE.AnimationMixer | null = null;
  private bear: Friend | null = null;
  private aurora: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly lookTarget = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private pmrem: THREE.PMREMGenerator | null = null;
  private spin = 0;
  private lastTime = -1;
  private lite: boolean;
  private width = 1;
  private height = 1;
  private desktop = true;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, quality: StageQuality) {
    this.lite = quality === "low";
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = this.pmrem.fromScene(room, 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    room.dispose();

    this.hemi = new THREE.HemisphereLight(HEMI_DAY, "#eef4f8", 1.5);
    this.key = new THREE.DirectionalLight(KEY_DAY, 2.0);
    this.key.position.set(-8, 11, 9);
    const fill = new THREE.DirectionalLight("#cfe6ff", 0.6);
    fill.position.set(9, 4, -6);
    this.scene.add(this.hemi, this.key, fill, this.globe);
  }

  async load(onReady: () => void): Promise<{ missing: string[] }> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    // The sea life is extra: the globe still opens if its file fails.
    const [gltf, sea] = await Promise.all([
      loader.loadAsync(LANDING_ASSETS.arctic),
      loader.loadAsync(LANDING_ASSETS.arcticSeaLife).catch(() => null),
    ]);
    if (this.disposed) return { missing: [] };
    const root = gltf.scene;
    this.globe.add(root);
    root.updateMatrixWorld(true);

    root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.name.startsWith("SM_Goldfish") || object.parent?.name.startsWith("SM_Goldfish")) {
          if (object.morphTargetInfluences?.length) this.fish.push({ mesh: object, phase: this.fish.length * 0.83 });
        }
        if (object.name === "SM_Orca_below_surface" && object.morphTargetInfluences?.length) this.orca = object;
      }
    });
    // Upright before the friends record their rest pose.
    this.uprightOrca(root);
    for (const [prefix, id, height] of FRIEND_NODES) {
      root.traverse((object) => {
        if (!object.name.startsWith(prefix) || this.friends.some((f) => f.object === object)) return;
        // Only the top node of each animal (not its child meshes).
        if (object.parent && object.parent.name.startsWith(prefix)) return;
        const friend = this.makeFriend(object, id, height);
        this.friends.push(friend);
        if (id === "bear") this.bear = friend;
      });
    }

    this.addSchools(root);
    if (sea) this.addSeaLife(root, sea.scene, sea.animations);
    this.addBubbles(root);

    const husky = root.getObjectByName("ARC_Husky");
    const idle = gltf.animations.find((clip) => clip.name === "Idle");
    if (husky && idle) {
      this.mixer = new THREE.AnimationMixer(husky);
      this.mixer.clipAction(idle).play();
    }

    this.addCampLight(root.getObjectByName("ARC_Light_Campfire"), "#ffb46b", 6, 3.2);
    this.addCampLight(root.getObjectByName("ARC_Light_Lantern"), "#ffd59a", 3.5, 2.4);
    this.addAurora();
    onReady();
    return { missing: [] };
  }

  /**
   * The goldfish mill round their schools (positions set each frame from swimPose), and extra copies
   * of the same fish (shared geometry and material) make the water feel full of life.
   */
  private addSchools(root: THREE.Object3D): void {
    const rootInverse = root.matrixWorld.clone().invert();
    const groups = new Map<string, THREE.Mesh[]>();
    for (const { mesh } of this.fish) {
      const key = mesh.name.includes("Far") || mesh.parent?.name.includes("Far") ? "far" : "front";
      groups.set(key, [...(groups.get(key) ?? []), mesh]);
    }
    const extra: Record<string, number> = { front: 26, far: 10 };
    let seed = 11;
    for (const [key, meshes] of groups) {
      const local = (mesh: THREE.Mesh) => mesh.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse);
      const center = meshes.reduce((sum, mesh) => sum.add(local(mesh)), new THREE.Vector3()).multiplyScalar(1 / meshes.length);
      const centre: [number, number, number] = [center.x, center.y, center.z];
      const school = makeSchool(centre, meshes.length + (extra[key] ?? 0), seed++, { radius: [0.45, key === "front" ? 1.5 : 1.0], depth: 0.7 });
      const template = meshes[0];
      school.forEach((swim, index) => {
        let mesh = meshes[index];
        if (!mesh) {
          mesh = template.clone();
          mesh.scale.multiplyScalar(0.8 + ((index * 37) % 10) / 25);
          template.parent?.add(mesh);
          this.fish.push({ mesh, phase: this.fish.length * 0.83 });
        }
        const parent = mesh.parent ?? root;
        const parentFromRoot = rootInverse.clone().multiply(parent.matrixWorld).invert();
        const parentTurn = new THREE.Quaternion().setFromRotationMatrix(parentFromRoot);
        this.swimmers.push({ mesh, swim, parentFromRoot, parentTurn });
      });
    }
    this.updateSwimmers(0);
  }

  private updateSwimmers(timeSeconds: number): void {
    for (const { mesh, swim, parentFromRoot, parentTurn } of this.swimmers) {
      const pose = swimPose(swim, timeSeconds);
      mesh.position.set(...pose.position).applyMatrix4(parentFromRoot);
      // The goldfish nose is +X, its back +Y.
      this.fwd.set(...pose.forward);
      this.upv.set(...pose.up);
      this.side.crossVectors(this.fwd, this.upv);
      this.basis.makeBasis(this.fwd, this.upv, this.side);
      mesh.quaternion.setFromRotationMatrix(this.basis).premultiply(parentTurn);
    }
  }

  /**
   * The orca came lying on its side (so the globe's outside showed its profile); under water beside the
   * upright goldfish it looked capsized. Turn it to swim level, back to the surface, keeping its heading.
   */
  private uprightOrca(root: THREE.Object3D): void {
    const orca = this.orca;
    const parent = orca?.parent;
    if (!orca || !parent) return;
    root.updateMatrixWorld(true);
    const rootInverse = root.matrixWorld.clone().invert();
    const inRoot = (object: THREE.Object3D) => {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const size = new THREE.Vector3();
      rootInverse.clone().multiply(object.matrixWorld).decompose(position, quaternion, size);
      return { position, quaternion, size };
    };
    const own = inRoot(orca);
    const holder = inRoot(parent);
    const heading = new THREE.Vector3(1, 0, 0).applyQuaternion(own.quaternion);
    const radial = own.position.clone().normalize();
    const level = uprightOn([heading.x, heading.y, heading.z], [radial.x, radial.y, radial.z]);
    const forward = new THREE.Vector3(...level.forward);
    const up = new THREE.Vector3(...level.up);
    this.basis.makeBasis(forward, up, new THREE.Vector3().crossVectors(forward, up));
    const toParent = holder.quaternion.clone().invert();
    const group = new THREE.Group();
    group.name = "OrcaSwim";
    group.position.copy(orca.position);
    parent.add(group);
    group.add(orca);
    orca.position.set(0, 0, 0);
    orca.quaternion.setFromRotationMatrix(this.basis).premultiply(toParent);
    orca.updateMatrixWorld(true);
    this.orcaSwim = {
      group,
      base: group.position.clone(),
      forward: forward.applyQuaternion(toParent),
      up: up.applyQuaternion(toParent),
      reach: 1 / (holder.size.x || 1),
    };
  }

  /** A slow glide back and forth with a gentle rise and a hint of a turn. */
  private updateOrca(timeSeconds: number): void {
    const swim = this.orcaSwim;
    if (!swim) return;
    const glide = Math.sin(timeSeconds * 0.22);
    swim.group.position.copy(swim.base)
      .addScaledVector(swim.forward, 0.14 * glide * swim.reach)
      .addScaledVector(swim.up, 0.04 * Math.sin(timeSeconds * 0.5) * swim.reach);
    swim.group.quaternion.setFromAxisAngle(swim.up, 0.05 * Math.cos(timeSeconds * 0.22));
  }

  /**
   * A school of tuna and a few dolphins round the goldfish (models from source/arctic/fish), slow and calm,
   * fewer on lite devices. Each is a rigged copy playing its own swim clip, out of step with the others.
   */
  private addSeaLife(root: THREE.Object3D, sea: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    const kinds = [["tuna", "SEA_Tuna", "Tuna_Swim", 21, 0.7], ["dolphins", "SEA_Dolphin", "Dolphin_Swim", 5, 0.55]] as const;
    for (const [kind, node, clipName, seed, pace] of kinds) {
      const template = sea.getObjectByName(node);
      if (!template) continue;
      const clip = clips.find((c) => c.name === clipName) ?? null;
      const spec = ARCTIC_SEA[kind];
      const count = this.lite ? Math.ceil(spec.count / 2) : spec.count;
      makeSchool(spec.center, count, seed, spec.shape).forEach((swim, index) => {
        const model = cloneSkinned(template);
        model.traverse((object) => { object.frustumCulled = false; });
        const body = new THREE.Group();
        body.add(model);
        body.scale.setScalar(0.9 + ((index * 7) % 5) * 0.05);
        root.add(body);
        let mixer: THREE.AnimationMixer | null = null;
        if (clip) {
          mixer = new THREE.AnimationMixer(model);
          const action = mixer.clipAction(clip);
          action.timeScale = pace * (0.9 + ((index * 3) % 4) * 0.06);
          action.play();
          action.time = (index * 0.37) % clip.duration;
        }
        this.seaLife.push({ body, mixer, swim, kind, phase: index * 1.3 });
      });
    }
    this.updateSeaLife(0, 0);
  }

  private updateSeaLife(timeSeconds: number, dt: number): void {
    for (const { body, mixer, swim, kind, phase } of this.seaLife) {
      const pose = swimPose(swim, timeSeconds);
      body.position.set(...pose.position);
      this.fwd.set(...pose.forward);
      this.upv.set(...pose.up);
      this.side.crossVectors(this.fwd, this.upv);
      this.basis.makeBasis(this.fwd, this.upv, this.side);
      body.quaternion.setFromRotationMatrix(this.basis);
      // Dolphins rise and dip a little as they swim.
      if (kind === "dolphins") body.quaternion.multiply(this.yawQuat.setFromAxisAngle(this.zAxis, 0.08 * Math.sin(timeSeconds * 0.9 + phase)));
      mixer?.update(dt);
    }
  }

  /** Little bubbles drifting up to the surface around the near school; seen from just above and under water. */
  private addBubbles(root: THREE.Object3D): void {
    const count = 80;
    const center = new THREE.Vector3(...ARCTIC_POINTS.fishSchool);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const p = this.bubbleSpot(center, i, Math.random());
      positions.set([p.x, p.y, p.z], i * 3);
      this.bubbleRise.push(0.18 + ((i * 53) % 17) / 60);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: "#e8fbff", size: 0.06, map: bubbleTexture(), transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true });
    this.bubbles = new THREE.Points(geometry, material);
    this.bubbles.frustumCulled = false;
    root.add(this.bubbles);
  }

  /** A bubble start point near the school, `depth01` of the way from deep to the surface. */
  private bubbleSpot(center: THREE.Vector3, index: number, depth01: number): THREE.Vector3 {
    const axis = center.clone().normalize();
    const a = index * 2.399963;
    const r = 0.3 + ((index * 29) % 23) / 13;
    const side = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
    const other = new THREE.Vector3().crossVectors(axis, side);
    const base = center.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(other, Math.sin(a) * r);
    const radius = THREE.MathUtils.lerp(base.length() - 0.6, ARCTIC_GLOBE.radius - 0.08, depth01);
    return base.normalize().multiplyScalar(radius);
  }

  private updateBubbles(dt: number): void {
    const bubbles = this.bubbles;
    if (!bubbles) return;
    const attribute = bubbles.geometry.getAttribute("position") as THREE.BufferAttribute;
    const center = new THREE.Vector3(...ARCTIC_POINTS.fishSchool);
    const p = new THREE.Vector3();
    for (let i = 0; i < attribute.count; i += 1) {
      p.fromBufferAttribute(attribute, i);
      const r = p.length() + this.bubbleRise[i] * dt;
      if (r > ARCTIC_GLOBE.radius - 0.06) p.copy(this.bubbleSpot(center, i, 0));
      else p.setLength(r);
      attribute.setXYZ(i, p.x, p.y, p.z);
    }
    attribute.needsUpdate = true;
  }

  private makeFriend(object: THREE.Object3D, id: string, height: number): Friend {
    const world = object.getWorldPosition(new THREE.Vector3());
    const normal = world.clone().sub(new THREE.Vector3(...ARCTIC_GLOBE.center)).normalize();
    const parent = object.parent ?? this.globe;
    const a = parent.worldToLocal(world.clone());
    const b = parent.worldToLocal(world.clone().add(normal));
    return {
      id,
      object,
      height,
      basePosition: object.position.clone(),
      baseQuaternion: object.quaternion.clone(),
      up: b.sub(a).normalize(),
      started: -1,
    };
  }

  private addCampLight(anchor: THREE.Object3D | undefined, color: string, intensity: number, distance: number): void {
    const light = new THREE.PointLight(color, 0, distance, 1.6);
    if (anchor) anchor.add(light);
    else light.position.set(...ARCTIC_POINTS.campfire);
    if (!anchor) this.globe.add(light);
    this.campLights.push({ light, base: intensity, phase: this.campLights.length * 1.7 });
  }

  /** Soft green/pink curtains behind the globe for the farewell; additive, faded in by the dusk beat. */
  private addAurora(): void {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // Alpha follows brightness: the canvas is transparent, so an opaque quad would paint the page black.
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
        varying vec2 vUv; uniform float uTime; uniform float uOpacity;
        void main(){
          float wave = sin(vUv.x * 9.0 + uTime * 0.35) * 0.06 + sin(vUv.x * 23.0 - uTime * 0.6) * 0.025;
          float band = smoothstep(0.18, 0.5, vUv.y + wave) * (1.0 - smoothstep(0.5, 0.95, vUv.y + wave));
          float streak = 0.65 + 0.35 * sin(vUv.x * 60.0 + uTime * 0.8 + sin(vUv.x * 7.0) * 3.0);
          float edge = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
          vec3 green = vec3(0.45, 1.0, 0.75);
          vec3 pink = vec3(0.95, 0.6, 1.0);
          vec3 color = mix(green, pink, smoothstep(0.45, 0.9, vUv.y));
          float a = band * streak * edge * uOpacity * 0.55;
          gl_FragColor = vec4(color, a);
        }`,
    });
    this.aurora = new THREE.Mesh(new THREE.PlaneGeometry(30, 10, 1, 1), material);
    this.aurora.visible = false;
    this.scene.add(this.aurora);
  }

  async warmUp(): Promise<void> {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((object) => {
      if (!object.visible) { hidden.push(object); object.visible = true; }
    });
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } finally {
      for (const object of hidden) object.visible = false;
    }
  }

  /** Last step of the adaptive quality ladder: steady lights, still aurora, no fish tails. */
  degrade(): void {
    this.lite = true;
  }

  private findFriend(x: number, y: number): Friend | null {
    this.pointer.set((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // A finger-sized sphere round each animal (like the valley); the globe body hides the far side.
    const spheres: PickSphere[] = this.friends.map((friend) => {
      const center = friend.object.getWorldPosition(new THREE.Vector3());
      center.addScaledVector(center.clone().normalize(), friend.height * 0.5);
      const distance = center.distanceTo(this.camera.position);
      return { center, radius: Math.max(friend.height * 0.62, distance * 0.022) };
    });
    const index = pickFriend(this.raycaster.ray, spheres, ARCTIC_GLOBE.radius - 0.05);
    return index === null ? null : this.friends[index];
  }

  friendAt(x: number, y: number): string | null {
    return this.findFriend(x, y)?.id ?? null;
  }

  poke(x: number, y: number): { id: string; x: number; y: number } | null {
    const friend = this.findFriend(x, y);
    if (!friend) return null;
    friend.started = Math.max(0, this.lastTime);
    friend.object.getWorldPosition(this.scratch);
    this.scratch.addScaledVector(this.scratch.clone().normalize(), friend.height * 1.1);
    this.scratch.project(this.camera);
    return { id: friend.id, x: (this.scratch.x * 0.5 + 0.5) * this.width, y: (-this.scratch.y * 0.5 + 0.5) * this.height };
  }

  hasCharacter(): boolean {
    return false;
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

  private poseCamera(p: number, parallaxX: number, parallaxY: number): void {
    const aspect = this.width / this.height;
    const portrait = aspect < 0.9;
    // The globe turns to bring each stop to the front; the camera stays in front of it.
    const shot = arcticViewAt(p, portrait);
    this.spinQuat.setFromAxisAngle(this.yAxis, this.spinAngle);
    this.globe.quaternion.set(...shot.globe).multiply(this.spinQuat);
    this.camera.position.set(...shot.position);
    this.lookTarget.set(...shot.target);
    this.camera.up.set(...shot.up);
    this.camera.lookAt(this.lookTarget);
    const under = smooth(clamp((ARCTIC_GLOBE.radius - this.camera.position.length()) / 0.35, 0, 1));
    this.fog.density = 0.14 * under;
    this.scene.fog = under > 0 ? this.fog : null;
    let fov = shot.fov;
    // Narrow screens: widen vertically so the horizontal view stays close to the desktop framing.
    const referenceAspect = 1.6;
    if (aspect < referenceAspect) {
      const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * referenceAspect);
      fov = Math.min(78, Math.max(fov, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf * 0.8) / aspect))));
    }
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    const shiftX = portrait || this.desktop ? shot.shiftX : 0;
    const offsetX = -shiftX * this.width + parallaxX;
    const offsetY = -shot.shiftY * this.height + parallaxY;
    if (offsetX !== 0 || offsetY !== 0) this.camera.setViewOffset(this.width, this.height, offsetX, offsetY, this.width, this.height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private applyLight(p: number, timeSeconds: number, animate: boolean): void {
    const warm = arcticWarmth(p);
    this.hemi.color.copy(HEMI_DAY).lerp(HEMI_DUSK, warm * 0.8);
    this.hemi.intensity = lerp(1.5, 1.05, warm);
    this.key.color.copy(KEY_DAY).lerp(KEY_DUSK, warm);
    this.key.intensity = lerp(2.0, 1.25, warm);
    const flickerOn = animate && !this.lite;
    for (const camp of this.campLights) {
      const t = timeSeconds * 1.0 + camp.phase;
      const flicker = flickerOn ? 1 + 0.12 * (Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1) * 0.3 + Math.sin(t * 2.9) * 0.2) : 1;
      camp.light.intensity = camp.base * (0.2 + 0.8 * warm) * flicker;
    }
    if (this.aurora) {
      const show = smooth(seg(p, STORY.duskStart, STORY.farewellHold[0]));
      this.aurora.visible = show > 0.002;
      this.aurora.material.uniforms.uOpacity.value = show;
      this.aurora.material.uniforms.uTime.value = animate && !this.lite ? timeSeconds : 0;
      // Behind the globe as seen from the camera, raised towards the sky.
      this.scratch.copy(this.camera.position).normalize().multiplyScalar(-14);
      this.aurora.position.set(this.scratch.x, this.scratch.y + 6.5, this.scratch.z);
      this.aurora.lookAt(this.camera.position);
    }
  }

  private updateFriends(timeSeconds: number): void {
    for (const friend of this.friends) {
      if (friend.started < 0) continue;
      const t = (timeSeconds - friend.started) / REACTION_SECONDS;
      const fade = t >= 1 ? 0 : 1 - t;
      const hop = Math.abs(Math.sin(t * Math.PI * 2)) * fade * friend.height * 0.3;
      friend.object.position.copy(friend.basePosition).addScaledVector(friend.up, hop);
      this.quat.setFromAxisAngle(friend.up, Math.sin(t * Math.PI * 3) * 0.25 * fade);
      friend.object.quaternion.copy(this.quat).multiply(friend.baseQuaternion);
      if (t >= 1) {
        friend.object.position.copy(friend.basePosition);
        friend.object.quaternion.copy(friend.baseQuaternion);
        friend.started = -1;
      }
    }
  }

  render(p: number, timeSeconds: number, parallaxX: number, parallaxY: number, animate: boolean): void {
    if (this.disposed) return;
    const dt = this.lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, timeSeconds - this.lastTime));
    this.lastTime = timeSeconds;

    // The globe turns slowly on the hero shot and eases back to its rest pose as the journey starts.
    if (animate && p < STORY.heroHold[1]) this.spin += dt * 0.04;
    this.spinAngle = this.spin * (1 - smooth(seg(p, STORY.heroHold[1], STORY.pondHold[0] - 0.03)));

    this.poseCamera(p, parallaxX, parallaxY);
    this.applyLight(p, timeSeconds, animate);

    if (animate) {
      this.mixer?.update(dt);
      if (!this.lite) {
        for (const { mesh, phase } of this.fish) {
          const influences = mesh.morphTargetInfluences;
          if (!influences) continue;
          const w = Math.sin(timeSeconds * 6.2 + phase);
          influences[0] = Math.max(0, w);
          if (influences.length > 1) influences[1] = Math.max(0, -w);
        }
      }
      const tail = this.orca?.morphTargetInfluences;
      if (tail) {
        // A slow, small up-and-down beat of the flukes (about a third of the Tail_Up / Tail_Down shapes).
        const w = 0.35 * Math.sin(timeSeconds * 2.1);
        tail[0] = Math.max(0, w);
        if (tail.length > 1) tail[1] = Math.max(0, -w);
      }
      this.updateSwimmers(timeSeconds);
      this.updateSeaLife(timeSeconds, dt);
      this.updateOrca(timeSeconds);
      if (!this.lite) this.updateBubbles(dt);
      this.updateFriends(timeSeconds);
      const bear = this.bear;
      if (bear && bear.started < 0) {
        // Bear greets on its beat (a happy sway), then calmly faces the fire.
        const greet = smooth(seg(p, STORY.heroHold[1], STORY.pondHold[0])) * (1 - smooth(seg(p, STORY.pondHold[1], STORY.elephantHold[0])));
        const sway = Math.sin(timeSeconds * 3.2) * 0.18 * greet + Math.sin(timeSeconds * 0.9) * 0.04;
        const bounce = Math.abs(Math.sin(timeSeconds * 3.2)) * 0.035 * greet;
        bear.object.position.copy(bear.basePosition).addScaledVector(bear.up, bounce);
        this.quat.setFromAxisAngle(bear.up, sway);
        bear.object.quaternion.copy(this.quat).multiply(bear.baseQuaternion);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  anchor(): ScreenAnchor {
    return { x: 0, y: 0, visible: false };
  }

  sample(p: number): number[] {
    this.poseCamera(p, 0, 0);
    return [...this.camera.position.toArray(), ...this.lookTarget.toArray()];
  }

  describe(): { position: number[]; target: number[]; fov: number; friends: number; fish: number; orcaTail: boolean; seaLife: number } {
    return {
      position: this.camera.position.toArray(),
      target: this.lookTarget.toArray(),
      fov: clamp(this.camera.fov, 0, 180),
      friends: this.friends.length,
      fish: this.fish.length,
      orcaTail: (this.orca?.morphTargetInfluences?.length ?? 0) >= 2,
      seaLife: this.seaLife.length,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
    for (const { mixer } of this.seaLife) mixer?.stopAllAction();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          for (const value of Object.values(material as unknown as Record<string, unknown>)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
      }
    });
    this.pmrem?.dispose();
    this.pmrem = null;
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}

/** A round bubble sprite: a bright rim, a clear middle and a small highlight. */
function bubbleTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const ring = context.createRadialGradient(32, 32, 10, 32, 32, 30);
  ring.addColorStop(0, "rgba(255,255,255,0.12)");
  ring.addColorStop(0.78, "rgba(255,255,255,0.35)");
  ring.addColorStop(0.92, "rgba(255,255,255,0.95)");
  ring.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = ring;
  context.beginPath();
  context.arc(32, 32, 31, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(255,255,255,0.9)";
  context.beginPath();
  context.arc(23, 22, 5, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
