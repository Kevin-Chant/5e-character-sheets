import { RollKind } from "src/lib/types";

// The fourteen conditions of 5e, plus what each one means for a d20 roll.
//
// **Advisory only.** Nothing here is applied to a roll: a condition contributes
// a note beside the advantage/disadvantage buttons and lets the player press the
// right one. That's deliberate and matches how the rest of the app treats rules
// it can't see the whole of — half of these are conditional on something the
// sheet has no access to ("while the source of your fear is in sight", "against
// a creature you can't see"), and silently applying disadvantage to a roll that
// didn't deserve it is worse than saying nothing.

export const CONDITION_NAMES = [
  "Blinded",
  "Charmed",
  "Deafened",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
] as const;

export type StandardCondition = (typeof CONDITION_NAMES)[number];

// Open to homebrew, the same convention as `ClassName` and `RechargeCriteria`.
export type ConditionName = StandardCondition | string;

interface ConditionEffect {
  // Which rolls the note is worth showing on. A condition that says nothing
  // about d20s (Deafened, Petrified's damage clauses) simply has no entry.
  appliesTo: RollKind[];
  note: string;
}

// What the roll dialog says when you're rolling under a condition. Phrased as
// what's true, not as an instruction — the player is the one who knows whether
// the clause applies.
export const CONDITION_ROLL_EFFECTS: Partial<
  Record<StandardCondition, ConditionEffect>
> = {
  Blinded: {
    appliesTo: ["attack"],
    note: "Attack rolls have disadvantage.",
  },
  Frightened: {
    appliesTo: ["attack", "check"],
    note: "Disadvantage on attacks and ability checks while the source of your fear is in sight.",
  },
  Invisible: {
    appliesTo: ["attack"],
    note: "Attack rolls have advantage.",
  },
  Paralyzed: {
    appliesTo: ["save"],
    note: "You automatically fail Strength and Dexterity saves, and can't take actions.",
  },
  Poisoned: {
    appliesTo: ["attack", "check"],
    note: "Attack rolls and ability checks have disadvantage.",
  },
  Prone: {
    appliesTo: ["attack"],
    note: "Attack rolls have disadvantage.",
  },
  Restrained: {
    appliesTo: ["attack", "save"],
    note: "Attack rolls have disadvantage, as do Dexterity saves.",
  },
  Stunned: {
    appliesTo: ["save"],
    note: "You automatically fail Strength and Dexterity saves, and can't take actions.",
  },
  Unconscious: {
    appliesTo: ["save"],
    note: "You automatically fail Strength and Dexterity saves, and can't take actions.",
  },
};

// The other side of the table: what a condition on your *target* means for
// your roll against it. Advisory like the bearer-side table above, and for
// the same reason — half the clauses hinge on facts the sheet can't see
// (distance for Prone, whether the attacker can see the Invisible bearer).
export const CONDITION_TARGET_EFFECTS: Partial<
  Record<StandardCondition, ConditionEffect>
> = {
  Blinded: {
    appliesTo: ["attack"],
    note: "Attack rolls against it have advantage.",
  },
  Invisible: {
    appliesTo: ["attack"],
    note: "Attack rolls against it have disadvantage.",
  },
  Paralyzed: {
    appliesTo: ["attack"],
    note: "Attacks against it have advantage; a hit from within 5 feet is a critical hit.",
  },
  Petrified: {
    appliesTo: ["attack"],
    note: "Attacks against it have advantage (and it resists all damage).",
  },
  Prone: {
    appliesTo: ["attack"],
    note: "Melee attacks from within 5 feet have advantage; other attacks have disadvantage.",
  },
  Restrained: {
    appliesTo: ["attack"],
    note: "Attack rolls against it have advantage.",
  },
  Stunned: {
    appliesTo: ["attack"],
    note: "Attack rolls against it have advantage.",
  },
  Unconscious: {
    appliesTo: ["attack"],
    note: "Attacks against it have advantage; a hit from within 5 feet is a critical hit.",
  },
};

// Notes about the chosen target's conditions, for a roll of this kind against
// it. Same "Source: note" shape as `conditionRollNotes`.
export function conditionTargetNotes(
  conditions: ConditionName[],
  kind: RollKind,
): string[] {
  return conditions.flatMap((name) => {
    const effect = CONDITION_TARGET_EFFECTS[name as StandardCondition];
    return effect?.appliesTo.includes(kind)
      ? [`Target ${name.toLowerCase()}: ${effect.note}`]
      : [];
  });
}

// Conditions that stop you acting at all. Surfaced as a banner on the board
// rather than by disabling anything — the same advisory rule as everywhere else,
// and a stunned character still has a DM who might rule otherwise.
export const INCAPACITATING_CONDITIONS: StandardCondition[] = [
  "Incapacitated",
  "Paralyzed",
  "Petrified",
  "Stunned",
  "Unconscious",
];

// Notes to show for a roll of this kind, given the conditions in play. Shaped to
// match `advantageNotes` output ("Source: note") so the roll dialog can render
// one list without caring which half it came from.
export function conditionRollNotes(
  conditions: ConditionName[],
  kind: RollKind,
): string[] {
  return conditions.flatMap((name) => {
    const effect = CONDITION_ROLL_EFFECTS[name as StandardCondition];
    return effect?.appliesTo.includes(kind) ? [`${name}: ${effect.note}`] : [];
  });
}
