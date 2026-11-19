import * as THREE from "three";

/** A shallow ribbon on the same ground as the animals; its near bank passes through their drinking spots. */
export function createForestStream(sinTilt: number) {
  const group = new THREE.Group(); group.name = "forest-drinking-stream";
  const count = 72;
  function ribbon() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((count + 1) * 6), 3));
    const uv: number[] = [], indices: number[] = [];
    for (let i = 0; i <= count; i++) {
      uv.push(i / count, 0, i / count, 1);
      if (i < count) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
    }
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
    return geometry;
  }
  const bank = new THREE.Mesh(ribbon(), new THREE.MeshStandardMaterial({ color: "#d6c49b", roughness: 1, side: THREE.DoubleSide }));
  const material = new THREE.MeshStandardMaterial({ color: "#8dd9e8", roughness: 0.42, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.35 });
  const time = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uStreamTime = time;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vCreekUv;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvCreekUv = uv;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vCreekUv; uniform float uStreamTime;").replace("#include <color_fragment>", `#include <color_fragment>
      float flow = sin(vCreekUv.x * 115.0 - uStreamTime * 1.5 + sin(vCreekUv.y * 12.0) * 0.6);
      float streak = smoothstep(0.90, 1.0, flow) * (0.3 + 0.7 * sin(vCreekUv.y * 21.0) * sin(vCreekUv.y * 21.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.99, 1.0), streak * 0.6);
      diffuseColor.rgb += sin(vCreekUv.x * 17.0 + uStreamTime * 0.4) * 0.025;
    `);
  };
  material.customProgramCacheKey = () => "lumikids-forest-stream";
  const water = new THREE.Mesh(ribbon(), material);
  bank.receiveShadow = true; water.receiveShadow = true;
  group.add(bank, water);
  const rippleMaterial = new THREE.MeshBasicMaterial({ color: "#f0fcff", transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
  const ripples = Array.from({ length: 2 }, () => {
    const rings = new THREE.Group();
    for (const r of [0.6, 1]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 32), rippleMaterial);
      ring.rotation.x = -Math.PI / 2; rings.add(ring);
    }
    group.add(rings); return rings;
  });
  let screenHeight = 1;
  function layout(width: number, height: number, contacts: readonly THREE.Vector3[]) {
    screenHeight = height;
    const half = height * 0.022 / sinTilt;
    const left = contacts[0] ?? new THREE.Vector3(-width * 0.18, 0, height * 0.45 / sinTilt);
    const right = contacts[1] ?? new THREE.Vector3(width * 0.20, 0, height * 0.45 / sinTilt);
    const points = [
      new THREE.Vector3(-width * 0.62, 0, height * 0.54 / sinTilt),
      new THREE.Vector3(-width * 0.38, 0, height * 0.50 / sinTilt),
      new THREE.Vector3(left.x, 0, left.z + half * 0.80),
      new THREE.Vector3(0, 0, height * 0.49 / sinTilt),
      new THREE.Vector3(right.x, 0, right.z + half * 0.80),
      new THREE.Vector3(width * 0.39, 0, height * 0.50 / sinTilt),
      new THREE.Vector3(width * 0.62, 0, height * 0.54 / sinTilt),
    ];
    const path = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.35);
    for (const [mesh, radius, y] of [[bank, half + height * 0.005 / sinTilt, -0.55], [water, half, -0.40]] as const) {
      const attr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i <= count; i++) {
        const p = path.getPoint(i / count);
        attr.setXYZ(i * 2, p.x, y, p.z - radius); attr.setXYZ(i * 2 + 1, p.x, y, p.z + radius);
      }
      attr.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
    }
    [left, right].forEach((p, i) => ripples[i].position.set(p.x, -0.3, p.z + half * 0.15));
  }
  function update(seconds: number, weights: readonly number[]) {
    time.value = seconds;
    ripples.forEach((ripple, i) => {
      ripple.visible = (weights[i] ?? 0) > 0.65;
      ripple.scale.setScalar(screenHeight * 0.019 * (0.9 + Math.sin(seconds * 2 + i) * 0.12));
    });
  }
  return { group, layout, update };
}
