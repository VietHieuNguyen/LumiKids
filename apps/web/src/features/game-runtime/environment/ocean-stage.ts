import { createOceanPenguin } from "./ocean-penguin";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/** Decorative actors stay around the board, never mixed with the objects being counted. */
export interface OceanActor {
  file: string;
  node: string;
  x: number;
  y: number;
  size: number;
  speed: number;
  anchor?: "bottom-left" | "bottom-right";
  yaw?: number;
  roll?: number;
  bob?: number;
}
export const OCEAN_PENGUIN: OceanActor = {
  file: "",
  node: "OceanPenguin",
  x: 0,
  y: 0,
  size: 3.8,
  speed: 0,
  anchor: "bottom-right",
  yaw: -0.35,
  bob: 0.02,
};
export const OCEAN_ACTORS: readonly OceanActor[] = [
  {
    file: "arctic.glb",
    node: "SM_Orca_below_surface",
    x: 0,
    y: 0,
    size: 7.5,
    speed: 0,
    anchor: "bottom-left",
    yaw: -0.75,
    roll: 0.12,
    bob: 0.08,
  },
  {
    file: "arctic-sea-life.glb",
    node: "Dolphin",
    x: 9,
    y: 4,
    size: 3,
    speed: 0.24,
  },
  {
    file: "arctic-sea-life.glb",
    node: "MantaRay",
    x: 9,
    y: -5,
    size: 3,
    speed: 0.12,
  },
  ...Array.from({ length: 6 }, (_, i) => ({
    file: "arctic-sea-life.glb",
    node: "Tuna",
    x: -11 + i * 1.1,
    y: 5 + (i % 2) * 0.6,
    size: 0.9,
    speed: 0.3,
  })),
];

