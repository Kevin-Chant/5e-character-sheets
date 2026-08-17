import { clamp, cloneDeep } from "lodash";
import {
  ArmorType,
  HIT_DICE,
  OfficialClass,
  SkillName,
  SpellLevelNum,
  StatKey,
} from "src/lib/data/data-definitions";
import { Character, IClass, TextComponent } from "src/lib/types";
import { randomUUID } from "src/lib/browser";
import {
  averageDie,
  dieFaces,
  getHitDice,
  getHpFormula,
  hpAdjustmentOf,
  modifier,
  statCapFor,
  withHpAdjustment,
} from "src/lib/rules";

import {
  applyClassLevel,
  applyRaceOptions,
  emptyLevelChoices,
  LevelChoices,
} from "src/lib/builder/level-grants";
import { addCatalogSpell } from "src/lib/builder/grant-spells";
import { getCatalogSpell } from "src/lib/spells/spell-catalog";
import { applyFeat, getFeat } from "src/lib/builder/feats";

// 5e progression tables the level-up wizard needs that aren't derivable from
// the class list (unlike HP/hit dice/PB/spell slots, computed in rules.ts).

// Minimum ability scores to multiclass into/out of a class (PHB p.163),
// non-blocking warning only.
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

// Classes that gain spellcasting as the base class. Subclass-only casters
// (Eldritch Knight, Arcane Trickster) are excluded — the level-1-oriented
// catalog doesn't model their level-3 subclass casting.
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

export const isCasterClass = (className: string): boolean => {
  const oc = asOfficialClass(className);
  return !!oc && CASTER_CLASSES.has(oc);
};

// Classes the bundled spell catalog tags on its spells. Artificer (and any
// homebrew class) isn't among them, so its picker shows the full list.
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

// Bard levels whose newly-learned spells are Magical Secrets, chosen from any
// class's spell list.
const BARD_MAGICAL_SECRETS_LEVELS = new Set([10, 14, 18]);

// The class name to filter the catalog spell list by, or undefined to show
// every spell (Artificer/homebrew, untagged; bard Magical Secrets levels).
export const spellListFilterFor = (
  className: string,
  level?: number,
): string | undefined => {
  const oc = asOfficialClass(className);
  if (!oc || !SPELL_LIST_CLASSES.has(oc)) return undefined;
  if (
    oc === OfficialClass.Bard &&
    level !== undefined &&
    BARD_MAGICAL_SECRETS_LEVELS.has(level)
  )
    return undefined;
  return className;
};

// Half-casters (Paladin, Ranger) learn no cantrips; every other caster does.
const NO_CANTRIP_CLASSES = new Set<OfficialClass>([
  OfficialClass.Paladin,
  OfficialClass.Ranger,
]);

export const classHasCantrips = (className: string): boolean => {
  const oc = asOfficialClass(className);
  return isCasterClass(className) && !(oc && NO_CANTRIP_CLASSES.has(oc));
};

// Wizard working state.
export interface LevelUpState extends LevelChoices {
  // For a brand-new multiclass, `isNewMulticlass` is true and starts at 1.
  className: string;
  isNewMulticlass: boolean;
  advancement: "asi" | "feat";
  // "average" is the fixed value most tables default to; "roll" takes `hpRoll`.
  hpMethod: "average" | "roll";
  // Clamped to the hit die's faces on apply.
  hpRoll?: number;
  // Ability-score deltas; an ASI spends +2 total.
  asi: Partial<Record<StatKey, number>>;
  featIndex?: string;
  // For a half-feat with a choice of stats, which one to raise.
  featAbilityChoice?: StatKey;
  featSkillChoices: SkillName[];
  featExpertiseChoices: SkillName[];
  featWeaponChoices: string[];
  featLanguageChoices: string[];
  featSpellChoices: Record<number, string[]>;
  // Newly learned spells, by numeric level (0 = cantrips).
  newSpells: Record<number, string[]>;
  // Spells from a list-ignoring allowance (a Lore bard's Additional Magical
  // Secrets at 6th). Held apart from `newSpells`, which the bard still fills
  // from the bard list that same level; flat list since the allowance spans
  // spell levels.
  secretSpells: string[];
  // A known spell swapped out this level (bard/sorcerer/warlock/ranger).
  // `"<bucketLevel>.<index>"` addresses the spell in `character.spells`.
  swapSpell?: string;
  // Warlock's Mystic Arcanum spell index for this level (6th/7th/8th/9th-level
  // spell at 11th/13th/15th/17th), recorded on the matching limited-use pool.
  mysticArcanum?: string;
  // Free-text features the player adds for content not modelled.
  addedFeatures: { title: string; detail: string }[];
}

