import { SkillName, StatKey } from "src/lib/data/data-definitions";
import { calculateCustomFormula } from "src/lib/formula";
import {
  SKILL_SOURCE_STATS,
  STAT_NAMES,
  getPB,
  hasJackOfAllTrades,
  modifier,
} from "src/lib/rules";
import { Character } from "src/lib/types";

// The ad-hoc d20s a table asks for by voice — "give me a Perception check",
// "everyone, a DEX save" — as data, so both the player's quick launcher and
// the DM's roll call speak the same language over the wire.
//
// Lives here rather than in `rules.ts` for the same reason `initiative.ts`
// does: the modifiers need `calculateCustomFormula` (save/skill bonus
// formulas), and rules.ts can't import the formula engine without a cycle.

export type RollCallCheck =
  | { kind: "save"; stat: StatKey }
  | { kind: "ability"; stat: StatKey }
  | { kind: "skill"; skill: SkillName };

// "Wisdom Save", "Strength check", "Perception (wis)" — the label both the
// prompt and the roll dialog show, and the one a result carries back.
export function checkLabel(check: RollCallCheck): string {
  if (check.kind === "save") return `${STAT_NAMES[check.stat]} Save`;
  if (check.kind === "ability") return `${STAT_NAMES[check.stat]} check`;
  return check.skill;
}

// The proficiency contribution to a d20 modifier: double PB for expertise, PB
// for proficiency, half PB (rounded down) for Jack of All Trades, else none.
// Mirrors the sheet's skills column — keep the two in step.
function proficiencyContribution(
  pb: number,
  proficient: boolean,
  expert: boolean,
  jack: boolean,
): number {
  if (expert) return 2 * pb;
  if (proficient) return pb;
  if (jack) return Math.floor(pb / 2);
  return 0;
}

export function checkModifier(
  character: Character,
  check: RollCallCheck,
): number {
  const pb = getPB(character);
  const jack = hasJackOfAllTrades(character);
  if (check.kind === "save") {
    const saveBonus = character.savingThrowBonus
      ? calculateCustomFormula(character.savingThrowBonus, character)
      : 0;
    return (
      modifier(character.stats[check.stat]) +
      (character.proficiencies.savingThrows[check.stat] ? pb : 0) +
      saveBonus
    );
  }
  if (check.kind === "ability") {
    // Jack of All Trades applies to any ability check without PB — a raw
    // ability check included.
    return (
      modifier(character.stats[check.stat]) +
      proficiencyContribution(pb, false, false, jack)
    );
  }
  const stat = SKILL_SOURCE_STATS[check.skill];
  const bonusFormula = character.proficiencies.skillBonuses[check.skill];
  const bonus = bonusFormula
    ? calculateCustomFormula(bonusFormula, character)
    : 0;
  return (
    modifier(character.stats[stat]) +
    proficiencyContribution(
      pb,
      !!character.proficiencies.skills[check.skill],
      !!character.proficiencies.expertise[check.skill],
      jack,
    ) +
    bonus
  );
}

// Everything the pickers offer, in the order a table thinks: saves first
// (the DM's most common ask), then raw abilities, then skills.
export const CHECK_GROUPS: {
  group: string;
  options: { value: string; check: RollCallCheck }[];
}[] = [
  {
    group: "Saving throws",
    options: (Object.keys(STAT_NAMES) as StatKey[]).map((stat) => ({
      value: `save:${stat}`,
      check: { kind: "save", stat },
    })),
  },
  {
    group: "Ability checks",
    options: (Object.keys(STAT_NAMES) as StatKey[]).map((stat) => ({
      value: `ability:${stat}`,
      check: { kind: "ability", stat },
    })),
  },
  {
    group: "Skills",
    options: (Object.keys(SKILL_SOURCE_STATS) as SkillName[]).map((skill) => ({
      value: `skill:${skill}`,
      check: { kind: "skill", skill },
    })),
  },
];

// The same list flattened for the shared `<Select>`: one option per check,
// carrying the heading it sorts under and the words a player types that its
// label doesn't contain. "save" is the whole reason `keywords` exists — the
// group reads "Saving throws", and nobody at a table says that.
export const CHECK_OPTIONS: {
  value: string;
  label: string;
  group: string;
  keywords?: string;
}[] = CHECK_GROUPS.flatMap(({ group, options }) =>
  options.map(({ value, check }) => ({
    value,
    label: checkLabel(check),
    group,
    keywords: check.kind === "save" ? "save saving throw" : undefined,
  })),
);

// The select's flat value ↔ check mapping, so the wire carries data and the
// <option> carries a string.
export function checkForValue(value: string): RollCallCheck | undefined {
  for (const { options } of CHECK_GROUPS) {
    const hit = options.find((o) => o.value === value);
    if (hit) return hit.check;
  }
  return undefined;
}
