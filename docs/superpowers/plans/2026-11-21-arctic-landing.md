# Arctic Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin can switch the landing between the valley and an Arctic globe journey led by the valley's bear, with puffins, a husky and warm camp lights.

**Architecture:**
- `landing-page.tsx` reads `settings.landingScene` and gets a scene config: which stage class to import lazily, the copy, the quest and which characters get pins.
- `ArcticStage` implements the same `LandingStage` interface that `ValleyStage` already satisfies.
- Arctic camera beats sit on the **same scroll timeline** as the valley (`STORY`), so every overlay timing in landing-page stays untouched.
- Models are prepared in Blender from the user's v8 `.blend` and exported to one `landing/arctic.glb`.

**Tech Stack:**
- Next 16 / React 19, three.js (existing), Blender MCP (EEVEE, glTF exporter), node:test.
- shared Zod, NestJS + Vitest.

**Spec:** docs/superpowers/specs/2026-11-21-arctic-landing-design.md (approved 2026-11-21, plus user additions below)

## Global Constraints

- No new npm dependencies. `npx gltf-transform` only after asking the user.
- No migration: `SiteSetting.landingScene` is already `VarChar(30)`.
- The valley's behaviour, assets and timings must not change.
- `public/models/landing/arctic.glb` must be ≤ 3 MB. Poster is `public/models/landing/arctic-poster.webp`.
- Raw packs are never committed. Under `public/models/source/` they are git-ignored (existing rule `/public/models/source/` in apps/web/.gitignore).
- User files are moved, never deleted.
- Credit each reused model with source and licence beside its entry in `landing-assets.ts`.
- **User addition:** reorganize `public/models`.
- **User addition:** reuse models from `public/models/animals` (Quaternius: Husky has Idle/Eating/Walk clips).
- **User addition:** the blender-skills repo (github.com/arjun988/blender-skills) may be cloned into `.claude/skills/` if Blender work needs it.
- Copy (Vietnamese) exactly from the spec:
  - Gấu "Chào bé! Lạnh quá nhỉ!"
  - Gấu Bắc Cực "Chào bạn nhỏ!"
  - Cáo tuyết "Chíp chíp!"
  - Hải cẩu "Ồ ồ!"
  - Puffin "Xin chào!"
  - Cá voi "Phù!"
  - Husky: "Gâu gâu!"

## Review Focus

1. **Settings say ARCTIC but arctic.glb fails to load or WebGL is software.** The page should fall back to the Arctic poster, not the valley and not a blank screen.
2. **Settings fetch still pending or failing on first paint.** The page should use the built-in VALLEY default and must not load both stages.
3. **Admin switches the scene while a visitor has the page open.** The current stage keeps running and the next load uses the new scene, with no crash from swapping mid-render.
4. **Portrait iPad (768×1024) at every Arctic beat.** The subject (bear, puffins, campfire) stays in frame; it is not hidden behind the copy.
5. **Low-power / `degrade()` and `prefers-reduced-motion`.** Lights stop flickering, the aurora is static, and frame time stays usable.

---

### Task 1: Reorganize public/models

**Files:**
- Move (no delete):
  - `public/models/artic/lumikids_arctic_globe_v8/` → `public/models/source/arctic/globe-v8/`
  - loose `public/models/artic/*.glb`, `articbiodiorama.md` and `free-winter-mountain-3d-low-poly-models/` → `public/models/source/arctic/downloads/`
  - `public/models/animals/` → `public/models/source/quaternius-animals/`
  - `public/models/dessert/` → `public/models/source/desert/`
- Create: `public/models/README.md`. It covers the layout (landing = optimised, committed; forest/pond/savana = game scenery kits; source = raw, git-ignored).

- [ ] Step 1: check nothing in `src/` references the moved paths.
  Run: `grep -rn "models/(artic|animals|dessert)" apps/web/src` (with `-E`)
  Expected: no output.
- [ ] Step 2: do the moves with `mv`, then confirm the files are now ignored.
  Run: `git status --short apps/web/public`
  Expected: only `README.md` untracked.
- [ ] Step 3: commit `chore(web): organise public/models (raw packs under source/)`.

### Task 2: Scene selection and scene config

**Files:**
- Modify:
  - `packages/shared/src/site-settings.ts:7` → `z.enum(["VALLEY", "ARCTIC"])`
  - `apps/web/src/features/landing/landing-scenes.ts` (ARCTIC entry: "Bắc Cực", "Quả cầu Bắc Cực với bạn gấu, chim puffin và lửa trại.", poster arctic-poster)
  - `apps/api/src/modules/site-settings/site-settings.service.spec.ts`
- Create:
  - `apps/web/src/features/landing/landing-stage.ts`
  - `apps/web/src/features/landing/scene-config.ts`
  - `apps/web/tests/landing-scenes.test.mjs`, plus a `test:landing` script added to `test` in `apps/web/package.json`

**Interfaces (Produces):**

