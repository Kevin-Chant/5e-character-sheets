import {
  DamageType,
  DieOperation,
  Operation,
  StatKey,
} from "src/lib/data/data-definitions";
import {
  CustomFormula,
  DieDefinition,
  DieExpression,
  SpellDamageComponent,
  SpellMechanics,
  SpellResolution,
  SpellScaling,
} from "src/lib/types";

// Authoring helpers for the non-SRD spells' structured `mechanics` blocks:
// builds the same `SpellMechanics` shape the SRD generator produces, from
// plain facts read off a spell page (`spellMech({ ... })`) instead of
// hand-assembled `DieExpression` tuples and scaling objects.

const STANDARD_FACES = new Set([4, 6, 8, 10, 12, 20]);

// "8d6" -> [8, d6, roll]. Throws on a non-`NdM` string.
export function roll(expr: string): DieExpression {
  const m = /^(\d+)d(\d+)$/.exec(expr.trim());
  if (!m) throw new Error(`nonsrd-mechanics: bad dice expression "${expr}"`);
  const count = Number(m[1]);
  const faces = Number(m[2]);
  const die: DieDefinition = STANDARD_FACES.has(faces)
    ? (`d${faces}` as DieDefinition)
    : { numFaces: faces };
  return [count, die, DieOperation.roll];
}

// Substituted for the real class id when the spell is added to a sheet
// (see `spell-adapter.ts`).
const CASTER_MOD = { spellMod: "@caster" } as unknown as CustomFormula;

export const saveHalf = (ability: StatKey): SpellResolution => ({
  kind: "save",
  ability,
  halfOnSuccess: true,
});
// Save-for-none: a save that gates a condition rather than halving damage.
export const save = (ability: StatKey): SpellResolution => ({
  kind: "save",
  ability,
});
export const attack = (range: "melee" | "ranged"): SpellResolution => ({
  kind: "attack",
  range,
});
export const auto = (): SpellResolution => ({ kind: "auto" });

// One damage component: a type, a base `NdM` roll, and an optional per-step
// scaling increment (e.g. Fireball's `+1d6`).
export interface DamageSpec {
  type: DamageType;
  base: string;
  scale?: string;
}

export interface MechSpec {
  level: number;
  resolution: SpellResolution;
  // Omit for a pure healing/utility spell.
  damage?: DamageSpec[];
  // `mod` adds the caster's spellcasting modifier; `scale` is the per-step
  // healing increment (Cure Wounds `+1d8`).
  healing?: { base: string; mod?: boolean; scale?: string };
  // Separately-rolled instances (Scorching Ray = 2 rays).
  instances?: number;
  scaleInstances?: number;
  // "slot" (default) adds a step per `perLevels` slot levels above `level`;
  // "character" is the cantrip 5/11/17 tiers.
  driver?: "slot" | "character";
  perLevels?: number;
}

// Emits `scaling` only when at least one scale hint is present.
export function spellMech(spec: MechSpec): SpellMechanics {
  const out: SpellMechanics = {
    level: spec.level,
    resolution: spec.resolution,
  };

  if (spec.damage)
    out.damage = spec.damage.map((d) => ({
      damageType: d.type,
      formula: roll(d.base),
    }));

  if (spec.healing) {
    const base = roll(spec.healing.base);
    out.healing = spec.healing.mod
      ? { operation: Operation.addition, operands: [base, CASTER_MOD] }
      : base;
  }

  if (spec.instances !== undefined) out.instances = spec.instances;

  const damageScale: SpellDamageComponent[] = (spec.damage ?? [])
    .filter((d) => d.scale)
    .map((d) => ({ damageType: d.type, formula: roll(d.scale!) }));
  const scaling: SpellScaling = { driver: spec.driver ?? "slot" };
  let scales = false;
  if (damageScale.length) {
    scaling.damage = damageScale;
    scales = true;
  }
  if (spec.healing?.scale) {
    scaling.healing = roll(spec.healing.scale);
    scales = true;
  }
  if (spec.scaleInstances) {
    scaling.instances = spec.scaleInstances;
    scales = true;
  }
  if (scales) {
    // `perLevels` only means anything for the slot driver.
    if ((spec.driver ?? "slot") === "slot" && spec.perLevels)
      scaling.perLevels = spec.perLevels;
    out.scaling = scaling;
  }

  return out;
}
