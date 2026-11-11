import type {
  ClassificationContent,
  CountingContent,
  GameContent,
  GameInteraction,
  MatchingContent,
} from "../dist/index.js";

// Compile-only consumer checks: public declarations must preserve discrimination.
export function narrowContent(content: GameContent): number {
  switch (content.gameType) {
    case "COUNTING": {
      const task: CountingContent = content;
      const rule: "CORRECT_CHOICE" = task.completionRule;
      const version: 1 | 2 = task.schemaVersion;
      // @ts-expect-error A counting task has no classification groups.
      void content.groups;
      return task.choices.length + version + rule.length;
    }
    case "MATCHING": {
      const task: MatchingContent = content;
      const rule: "ALL_PAIRS_CORRECT" = task.completionRule;
      // @ts-expect-error A matching task has no counting answer.
      void content.correctChoiceId;
      return task.pairs.length + rule.length;
    }
    case "CLASSIFICATION": {
      const task: ClassificationContent = content;
      const rule: "ALL_ITEMS_CLASSIFIED_CORRECTLY" = task.completionRule;
      // @ts-expect-error A classification task has no matching pair list.
      void content.pairs;
      return task.groups.length + rule.length;
    }
    default: {
      const exhaustive: never = content;
      return exhaustive;
    }
  }
}

export function narrowInteraction(event: GameInteraction): string {
  switch (event.actionType) {
    case "SELECT_CHOICE":
      // @ts-expect-error Choice selection must not have a drop target.
      void event.targetId;
      return event.sourceId;
    case "MATCH_DROP":
    case "CLASSIFY_DROP":
      return event.targetId;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
