import { ActionCost, RollRider } from "src/lib/types";

// The mechanics data model lives in `src/lib/types.ts` (the character model
// embeds it via `LimitedUseAbility.mechanics`, and types.ts can't import from
// here without a cycle). This module re-exports it so mechanics code and its
// consumers keep one import root, and holds the runtime-only bits.
export type {
  AbilityAction,
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

// A rider in play for a specific roll, tagged with where it came from so the
// UI can attribute it. Runtime-only — never stored on the character.
export interface ActiveRider {
  source: string;
  rider: RollRider;
}
