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

// Lives outside rules.ts because these modifiers need calculateCustomFormula,
// and rules.ts can't import the formula engine without a cycle.

export type RollCallCheck =
  | { kind: "save"; stat: StatKey }
  | { kind: "ability"; stat: StatKey }
  | { kind: "skill"; skill: SkillName };

export function checkLabel(check: RollCallCheck): string {
  if (check.kind === "save") return `${STAT_NAMES[check.stat]} Save`;
  if (check.kind === "ability") return `${STAT_NAMES[check.stat]} check`;
  return check.skill;
}

// Double PB for expertise, PB for proficiency, half PB (rounded down) for
// Jack of All Trades, else none. Mirrors the sheet's skills column.
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

// Order: saves, then abilities, then skills.
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

// Flattened for the shared `<Select>`. `keywords` covers "save", since the
// group label reads "Saving throws".
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

export function checkForValue(value: string): RollCallCheck | undefined {
  for (const { options } of CHECK_GROUPS) {
    const hit = options.find((o) => o.value === value);
    if (hit) return hit.check;
  }
  return undefined;
}
