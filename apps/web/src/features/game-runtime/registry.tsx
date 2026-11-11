import type { ReactNode } from "react";
import type { GameType } from "@lumikids/shared";
import type { GameRendererProps } from "./components/types";
import { CountingGame } from "./components/counting-game";
import { MatchingGame } from "./components/matching-game";
import { ClassificationGame } from "./components/classification-game";

// A small exhaustive registry; each renderer receives its own narrowed content/state.
export const gameRegistry = {
  COUNTING: {
    label: "Đếm số lượng",
    render: ({ content, state, ...props }: GameRendererProps) => {
      if (content.gameType !== "COUNTING" || state.gameType !== "COUNTING")
        throw new Error("Counting renderer received incompatible state.");
      return <CountingGame {...props} content={content} state={state} />;
    },
  },
  MATCHING: {
    label: "Ghép cặp",
    render: ({ content, state, ...props }: GameRendererProps) => {
      if (content.gameType !== "MATCHING" || state.gameType !== "MATCHING")
        throw new Error("Matching renderer received incompatible state.");
      return <MatchingGame {...props} content={content} state={state} />;
    },
  },
  CLASSIFICATION: {
    label: "Phân loại",
    render: ({ content, state, ...props }: GameRendererProps) => {
      if (
        content.gameType !== "CLASSIFICATION" ||
        state.gameType !== "CLASSIFICATION"
      )
        throw new Error("Classification renderer received incompatible state.");
      return <ClassificationGame {...props} content={content} state={state} />;
    },
  },
} satisfies Record<
  GameType,
  { label: string; render: (props: GameRendererProps) => ReactNode }
>;
