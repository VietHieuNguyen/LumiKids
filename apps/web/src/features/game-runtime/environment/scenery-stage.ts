import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { SceneTheme } from "../model/backgrounds";
import { driftAcross, duckSwim, frogHop, FROG_HOP_DURATION, drinkingWeight, deerSipWeight } from "./scenery-motion";
import { createSkyAccents } from "./sky-accents";
import { createForestStream } from "./forest-stream";
import { createDrinker, restoreDrinkingPose, rememberDrinkingPose, solveDrinkingPose } from "./animal-drinking";
import type { Drinker } from "./animal-drinking";

type Kind = "tree" | "cloud" | "plant" | "prop" | "deer" | "elephant" | "duck" | "frog" | "water" | "ripple" | "drift";
type Placement = { asset: string; kind: Kind; x: number; foot: number; height: number; yaw?: number; mobileX?: number; mobileHeight?: number; kit?: "forest" | "pond"; measure?: "width"; lift?: number; motionPhase?: number; maxWidth?: number; support?: string; id?: string };
type Rig = { root: THREE.Group; body: THREE.Group; place: Placement; phase: number; anchorX: number; anchorZ: number; span: number; supportHeight: number; mixer?: THREE.AnimationMixer; idle?: THREE.AnimationAction; jump?: THREE.AnimationAction; lastHop?: number; drinker?: Drinker };
const isAnimal = (kind: Kind) => ["deer", "elephant", "duck", "frog"].includes(kind);

// Feet, flowers and props occupy separate patches. The two central glades stay completely clear.
const FOREST: readonly Placement[] = [
  { asset: "tree_round_large", kind: "tree", x: 0.095, foot: 0.88, height: 0.79, yaw: 0.12, mobileX: 0.015, mobileHeight: 0.58 },
  { asset: "tree_round_medium", kind: "tree", x: 0.91, foot: 0.875, height: 0.74, yaw: -0.18, mobileX: 0.985, mobileHeight: 0.55 },
  { asset: "tree_pine", kind: "tree", x: 0.025, foot: 0.78, height: 0.43, mobileX: -0.20, mobileHeight: 0.36 },
  { asset: "tree_sapling", kind: "tree", x: 0.97, foot: 0.79, height: 0.35, mobileX: 1.20, mobileHeight: 0.32 },
  { asset: "cloud_long", kind: "cloud", x: 0.28, foot: 0.12, height: 0.075, mobileX: 0.24 },
  { asset: "cloud_puffy_large", kind: "cloud", x: 0.52, foot: 0.09, height: 0.065, mobileX: 0.57 },
  { asset: "cloud_puffy_small", kind: "cloud", x: 0.77, foot: 0.16, height: 0.08, mobileX: 0.86 },
  { asset: "bush_round", kind: "plant", x: 0.055, foot: 0.93, height: 0.11, mobileX: -0.05 },
  { asset: "bush_small", kind: "plant", x: 0.94, foot: 0.925, height: 0.10, mobileX: 1.05 },
  { asset: "fallen_log", kind: "prop", x: 0.14, foot: 0.95, height: 0.065, yaw: -0.2, mobileX: -0.12 },
  { asset: "mushroom_cluster", kind: "prop", x: 0.105, foot: 0.97, height: 0.055, mobileX: -0.02 },
  { asset: "rock_small", kind: "prop", x: 0.88, foot: 0.96, height: 0.065, mobileX: 1.01 },
  { asset: "flower_pink", kind: "plant", x: 0.035, foot: 0.975, height: 0.075, mobileX: -0.04 },
  { asset: "flower_yellow", kind: "plant", x: 0.97, foot: 0.98, height: 0.075, mobileX: 1.04 },
  { asset: "grass_tuft_a", kind: "plant", x: 0.17, foot: 0.965, height: 0.045, mobileX: -0.06 },
  { asset: "grass_tuft_b", kind: "plant", x: 0.835, foot: 0.965, height: 0.05, mobileX: 1.06 },
  { asset: "deer", kind: "deer", x: 0.30, foot: 0.925, height: 0.245, yaw: 0.50, mobileX: 0.245 },
  { asset: "elephant", kind: "elephant", x: 0.74, foot: 0.925, height: 0.235, yaw: -Math.PI / 2 - 0.25, mobileX: 0.76, maxWidth: 0.40 },
];