// The Mystic Arcanum spell level a warlock chooses on reaching a given warlock
// level (11→6th, 13→7th, 15→8th, 17→9th); undefined at every other level.
export function mysticArcanumLevelAt(
  className: string,
  level: number,
): number | undefined {
  if (className !== OfficialClass.Warlock) return undefined;
  return { 11: 6, 13: 7, 15: 8, 17: 9 }[level];
}

// How many spells from any class's list a College of Lore bard learns on
// reaching a given level: two at 6th, never again. Sits on top of the
// ordinary bard-list allowance rather than consuming it, so it can't fold
// into `spellListFilterFor` (6th level needs both a filter and no filter).
export function additionalMagicalSecretsAt(
  className: string,
  level: number,
  subclass?: string,
): number {
  return className === OfficialClass.Bard && subclass === "Lore" && level === 6
    ? 2
    : 0;
}

// Cleared when the chosen feat or advancement mode changes, so a previous
// feat's picks don't leak into a different one.
export const emptyFeatChoices = () => ({
  featSkillChoices: [] as SkillName[],
  featExpertiseChoices: [] as SkillName[],
  featWeaponChoices: [] as string[],
  featLanguageChoices: [] as string[],
  featSpellChoices: {} as Record<number, string[]>,
});

export function defaultLevelUpState(character: Character): LevelUpState {
  // Default to advancing the character's first (primary) class.
  const primary = character.class[0]?.name ?? OfficialClass.Fighter;
  return {
    className: primary,
    isNewMulticlass: false,
    advancement: "asi",
    hpMethod: "average",
    asi: {},
    ...emptyFeatChoices(),
    newSpells: {},
    secretSpells: [],
    ...emptyLevelChoices(),
    addedFeatures: [],
  };
}

// The class level this character will reach for `state`'s target class once
// applied.
export function targetClassLevel(
  character: Character,
  state: LevelUpState,
): number {
  if (state.isNewMulticlass) return 1;
  const existing = character.class.find((c) => c.name === state.className);
  return (existing?.level ?? 0) + 1;
}

// Applying the level-up — pure, returns a new Character.
const text = (title: string, detail?: string): TextComponent =>
  detail
    ? { title, titleFormulas: [], detail, detailFormulas: [] }
    : { title, titleFormulas: [] };

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
      // Not yet on the sheet: behaves like a fresh entry.
      klass = { id: randomUUID(), name: state.className, level: 1 };
      char.class.push(klass);
    }
  }

  // 2. Everything reaching this class level grants — subclass, feature prose,
  //    pools, fighting style, expertise, tools, invocations, chosen options.
  applyClassLevel(char, klass, state);

  // 2a. Picks a race owes at the new total character level (Simic Hybrid's
  //     second Animal Enhancement at 5th) — keyed to total, not class level.
  applyRaceOptions(
    char,
    state,
    char.class.reduce((sum, k) => sum + k.level, 0),
  );

  // 3. Recompute derived numbers: HP/hit dice/PB/spell slots read from the
  //    updated class list.
  const gainedDie =
    HIT_DICE[asOfficialClass(state.className) ?? OfficialClass.Fighter];
  const average = averageDie(gainedDie, Math.ceil);
  // The HP formula is average-based and rebuilt from the class list here, so a
  // rolled result is carried as a flat adjustment term; read the prior
  // adjustment first or rebuilding silently undoes earlier rolls.
  const priorAdjustment = hpAdjustmentOf(char.maxHp);
  const rolled =
    state.hpMethod === "roll"
      ? clamp(Math.floor(state.hpRoll ?? average), 1, dieFaces(gainedDie))
      : average;
  char.maxHp = withHpAdjustment(
    getHpFormula(char),
    priorAdjustment + (rolled - average),
  );
  char.totalHitDice = getHitDice(char);
  char.currHp += Math.max(1, rolled + conMod);

  // 4. Register the class for spellcasting (new caster multiclass).
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
    // Capped at 20, or higher where a feature says so (`statCapFor`).
    for (const [stat, delta] of Object.entries(state.asi)) {
      const key = stat as StatKey;
      char.stats[key] = Math.min(
        char.stats[key] + (delta ?? 0),
        statCapFor(char, key),
      );
    }
  } else if (state.featIndex) {
    const feat = getFeat(state.featIndex);
    if (feat) applyFeat(char, feat, state);
  }

  // A feat taken just now can add HP per level (Tough), which step 3 was too
  // early to see.
  char.maxHp = withHpAdjustment(getHpFormula(char), hpAdjustmentOf(char.maxHp));

  // 6. Swapped-out known spell, removed before the new ones land.
  if (state.swapSpell) {
    const [bucket, index] = state.swapSpell.split(".");
    const list = char.spells[Number(bucket) as SpellLevelNum];
    if (list) list.splice(Number(index), 1);
  }

  // 7. Newly learned spells: the class's own allowance, then any from a
  //    list-ignoring allowance (Additional Magical Secrets).
  for (const indices of Object.values(state.newSpells))
    for (const index of indices) addCatalogSpell(char, index, state.className);
  if (additionalMagicalSecretsAt(state.className, klass.level, klass.subclass))
    for (const index of state.secretSpells)
      addCatalogSpell(char, index, state.className);

  // 8. Any manually added features.
  for (const f of state.addedFeatures)
    if (f.title.trim())
      char.features.push(text(f.title.trim(), f.detail.trim()));

  // 9. Mystic Arcanum: name the warlock's chosen 6th-9th-level spell on the
  //    pool `applyClassLevel` created (cast once per long rest, no slot spent).
  const arcanumLevel = mysticArcanumLevelAt(state.className, klass.level);
  if (arcanumLevel && state.mysticArcanum) {
    const ord = `${arcanumLevel}th`;
    const pool = (char.limitedUseAbilities ?? []).find(
      (a) => a.info.title === `Mystic Arcanum (${ord} Level)`,
    );
    const spell = getCatalogSpell(state.mysticArcanum);
    if (pool && spell)
      pool.info = {
        title: pool.info.title,
        titleFormulas: [],
        detail: `Once per long rest, cast ${spell.name} (your ${ord}-level Mystic Arcanum) without expending a spell slot.`,
        detailFormulas: [],
      };
  }

  return char;
}

