import {
  DamageType,
  HitDie,
  LeveledSpellLevel,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { ClassName, CustomFormula, DieDefinition } from "src/lib/types/formula";

// Serializable descriptions of what abilities do at the table: a closed set of
// interpretable kinds, an open set of data compositions — no functions, so
// mechanics survive persistence, live-sync, and undo. Interpreters and the
// bundled catalog live in `src/lib/mechanics/`; embedded via
// `LimitedUseAbility.mechanics`.

// `special` covers anything outside the standard economy (part of a rest, a
// trigger on being hit); pair it with `costNote`.
export type ActionCost =
  | "action"
  | "bonusAction"
  | "reaction"
  | "free"
  | "special";

// `fixed` is a formula over the character (may contain dice, rolled at
// execution time, not render). `plusLevelOf` adds `levelMultiplier` (default
// 1) × level in a named class, since authored formulas can't reference the
// sheet's per-class UUIDs (Second Wind, Wholeness of Body). `chosenAmount`/
// `chosenLevel` are user picks at execution time; `byChosenLevel` is a lookup
// keyed by chosen slot level (Font of Magic).
export type AmountExpr =
  | { fixed: CustomFormula; plusLevelOf?: ClassName; levelMultiplier?: number }
  | { chosenAmount: true }
  // Roll the chosen number of these dice (Healing Light: "spend N, heal N d6").
  | { chosenAmountDice: StandardDie }
  | { chosenLevel: true }
  | { byChosenLevel: Record<number, number> };

// A described state change or table prompt, interpreted by
// `mechanics/resolve.ts` into ordinary reducer updates so every effect syncs
// and undoes like a manual edit.
export type Effect =
  | { effect: "heal"; amount: AmountExpr } // clamped to max HP
  | { effect: "gainTempHp"; amount: AmountExpr } // doesn't stack, applies only if higher
  // Spends from the owning ability's pool by default; `pool` names a
  // different ability by title to spend from instead (Cutting Words from
  // Bardic Inspiration, a monk discipline from Ki).
  | { effect: "spendUses"; amount: AmountExpr; pool?: string }
  | { effect: "restoreUses"; amount: AmountExpr; pool?: string } // clamped at max
  | { effect: "expendSlot"; level?: LeveledSpellLevel }
  // Sheet tracks expended-vs-total, so slot creation is modelled as restoration.
  | { effect: "restoreSlot"; level?: LeveledSpellLevel }
  | { effect: "spendHitDie"; die: HitDie }
  | { effect: "roll"; label: string; amount: AmountExpr } // display only, no write
  | { effect: "remind"; note: string }; // table prompt, not automation

// A clickable use of an ability. All effects must be payable/meaningful for
// the action to be enabled.
export interface AbilityAction {
  id: string;
  name: string;
  cost: ActionCost;
  costNote?: string;
  choose?: {
    // Levels with an expended slot to restore, or an available slot to expend.
    slotLevel?: "toRestore" | "toExpend";
    slotLevelMax?: number; // caps offered levels (Arcane Recovery stops at 5th)
    amount?: "uses"; // free-typed amount, capped at remaining uses
  };
  // Condition this use puts on a target (Stunning Strike, Hexblade's Curse,
  // Bardic Inspiration). Same shape/rounds convention as
  // `SpellConditionGrant` (1 round = 1, 1 minute = 10).
  applies?: AppliedCondition;
  effects: Effect[];
}

// `multi` marks a save-the-room effect; report carries `targetIds`.
// Single-target is default. Ignored on a damage rider (target is the
// attack's target).
export interface AppliedCondition {
  name: string;
  rounds?: number;
  note?: string;
  multi?: boolean;
}

// "check" is ability/skill checks (incl. initiative); "save" is saving
// throws — split because 5e treats them differently (Bless boosts saves not
// checks, Dwarven Resilience is saves only).
export type RollKind =
  | "check"
  | "save"
  | "attack"
  | "damage"
  | "healing"
  | "hitDie";

// 5e weapon properties that actually gate a feature, not the full property list.
// `melee`/`ranged` describe how the attack is made, so a thrown handaxe is
// tagged both `melee` and `thrown`.
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

// The weapon shape a rider applies to. Every clause must hold; a clause the
// attack has no information about is unknown rather than false, which turns
// an auto-applied rider into an opt-in prompt (see `riderEligibility` in
// `mechanics/conditions.ts`).
export interface RiderCondition {
  tags?: AttackTag[]; // must have all (Rage: melee)
  anyTags?: AttackTag[]; // must have at least one (Sneak Attack: finesse or ranged)
  without?: AttackTag[]; // disqualifying tags (Archery: not a thrown melee weapon)
  // Ability the attack must use. A finesse attack resolves to max(STR, DEX),
  // so which one is "used" is unknowable.
  ability?: StatKey[];
}

// `requires` (the weapon shape it applies to) is factored out here since it's
// orthogonal to the kind.
export type RollRider = RollRiderKind & { requires?: RiderCondition };

type RollRiderKind =
  | { rider: "minimumTotal"; value: CustomFormula } // total can't come out below this (Durable)
  | { rider: "minimumDie"; value: number } // dice below this count as this (Reliable Talent's 10)
  // Reroll dice at or below threshold once, keeping the new roll (Great
  // Weapon Fighting, Halfling Luck).
  | { rider: "rerollBelow"; threshold: number }
  | {
      rider: "bonus";
      value: CustomFormula;
      // Forces the opt-in checkbox even when `requires` is satisfied (Foe
      // Slayer). A bonus with neither `optional` nor an undecidable
      // `requires` folds silently.
      optional?: boolean;
      note?: string;
    }
  // A bonus die rolled onto a d20 check at roll time (Bless's d4, Guidance) —
  // real randomness, distinct from `bonus`'s deterministic formula. Still
  // app-rolled in manual mode so the reported total stays whole.
  | {
      rider: "bonusDice";
      count: number;
      die: StandardDie;
      optional?: boolean; // e.g. Guidance boosts one check, then ends
      note?: string;
    }
  | { rider: "critRange"; value: number } // d20s at or above this crit (Improved Critical: 19)
  | { rider: "advantage"; note: string } // advisory only, situational
  // Extra damage folded into a weapon attack (Sneak Attack, Rage, Divine
  // Smite/Strike). Handled directly by the roll dialog rather than the silent
  // `applyTotalRiders` fold since it's contextual (gated to weapon attacks,
  // declared at a specific step, optionally opt-in). Catalog entries bake
  // `amount`'s dice count from class level at collection time; homebrew
  // instances store a concrete expression.
  | {
      rider: "extraDamage";
      // CustomFormula, not a damage map, because the type is usually the
      // weapon's, not the rider's.
      amount: CustomFormula;
      // Omit to mean "same type as the weapon" (Sneak Attack, Rage). Set when
      // intrinsic to the feature (Divine Smite radiant).
      damageType?: DamageType;
      // Drives dialog sequencing/crit doubling: before the attack roll
      // (Great Weapon Master), after the hit is known (Sneak Attack, Divine
      // Smite), or after the damage roll (reroll effects).
      declareAt: "before-attack" | "on-hit" | "after-damage";
      // Condition the hit puts on the target (Fire Rune, Eldritch Smite) —
      // stamped onto the rolled damage report, then follows the spell/ability wire path.
      applies?: AppliedCondition;
      // Opt-in per attack (Sneak Attack, Divine Smite) vs always applies on a
      // qualifying hit (Rage, Divine Strike). Default false.
      optional?: boolean;
      oncePerTurn?: boolean; // advisory: sheet can't see turns
      note?: string; // eligibility the sheet can't verify, shown in the dialog
      // Powered by a spell slot the player chooses and expends (Divine
      // Smite): dice scale with slot level, slot spent by an explicit button.
      slot?: {
        minLevel: number; // lowest slot level that can power it
        die: DieDefinition; // scaling die
        diceAtMin: number; // dice at minLevel
        maxDice: number; // cap, growing +1 die per slot level above minLevel
        // Optional situational extra (Divine Smite vs undead/fiend), same die.
        bonus?: { dice: number; label: string };
      };
      // Costs a use of a limited-use pool instead of a slot (Rune Knight's
      // Fire Rune). Dice don't scale, so `amount` is authoritative. Never set
      // alongside `slot`.
      uses?: {
        pool: string; // limited-use ability's title, matched like spendUses' pool
      };
    }
  // Mirror of `extraDamage` for spell damage (Potent Spellcasting, Empowered
  // Evocation, Radiant Soul). A flat modifier, not dice — added once, doesn't
  // inflate on a crit. Kept distinct from `extraDamage` so the two collectors
  // never cross a spell/weapon boundary.
  | {
      rider: "spellDamage";
      value: CustomFormula; // usually a spellcasting ability modifier
      // Cleric Potent Spellcasting is cantrip-only; Empowered Evocation is
      // leveled; a type-scoped one is `any`.
      scope: "cantrip" | "leveled" | "any";
      damageType?: DamageType; // omit to fold into the spell's own damage line
      // Player confirms eligibility the sheet can't see. Potent Spellcasting
      // is unconditional; school/type-scoped ones opt in.
      optional?: boolean;
      note?: string;
    };

export interface FeatureRider {
  appliesTo: RollKind[];
  rider: RollRider;
}

// Riders keyed off the feature being on the sheet, actions attached to its
// limited-use pool.
export interface FeatureMechanics {
  riders?: FeatureRider[];
  actions?: AbilityAction[];
}
