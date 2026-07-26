import {
  DamageType,
  LeveledSpellLevel,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { ClassName, CustomFormula, DieDefinition } from "src/lib/types/formula";

// ---------------------------------------------------------------------------
// Ability mechanics: serializable descriptions of what abilities *do* at the
// table. Same design rule as `CustomFormula`: a closed set of interpretable
// kinds, an open set of data compositions — no functions, so mechanics survive
// Drive persistence, live-sync, and undo. The interpreters and the bundled
// catalog live in `src/lib/mechanics/`; these types live here because the
// character model (`LimitedUseAbility.mechanics`) embeds them.

// What using an action costs at the table. `special` covers anything outside
// the standard economy (part of a rest, a trigger on being hit, …) — pair it
// with `costNote` so the UI can say what.
export type ActionCost =
  | "action"
  | "bonusAction"
  | "reaction"
  | "free"
  | "special";

// How much an effect moves. `fixed` is a formula over the character (it may
// contain dice — resolved with a real roll at execution time, never during
// render); `plusLevelOf` adds `levelMultiplier` (default 1) × the character's
// level in a named class, since authored formulas can't reference the sheet's
// per-class UUIDs (Second Wind's fighter level, Wholeness of Body's 3× monk
// level). `chosenAmount`/`chosenLevel` are the user's picks at execution time;
// `byChosenLevel` is a lookup table keyed by the chosen slot level (Font of
// Magic's creation costs).
export type AmountExpr =
  | { fixed: CustomFormula; plusLevelOf?: ClassName; levelMultiplier?: number }
  | { chosenAmount: true }
  // Roll the chosen number of these dice (Healing Light's "spend N, heal
  // N d6"). Pairs naturally with a `spendUses` of `chosenAmount`.
  | { chosenAmountDice: StandardDie }
  | { chosenLevel: true }
  | { byChosenLevel: Record<number, number> };

// One described state change (or table prompt) — the closed set an
// `AbilityAction` composes from. Interpreted by `mechanics/resolve.ts` into
// ordinary whole-value reducer updates, so every effect syncs and undoes like
// a manual edit. Costs and gains are both just effects — direction is in the
// kind.
export type Effect =
  // Heal current HP, clamped to the max.
  | { effect: "heal"; amount: AmountExpr }
  // Grant temporary HP. Temp HP don't stack: applies only if higher.
  | { effect: "gainTempHp"; amount: AmountExpr }
  // Spend uses from a limited-use pool. Defaults to the owning ability's own
  // pool; `pool` names a *different* ability by title (normalized) to spend
  // from instead — a Lore bard's Cutting Words spending Bardic Inspiration, a
  // monk discipline spending Ki. The named pool is found on the character at
  // resolve time, so a feature keeps its own mechanics without owning the
  // resource it drains.
  | { effect: "spendUses"; amount: AmountExpr; pool?: string }
  // Regain uses in a pool (the owning ability's, or `pool` by title), clamped
  // at its maximum.
  | { effect: "restoreUses"; amount: AmountExpr; pool?: string }
  // Expend a spell slot (the chosen level unless pinned).
  | { effect: "expendSlot"; level?: LeveledSpellLevel }
  // Restore an expended spell slot. The sheet tracks expended-vs-total, so
  // "creating" a slot beyond the normal maximum has nowhere to live —
  // restoration is the model.
  | { effect: "restoreSlot"; level?: LeveledSpellLevel }
  // Mark one hit die of this size expended.
  | { effect: "spendHitDie"; die: StandardDie }
  // Roll dice for display only (Stone's Endurance's reduction) — no write.
  | { effect: "roll"; label: string; amount: AmountExpr }
  // A table prompt for the parts the sheet can't adjudicate (reactions,
  // effects on other creatures). Deliberately not automation.
  | { effect: "remind"; note: string };

// A clickable use of an ability: its action-economy cost, what the user picks
// first, and the effects that fire. All effects must be payable/meaningful for
// the action to be enabled.
export interface AbilityAction {
  id: string;
  name: string;
  cost: ActionCost;
  // Shown beside the cost badge — timing/frequency prose ("during a short
  // rest", "when you take damage").
  costNote?: string;
  choose?: {
    // Offer a slot-level picker: levels with an expended slot to restore, or
    // with an available slot to expend.
    slotLevel?: "toRestore" | "toExpend";
    // Cap the offered levels (slot creation and Arcane Recovery stop at 5th).
    slotLevelMax?: number;
    // Offer a free-typed amount, capped at the pool's remaining uses.
    amount?: "uses";
  };
  effects: Effect[];
}

// What kind of roll is happening, as a tag the roll dialog supplies. `check`
// covers every non-attack d20 (ability checks, saves, initiative).
export type RollKind = "check" | "attack" | "damage" | "healing" | "hitDie";

// The weapon properties a rider can key off. These are the 5e properties that
// actually gate a feature ("melee weapon attack using Strength", "ranged
// weapons only", "a two-handed or versatile melee weapon") — not the whole
// property list, which the sheet has no use for.
//
// `melee`/`ranged` describe how the attack is *made*, so a thrown handaxe is
// tagged both `melee` (it's a melee weapon) and `thrown`; Rage excludes the
// latter, Archery requires `ranged` without `thrown`.
export type AttackTag =
  | "melee"
  | "ranged"
  | "thrown"
  | "finesse"
  | "heavy"
  | "light"
  | "two-handed"
  | "versatile"
  | "reach"
  | "loading"
  | "ammunition";

// The weapon shape a rider needs to apply. Every clause must hold; a clause the
// attack carries no information about is *unknown* rather than false, which is
// what turns an auto-applied rider back into an opt-in prompt (see
// `riderEligibility` in `mechanics/conditions.ts`).
export interface RiderCondition {
  // Tags the attack must all have (Rage: melee).
  tags?: AttackTag[];
  // Tags the attack must have at least one of (Sneak Attack: finesse or ranged).
  anyTags?: AttackTag[];
  // Tags that disqualify it (Archery: not a thrown melee weapon).
  without?: AttackTag[];
  // The ability the attack must use (Rage: Strength). A finesse attack resolves
  // to max(STR, DEX), so which one is "used" is unknowable — deliberately so.
  ability?: StatKey[];
}

// A modifier a feature applies to matching rolls — the roll-side closed set.
//
// Every variant may carry `requires`: the weapon shape it applies to. Intersected
// once here rather than repeated per variant — it is orthogonal to the kind.
export type RollRider = RollRiderKind & { requires?: RiderCondition };

type RollRiderKind =
  // The roll's total can't come out below this (Durable).
  | { rider: "minimumTotal"; value: CustomFormula }
  // Individual dice below this count as this (Reliable Talent's 10).
  | { rider: "minimumDie"; value: number }
  // Reroll dice at or below the threshold once, keeping the new roll
  // (Great Weapon Fighting's 1s and 2s, Halfling Luck's natural 1s).
  | { rider: "rerollBelow"; threshold: number }
  // Flat addition to the total.
  | {
      rider: "bonus";
      value: CustomFormula;
      // Forces the opt-in checkbox even when `requires` is satisfied — for a
      // condition that isn't about the weapon at all (Foe Slayer's "against a
      // favored enemy, and not if you added it to the damage instead"). A bonus
      // with neither `optional` nor an undecidable `requires` folds silently.
      optional?: boolean;
      // The condition, shown alongside the checkbox.
      note?: string;
    }
  // d20s at or above this crit (Improved Critical's 19).
  | { rider: "critRange"; value: number }
  // Advisory only — surfaced as a note, since advantage is situational.
  | { rider: "advantage"; note: string }
  // Extra damage folded into a weapon attack (Sneak Attack, Rage damage, Divine
  // Smite, Divine Strike). Unlike the modifier riders above this carries a whole
  // damage expression, and its application is *contextual* — gated to weapon
  // attacks, declared at a specific step, optionally opt-in — so the roll dialog
  // handles it directly rather than the silent `applyTotalRiders` fold. Catalog
  // entries bake `amount`'s dice count from the character's class level at
  // collection time (the engine's die count is a literal a formula can't drive);
  // authored/homebrew instances store a concrete expression.
  | {
      rider: "extraDamage";
      // Dice/flat expression for the extra damage. A `CustomFormula` (not a
      // damage map) because the type is usually the weapon's, not the rider's.
      amount: CustomFormula;
      // Omit to mean "same type as the weapon" (Sneak Attack, Rage) — shown as
      // its own line, untyped. Set it when the type is intrinsic to the feature
      // (Divine Smite radiant, a domain's Divine Strike type).
      damageType?: DamageType;
      // When the player commits, which drives dialog sequencing and (later) crit
      // doubling: before the attack roll (Great Weapon Master's flat +10), after
      // the hit is known but before damage (Sneak Attack, Divine Smite — you may
      // wait to learn it hit/crit), or after the damage roll (reroll effects).
      declareAt: "before-attack" | "on-hit" | "after-damage";
      // The player opts in per attack (Sneak Attack, Divine Smite) vs it always
      // applies on a qualifying hit (Rage damage, Divine Strike). Default false.
      optional?: boolean;
      // Advisory: the sheet can't see turns, so this is a reminder only.
      oncePerTurn?: boolean;
      // Condition summary shown in the dialog (the eligibility the sheet can't
      // verify — "finesse or ranged, with advantage or an ally adjacent").
      note?: string;
      // Present when the extra damage is powered by a spell slot the player
      // chooses and expends (Divine Smite): the dice scale with the chosen slot
      // level, and the slot is spent by an explicit button (not the re-rollable
      // damage roll). When set, the modal computes the dice from the slot and
      // `amount` is only a pre-choice placeholder.
      slot?: {
        // Lowest slot level that can power it (Divine Smite: 1).
        minLevel: number;
        // The scaling die (Divine Smite: d8).
        die: DieDefinition;
        // Dice at `minLevel` (2 → 2d8 at a 1st-level slot) …
        diceAtMin: number;
        // … growing +1 die per slot level above `minLevel`, capped here (5d8).
        maxDice: number;
        // An optional situational extra (Divine Smite's +1d8 vs undead/fiend),
        // offered as a toggle. Same die as above.
        bonus?: { dice: number; label: string };
      };
    }
  // Extra damage folded into a *spell's* damage — the mirror image of
  // `extraDamage`, gated to spell damage instead of weapon attacks. Potent
  // Spellcasting (+WIS to cantrip damage), Empowered Evocation (+INT), a
  // Celestial warlock's Radiant Soul (+CHA). A flat modifier, not dice — it's
  // added once to the spell's damage total and doesn't inflate on a crit, the
  // same way a weapon's Dueling +2 stays flat. Kept a distinct kind (not a
  // scoped `extraDamage`) so the two collectors never cross: `extraDamage`
  // never touches a spell, `spellDamage` never touches a weapon. `RollKind`
  // can't tell a cantrip from a leveled spell from healing, which is exactly
  // why this carries its own `scope` rather than riding the `damage` kind.
  | {
      rider: "spellDamage";
      // The flat modifier added to the spell's damage total (usually a
      // spellcasting ability modifier).
      value: CustomFormula;
      // Which casts it applies to. Cleric Potent Spellcasting is cantrip-only;
      // Empowered Evocation is leveled; a type-scoped one is `any`.
      scope: "cantrip" | "leveled" | "any";
      // The extra damage's type. Omit to fold into the spell's own damage line.
      damageType?: DamageType;
      // The player confirms eligibility the sheet can't see (a spell's school,
      // its damage type, once-per-turn) — offered as a checkbox rather than
      // applied silently. Potent Spellcasting is unconditional (auto); the
      // school/type-scoped ones opt in.
      optional?: boolean;
      // Condition/reminder shown by the checkbox.
      note?: string;
    };

export interface FeatureRider {
  appliesTo: RollKind[];
  rider: RollRider;
}

// What a feature/ability can carry: riders keyed off it being on the sheet,
// and actions attached to its limited-use pool.
export interface FeatureMechanics {
  riders?: FeatureRider[];
  actions?: AbilityAction[];
}