```ts
// landing-stage.ts — the members landing-page.tsx calls today on ValleyStage
export interface LandingStage {
  load(onReady: () => void): Promise<{ missing: string[] }>;
  warmUp(): Promise<void>;
  degrade(): void;
  friendAt(x: number, y: number): string | null;
  poke(x: number, y: number): { id: string; x: number; y: number } | null;
  hasCharacter(id: CharacterId): boolean;
  pixelRatio(): number;
  resize(width: number, height: number, dpr: number, desktop: boolean): void;
  render(p: number, timeSeconds: number, parallaxX: number, parallaxY: number, animate: boolean): void;
  anchor(id: CharacterId): ScreenAnchor;
  sample(p: number): number[];
  describe(): Record<string, unknown>;
  dispose(): void;
}
export type LandingStageClass = new (canvas: HTMLCanvasElement, quality: StageQuality) => LandingStage;

// scene-config.ts
export type LandingSceneConfig = {
  key: LandingScene;
  mainAsset: string;                      // used in the load-failed log
  poster: string;
  characterIds: readonly CharacterId[];   // pins + hotspot cards
  quest: readonly string[] | null;        // null hides the quest UI
  copy: { guide: string; guideNote: string; encounterCaption: string; friends: Record<string, string> };
  loadStage: () => Promise<LandingStageClass>;
};
export function landingSceneConfig(scene: LandingScene): LandingSceneConfig;
```

- [ ] **Step 1: write the failing test** `tests/landing-scenes.test.mjs` (node strip-types; import only `scene-config.ts`, never call `loadStage`):
  - `landingSceneSchema.parse("ARCTIC") === "ARCTIC"`, and parsing `"MOON"` throws.
  - `landingSceneConfig("VALLEY").quest` deep-equals `["duck","frog","deer","elephant","rabbit","bear","dog"]`; its `characterIds` are `["rabbit","bear"]`; its copy equals the current `LANDING_COPY` values.
  - `landingSceneConfig("ARCTIC").quest === null`, `characterIds` is `[]`, and `copy.friends` holds exactly the 7 Global Constraints lines keyed `bear, polarBear, fox, seal, puffin, orca, husky`.
  - `copy.guide === "Cùng gấu khám phá Bắc Cực"`.
  - `mainAsset === "/models/landing/arctic.glb"`.
- [ ] Step 2: run `pnpm --filter web test:landing`. Expected: FAIL (module missing).
- [ ] Step 3: implement.
  - VALLEY config wraps today's constants. `loadStage` is `() => import("./valley-scene").then(m => m.ValleyStage)`. Add `implements LandingStage` to `ValleyStage` with no body change. If signatures differ, widen the interface, not the valley.
- [ ] Step 4: verify.
  - `pnpm --filter web test:landing` → PASS.
  - `cd apps/api && npx vitest run src/modules/site-settings` → PASS, with a new case `accepts ARCTIC`.
  - `pnpm --filter web typecheck` → clean.
- [ ] Step 5: commit `feat(landing): ARCTIC scene key and per-scene config`.

### Task 3: Arctic models in Blender

**Files:**
- Source: a copy `public/models/source/arctic/globe-v8/arctic_landing.blend` (never save over `arctic_globe_v8.blend`).
- Create: `public/models/landing/arctic.glb`, `public/models/landing/arctic-poster.webp`.

- [ ] Step 1: in Blender MCP, open the copy and record the facts Task 4 needs into `public/models/source/arctic/arctic-landing-notes.json`:
  - globe centre and radius;
  - world positions of the igloo door, campfire, lantern, the iceberg chosen for puffins, the polar bear mother and cub, and the fox.
- [ ] Step 2: add the cast.
  - **Puffins:** search Poly Pizza for "puffin" (CC0/CC-BY). If nothing fits the pastel low-poly look, model three low-poly puffins: black back, white belly, orange beak and feet, about 1,000 tris each. Name them `ARC_Puffin_1..3` and place them on the chosen iceberg.
  - **Bear:** import `public/models/landing/bear.glb` as `ARC_Bear` beside the igloo, then add a red low-poly scarf `ARC_Bear_Scarf` parented to it.
  - **Husky:** import `source/quaternius-animals/Husky.gltf` as `ARC_Husky` near the kayak, keeping `Idle` and `Eating` clips only.
  - **Lights:** create empties `ARC_Light_Campfire` and `ARC_Light_Lantern` at the flame and lantern positions; the runtime attaches the lights to them.
- [ ] Step 3: export glTF.
  - Settings: selected scene, WebP images at 1024 max, animations (goldfish + husky), punctual lights off.
  - Render the poster: 1600×1000 camera view from the vista shot, converted to webp.
  - Run the existing `glbinfo.mjs`-style check: size ≤ 3 MB, `ARC_*` nodes present, clips listed. If > 3 MB, stop and ask before running `npx gltf-transform`.
- [ ] Step 4: `look` at the vista and at each beat subject; the bear's scarf must read clearly at the bear-greet distance.
- [ ] Step 5: commit `feat(landing): arctic.glb with puffins, husky and the valley bear` (only the two files in `landing/`).

### Task 4: Arctic camera path

**Files:**
- Create: `apps/web/src/features/landing/arctic-path.ts`
- Test: `apps/web/tests/landing-scenes.test.mjs`