// Waterline/shore decorations leave the middle for cards and the lower middle for the number choices.
// Thin pads/ripples are sized by width, so their tiny GLB height cannot turn them into giant discs.
const POND: readonly Placement[] = [
  { asset: "cloud_long", kind: "cloud", x: 0.25, foot: 0.10, height: 0.055, mobileX: 0.25 },
  { asset: "cloud_puffy_small", kind: "cloud", x: 0.75, foot: 0.16, height: 0.055, mobileX: 0.8 },
  { asset: "cattails_three", kit: "pond", kind: "plant", x: 0.035, foot: 0.43, height: 0.23, mobileX: -0.035 },
  { asset: "cattails_two", kit: "pond", kind: "plant", x: 0.965, foot: 0.45, height: 0.22, mobileX: 1.035 },
  { asset: "shore_rocks_small", kit: "pond", kind: "prop", x: 0.09, foot: 0.43, height: 0.075, mobileX: -0.035 },
  { asset: "reeds_short", kit: "pond", kind: "plant", x: 0.965, foot: 0.97, height: 0.16, mobileX: 1.05 },
  { asset: "reeds_tall", kit: "pond", kind: "plant", x: 0.025, foot: 0.96, height: 0.21, mobileX: -0.07 },
  { asset: "lotus_white_on_pad", kit: "pond", kind: "water", x: 0.095, foot: 0.97, height: 0.16, measure: "width", mobileX: -0.05, maxWidth: 0.18 },
  { asset: "lotus_pink_on_pad", kit: "pond", kind: "water", x: 0.92, foot: 0.97, height: 0.17, measure: "width", mobileX: 1.02, maxWidth: 0.18 },
  { asset: "lily_pad_small", kit: "pond", kind: "water", x: 0.64, foot: 0.96, height: 0.10, measure: "width", mobileX: 0.61, maxWidth: 0.13 },
  { asset: "lily_pad_single", id: "frog-pad-near", kit: "pond", kind: "water", x: 0.775, foot: 0.91, height: 0.30, measure: "width", mobileX: 0.79, maxWidth: 0.41 },
  { asset: "lily_pad_single", id: "frog-pad-far", kit: "pond", kind: "water", x: 0.79, foot: 0.76, height: 0.30, measure: "width", mobileX: 0.79, maxWidth: 0.41 },
  { asset: "lily_pad_small", kit: "pond", kind: "drift", x: 0.16, foot: 0.665, height: 0.10, measure: "width", maxWidth: 0.17, motionPhase: 0 },
  { asset: "lily_pad_cluster", kit: "pond", kind: "drift", x: 0.58, foot: 0.70, height: 0.14, measure: "width", maxWidth: 0.22, motionPhase: 1 },
  { asset: "lily_pad_small", kit: "pond", kind: "drift", x: 0.94, foot: 0.64, height: 0.085, measure: "width", maxWidth: 0.15, motionPhase: 2 },
  { asset: "pond_ripple", kit: "pond", kind: "ripple", x: 0.255, foot: 0.895, height: 0.27, measure: "width", mobileX: 0.25, motionPhase: 0, maxWidth: 0.32 },
  { asset: "duck", kind: "duck", x: 0.255, foot: 0.895, height: 0.17, yaw: 0.65, mobileX: 0.25, motionPhase: 0, maxWidth: 0.32 },
  { asset: "pond_ripple", kit: "pond", kind: "ripple", x: 0.41, foot: 0.855, height: 0.18, measure: "width", mobileX: 0.43, motionPhase: 0.6, maxWidth: 0.22 },
  { asset: "duck", kind: "duck", x: 0.41, foot: 0.855, height: 0.115, yaw: 0.7, mobileX: 0.43, motionPhase: 0.6, maxWidth: 0.21 },
  { asset: "frog", kind: "frog", x: 0.775, foot: 0.91, height: 0.14, lift: 0.019, support: "frog-pad-near", yaw: -0.25, mobileX: 0.79, maxWidth: 0.37 },
];

