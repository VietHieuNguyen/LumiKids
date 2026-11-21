import { gameContentSchema } from "@lumikids/shared";
import counting from "../../../../../packages/shared/examples/game-content/counting.v1.json";
import matching from "../../../../../packages/shared/examples/game-content/matching.v1.json";
import classification from "../../../../../packages/shared/examples/game-content/classification.v1.json";
import pattern from "../../../../../packages/shared/examples/game-content/pattern.v1.json";
import type { ResolvedAssetUrls } from "./components/types";

export const demoContents = {
  COUNTING: gameContentSchema.parse(counting),
  MATCHING: gameContentSchema.parse(matching),
  CLASSIFICATION: gameContentSchema.parse(classification),
  PATTERN: gameContentSchema.parse(pattern),
};
// Explicit local fixtures for the illustrative UUIDs from 4A. No MinIO URLs or upload.
export const demoAssetUrls: ResolvedAssetUrls = {
  "8e180e94-9105-4be1-9fea-f6cf43144001": "/game-demo/apple.svg",
  "8e180e94-9105-4be1-9fea-f6cf43144002": "/game-demo/cat.svg",
  "8e180e94-9105-4be1-9fea-f6cf43144003": "/game-demo/dog.svg",
  "8e180e94-9105-4be1-9fea-f6cf43144004": "/game-demo/dog-shadow.svg",
  "8e180e94-9105-4be1-9fea-f6cf43144005": "/game-demo/cat-shadow.svg",
  "8e180e94-9105-4be1-9fea-f6cf43144006": "/game-demo/ball-red.svg",
  "8e180e94-9105-4be1-9fea-f6cf43144007": "/game-demo/ball-blue.svg",
  "8e180e94-9105-4be1-9fea-f6cf43144008": "/game-demo/basket-red.svg",
  "8e180e94-9105-4be1-9fea-f6cf43144009": "/game-demo/basket-blue.svg",
  // PATTERN demo uses three pictures of the LUMI_PASTEL_01 pack.
  "7c1a9a10-0000-4000-8000-000000000001": "/game-demo/bunny.webp",
  "7c1a9a10-0000-4000-8000-000000000002": "/game-demo/chick.webp",
  "7c1a9a10-0000-4000-8000-000000000003": "/game-demo/pig.webp",
};
