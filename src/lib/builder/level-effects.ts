import { uniq } from "lodash";
import {
  OfficialClass,
  Operation,
  StatKey,
} from "src/lib/data/data-definitions";
import { Character, CustomFormula, Senses, Speeds } from "src/lib/types";
import { LevelEffects } from "src/lib/builder/types";
import { getSubclassByName } from "src/lib/builder/subclasses";

// `LevelEffects` grants write to a character field rather than adding prose;
// see the type for why each must be idempotent. Base-class and subclass
// levels feed the same applier below, just from different tables.

// Effects a base-class level confers, keyed by class then level. Counterpart
// to `CatalogSubclass.levelEffects` for the subclass-independent case.
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

// Whether `formula` already contains `operand` anywhere in its tree. Guards
// the initiative modifier, the one effect not naturally idempotent.
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

// Safe to call repeatedly for the same level: sets stay sets, speeds only
// rise, and the initiative modifier is guarded by `formulaIncludes`.
export function applyLevelEffects(
  char: Character,
  effects: LevelEffects,
): void {
  for (const stat of effects.savingThrows ?? [])
    char.proficiencies.savingThrows[stat] = true;

  for (const skill of effects.skills ?? [])
    char.proficiencies.skills[skill] = true;

  const damage =
    effects.resistances ?? effects.immunities ?? effects.vulnerabilities;
  if (damage) {
    // Older characters may lack `damageModifiers`.
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
    // Only ever raise, never overwrite a faster existing speed.
    if (feet > (char.speeds[key] ?? 0)) char.speeds[key] = feet;
  }

  for (const [sense, feet] of Object.entries(effects.senses ?? {})) {
    const key = sense as keyof Senses;
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

// Every `LevelEffects` due at `level` in `className`: base-class table plus
// the chosen subclass's entry. Returned rather than applied.
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