/** A transparent stage over background.png, with a shared ground and real contact shadows. */
export function mountSceneryStage(canvas: HTMLCanvasElement, status: (value: string) => void, theme: SceneTheme): () => void {
  const composition = theme === "pond" ? POND : FOREST;
  const tilt = THREE.MathUtils.degToRad(theme === "pond" ? 24 : 12);
  const SIN_TILT = Math.sin(tilt), COS_TILT = Math.cos(tilt);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch { status("fallback"); return () => {}; }
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 14000);
  camera.position.set(0, SIN_TILT * 6000, COS_TILT * 6000);
  camera.lookAt(0, 0, 0);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.localClippingEnabled = true;
  canvas.style.visibility = "";
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.32;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#f2fbff", "#a7bb6f", 1.7));
  const sun = new THREE.DirectionalLight("#fff2d8", 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 1;
  sun.shadow.bias = -0.00015;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  // Invisible floor: PNG supplies grass colour, this plane receives actual model shadows.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000), new THREE.ShadowMaterial({ opacity: theme === "pond" ? 0.10 : 0.16, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.6;
  ground.receiveShadow = true;
  scene.add(ground);
  const rigs: Rig[] = [];
  const geometries = new Set<THREE.BufferGeometry>([ground.geometry]);
  const materials = new Set<THREE.Material>([ground.material]);
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  let disposed = false, contextUnavailable = false, inView = true, failed = false;
  let raf = 0, previous = 0, elapsed = 0, width = 1, height = 1;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function collect(object: THREE.Object3D) {
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      geometries.add(node.geometry);
      if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
  }
  function release() {
    geometries.forEach((value) => value.dispose()); materials.forEach((value) => value.dispose()); textures.forEach((value) => value.dispose());
    skeletons.forEach((value) => value.dispose());
    geometries.clear(); materials.clear(); textures.clear(); skeletons.clear();
  }
  const sky = theme === "forest" ? createSkyAccents(camera) : null;
  if (sky) { scene.add(sky.group); collect(sky.group); }
  const stream = theme === "forest" ? createForestStream(SIN_TILT) : null;
  if (stream) { scene.add(stream.group); collect(stream.group); }
  const drinkWeights = [0, 0];
  const drinkTarget = new THREE.Vector3();
  // The new forest kit uses only vertex colours and static nodes: one draw call per merged instance.
  function mergeForest(model: THREE.Group): THREE.Object3D {
    model.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    model.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
      geometry.applyMatrix4(node.matrixWorld); geometry.computeVertexNormals(); parts.push(geometry);
    });
    const merged = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    return merged ? new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 })) : model;
  }

  function layout() {
    if (disposed || contextUnavailable) return;
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setSize(width, height, false);
    camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    const compact = width < 1000;
    const extent = Math.max(width, height * 3);
    sun.position.set(-extent * 0.5, extent, extent * 0.8); sun.target.position.set(0, 0, height);
    const shadow = sun.shadow.camera;
    shadow.left = -extent; shadow.right = extent; shadow.top = extent; shadow.bottom = -extent;
    shadow.near = 1; shadow.far = extent * 5; shadow.updateProjectionMatrix();
    for (const rig of rigs) {
      const p = rig.place;
      const animal = isAnimal(p.kind);
      const x = compact ? p.mobileX ?? p.x : p.x;
      let size = height * (compact ? p.mobileHeight ?? p.height : p.height);
      if (animal || p.maxWidth) size = Math.min(size, width * (p.maxWidth ?? 0.34) / Math.max(rig.span, 0.01));
      rig.root.scale.setScalar(size / COS_TILT);
      // Solve screen Y on the ground plane; all land objects have feet at world y=0.
      rig.anchorX = (x - 0.5) * width;
      rig.anchorZ = (p.foot - 0.5) * height / SIN_TILT;
      rig.root.position.set(rig.anchorX, (p.lift ?? 0) * height, rig.anchorZ);
      if (p.kind === "cloud") {
        rig.root.position.y = (0.5 - p.foot) * height / COS_TILT;
        rig.root.position.z = 0;
      }
    }
    if (stream) {
      const contacts = ["deer", "elephant"].map((kind) => {
        const rig = rigs.find((candidate) => candidate.place.kind === kind && candidate.drinker);
        return rig?.drinker ? rig.root.localToWorld(rig.drinker.target.clone()) : undefined;
      });
      if (contacts[0] && contacts[1]) stream.layout(width, height, [contacts[0], contacts[1]]);
      else stream.layout(width, height, []);
    }
    draw(0);
  }
  function draw(dt: number) {
    for (const rig of rigs) {
      const kind = rig.place.kind;
      if (kind === "tree") rig.body.rotation.z = motion.matches ? 0 : Math.sin(elapsed * 0.35 + rig.phase) * 0.008;
      if (kind === "plant") rig.body.rotation.z = motion.matches ? 0 : Math.sin(elapsed * 0.7 + rig.phase) * 0.018;
      if (kind === "cloud" || kind === "drift") {
        const t = motion.matches ? 0 : elapsed;
        const initial = rig.anchorX / width + 0.5;
        rig.root.position.x = (driftAcross(t, initial, kind === "cloud" ? 115 + rig.phase : 95 + (rig.place.motionPhase ?? 0) * 12) - 0.5) * width;
        if (kind === "drift") rig.body.rotation.y = motion.matches ? 0 : Math.sin(elapsed * 0.18 + rig.phase) * 0.10;
      }
      if (kind === "duck" || kind === "ripple") {
        const phase = rig.place.motionPhase ?? 0;
        const pose = duckSwim(motion.matches ? 0 : elapsed, phase);
        rig.root.position.x = rig.anchorX + pose.offsetX * width;
        rig.root.position.z = rig.anchorZ + pose.offsetY * height / SIN_TILT;
        if (kind === "duck") {
          rig.body.rotation.y = pose.heading;
          rig.body.position.y = -0.14 + (motion.matches ? 0 : Math.sin(elapsed * 1.2 + phase) * 0.012);
        }
      }
      if (kind === "water" || kind === "frog" || kind === "drift") rig.root.position.y = (rig.place.lift ?? 0) * height + (motion.matches ? 0 : Math.sin(elapsed * 1.1) * height * 0.001);
      if (kind === "elephant") {
        const breathe = motion.matches ? 0 : Math.sin(elapsed * 1.5) * 0.012;
        rig.body.scale.set(1 - breathe * 0.35, 1 + breathe, 1 - breathe * 0.35);
        rig.body.rotation.y = (rig.place.yaw ?? 0) + (motion.matches ? 0 : Math.sin(elapsed * 0.45) * 0.045);
      }
      if (rig.drinker) restoreDrinkingPose(rig.drinker);
      if (kind === "deer" && rig.drinker && motion.matches && rig.idle) rig.idle.time = 1.6;
      if (kind !== "frog") rig.mixer?.update(dt);
      if (rig.drinker) {
        rememberDrinkingPose(rig.drinker);
        const weight = kind === "deer" ? deerSipWeight(rig.idle?.time ?? 1.6) : drinkingWeight(motion.matches ? 0 : elapsed + 1.5);
        rig.root.localToWorld(drinkTarget.copy(rig.drinker.target));
        solveDrinkingPose(rig.drinker, drinkTarget, weight);
        drinkWeights[kind === "deer" ? 0 : 1] = weight;
      }
    }
    // Idle between short, infrequent hops; both endpoints follow the pads' real tops at every viewport size.
    for (const rig of rigs) {
      if (!rig.place.support) continue;
      const pads = ["frog-pad-near", "frog-pad-far"].map((id) => rigs.find((candidate) => candidate.place.id === id));
      const pose = frogHop(motion.matches ? 0 : elapsed);
      const from = pads[pose.from] ?? pads[0];
      const to = pads[pose.to] ?? from;
      if (!from || !to) continue;
      const travel = pose.travel;
      rig.root.position.lerpVectors(from.root.position, to.root.position, travel);
      rig.root.position.y = THREE.MathUtils.lerp(from.root.position.y + from.supportHeight * from.root.scale.y, to.root.position.y + to.supportHeight * to.root.scale.y, travel) + pose.arc * height * 0.045;
      const baseYaw = rig.place.yaw ?? 0;
      const heading = Math.atan2(to.root.position.x - from.root.position.x, to.root.position.z - from.root.position.z);
      const turn = Math.atan2(Math.sin(heading - baseYaw), Math.cos(heading - baseYaw));
      const turnWeight = pose.active ? Math.sin(Math.PI * pose.progress) : 0;
      rig.body.rotation.y = baseYaw + turn * turnWeight;
      if (pose.active && rig.lastHop !== pose.key) {
        rig.lastHop = pose.key;
        // The source Jump stretches almost twice as tall; a partial blend keeps this gentle hop below the answers.
        rig.idle?.setEffectiveWeight(0.55);
        rig.jump?.reset().setEffectiveWeight(0.45).fadeIn(0.12).play();
        if (rig.jump) rig.jump.paused = true;
      } else if (!pose.active && rig.lastHop !== undefined) {
        rig.lastHop = undefined;
        rig.jump?.fadeOut(0.15);
        rig.idle?.setEffectiveWeight(1).play();
      }
      if (pose.active && rig.jump) rig.jump.time = pose.progress * rig.jump.getClip().duration;
      if (motion.matches) { rig.jump?.stop(); rig.idle?.reset().setEffectiveWeight(1).play(); }
      rig.mixer?.update(dt);
    }
    sky?.update(width, height, elapsed, motion.matches);
    stream?.update(motion.matches ? 0 : elapsed, drinkWeights);
    renderer.render(scene, camera);
  }
  function frame(now: number) {
    raf = 0;
    if (disposed || contextUnavailable || !inView || document.hidden || motion.matches) return;
    const passed = previous ? Math.max(0, (now - previous) / 1000) : 0;
    previous = now;
    elapsed += passed;
    draw(Math.min(passed, 0.1));
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    cancelAnimationFrame(raf); raf = 0; previous = 0;
    if (disposed || contextUnavailable) return;
    if (!document.hidden && inView) { draw(0); if (!motion.matches) raf = requestAnimationFrame(frame); }
  }
  function contextLost(event: Event) {
    event.preventDefault(); contextUnavailable = true; cancelAnimationFrame(raf); status("fallback"); canvas.style.visibility = "hidden";
  }
  const observer = new ResizeObserver(layout); observer.observe(canvas);
  const visibility = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }); visibility.observe(canvas);
  document.addEventListener("visibilitychange", sync); motion.addEventListener("change", sync); canvas.addEventListener("webglcontextlost", contextLost);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const models = new Map<string, Promise<{ model: THREE.Object3D; clips: THREE.AnimationClip[] }>>();
  function load(place: Placement) {
    let pending = models.get(place.asset);
    if (!pending) {
      const animal = isAnimal(place.kind);
      const kit = animal ? "landing" : place.kit ?? "forest";
      pending = loader.loadAsync(`/models/${kit}/${place.asset}.glb`).then((gltf) => {
        collect(gltf.scene);
        const model = kit === "forest" ? mergeForest(gltf.scene) : gltf.scene;
        collect(model); return { model, clips: gltf.animations };
      });
      models.set(place.asset, pending);
    }
    return pending;
  }
  void Promise.all(composition.map(async (place, index) => {
    try {
      const { model: source, clips } = await load(place);
      if (disposed) { release(); return; }
      const model = isAnimal(place.kind) ? cloneSkinned(source) : source.clone(true);
      let mixer: THREE.AnimationMixer | undefined;
      let idleAction: THREE.AnimationAction | undefined;
      let jumpAction: THREE.AnimationAction | undefined;
      if (isAnimal(place.kind)) {
        const idle = clips.find((clip) => clip.name === (place.kind === "duck" ? "Swim" : "Idle")) ?? clips[0];
        if (idle) {
          mixer = new THREE.AnimationMixer(model);
          mixer.timeScale = place.kind === "frog" ? 1 : 0.7;
          idleAction = mixer.clipAction(idle).play(); mixer.update(0);
          if (place.kind === "frog") {
            const jump = clips.find((clip) => /jump/i.test(clip.name));
            if (jump) {
              jumpAction = mixer.clipAction(jump);
              jumpAction.setLoop(THREE.LoopOnce, 1); jumpAction.clampWhenFinished = true;
              jumpAction.timeScale = jump.duration / FROG_HOP_DURATION;
            }
          }
        }
      }
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const normalized = new THREE.Group();
      model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z)); normalized.add(model);
      normalized.scale.setScalar(1 / Math.max(place.measure === "width" ? Math.max(box.max.x - box.min.x, box.max.z - box.min.z) : box.max.y - box.min.y, 0.00001));
      const body = new THREE.Group(); body.add(normalized); body.rotation.y = place.yaw ?? 0;
      const root = new THREE.Group(); root.name = `${theme}-${place.asset}-${index}`; root.add(body); scene.add(root);
      root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
      let drinker: Drinker | undefined;
      if (theme === "forest" && (place.kind === "deer" || place.kind === "elephant")) {
        if (place.kind === "deer" && mixer) {
          const eating = clips.find((clip) => clip.name === "Eating");
          if (eating) { idleAction?.stop(); idleAction = mixer.clipAction(eating); idleAction.time = 1.6; idleAction.play(); mixer.update(0); }
        }
        drinker = createDrinker(model, root, place.kind);
      }
      model.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.castShadow = !["cloud", "water", "ripple", "duck", "frog", "drift"].includes(place.kind);
        node.receiveShadow = place.kind !== "cloud"; node.frustumCulled = false;
        if (place.kind === "duck") {
          // Keep feet below the waterline; the Swim clip still animates the visible body naturally.
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          const next = mats.map((material) => { const clone = material.clone(); clone.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]; return clone; });
          node.material = Array.isArray(node.material) ? next : next[0];
        }
      });
      collect(model);
      // Fit the duck's whole turning envelope without measuring an already-rotated box twice.
      const span = place.kind === "duck" ? Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) * normalized.scale.x : bounds.x;
      rigs.push({ root, body, place, phase: index * 1.7, anchorX: 0, anchorZ: 0, span, supportHeight: bounds.y, mixer, idle: idleAction, jump: jumpAction, drinker }); layout();
    } catch { failed = true; }
  })).then(() => { if (!disposed && !contextUnavailable) status(failed ? (rigs.length ? "partial" : "fallback") : "ready"); });
  layout(); sync();
  return () => {
    disposed = true; cancelAnimationFrame(raf); observer.disconnect(); visibility.disconnect();
    document.removeEventListener("visibilitychange", sync); motion.removeEventListener("change", sync); canvas.removeEventListener("webglcontextlost", contextLost);
    rigs.forEach((rig) => { rig.mixer?.stopAllAction(); if (rig.mixer) rig.mixer.uncacheRoot(rig.mixer.getRoot()); });
    release(); environment.dispose(); scene.clear(); renderer.dispose();
  };
}
