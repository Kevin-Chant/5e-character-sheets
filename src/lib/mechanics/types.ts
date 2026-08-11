import { ActionCost, RollRider } from "src/lib/types";

// Re-exports the mechanics model from src/lib/types.ts (avoids a cycle) and
// adds runtime-only bits.
export type {
  AbilityAction,
  AppliedCondition,
  ActionCost,
  AmountExpr,
  Effect,
  FeatureMechanics,
  FeatureRider,
  RollKind,
  RollRider,
} from "src/lib/types";

export const ACTION_COST_LABELS: Record<ActionCost, string> = {
  action: "Action",
  bonusAction: "Bonus",
  reaction: "Reaction",
  free: "Free",
  special: "Special",
};

// Runtime-only; never stored on the character.
export interface ActiveRider {
  source: string;
  rider: RollRider;
}