// What the level actually gave you, for the review step. A diff of the
// before/after character rather than a second reading of the grant tables, so
// it reports everything `applyClassLevel` grants without needing to know the
// rules behind it.

export interface LevelUpSummary {
  /** Feature prose that wasn't on the sheet before. */
  features: string[];
  /** Limited-use pools gained, e.g. "Rage (3 uses)". */
  abilities: string[];
  /** Pools that were already there but grew or changed. */
  changedAbilities: string[];
  /** Spells learned this level, by name. */
  spells: string[];
  /** New proficiencies, expertise and languages, already labelled. */
  proficiencies: string[];
  /** Attacks the level added (a monk's re-derived Unarmed Strike). */
  attacks: string[];
  /** Hit points gained. */
  hp: number;
}

const titlesOf = (items: { title: string }[]) =>
  items.map((i) => i.title.trim());

const poolLabel = (a: Character["limitedUseAbilities"][number]) =>
  `${a.info.title.trim()}`;

export function summarizeLevelUp(
  before: Character,
  after: Character,
): LevelUpSummary {
  const hadFeature = new Set(titlesOf(before.features));
  const features = titlesOf(after.features).filter((t) => !hadFeature.has(t));

  const beforePools = new Map(
    before.limitedUseAbilities.map((a) => [poolLabel(a), a] as const),
  );
  const abilities: string[] = [];
  const changedAbilities: string[] = [];
  for (const a of after.limitedUseAbilities) {
    const label = poolLabel(a);
    const prior = beforePools.get(label);
    if (!prior) abilities.push(label);
    // `maxUses` is a formula; compare the stored expression so a re-derived
    // size (Rage 2 -> 3) shows up as changed.
    else if (JSON.stringify(prior.maxUses) !== JSON.stringify(a.maxUses))
      changedAbilities.push(label);
  }

  const hadSpell = new Set(
    Object.values(before.spells).flatMap((list) =>
      (list ?? []).map((s) => s.info.title.trim()),
    ),
  );
  const spells = Object.values(after.spells)
    .flatMap((list) => (list ?? []).map((s) => s.info.title.trim()))
    .filter((t) => !hadSpell.has(t));

  const proficiencies: string[] = [];
  const skills = after.proficiencies.skills;
  for (const skill of Object.keys(skills) as (keyof typeof skills)[]) {
    if (skills[skill] && !before.proficiencies.skills[skill])
      proficiencies.push(skill);
    if (
      after.proficiencies.expertise[skill] &&
      !before.proficiencies.expertise[skill]
    )
      proficiencies.push(`${skill} (expertise)`);
  }
  // Flatten the four differently-shaped `otherProficiencies` lists to labelled
  // strings so the diff is one set operation.
  const flattenOther = (p: Character["otherProficiencies"]): string[] => [
    ...p.languages.map((l) => `${l} (language)`),
    ...(Object.keys(p.armor) as ArmorType[])
      .filter((a) => p.armor[a])
      .map((a) => `${a} armor`),
    ...p.weapons,
    ...p.toolsAndOther.map((t) => t.title.trim()),
  ];
  const hadOther = new Set(flattenOther(before.otherProficiencies));
  proficiencies.push(
    ...flattenOther(after.otherProficiencies).filter((p) => !hadOther.has(p)),
  );

  const hadAttack = new Set(before.attacks.map((a) => a.name.trim()));
  const attacks = after.attacks
    .map((a) => a.name.trim())
    .filter((n) => !hadAttack.has(n));

  return {
    features,
    abilities,
    changedAbilities,
    spells,
    proficiencies,
    attacks,
    hp: after.currHp - before.currHp,
  };
}
