import {
  DamageType,
  DieOperation,
  Operation,
  StandardDie,
} from "src/lib/data/data-definitions";
import {
  CustomFormula,
  DieExpression,
  SpellDamageComponent,
  SpellMechanics,
  SpellResolution,
  SpellScaling,
  isDieExpression,
  isSpellMod,
} from "src/lib/types";
import { UUID } from "crypto";

// Bridges the structured `SpellMechanics` model (see spell-scaling.md) and the
// plain text inputs the spell editor exposes. The editor only offers the two
// shapes that cover almost every rollable spell — bare dice ("8d6") and dice
// plus the caster's spellcasting modifier ("1d8 + spell mod") — and treats
// anything richer (imported `damageTable`s, hand-built formulas) as read-only so
// it is never silently clobbered.

const DIE_BY_FACES: Record<number, StandardDie> = {
  4: StandardDie.d4,
  6: StandardDie.d6,
  8: StandardDie.d8,
  10: StandardDie.d10,
  12: StandardDie.d12,
  20: StandardDie.d20,
};

// "8d6" (whitespace-tolerant, case-insensitive) → a roll DieExpression.
export function parseDice(text: string): DieExpression | undefined {
  const match = /^\s*(\d+)\s*d\s*(\d+)\s*$/i.exec(text);
  if (!match) return undefined;
  const count = Number(match[1]);
  const die = DIE_BY_FACES[Number(match[2])];
  if (!die || count < 1) return undefined;
  return [count, die, DieOperation.roll];
}

// A roll DieExpression → "8d6". Non-roll operations (average/max) aren't
// representable as plain dice text, so they return undefined.
export function formatDice(d: DieExpression): string | undefined {
  const [count, def, op] = d;
  if (op !== DieOperation.roll) return undefined;
  const faces =
    typeof def === "string" ? def.replace(/^d/, "") : String(def.numFaces);
  return `${count}d${faces}`;
}

// The editor's view of a single damage/healing amount: N dice, optionally plus
// the class's live spellcasting modifier.
export interface DiceFormulaInput {
  dice: string;
  addSpellMod: boolean;
}

// Best-effort parse of a stored formula into the simple editor shape. Returns
// undefined for anything that isn't "dice" or "dice + spellMod" so callers can
// fall back to a read-only display rather than lose data on round-trip.
export function formulaToDiceInput(
  f: CustomFormula,
): DiceFormulaInput | undefined {
  if (isDieExpression(f)) {
    const dice = formatDice(f);
    return dice ? { dice, addSpellMod: false } : undefined;
  }
  if (
    typeof f === "object" &&
    f !== null &&
    !Array.isArray(f) &&
    "operation" in f &&
    f.operation === Operation.addition &&
    f.operands.length === 2 &&
    isDieExpression(f.operands[0]) &&
    isSpellMod(f.operands[1])
  ) {
    const dice = formatDice(f.operands[0]);
    return dice ? { dice, addSpellMod: true } : undefined;
  }
  return undefined;
}

// Build a stored formula from the editor shape. Returns undefined when the dice
// text is unparseable (so the caller can keep the field empty / drop the row).
export function diceInputToFormula(
  input: DiceFormulaInput,
  classId: UUID,
): CustomFormula | undefined {
  const dice = parseDice(input.dice);
  if (!dice) return undefined;
  if (!input.addSpellMod) return dice;
  return {
    operation: Operation.addition,
    operands: [dice, { spellMod: classId }],
  };
}

// ---------------------------------------------------------------------------
// Whole-mechanics <-> editor-form conversion.
//
// The editor holds a flat, text-friendly `MechForm` (so mid-typing invalid dice
// don't corrupt the model) and derives `SpellMechanics` from it on each change.
// Shapes the simple inputs can't express (imported `damageTable`s, non-dice
// scaling) are stashed as `raw*`/`damageTable` and passed through untouched.
// ---------------------------------------------------------------------------

export interface DamageRowForm {
  damageType: DamageType;
  dice: string;
  addSpellMod: boolean;
  // Present when the stored formula isn't plain "dice [+ spellMod]"; kept as-is.
  raw?: CustomFormula;
}

export interface HealRowForm {
  dice: string;
  addSpellMod: boolean;
  raw?: CustomFormula;
}

