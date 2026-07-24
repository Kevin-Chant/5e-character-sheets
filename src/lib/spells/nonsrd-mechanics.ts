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

// Authoring helpers for the non-SRD spells' structured `mechanics` blocks. These
// build the same `SpellMechanics` shape the SRD generator produces from the API,
// but from plain facts an author reads off a spell page — so a partition file
// writes `mechanics: spellMech({ ... })` instead of hand-assembling
// `DieExpression` tuples and scaling objects (which is where errors hide).
//
// Everything here runs at module load and returns plain data (no functions are
// stored), so a built spell's `mechanics` survives persistence like any other.

const STANDARD_FACES = new Set([4, 6, 8, 10, 12, 20]);

// "8d6" → [8, d6, roll]. Throws on a non-`NdM` string so a typo fails the build
// rather than silently dropping a spell's damage.
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

// The caster's spellcasting modifier, substituted for the real class id when the
// spell is added to a sheet (see `srd-spell-adapter.ts`).
const CASTER_MOD = { spellMod: "@caster" } as unknown as CustomFormula;

// Resolution helpers, mirroring the three `SpellResolution` kinds.
export const saveHalf = (ability: StatKey): SpellResolution => ({
  kind: "save",
  ability,
  halfOnSuccess: true,
});
// A save the spell's damage isn't halved on (save-for-none, or a save that gates
// a condition rather than damage).
export const save = (ability: StatKey): SpellResolution => ({
  kind: "save",
  ability,
});
export const attack = (range: "melee" | "ranged"): SpellResolution => ({
  kind: "attack",
  range,
});
export const auto = (): SpellResolution => ({ kind: "auto" });

// One damage component: a type, a base `NdM` roll, and (optionally) the per-step
// increment as it upcasts/scales (e.g. Fireball's `+1d6`, a cantrip's `+1d10`).
export interface DamageSpec {
  type: DamageType;
  base: string;
  scale?: string;
}

export interface MechSpec {
  level: number;
  resolution: SpellResolution;
  // Damage components. Omit for a pure healing or utility spell.
  damage?: DamageSpec[];
  // Base healing roll; `mod` adds the caster's spellcasting modifier; `scale` is
  // the per-step increment (Cure Wounds `+1d8`).
  healing?: { base: string; mod?: boolean; scale?: string };
  // Separately-rolled instances (Scorching Ray = 2 rays), with the count gained
  // per scaling step.
  instances?: number;
  scaleInstances?: number;
  // How it scales. "slot" (default) adds a step per `perLevels` slot levels above
  // `level`; "character" is the cantrip 5/11/17 tiers. Omit both scale hints for
  // a spell that doesn't grow.
  driver?: "slot" | "character";
  perLevels?: number;
}

// Assemble the `SpellMechanics` from a spec. Only emits `scaling` when at least
// one scale hint is present, matching what the SRD data does.
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
