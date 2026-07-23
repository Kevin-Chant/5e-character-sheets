import { cloneDeep, uniq } from "lodash";
import {
  ArmorType,
  HIT_DICE,
  Operation,
  OfficialClass,
  RestType,
  SkillName,
  StatKey,
} from "src/lib/data/data-definitions";
import { Character, IClass, Spell, TextComponent } from "src/lib/types";
import { randomUUID } from "src/lib/browser";
import { averageDie, getHitDice, getHpFormula, modifier } from "src/lib/rules";
import {
  classFeaturesAt,
  ELDRITCH_INVOCATIONS,
  fightingStyleDueAt,
  getFightingStyle,
  syncMartialArts,
} from "src/lib/builder/class-features";
import { syncClassPools, syncRacePools } from "src/lib/builder/class-pools";
import { optionGroup } from "src/lib/builder/chosen-options";
import { getSubclassByName } from "src/lib/builder/subclasses";
import { getFeat } from "src/lib/builder/feats";
import { getSrdSpell } from "src/lib/spells/srd-spells";
import { buildSpellFromSrd } from "src/lib/spells/srd-spell-adapter";
import { Feat, SrdSubclass } from "src/lib/builder/types";

// ---------------------------------------------------------------------------
// 5e progression tables the level-up wizard needs but that aren't derivable
// from the class list (unlike HP / hit dice / PB / spell slots, which rules.ts
// already computes from `char.class[]`).
// ---------------------------------------------------------------------------

// The class level at which each class chooses its subclass.
const SUBCLASS_LEVEL: Record<OfficialClass, number> = {
  Artificer: 3,
  Barbarian: 3,
  Bard: 3,
  Cleric: 1,
  Druid: 2,
  Fighter: 3,
  Monk: 3,
  Paladin: 3,
  Ranger: 3,
  Rogue: 3,
  Sorcerer: 1,
  Warlock: 1,
  Wizard: 2,
};

// Levels (in a single class) that grant an Ability Score Improvement / feat.
// Everyone gets 4/8/12/16/19; Fighter and Rogue get extras.
const BASE_ASI_LEVELS = [4, 8, 12, 16, 19];
const EXTRA_ASI_LEVELS: Partial<Record<OfficialClass, number[]>> = {
  Fighter: [6, 14],
  Rogue: [10],
};

// Minimum ability scores to multiclass into / out of a class (non-blocking
// warning only — homebrew and variant rules are common).
export const MULTICLASS_PREREQS: Partial<Record<OfficialClass, string>> = {
  Artificer: "Intelligence 13",
  Barbarian: "Strength 13",
  Bard: "Charisma 13",
  Cleric: "Wisdom 13",
  Druid: "Wisdom 13",
  Fighter: "Strength 13 or Dexterity 13",
  Monk: "Dexterity 13 and Wisdom 13",
  Paladin: "Strength 13 and Charisma 13",
  Ranger: "Dexterity 13 and Wisdom 13",
  Rogue: "Dexterity 13",
  Sorcerer: "Charisma 13",
  Warlock: "Charisma 13",
  Wizard: "Intelligence 13",
};

// Classes that gain spellcasting as the base class (subclass-only casters like
// Eldritch Knight / Arcane Trickster are excluded — they cast from level 3 via
// a subclass the level-1-oriented catalog doesn't model).
const CASTER_CLASSES = new Set<OfficialClass>([
  OfficialClass.Artificer,
  OfficialClass.Bard,
  OfficialClass.Cleric,
  OfficialClass.Druid,
  OfficialClass.Paladin,
  OfficialClass.Ranger,
  OfficialClass.Sorcerer,
  OfficialClass.Warlock,
  OfficialClass.Wizard,
]);

const asOfficialClass = (name: string): OfficialClass | undefined =>
  (Object.values(OfficialClass) as string[]).includes(name)
    ? (name as OfficialClass)
    : undefined;

// Does reaching `level` in `className` grant a subclass choice?
export const subclassDueAt = (className: string, level: number): boolean => {
  const oc = asOfficialClass(className);
  return oc ? SUBCLASS_LEVEL[oc] === level : false;
};

// Does reaching `level` in `className` grant an ASI / feat?
export const isAsiLevel = (className: string, level: number): boolean => {
  const oc = asOfficialClass(className);
  const extra = (oc && EXTRA_ASI_LEVELS[oc]) || [];
  return BASE_ASI_LEVELS.includes(level) || extra.includes(level);
};