export function mountOceanStage(
  canvas: HTMLCanvasElement,
  status: (value: string) => void,
): () => void {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
  } catch {
    status("fallback");
    return () => {};
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x529db8, 0.018);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 25);
  scene.add(new THREE.HemisphereLight(0xe3faff, 0x184b68, 2.4));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(-3, 9, 12);
  scene.add(light);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const geometry = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  const collect = (root: THREE.Object3D) =>
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      geometry.add(node.geometry);
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
      }
    });
  const release = () => {
    geometry.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };
  const actors: {
    body: THREE.Group;
    source: (typeof OCEAN_ACTORS)[number];
    phase: number;
    bounds: THREE.Vector3;
  }[] = [];
  // Low-poly seabed rocks, behind the learning panels.
  const rockGeometry = new THREE.IcosahedronGeometry(1, 0),
    rockMaterial = new THREE.MeshStandardMaterial({
      color: 0xa2c7ce,
      roughness: 1,
    });
  geometry.add(rockGeometry);
  materials.add(rockMaterial);
  for (let i = 0; i < 8; i++) {
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.set(-14 + i * 4, -8, -4);
    rock.scale.set(2.5 + (i % 3), 1.2 + (i % 2), 2);
    scene.add(rock);
  }
  const bubbleGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(70 * 3);
  for (let i = 0; i < 70; i++) {
    positions[i * 3] = Math.sin(i * 13.7) * 17;
    positions[i * 3 + 1] = ((i * 0.87) % 20) - 10;
    positions[i * 3 + 2] = -2 - (i % 5);
  }
  bubbleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  const bubbleCanvas = document.createElement("canvas");
  bubbleCanvas.width = bubbleCanvas.height = 64;
  const context = bubbleCanvas.getContext("2d");
  let bubbleTexture: THREE.CanvasTexture | null = null;
  if (context) {
    context.strokeStyle = "rgba(222,250,255,.8)";
    context.lineWidth = 3;
    context.fillStyle = "rgba(212,246,255,.09)";
    context.beginPath();
    context.arc(32, 32, 27, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    bubbleTexture = new THREE.CanvasTexture(bubbleCanvas);
    textures.add(bubbleTexture);
  }
  const bubbleMaterial = new THREE.PointsMaterial({
    color: 0xd3f5ff,
    map: bubbleTexture,
    size: 0.14,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  geometry.add(bubbleGeometry);
  materials.add(bubbleMaterial);
  scene.add(new THREE.Points(bubbleGeometry, bubbleMaterial));
  let disposed = false,
    visible = true,
    contextLost = false,
    raf = 0,
    time = 0,
    last = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const draw = (now: number) => {
    if (disposed || contextLost) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (!reduced.matches) time += dt;
    actors.forEach(({ body, source, phase, bounds }) => {
      body.rotation.set(
        0,
        source.yaw ?? Math.sin(time * 0.2 + phase) * 0.12,
        source.roll ?? 0,
      );
      const halfHeight =
        Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
        (camera.position.z + 2);
      const halfWidth = halfHeight * camera.aspect;
      if (source.anchor) {
        body.position.set(
          (source.anchor === "bottom-left" ? -1 : 1) *
            Math.max(0, halfWidth - bounds.x / 2 - 0.28),
          -halfHeight +
            bounds.y / 2 +
            0.12 +
            Math.sin(time * 0.35 + phase) * (source.bob ?? 0),
          -2,
        );
      } else
        body.position.set(
          source.x * Math.min(1, camera.aspect) +
            Math.sin(time * source.speed + phase) * 1.7,
          source.y + Math.sin(time * 0.3 + phase) * 0.35,
          -2,
        );
      body.traverse((node) => {
        if (node instanceof THREE.Mesh && node.morphTargetInfluences?.length)
          node.morphTargetInfluences[0] =
            0.5 + 0.5 * Math.sin(time * 2 + phase);
      });
    });
    if (!reduced.matches) {
      for (let i = 0; i < 70; i++)
        positions[i * 3 + 1] =
          ((positions[i * 3 + 1] + dt * 0.45 + 10) % 20) - 10;
      bubbleGeometry.attributes.position.needsUpdate = true;
    }
    renderer.render(scene, camera);
    if (visible && !document.hidden && !reduced.matches)
      raf = requestAnimationFrame(draw);
  };
  const sync = () => {
    cancelAnimationFrame(raf);
    last = 0;
    if (visible && !document.hidden && !disposed && !contextLost)
      raf = requestAnimationFrame(draw);
  };
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (width && height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      sync();
    }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  intersection.observe(canvas);
  const lost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(raf);
    status("fallback");
  };
  canvas.addEventListener("webglcontextlost", lost);
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", sync);
  const penguin = createOceanPenguin();
  collect(penguin);
  const penguinBox = new THREE.Box3().setFromObject(penguin),
    penguinSize = penguinBox.getSize(new THREE.Vector3());
  const penguinBody = new THREE.Group();
  penguin.position.sub(penguinBox.getCenter(new THREE.Vector3()));
  penguinBody.add(penguin);
  penguinBody.scale.setScalar(
    OCEAN_PENGUIN.size / Math.max(penguinSize.x, penguinSize.y, penguinSize.z),
  );
  penguinBody.rotation.y = OCEAN_PENGUIN.yaw ?? 0;
  const penguinBounds = new THREE.Box3()
    .setFromObject(penguinBody)
    .getSize(new THREE.Vector3());
  scene.add(penguinBody);
  actors.push({
    body: penguinBody,
    source: OCEAN_PENGUIN,
    phase: 0,
    bounds: penguinBounds,
  });
  void Promise.all(
    [...new Set(OCEAN_ACTORS.map((a) => a.file))].map(async (file) => {
      try {
        const gltf = await loader.loadAsync(`/models/landing/${file}`);
        collect(gltf.scene);
        if (disposed) {
          release();
          return false;
        }
        OCEAN_ACTORS.filter((a) => a.file === file).forEach((source, index) => {
          const original = gltf.scene.getObjectByName(source.node);
          if (!original) return;
          const mesh = original.clone(true);
          mesh.position.set(0, 0, 0);
          mesh.rotation.set(0, 0, 0);
          mesh.scale.setScalar(1);
          const body = new THREE.Group();
          body.add(mesh);
          const box = new THREE.Box3().setFromObject(body),
            size = box.getSize(new THREE.Vector3());
          mesh.position.sub(box.getCenter(new THREE.Vector3()));
          body.scale.setScalar(
            source.size / Math.max(size.x, size.y, size.z, 0.001),
          );
          scene.add(body);
          body.rotation.set(0, source.yaw ?? 0, source.roll ?? 0);
          const bounds = new THREE.Box3()
            .setFromObject(body)
            .getSize(new THREE.Vector3());
          actors.push({ body, source, phase: index * 1.3, bounds });
        });
        sync();
        return true;
      } catch {
        return false;
      }
    }),
  ).then((results) => {
    if (!disposed)
      status(
        results.every(Boolean)
          ? "ready"
          : actors.length
            ? "partial"
            : "fallback",
      );
  });
  resize();
  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    intersection.disconnect();
    document.removeEventListener("visibilitychange", sync);
    reduced.removeEventListener("change", sync);
    canvas.removeEventListener("webglcontextlost", lost);
    release();
    scene.clear();
    renderer.dispose();
  };
}
