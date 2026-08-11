import { RollKind } from "src/lib/types";

// The fourteen conditions of 5e, plus what each means for a d20 roll.
// Advisory only: a condition surfaces a note beside the advantage/
// disadvantage buttons rather than applying anything, since many clauses
// depend on facts the sheet can't see (line of sight, etc).

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

// Open to homebrew, like `ClassName` and `RechargeCriteria`.
export type ConditionName = StandardCondition | string;

interface ConditionEffect {
  appliesTo: RollKind[];
  note: string;
}

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

// What a condition on the target means for a roll against it. Advisory,
// same reasoning as above.
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

// Conditions that stop you acting. Surfaced as a banner rather than by
// disabling anything, same advisory rule as above.
export const INCAPACITATING_CONDITIONS: StandardCondition[] = [
  "Incapacitated",
  "Paralyzed",
  "Petrified",
  "Stunned",
  "Unconscious",
];

// Shaped to match `advantageNotes` output ("Source: note") so the roll
// dialog can render one list regardless of source.
export function conditionRollNotes(
  conditions: ConditionName[],
  kind: RollKind,
): string[] {
  return conditions.flatMap((name) => {
    const effect = CONDITION_ROLL_EFFECTS[name as StandardCondition];
    return effect?.appliesTo.includes(kind) ? [`${name}: ${effect.note}`] : [];
  });
}
