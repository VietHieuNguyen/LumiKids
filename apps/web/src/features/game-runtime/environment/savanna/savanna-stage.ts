import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { driftAcross } from "../scenery-motion";
import { SAVANNA_BACKGROUND, savannaModelUrl, savannaSceneConfig } from "./savanna-scene-config";
import type { SavannaCloud, SavannaPlacement, SavannaSceneConfig } from "./savanna-scene-config";
import { loadSavannaTemplate, savannaPartName } from "./savanna-models";
import { breathing, headTilt, idleTurn, tailSwish, windSway } from "./savanna-motion";

type Actor = {
  place: SavannaPlacement;
  root: THREE.Group;
  body: THREE.Group;
  head?: THREE.Object3D;
  tail?: THREE.Object3D;
  /** Unit-scale size after yaw: x is the on-screen width, y the height. */
  size: THREE.Vector3;
  phase: number;
  casts: boolean;
};
type CloudActor = { cloud: SavannaCloud; root: THREE.Group; width: number };

/** Screen row (0..1) of the painted horizon after CSS `background: center / cover` cropping. */
export function savannaHorizon(width: number, height: number, background = SAVANNA_BACKGROUND): number {
  const scale = Math.max(width / background.width, height / background.height);
  const shown = background.height * scale;
  return ((height - shown) / 2 + background.horizon * shown) / height;
}

/** Downward camera pitch that puts the 3D horizon exactly on the painted one. */
export function savannaPitch(horizon: number, fovDegrees: number): number {
  return Math.atan((1 - 2 * horizon) * Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2));
}

export function resolvePlacement(place: SavannaPlacement, compact: boolean) {
  const override = compact ? place.compact : undefined;
  return {
    x: override?.x ?? place.x,
    foot: override?.foot ?? place.foot,
    height: override?.height ?? place.height,
    visible: override?.visible ?? place.visible ?? true,
  };
}

const CLOUD_DISTANCE = 160;

/**
 * Transparent perspective stage over the savanna PNG. The camera's horizon matches the painting,
 * models stand on one invisible ground plane that only receives soft, warm contact shadows.
 */