export interface ScalingForm {
  driver: "slot" | "character";
  perLevels: number; // slot driver only, >= 1
  damageDice: string; // "" = no extra damage per step
  damageType: DamageType;
  instances: number; // 0 = no extra instances per step
  rawHealing?: CustomFormula; // preserved, not edited here
  rawDamageExtra?: SpellDamageComponent[]; // preserved advanced damage steps
}

export interface MechForm {
  resolution: SpellResolution;
  damage: DamageRowForm[];
  healing?: HealRowForm;
  instances: number; // >= 1
  scaling?: ScalingForm;
  damageTable?: Record<number, SpellDamageComponent[]>; // preserved
}

const amountToRow = (
  f: CustomFormula,
): { dice: string; addSpellMod: boolean; raw?: CustomFormula } => {
  const input = formulaToDiceInput(f);
  return input ? { ...input } : { dice: "", addSpellMod: false, raw: f };
};

function scalingToForm(s: SpellScaling): ScalingForm {
  const [first, ...rest] = s.damage ?? [];
  const firstDice = first && formatDice2(first.formula);
  return {
    driver: s.driver,
    perLevels: s.perLevels ?? 1,
    damageDice: firstDice ?? "",
    damageType: first?.damageType ?? DamageType.Fire,
    instances: s.instances ?? 0,
    rawHealing: s.healing,
    // If the first component wasn't plain dice, keep the whole list as raw.
    rawDamageExtra: firstDice ? rest : s.damage,
  };
}

// `formatDice` narrowed to the damage-component case (dice-only formulas).
const formatDice2 = (f: CustomFormula): string | undefined =>
  isDieExpression(f) ? formatDice(f) : undefined;

export function mechanicsToForm(m: SpellMechanics): MechForm {
  return {
    resolution: m.resolution,
    damage: (m.damage ?? []).map((c) => ({
      damageType: c.damageType,
      ...amountToRow(c.formula),
    })),
    healing: m.healing ? amountToRow(m.healing) : undefined,
    instances: m.instances ?? 1,
    scaling: m.scaling ? scalingToForm(m.scaling) : undefined,
    damageTable: m.damageTable,
  };
}

function formScaling(sf: ScalingForm): SpellScaling | undefined {
  const stepDice = parseDice(sf.damageDice);
  const damage: SpellDamageComponent[] = [
    ...(stepDice ? [{ damageType: sf.damageType, formula: stepDice }] : []),
    ...(sf.rawDamageExtra ?? []),
  ];
  const instances = sf.instances > 0 ? sf.instances : undefined;
  if (!damage.length && instances === undefined && !sf.rawHealing)
    return undefined;
  return {
    driver: sf.driver,
    ...(sf.driver === "slot" ? { perLevels: Math.max(1, sf.perLevels) } : {}),
    ...(damage.length ? { damage } : {}),
    ...(sf.rawHealing ? { healing: sf.rawHealing } : {}),
    ...(instances !== undefined ? { instances } : {}),
  };
}

export function formToMechanics(
  form: MechForm,
  level: number,
  classId: UUID,
): SpellMechanics {
  const damage: SpellDamageComponent[] = [];
  for (const row of form.damage) {
    const formula =
      row.raw ??
      diceInputToFormula(
        { dice: row.dice, addSpellMod: row.addSpellMod },
        classId,
      );
    if (formula) damage.push({ damageType: row.damageType, formula });
  }
  const healing =
    form.healing &&
    (form.healing.raw ??
      diceInputToFormula(
        { dice: form.healing.dice, addSpellMod: form.healing.addSpellMod },
        classId,
      ));
  const scaling = form.scaling && formScaling(form.scaling);
  return {
    level,
    resolution: form.resolution,
    ...(damage.length ? { damage } : {}),
    ...(healing ? { healing } : {}),
    ...(form.instances > 1 ? { instances: form.instances } : {}),
    ...(scaling ? { scaling } : {}),
    ...(form.damageTable ? { damageTable: form.damageTable } : {}),
  };
}

// A fresh mechanics block seeded when the user first marks a spell rollable: a
// ranged spell attack dealing 1d6 fire, ready to edit.
export function defaultMechanics(level: number): SpellMechanics {
  return {
    level,
    resolution: { kind: "attack", range: "ranged" },
    damage: [
      {
        damageType: DamageType.Fire,
        formula: [1, StandardDie.d6, DieOperation.roll],
      },
    ],
  };
}
