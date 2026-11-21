import type { LandingScene } from "@lumikids/shared";
import { LANDING_ASSETS } from "./landing-assets";
import type { CharacterId } from "./landing-assets";
import { LANDING_COPY } from "./landing-copy";
import type { LandingStageClass } from "./landing-stage";
import type { FriendId } from "./valley-scene";

/** Everything on the landing page that differs between 3D scenes; overlay timings are shared. */
export type LandingSceneConfig = {
  key: LandingScene;
  /** Main model, named in the load-failed log. */
  mainAsset: string;
  poster: string;
  /** Characters with pins and hotspot cards while the encounter beat is framed. */
  characterIds: readonly CharacterId[];
  /** Animals to find, in dot order; null hides the quest. */
  quest: readonly string[] | null;
  copy: {
    storyLabel: string;
    guide: string;
    guideNote: string;
    encounterCaption: string;
    farewellTitle: string;
    credits: string;
    /** Bubble text when an animal is tapped, keyed by the id the stage reports. */
    friends: Readonly<Record<string, string>>;
  };
  /** Which built-in synth voice (landing-audio) each tappable animal uses when sound is on. */
  voices: Readonly<Record<string, FriendId>>;
  /** Imported only when this scene is shown, so the other scene's code and models never load. */
  loadStage: () => Promise<LandingStageClass>;
};

const VALLEY: LandingSceneConfig = {
  key: "VALLEY",
  mainAsset: LANDING_ASSETS.valley,
  poster: LANDING_ASSETS.poster,
  characterIds: ["rabbit", "bear"],
  quest: ["duck", "frog", "deer", "elephant", "rabbit", "bear", "dog"],
  copy: {
    storyLabel: "Hành trình vào thung lũng LumiKids",
    guide: LANDING_COPY.guide,
    guideNote: LANDING_COPY.guideNote,
    encounterCaption: LANDING_COPY.encounter.caption,
    farewellTitle: LANDING_COPY.farewell.title,
    credits: LANDING_COPY.footer.credits,
    friends: LANDING_COPY.friends,
  },
  voices: { duck: "duck", frog: "frog", deer: "deer", elephant: "elephant", rabbit: "rabbit", bear: "bear", dog: "dog" },
  loadStage: () => import("./valley-scene").then((module) => module.ValleyStage),
};

const ARCTIC: LandingSceneConfig = {
  key: "ARCTIC",
  mainAsset: LANDING_ASSETS.arctic,
  poster: LANDING_ASSETS.arcticPoster,
  characterIds: [],
  quest: null,
  copy: {
    storyLabel: "Hành trình cùng gấu đến Bắc Cực",
    guide: "Cùng gấu khám phá Bắc Cực",
    guideNote: "Gấu đi du lịch đến xứ tuyết. Chạm vào các bạn Bắc Cực để chào nhé!",
    encounterCaption: "Gặp các bạn trên tảng băng",
    farewellTitle: "Bắc Cực luôn chờ bé quay lại",
    credits:
      "Mô hình 3D: quả cầu Bắc Cực và chim puffin LumiKids; lều tuyết, tảng băng, cá voi, kayak và cá vàng của Poly by Google (CC BY); lửa trại của Kenney; củi của Voxel_dev; đèn lồng của Alex Safayan (Poly Pizza); chó husky của Quaternius (CC0); Gấu từ Sketchfab (xem giấy phép của tác giả).",
    friends: {
      bear: "Chào bé! Lạnh quá nhỉ!",
      polarBear: "Chào bạn nhỏ!",
      fox: "Chíp chíp!",
      seal: "Ồ ồ!",
      puffin: "Xin chào!",
      orca: "Phù!",
      husky: "Gâu gâu!",
    },
  },
  voices: { bear: "bear", polarBear: "bear", husky: "dog", fox: "deer", seal: "duck", puffin: "duck", orca: "elephant" },
  loadStage: () => import("./arctic-scene").then((module) => module.ArcticStage),
};

const CONFIGS: Record<LandingScene, LandingSceneConfig> = { VALLEY, ARCTIC };

export function landingSceneConfig(scene: LandingScene): LandingSceneConfig {
  return CONFIGS[scene];
}
