import { uniq } from "lodash";
import { FEATS } from "src/lib/data/feats";
import { Feat } from "src/lib/builder/types";
import {
  Operation,
  RestType,
  SkillName,
  StatKey,
} from "src/lib/data/data-definitions";
import { Character, TextComponent } from "src/lib/types";
import { grantArmor } from "src/lib/builder/level-grants";
import { statCapFor } from "src/lib/rules";
import { addSrdSpell } from "src/lib/builder/grant-spells";

const text = (title: string, detail?: string): TextComponent =>
  detail
    ? { title, titleFormulas: [], detail, detailFormulas: [] }
    : { title, titleFormulas: [] };

export { FEATS };

const BY_INDEX = new Map(FEATS.map((f) => [f.index, f]));

export const getFeat = (index?: string): Feat | undefined =>
  index ? BY_INDEX.get(index) : undefined;

// ---------------------------------------------------------------------------
// Applying a feat
//
// Lives with the feat catalog rather than in the level-up wizard: creation
// applies one too (Variant Human, Custom Lineage), so a module named for one
// wizard was the wrong home.

// The subset of wizard state a feat needs. Narrowed to an interface (rather
// than taking `LevelUpState`) so the *creation* wizard can apply a level-1 feat
// — Variant Human, Custom Lineage — through exactly the same code path.
// `LevelUpState` satisfies it structurally.
export interface FeatChoices {
  featAbilityChoice?: StatKey;
  featSkillChoices: SkillName[];
  featExpertiseChoices: SkillName[];
  featWeaponChoices: string[];
  featSpellChoices: Record<number, string[]>;
  // Which class any feat-granted spells are tagged to. Optional because the
  // creation wizard derives it from `classIndex`; `addSpell` already falls back
  // to the character's first class when the name doesn't match one.
  className?: string;
}

// Apply a chosen feat to the character: its ability increase, its `effect` as a
// feature, its automatic `grants`, and any player choices made in the wizard.
// Feat-granted spells are tagged to the class being advanced (a sensible,
// editable default — the sheet lets the player retag or adjust the ability).
export function applyFeat(
  char: Character,
  feat: Feat,
  state: FeatChoices,
): void {
  char.features.push(text(feat.name, feat.effect));

  const raisedStat = feat.abilityIncrease
    ? (state.featAbilityChoice ?? feat.abilityIncrease.from[0])
    : undefined;
  // A half-feat's +1 obeys the same ceiling an ASI does — Resilient can't take
  // a 20 to 21 any more than a straight increase can.
  if (feat.abilityIncrease && raisedStat)
    char.stats[raisedStat] = Math.min(
      char.stats[raisedStat] + feat.abilityIncrease.by,
      statCapFor(char, raisedStat),
    );

  const g = feat.grants;
  if (!g) return;

  if (g.savingThrowFromAbility && raisedStat)
    char.proficiencies.savingThrows[raisedStat] = true;
  if (g.armor) grantArmor(char.otherProficiencies.armor, g.armor);
  if (g.weapons)
    char.otherProficiencies.weapons = uniq([
      ...char.otherProficiencies.weapons,
      ...g.weapons,
    ]);
  if (g.tools)
    char.otherProficiencies.toolsAndOther = [
      ...char.otherProficiencies.toolsAndOther,
      ...g.tools.map((t) => text(t)),
    ];
  if (g.speedBonus) char.speeds.walk += g.speedBonus;
  if (g.initiativeBonus)
    char.initiativeFormula = {
      operation: Operation.addition,
      operands: [char.initiativeFormula ?? StatKey.dex, g.initiativeBonus],
    };
  for (const index of g.fixedCantrips ?? [])
    addSrdSpell(char, index, state.className ?? "");
  for (const index of g.fixedSpells ?? [])
    addSrdSpell(char, index, state.className ?? "");
  if (g.limitedUse)
    char.limitedUseAbilities.push({
      info: text(g.limitedUse.name, g.limitedUse.detail),
      maxUses: g.limitedUse.maxUses,
      recharge:
        g.limitedUse.recharge === "long"
          ? RestType.longRest
          : RestType.shortRest,
      expended: 0,
    });

  // Player choices.
  for (const skill of state.featSkillChoices)
    char.proficiencies.skills[skill] = true;
  for (const skill of state.featExpertiseChoices)
    char.proficiencies.expertise[skill] = true;
  if (state.featWeaponChoices.length)
    char.otherProficiencies.weapons = uniq([
      ...char.otherProficiencies.weapons,
      ...state.featWeaponChoices,
    ]);
  for (const indices of Object.values(state.featSpellChoices))
    for (const index of indices)
      addSrdSpell(char, index, state.className ?? "");
}