export function mountSavannaStage(canvas: HTMLCanvasElement, status: (value: string) => void, config: SavannaSceneConfig = savannaSceneConfig): () => void {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch { status("fallback"); return () => {}; }
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvas.style.visibility = "";

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(config.haze.color, config.haze.near, config.haze.far);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = config.lighting.environment;
  room.dispose(); pmrem.dispose();

  const light = config.lighting;
  scene.add(new THREE.HemisphereLight(light.sky, light.ground, light.hemisphere));
  const sun = new THREE.DirectionalLight(light.sun, light.sunIntensity);
  const sunDirection = new THREE.Vector3(...light.sunDirection).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.015;
  sun.shadow.radius = 5;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.ShadowMaterial({ color: light.shadowColor, opacity: light.shadowOpacity, depthWrite: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.05, 600);
  camera.position.set(0, 1, 0);

  const geometries = new Set<THREE.BufferGeometry>([ground.geometry]);
  const materials = new Set<THREE.Material>([ground.material]);
  function collect(object: THREE.Object3D) {
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    });
  }

  const actors: Actor[] = [];
  const clouds: CloudActor[] = [];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false, contextUnavailable = false, inView = true;
  let raf = 0, previous = 0, elapsed = 0, width = 1, height = 1;
  const ray = new THREE.Vector3(), forward = new THREE.Vector3(), viewPoint = new THREE.Vector3();

  function rayThrough(x: number, y: number) {
    return ray.set(x * 2 - 1, 1 - y * 2, 0.5).unproject(camera).sub(camera.position).normalize();
  }
  function frustumWidthAt(point: THREE.Vector3) {
    const depth = -viewPoint.copy(point).applyMatrix4(camera.matrixWorldInverse).z;
    return 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
  }

  function layout() {
    if (disposed || contextUnavailable) return;
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const horizon = savannaHorizon(width, height);
    camera.aspect = aspect;
    camera.rotation.set(-savannaPitch(horizon, camera.fov), 0, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const compact = aspect < config.camera.compactAspect;
    const sizeScale = THREE.MathUtils.clamp(aspect / config.camera.referenceAspect, config.camera.minSizeScale, 1);
    for (const actor of actors) {
      const spot = resolvePlacement(actor.place, compact);
      // Never stand on (or above) the horizon line, where a ground ray would not hit the plane.
      const direction = rayThrough(spot.x, Math.max(spot.foot, horizon + 0.015));
      actor.root.visible = spot.visible && direction.y < -1e-4;
      if (!actor.root.visible) continue;
      actor.root.position.copy(camera.position).addScaledVector(direction, -camera.position.y / direction.y);
      let scale = spot.height * sizeScale / actor.size.y;
      const maxWidth = actor.place.maxWidth;
      if (maxWidth) scale = Math.min(scale, maxWidth * frustumWidthAt(actor.root.position) / actor.size.x);
      actor.root.scale.setScalar(scale);
    }
    fitShadow();
    draw();
  }

  /** Fit the single shadow map tightly around nearby casters for crisp, cheap contact shadows. */
  function fitShadow() {
    const box = new THREE.Box3();
    for (const actor of actors) if (actor.casts && actor.root.visible) box.expandByObject(actor.root);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.5);
    sun.target.position.copy(sphere.center);
    sun.position.copy(sphere.center).addScaledVector(sunDirection, radius * 2);
    const shadow = sun.shadow.camera;
    shadow.left = -radius; shadow.right = radius; shadow.top = radius; shadow.bottom = -radius;
    shadow.near = 0.05; shadow.far = radius * 4; shadow.updateProjectionMatrix();
  }

  function placeClouds(time: number) {
    camera.getWorldDirection(forward);
    for (const { cloud, root, width: unitWidth } of clouds) {
      const x = motion.matches ? cloud.x : driftAcross(time, cloud.x, cloud.period);
      root.position.copy(camera.position).addScaledVector(rayThrough(x, cloud.y), CLOUD_DISTANCE);
      root.scale.setScalar(cloud.width * frustumWidthAt(root.position) / unitWidth);
    }
  }

  function draw() {
    const time = motion.matches ? 0 : elapsed;
    for (const actor of actors) {
      const { place, body, phase } = actor;
      if (place.motion === "tree" || place.motion === "grass") body.rotation.z = windSway(time, phase, place.motion);
      if (place.motion === "animal") {
        body.rotation.y = (place.yaw ?? 0) + idleTurn(time, phase);
        body.scale.set(1, 1 + breathing(time, phase), 1);
        // Parts live in the source Z-up frame: Y is the facing axis (head roll), Z is vertical (tail swish).
        if (actor.head) { actor.head.rotation.y = headTilt(time, phase); actor.head.rotation.z = idleTurn(time, phase + 2) * 1.4; }
        if (actor.tail) actor.tail.rotation.z = tailSwish(time, phase);
      }
    }
    placeClouds(time);
    renderer.render(scene, camera);
  }
  function frame(now: number) {
    raf = 0;
    if (disposed || contextUnavailable || !inView || document.hidden || motion.matches) return;
    const passed = previous ? Math.max(0, (now - previous) / 1000) : 0;
    previous = now;
    elapsed += Math.min(passed, 0.1);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    cancelAnimationFrame(raf); raf = 0; previous = 0;
    if (disposed || contextUnavailable) return;
    if (!document.hidden && inView) { draw(); if (!motion.matches) raf = requestAnimationFrame(frame); }
  }
  function contextLost(event: Event) {
    event.preventDefault(); contextUnavailable = true; cancelAnimationFrame(raf); status("fallback"); canvas.style.visibility = "hidden";
  }

  const observer = new ResizeObserver(layout); observer.observe(canvas);
  const visibility = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }); visibility.observe(canvas);
  document.addEventListener("visibilitychange", sync); motion.addEventListener("change", sync); canvas.addEventListener("webglcontextlost", contextLost);

  let failed = false;
  const horizonFoot = (place: SavannaPlacement) => place.foot - SAVANNA_BACKGROUND.horizon;
  const placements = [...config.environment, ...config.animals];
  const loadingPlacements = placements.map(async (place, index) => {
    try {
      const template = await loadSavannaTemplate(savannaModelUrl(place.model), place.rig);
      if (disposed) return;
      const model = template.object.clone(true);
      const body = new THREE.Group(); body.rotation.y = place.yaw ?? 0; body.add(model);
      const root = new THREE.Group(); root.name = `savanna-${place.id}`; root.add(body);
      root.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      // Distant scenery is hazy and tiny; skipping its shadows keeps the shadow map tight and sharp.
      const casts = (place.castShadow ?? true) && horizonFoot(place) > 0.15;
      model.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.castShadow = casts; node.receiveShadow = false;
      });
      collect(model);
      scene.add(root);
      actors.push({
        place, root, body, size, phase: index * 1.73, casts,
        head: model.getObjectByName(savannaPartName("head")),
        tail: model.getObjectByName(savannaPartName("tail")),
      });
      layout();
    } catch { failed = true; }
  });
  const loadingClouds = config.clouds.filter((cloud) => cloud.visible ?? true).map(async (cloud) => {
    try {
      const template = await loadSavannaTemplate(savannaModelUrl(cloud.model));
      if (disposed) return;
      const root = template.object.clone(true);
      root.name = `savanna-${cloud.id}`;
      root.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        // Sky is far beyond the haze; clouds keep their own soft white instead of fading into it.
        // Shape and vertex colours stay as authored; only a soft white lift for the underside.
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          material.fog = false;
          if (material instanceof THREE.MeshStandardMaterial) { material.emissive.set("#ffffff"); material.emissiveIntensity = light.cloudGlow; }
        }
      });
      collect(root);
      scene.add(root);
      clouds.push({ cloud, root, width: template.size.x });
      draw();
    } catch { failed = true; }
  });
  void Promise.all([...loadingPlacements, ...loadingClouds]).then(() => {
    if (!disposed && !contextUnavailable) status(failed ? (actors.length ? "partial" : "fallback") : "ready");
  });

  layout(); sync();
  return () => {
    disposed = true; cancelAnimationFrame(raf); observer.disconnect(); visibility.disconnect();
    document.removeEventListener("visibilitychange", sync); motion.removeEventListener("change", sync); canvas.removeEventListener("webglcontextlost", contextLost);
    // Templates stay cached for the next mount; this frees this renderer's GPU copies only.
    geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose());
    environment.dispose(); scene.clear(); renderer.dispose();
  };
}
