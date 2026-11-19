import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { savannaSceneConfig, savannaModelUrl, SAVANNA_BACKGROUND } from "../src/features/game-runtime/environment/savanna/savanna-scene-config.ts";
import { buildSavannaTemplate, savannaPartName } from "../src/features/game-runtime/environment/savanna/savanna-models.ts";
import { savannaHorizon, savannaPitch, resolvePlacement } from "../src/features/game-runtime/environment/savanna/savanna-stage.ts";
import { breathing, headTilt, idleTurn, tailSwish, windSway } from "../src/features/game-runtime/environment/savanna/savanna-motion.ts";
import { gameSceneTheme, SCENE_BACKGROUNDS } from "../src/features/game-runtime/model/backgrounds.ts";

const publicFile = (url) => new URL(`../public${url}`, import.meta.url);
const parse = async (url) => {
  const bytes = readFileSync(publicFile(url));
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
};
const placements = [...savannaSceneConfig.environment, ...savannaSceneConfig.animals];

test("only classification visits the savanna; its background exists", () => {
  assert.equal(gameSceneTheme("CLASSIFICATION"), "savanna");
  assert.equal(gameSceneTheme("COUNTING"), "pond");
  assert.equal(gameSceneTheme("MATCHING"), "forest");
  assert.equal(SCENE_BACKGROUNDS.savanna, SAVANNA_BACKGROUND.src);
  assert.ok(existsSync(publicFile(SAVANNA_BACKGROUND.src)));
});

test("every configured GLB exists and ids are unique", () => {
  const ids = new Set();
  for (const item of [...placements, ...savannaSceneConfig.clouds]) {
    assert.ok(existsSync(publicFile(savannaModelUrl(item.model))), `missing ${item.model}`);
    assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
    ids.add(item.id);
  }
});

test("ground placements stand below the painted horizon on desktop and compact stages", () => {
  for (const [width, height] of [[1600, 900], [1600, 1000], [2400, 900], [820, 1100], [500, 1000]]) {
    const horizon = savannaHorizon(width, height);
    const compact = width / height < savannaSceneConfig.camera.compactAspect;
    for (const place of placements) {
      const spot = resolvePlacement(place, compact);
      if (spot.visible) assert.ok(spot.foot > horizon + 0.03 && spot.foot <= 1, `${place.id} @${width}x${height}`);
    }
    for (const cloud of savannaSceneConfig.clouds) assert.ok(cloud.y < horizon - 0.15, `${cloud.id} stays in the sky`);
  }
});

test("camera pitch puts the 3D horizon on the painted horizon after cover cropping", () => {
  assert.ok(Math.abs(savannaHorizon(SAVANNA_BACKGROUND.width, SAVANNA_BACKGROUND.height) - SAVANNA_BACKGROUND.horizon) < 1e-9);
  for (const [width, height] of [[1600, 900], [2400, 900], [820, 1100], [500, 1000]]) {
    const horizon = savannaHorizon(width, height);
    const camera = new THREE.PerspectiveCamera(savannaSceneConfig.camera.fov, width / height, 0.05, 1e7);
    camera.position.set(0, 1, 0);
    camera.rotation.set(-savannaPitch(horizon, camera.fov), 0, 0);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const far = new THREE.Vector3(0, 0, -1e6).project(camera);
    assert.ok(Math.abs((1 - far.y) / 2 - horizon) < 0.002, `${width}x${height}`);
  }
  // Wider stages crop the PNG vertically, so the painted horizon moves and the camera follows it.
  assert.ok(savannaHorizon(2400, 900) < savannaHorizon(1600, 900));
});

test("Z-up savanna GLBs become upright, grounded templates that face the camera", async () => {
  for (const place of placements) {
    const gltf = await parse(savannaModelUrl(place.model));
    const { object, size } = buildSavannaTemplate(gltf.scene, place.rig);
    const box = new THREE.Box3().setFromObject(object);
    assert.ok(Math.abs(box.min.y) < 1e-4, `${place.id} base must sit on y=0`);
    assert.ok(size.y > 0 && Number.isFinite(size.y));
  }
  const giraffe = savannaSceneConfig.animals.find((animal) => animal.id === "giraffe");
  const { object, size } = buildSavannaTemplate((await parse(savannaModelUrl(giraffe.model))).scene, giraffe.rig);
  assert.ok(size.y > size.x && size.y > size.z, "giraffe stands tall instead of lying on its side");
  const head = object.getObjectByName(savannaPartName("head"));
  const eyes = new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3());
  assert.ok(eyes.z > 0 && eyes.y > size.y * 0.5, "head is high and turned towards +Z (the camera)");
});

test("animal rig parts reference real meshes and merging keeps draw calls low", async () => {
  for (const animal of savannaSceneConfig.animals) {
    const gltf = await parse(savannaModelUrl(animal.model));
    const names = new Set();
    let meshes = 0;
    gltf.scene.traverse((node) => { if (node.isMesh) { names.add(node.name); meshes++; } });
    for (const part of ["head", "tail"]) for (const name of animal.rig?.[part]?.meshes ?? []) assert.ok(names.has(name), `${animal.id}: ${name}`);
    const { object } = buildSavannaTemplate(gltf.scene, animal.rig);
    let drawn = 0;
    object.traverse((node) => { if (node.isMesh) drawn++; });
    assert.ok(drawn <= 6 && drawn < meshes, `${animal.id}: ${drawn} draw calls`);
    for (const part of ["body", "head", "tail"]) assert.ok(object.getObjectByName(savannaPartName(part)), `${animal.id} ${part}`);
  }
});

test("idle motion is subtle and bounded; breathing never lifts the feet", () => {
  for (let t = 0; t < 120; t += 0.05) for (const phase of [0, 1.73, 3.46]) {
    const breath = breathing(t, phase);
    assert.ok(breath >= 0 && breath <= 0.0111);
    assert.ok(Math.abs(idleTurn(t, phase)) <= 0.046);
    assert.ok(Math.abs(headTilt(t, phase)) <= 0.1);
    assert.ok(Math.abs(tailSwish(t, phase)) <= 0.38);
    assert.ok(Math.abs(windSway(t, phase, "tree")) <= 0.0071 && Math.abs(windSway(t, phase, "grass")) <= 0.031);
    assert.ok(Math.abs(headTilt(t + 0.01, phase) - headTilt(t, phase)) < 0.01, "no head snapping");
  }
  // The body is scaled around its base (y = 0), so a foot vertex at y = 0 stays at y = 0.
  const foot = new THREE.Vector3(0.3, 0, 0.2).applyMatrix4(new THREE.Matrix4().makeScale(1, 1 + breathing(0.9, 0), 1));
  assert.equal(foot.y, 0);
});
