import type { CharacterId } from "./landing-assets";

export type StageQuality = "high" | "low";
export type ScreenAnchor = { x: number; y: number; visible: boolean };

/** What landing-page.tsx needs from a 3D scene (valley, arctic, …). */
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
  describe(): object;
  dispose(): void;
}

export type LandingStageClass = new (canvas: HTMLCanvasElement, quality: StageQuality) => LandingStage;