**Interfaces:**
- Consumes: `CameraShot`, `STORY` and `createMonotoneCurve` from `camera-path.ts` / `scroll-math.ts`; Task 3 notes for coordinates.
- Produces:
  - `ARCTIC_SHOTS: readonly CameraShot[]` (names in order: `vista, bearGreet, polarBears, iceberg, campfire, dusk, farewell`)
  - `ARCTIC_GLOBE: { center: Vec3; radius: number }`
  - `arcticShotAt(p: number): { position: Vec3; target: Vec3; fov: number }`
  - `ARCTIC_WARMTH(p: number): number` (0 = midday, 1 = campfire dusk)

Beat → valley slot:
- `vista` = heroHold
- `bearGreet` = pondHold (guide caption)
- `polarBears` = elephantHold
- `iceberg` (puffins, seal, walrus) = charactersHold (encounter caption, tappable)
- `campfire` = cabinHold (teacher copy)
- `dusk` = summitHold
- `farewell` = farewellHold (aurora)

- [ ] **Step 1: failing tests:**
  - `ARCTIC_SHOTS.map(s => s.name)` equals the 7 names.
  - For each hold `[a,b]` in `STORY`, `arcticShotAt(a)` deep-equals `arcticShotAt(b)` (holds stand still).
  - Sampling p = 0..1 every 0.001: camera distance to `ARCTIC_GLOBE.center` stays > `radius * 1.08`, so the camera never clips into the globe.
  - Neighbouring samples move < `radius * 0.08`, so there are no jumps.
  - `ARCTIC_WARMTH(0) === 0`, `ARCTIC_WARMTH(STORY.cabinHold[0]) === 1`, and the function is non-decreasing up to `cabinHold[0]`.
  - Every shot has a `portrait` entry.
- [ ] Step 2: run. Expected: FAIL.
- [ ] Step 3: implement with the same monotone-curve technique as `camera-path.ts`, using the coordinates from the Task 3 notes.
- [ ] Step 4: run. Expected: PASS.
- [ ] Step 5: commit `feat(landing): arctic camera path on the shared story timeline`.

### Task 5: ArcticStage and landing integration

**Files:**
- Create: `apps/web/src/features/landing/arctic-scene.ts` (`export class ArcticStage implements LandingStage`).
- Modify: `landing-page.tsx`:
  - pick the config via `landingSceneConfig(useSiteSettings().settings.landingScene)`;
  - replace `import("./valley-scene")` with `config.loadStage()`;
  - drive QUEST, CHARACTER_IDS, friend bubbles, guide/encounter copy and the load-failed asset from the config;
  - render the quest UI only when `config.quest`.
  - Modify `landing-assets.ts` (arctic entries + credits).

Behaviour:
- Load `arctic.glb` with the existing loader setup and play the goldfish clips plus husky `Idle`.
- The globe turns slowly (0.04 rad/s) only while `p < STORY.heroHold[1]`.
- Bear waves procedurally during `bearGreet` (copy the valley wave), and sits facing the fire during `campfire`.
- `friendAt`/`poke` raycast `ARC_*` and the v8 animal nodes and map them to the 7 friend keys. Poke gives a small hop or head tilt.
- Lights:
  - `PointLight` warm `#ffb46b` at `ARC_Light_Campfire` and `#ffd59a` at `ARC_Light_Lantern`, intensity scaled by `ARCTIC_WARMTH(p)`.
  - Flicker ±12% by summed sines, off when `!animate` or degraded.
  - Hemisphere/ambient go from midday pastel blue to dusk peach by `ARCTIC_WARMTH`.
- Aurora: one transparent plane behind the globe with a scrolling-gradient shader. Opacity is `smooth(seg(p, STORY.duskStart, STORY.farewellHold[0]))`; it is static when `!animate`.
- `anchor()` returns `{x:0,y:0,visible:false}` and `hasCharacter()` returns false (no pins in Arctic).
- If settings are not loaded yet, use the built-in default (VALLEY). The stage is chosen once per mount.

- [ ] Step 1: verify:
  - `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test` → all pass;
  - valley `?debug` `__lumi.describe()` at p = 0.2 is identical before and after (record both values).
- [ ] Step 2: visual check:
  - headless Chromium **with GPU** (no `--disable-gpu`; use `--use-angle=gl` or `--enable-unsafe-swiftshader` only as a last resort and say so);
  - temporary built-in default ARCTIC via a `?scene=ARCTIC` dev-only query read in landing-page under `process.env.NODE_ENV !== "production"`;
  - screenshot each beat at 1440×900, 1024×768 and 768×1024.
  - Expected: subject in frame, copy readable, warm light at campfire, aurora at farewell.
- [ ] Step 3: commit `feat(landing): arctic stage with the valley bear, puffins and camp lights`.

### Task 6: Docs

- [ ] Update `docs/` landing notes (if a landing doc exists, else `public/models/README.md`) with how to switch scenes (Admin → Cài đặt trang → Cảnh landing) and the arctic credits.
- [ ] Commit `docs: arctic landing`.