export const isCasterClass = (className: string): boolean => {
  const oc = asOfficialClass(className);
  return !!oc && CASTER_CLASSES.has(oc);
};

// Classes the bundled SRD spell catalog actually tags on its spells. Artificer
// (and any homebrew class) isn't among them, so its spell picker must show the
// full list rather than filter to a class that matches nothing.
const SPELL_LIST_CLASSES = new Set<OfficialClass>([
  OfficialClass.Bard,
  OfficialClass.Cleric,
  OfficialClass.Druid,
  OfficialClass.Paladin,
  OfficialClass.Ranger,
  OfficialClass.Sorcerer,
  OfficialClass.Warlock,
  OfficialClass.Wizard,
]);

// The class name to filter the SRD spell list by — or undefined to show every
// spell (Artificer / homebrew, which the SRD catalog doesn't tag).
export const spellListFilterFor = (className: string): string | undefined => {
  const oc = asOfficialClass(className);
  return oc && SPELL_LIST_CLASSES.has(oc) ? className : undefined;
};

// Half-casters (Paladin, Ranger) learn no cantrips; every other caster does.
const NO_CANTRIP_CLASSES = new Set<OfficialClass>([
  OfficialClass.Paladin,
  OfficialClass.Ranger,
]);

export const classHasCantrips = (className: string): boolean => {
  const oc = asOfficialClass(className);
  // Non-official (homebrew) casters: allow cantrips rather than assume none.
  return isCasterClass(className) && !(oc && NO_CANTRIP_CLASSES.has(oc));
};

// ---------------------------------------------------------------------------
// Wizard working state.
// ---------------------------------------------------------------------------

export interface LevelUpState {
  // The class being advanced. For a brand-new multiclass, `isNewMulticlass` is
  // true and the class starts at level 1.
  className: string;
  isNewMulticlass: boolean;
  // Subclass chosen this level (name), when one is due.
  subclass?: string;
  // ASI vs feat at an ASI level.
  advancement: "asi" | "feat";
  // Ability-score deltas (an ASI spends +2 total). Keyed by stat.
  asi: Partial<Record<StatKey, number>>;
  featIndex?: string;
  // For a half-feat with a choice of stats, which one to raise.
  featAbilityChoice?: StatKey;
  // Choices a chosen feat's grants require (see FeatGrants).
  featSkillChoices: SkillName[];
  featExpertiseChoices: SkillName[];
  featWeaponChoices: string[];
  featSpellChoices: Record<number, string[]>;
  // Newly learned spells, by numeric level (0 = cantrips).
  newSpells: Record<number, string[]>;
  // Fighting style chosen when the class grants one at this level.
  fightingStyle?: string;
  // Eldritch invocations picked when the warlock's known count grows.
  invocations: string[];
  // Picks from the class's closed option lists (Metamagic, maneuvers, Pact
  // Boon, a ranger's favored enemy), keyed by `OptionGroup.category`. Only the
  // *new* picks this level grants live here — earlier ones stay on the sheet.
  chosenOptions: Record<string, string[]>;
  // Free-text features the player adds for content we don't model.
  addedFeatures: { title: string; detail: string }[];
}

// Cleared whenever the chosen feat (or the advancement mode) changes, so a
// previous feat's picks don't leak into a different one.
export const emptyFeatChoices = () => ({
  featSkillChoices: [] as SkillName[],
  featExpertiseChoices: [] as SkillName[],
  featWeaponChoices: [] as string[],
  featSpellChoices: {} as Record<number, string[]>,
});

export function defaultLevelUpState(character: Character): LevelUpState {
  // Default to advancing the character's first (primary) class.
  const primary = character.class[0]?.name ?? OfficialClass.Fighter;
  return {
    className: primary,
    isNewMulticlass: false,
    advancement: "asi",
    asi: {},
    ...emptyFeatChoices(),
    newSpells: {},
    invocations: [],
    chosenOptions: {},
    addedFeatures: [],
  };
}

