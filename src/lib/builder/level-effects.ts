import { uniq } from "lodash";
import {
  OfficialClass,
  Operation,
  StatKey,
} from "src/lib/data/data-definitions";
import { Character, CustomFormula, Senses, Speeds } from "src/lib/types";
import { LevelEffects } from "src/lib/builder/types";
import { getSubclassByName } from "src/lib/builder/subclasses";

// Applying `LevelEffects` — the grants that write to a character field rather
// than adding prose. See the type for why every one of them is idempotent.
//
// Base-class levels and subclass levels feed the same applier: the *source*
// differs (a table here vs. `SrdSubclass.levelEffects`), the effect doesn't.

// Effects a *base class* level confers, keyed by class then level. The
// subclass-independent counterpart to `SrdSubclass.levelEffects` — small by
// design, since almost everything at this level of the class is prose.
export const CLASS_LEVEL_EFFECTS: Partial<
  Record<OfficialClass, Record<number, LevelEffects>>
> = {
  // Diamond Soul: proficiency in every saving throw.
  [OfficialClass.Monk]: {
    14: {
      savingThrows: [
        StatKey.str,
        StatKey.dex,
        StatKey.con,
        StatKey.int,
        StatKey.wis,
        StatKey.cha,
      ],
    },
  },
};

// Whether `formula` already contains `operand` anywhere in its tree. Used to
// keep an additive grant (an initiative modifier) from stacking when a level is
// re-applied — the one effect that isn't naturally idempotent.
export function formulaIncludes(
  formula: CustomFormula | undefined,
  operand: CustomFormula,
): boolean {
  if (formula === undefined) return false;
  if (JSON.stringify(formula) === JSON.stringify(operand)) return true;
  if (typeof formula !== "object" || formula === null) return false;
  if (Array.isArray(formula)) return false;
  if (!("operands" in formula)) return false;
  return formula.operands.some((o) => formulaIncludes(o, operand));
}

// Fold one `LevelEffects` into the character. Safe to call repeatedly for the
// same level: sets stay sets, speeds only rise, and the initiative modifier is
// guarded by `formulaIncludes`.
export function applyLevelEffects(
  char: Character,
  effects: LevelEffects,
): void {
  for (const stat of effects.savingThrows ?? [])
    char.proficiencies.savingThrows[stat] = true;

  const damage =
    effects.resistances ?? effects.immunities ?? effects.vulnerabilities;
  if (damage) {
    // Legacy characters from before `damageModifiers` existed may lack it.
    char.damageModifiers ??= {
      resistances: [],
      immunities: [],
      vulnerabilities: [],
    };
    const merge = (key: keyof typeof char.damageModifiers, add?: string[]) => {
      if (add?.length)
        char.damageModifiers[key] = uniq([
          ...(char.damageModifiers[key] ?? []),
          ...add,
        ]);
    };
    merge("resistances", effects.resistances);
    merge("immunities", effects.immunities);
    merge("vulnerabilities", effects.vulnerabilities);
  }

  for (const [mode, value] of Object.entries(effects.speeds ?? {})) {
    const key = mode as keyof Speeds;
    const feet = value === "walk" ? char.speeds.walk : value;
    // Only ever raise: a slower grant never overwrites a faster speed the
    // character already has from a race, an item, or an earlier level.
    if (feet > (char.speeds[key] ?? 0)) char.speeds[key] = feet;
  }

  for (const [sense, feet] of Object.entries(effects.senses ?? {})) {
    const key = sense as keyof Senses;
    // Only ever raise, for the same reason speeds do.
    if (feet > (char.senses?.[key] ?? 0)) (char.senses ??= {})[key] = feet;
  }

  if (effects.initiativeAbility) {
    const current = char.initiativeFormula ?? StatKey.dex;
    if (!formulaIncludes(current, effects.initiativeAbility))
      char.initiativeFormula = {
        operation: Operation.addition,
        operands: [current, effects.initiativeAbility],
      };
  }
}

// Every `LevelEffects` due at `level` in `className` — the base-class table
// plus the chosen subclass's own entry. Returned rather than applied so the
// caller (and its tests) can see what a level confers.
export function levelEffectsAt(
  className: string,
  subclass: string | undefined,
  level: number,
): LevelEffects[] {
  const out: LevelEffects[] = [];
  const base = CLASS_LEVEL_EFFECTS[className as OfficialClass]?.[level];
  if (base) out.push(base);
  if (subclass) {
    const entry = getSubclassByName(className.toLowerCase(), subclass)
      ?.levelEffects?.[level];
    if (entry) out.push(entry);
  }
  return out;
}
