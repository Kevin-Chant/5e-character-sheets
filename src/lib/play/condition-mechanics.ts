import { StandardDie } from "src/lib/data/data-definitions";
import { ActiveRider } from "src/lib/mechanics/types";
import { FeatureRider, RollKind } from "src/lib/types";
import { ConditionName } from "src/lib/play/conditions";

// What a condition *does* to its bearer's rolls — the wired half of the
// condition system, as `CONDITION_ROLL_EFFECTS` (conditions.ts) is the
// advisory half.
//
// This is the catalog that makes "send fully wired conditions across the
// wire" viable without sending mechanics across the wire: a `ConditionOffer`
// carries only the condition's **name**, and every client resolves that name
// against this bundled table — the same trust and versioning model as the
// spell catalog. Rider definitions never travel, so a rogue client can lie
// about *which* buff it cast but cannot inject arbitrary mechanics into a
// peer's rolls.
//
// The standard 5e conditions stay advisory-only (their clauses hinge on
// facts the sheet can't see); entries here are the buff/debuff conditions
// spells mint — Bless, Guidance — whose effects are unconditional enough to
// wire. Checks and saves are distinct `RollKind`s, so a rider aimed at one
// never leaks onto the other; `optional` remains for eligibility the kinds
// still can't express (Guidance boosts *one* check, then ends).

export interface ConditionMechanics {
  riders?: FeatureRider[];
  // One line for banners and the DM board: what accepting this means.
  summary?: string;
}

export const CONDITION_MECHANICS: Record<string, ConditionMechanics> = {
  Bless: {
    summary: "+1d4 to attack rolls and saving throws",
    riders: [
      {
        // Saves and attacks are exactly what Bless touches and exactly what
        // the kinds can now say — so the d4 folds in on its own, no tick.
        appliesTo: ["attack", "save"],
        rider: {
          rider: "bonusDice",
          count: 1,
          die: StandardDie.d4,
        },
      },
    ],
  },
  Guidance: {
    summary: "+1d4 to one ability check, then it ends",
    riders: [
      {
        appliesTo: ["check"],
        rider: {
          rider: "bonusDice",
          count: 1,
          die: StandardDie.d4,
          optional: true,
          note: "one ability check — remove the condition after using it",
        },
      },
    ],
  },
  "Hideous Laughter": {
    summary:
      "Falls prone, incapacitated with laughter; repeats the save when damaged",
  },
};

// The riders a bearer's active conditions contribute to a roll of this kind.
// Merged beside `ridersFor`'s feature riders at the dialog's collection
// points — conditions live on the encounter, features on the character, and
// neither layer should import the other's store.
export function conditionRiders(
  conditions: ConditionName[],
  kind: RollKind,
): ActiveRider[] {
  return conditions.flatMap((name) => {
    const entry = CONDITION_MECHANICS[name];
    return (entry?.riders ?? [])
      .filter((r) => r.appliesTo.includes(kind))
      .map((r) => ({ source: name, rider: r.rider }));
  });
}

// The one-line meaning of a condition, for banners and the seat's queue.
export function conditionSummary(name: ConditionName): string | undefined {
  return CONDITION_MECHANICS[name]?.summary;
}