// The class level this character will reach for `state`'s target class once the
// level-up is applied.
export function targetClassLevel(
  character: Character,
  state: LevelUpState,
): number {
  if (state.isNewMulticlass) return 1;
  const existing = character.class.find((c) => c.name === state.className);
  return (existing?.level ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Applying the level-up — pure, returns a new Character.
// ---------------------------------------------------------------------------

const text = (title: string, detail?: string): TextComponent =>
  detail
    ? { title, titleFormulas: [], detail, detailFormulas: [] }
    : { title, titleFormulas: [] };

// OR a set of armor-proficiency grant strings into the sheet's armor map.
function grantArmor(armor: Record<ArmorType, boolean>, grants: string[]): void {
  for (const g of grants) {
    const lc = g.toLowerCase();
    if (lc === "all armor")
      armor[ArmorType.Light] =
        armor[ArmorType.Medium] =
        armor[ArmorType.Heavy] =
          true;
    else if (lc.includes("light")) armor[ArmorType.Light] = true;
    else if (lc.includes("medium")) armor[ArmorType.Medium] = true;
    else if (lc.includes("heavy")) armor[ArmorType.Heavy] = true;
    else if (lc.includes("shield")) armor[ArmorType.Shields] = true;
  }
}

// Fold a subclass's level-1 `grants` (features, proficiencies, domain spells)
// into an existing character. Mirrors what build-character.ts applies at
// creation, but for a subclass chosen mid-play.
function applySubclassGrant(
  char: Character,
  grant: NonNullable<SrdSubclass["grants"]>,
  className: string,
): void {
  if (grant.proficiencies?.armor)
    grantArmor(char.otherProficiencies.armor, grant.proficiencies.armor);
  if (grant.proficiencies?.weapons)
    char.otherProficiencies.weapons = uniq([
      ...char.otherProficiencies.weapons,
      ...grant.proficiencies.weapons,
    ]);
  if (grant.proficiencies?.tools)
    char.otherProficiencies.toolsAndOther = [
      ...char.otherProficiencies.toolsAndOther,
      ...grant.proficiencies.tools.map((t) => text(t)),
    ];
  for (const skill of grant.proficiencies?.skills ?? [])
    char.proficiencies.skills[skill] = true;
  for (const f of grant.features ?? [])
    char.features.push(text(f.title, f.detail));
  for (const index of grant.spellIndices ?? [])
    addSpell(char, index, className);
}

// Push an SRD spell (by index) into the right `character.spells` bucket.
function addSpell(char: Character, index: string, className: string): void {
  const srd = getSrdSpell(index);
  if (!srd) return;
  // Resolve the class name to its stable id (spells reference classes by id).
  const classId =
    char.class.find((c) => c.name === className)?.id ??
    char.class[0]?.id ??
    randomUUID();
  const spell: Spell = buildSpellFromSrd(srd, classId);
  const bucket = (char.spells[srd.level as keyof typeof char.spells] ??= []);
  bucket.push(spell);
}

// Apply a chosen feat to the character: its ability increase, its `effect` as a
// feature, its automatic `grants`, and any player choices made in the wizard.
// Feat-granted spells are tagged to the class being advanced (a sensible,
// editable default — the sheet lets the player retag or adjust the ability).
function applyFeat(char: Character, feat: Feat, state: LevelUpState): void {
  char.features.push(text(feat.name, feat.effect));

  const raisedStat = feat.abilityIncrease
    ? (state.featAbilityChoice ?? feat.abilityIncrease.from[0])
    : undefined;
  if (feat.abilityIncrease && raisedStat)
    char.stats[raisedStat] += feat.abilityIncrease.by;

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
    addSpell(char, index, state.className);
  for (const index of g.fixedSpells ?? [])
    addSpell(char, index, state.className);
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
    for (const index of indices) addSpell(char, index, state.className);
}

export function applyLevelUp(
  character: Character,
  state: LevelUpState,
): Character {
  const char = cloneDeep(character);
  const conMod = modifier(char.stats.con);

  // 1. Advance the class list.
  let klass: IClass;
  if (state.isNewMulticlass) {
    klass = { id: randomUUID(), name: state.className, level: 1 };
    char.class.push(klass);
  } else {
    const existing = char.class.find((c) => c.name === state.className);
    if (existing) {
      existing.level += 1;
      klass = existing;
    } else {
      // Advancing a class not yet on the sheet behaves like a fresh entry.
      klass = { id: randomUUID(), name: state.className, level: 1 };
      char.class.push(klass);
    }
  }

  // 2. Subclass (and its level-1 grants, when we have them).
  if (state.subclass) {
    klass.subclass = state.subclass;
    const grant = getSubclassByName(
      asOfficialClass(state.className)?.toLowerCase(),
      state.subclass,
    )?.grants;
    if (grant) applySubclassGrant(char, grant, state.className);
  }

  // 2.5. Class-feature pools: create/refresh this class's limited-use pools
  //      (Rage count, Ki points, Channel Divinity uses, …) for the new level.
  //      Titles match the mechanics catalog, so their actions light up.
  syncClassPools(char, klass);

  // 2.5a. The monk's Unarmed Strike, whose damage die is the Martial Arts die
  //       — granted at monk 1 and re-derived as the die grows.
  syncMartialArts(char, klass);

  // 2.5b. Refresh racial pools whose mechanics scale on total character level
  //       (Breath Weapon's dice). Passing the existing pool titles refreshes
  //       the matching racial ones without creating anything new.
  syncRacePools(
    char,
    char.limitedUseAbilities.map((a) => a.info.title),
  );

  // 2.6. Feature prose for this class level (Extra Attack, Divine Smite, …).
  for (const f of classFeaturesAt(state.className, klass.level))
    char.features.push(text(f.title, f.detail));

  // 2.7. Fighting style, when the class grants one at this level. The bare
  //      style name is the feature title, so styles the mechanics catalog
  //      knows (Great Weapon Fighting) light their riders up; Defense also
  //      folds its +1 into the AC formula.
  if (
    state.fightingStyle &&
    fightingStyleDueAt(state.className, klass.level)?.includes(
      state.fightingStyle,
    )
  ) {
    const style = getFightingStyle(state.fightingStyle);
    if (style) {
      char.features.push(text(style.name, style.summary));
      if (style.acBonus)
        char.acFormula = {
          operation: Operation.addition,
          operands: [char.acFormula, style.acBonus],
        };
    }
  }

  // 2.8. Eldritch invocations picked this level.
  for (const name of state.invocations) {
    const inv = ELDRITCH_INVOCATIONS.find((i) => i.name === name);
    if (inv) char.features.push(text(inv.name, inv.summary));
  }

  // 2.9. Picks from the class's closed option lists. Appended to whatever the
  //      character already knows, and de-duplicated so re-running a level-up
  //      (or picking something already on the sheet) can't double an entry.
  for (const [category, names] of Object.entries(state.chosenOptions)) {
    const group = optionGroup(category);
    if (!group) continue;
    for (const name of names) {
      const already = (char.chosenOptions ?? []).some(
        (o) => o.category === category && o.name === name,
      );
      if (already) continue;
      const detail = group.options.find((o) => o.name === name)?.summary;
      (char.chosenOptions ??= []).push({
        category,
        name,
        ...(detail ? { detail } : {}),
      });
    }
  }

  // 3. Recompute derived numbers. HP/hit dice/PB/spell slots all read from the
  //    updated class list, so we just refresh the stored formulas + bump the
  //    current HP by this level's average gain.
  char.maxHp = getHpFormula(char);
  char.totalHitDice = getHitDice(char);
  const gainedDie =
    HIT_DICE[asOfficialClass(state.className) ?? OfficialClass.Fighter];
  char.currHp += Math.max(1, averageDie(gainedDie, Math.ceil) + conMod);

  // 4. Ensure the class is registered for spellcasting (new caster multiclass).
  if (
    isCasterClass(state.className) &&
    !char.spellcastingClasses.some((c) => c.classId === klass.id)
  ) {
    char.spellcastingClasses.push({ classId: klass.id });
    char.spells[0] ??= []; // key 0 = cantrips
  }
  if (state.className === OfficialClass.Warlock && !char.pactSlots)
    char.pactSlots = { expended: 0 };

  // 5. Ability Score Improvement or feat.
  if (state.advancement === "asi") {
    for (const [stat, delta] of Object.entries(state.asi))
      char.stats[stat as StatKey] += delta ?? 0;
  } else if (state.featIndex) {
    const feat = getFeat(state.featIndex);
    if (feat) applyFeat(char, feat, state);
  }

  // 6. Newly learned spells.
  for (const indices of Object.values(state.newSpells))
    for (const index of indices) addSpell(char, index, state.className);

  // 7. Any manually added features.
  for (const f of state.addedFeatures)
    if (f.title.trim())
      char.features.push(text(f.title.trim(), f.detail.trim()));

  return char;
}
