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
  emptyLevelChoices,
  LevelChoices,
} from "src/lib/builder/level-grants";
import { addSrdSpell } from "src/lib/builder/grant-spells";
import { applyFeat, getFeat } from "src/lib/builder/feats";

// ---------------------------------------------------------------------------
// 5e progression tables the level-up wizard needs but that aren't derivable
// from the class list (unlike HP / hit dice / PB / spell slots, which rules.ts
// already computes from `char.class[]`).
// ---------------------------------------------------------------------------

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

export interface LevelUpState extends LevelChoices {
  // The class being advanced. For a brand-new multiclass, `isNewMulticlass` is
  // true and the class starts at level 1.
  className: string;
  isNewMulticlass: boolean;
  // ASI vs feat at an ASI level.
  advancement: "asi" | "feat";
  // How this level's hit points are determined. "average" is the fixed value
  // most tables use by default; "roll" takes the player's rolled `hpRoll`.
  hpMethod: "average" | "roll";
  // The die result the player rolled, when `hpMethod` is "roll". Clamped to the
  // hit die's faces on apply — a typo'd 40 on a d8 is a typo, not a house rule.
  hpRoll?: number;
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
  // A known spell being swapped out this level. Known casters (bard, sorcerer,
  // warlock, ranger) may replace one spell they know each time they level.
  // `"<bucketLevel>.<index>"` addresses the spell in `character.spells`.
  swapSpell?: string;
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
    hpMethod: "average",
    asi: {},
    ...emptyFeatChoices(),
    newSpells: {},
    ...emptyLevelChoices(),
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

  // 2. Everything reaching this class level grants — subclass, feature prose,
  //    pools, fighting style, expertise, tools, invocations, chosen options.
  //    Shared with the creation wizard so the two can't drift.
  applyClassLevel(char, klass, state);

  // 3. Recompute derived numbers. HP/hit dice/PB/spell slots all read from the
  //    updated class list, so we just refresh the stored formulas + bump the
  //    current HP by this level's average gain.
  const gainedDie =
    HIT_DICE[asOfficialClass(state.className) ?? OfficialClass.Fighter];
  const average = averageDie(gainedDie, Math.ceil);
  // A rolled result is carried as a flat term on the HP formula, since the
  // formula itself is average-based and gets rebuilt from the class list here.
  // The running total from earlier rolls is read back off the old formula first
  // — rebuilding without it would silently undo every previous roll.
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
    // Capped at 20 — or higher where a feature says so (see `statCapFor`). The
    // cap is applied here as well as in the picker so a stale state or a raise
    // that lands in the same level-up can't push a score past its ceiling.
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

  // 6. A swapped-out known spell, removed before the new ones land so a
  //    replace-then-learn in the same level reads naturally on the sheet.
  if (state.swapSpell) {
    const [bucket, index] = state.swapSpell.split(".");
    const list = char.spells[Number(bucket) as SpellLevelNum];
    if (list) list.splice(Number(index), 1);
  }

  // 7. Newly learned spells.
  for (const indices of Object.values(state.newSpells))
    for (const index of indices) addSrdSpell(char, index, state.className);

  // 8. Any manually added features.
  for (const f of state.addedFeatures)
    if (f.title.trim())
      char.features.push(text(f.title.trim(), f.detail.trim()));

  return char;
}

// ---------------------------------------------------------------------------
// What the level actually gave you.
//
// The review step used to list only the *choices you made* — class, subclass,
// ASI, feat — which is the smaller half of a level-up. Everything `applyLevelUp`
// grants on your behalf (feature prose, a new pool, a bigger Rage die, spell
// slots, expertise) went by unseen, so "Confirm level up" was a leap.
//
// It's a diff of the before/after character rather than a second reading of the
// grant tables, which is the point: `applyClassLevel` grows, subclasses get
// added, pools re-derive — and a diff reports all of it without being taught
// about any of it. The cost is that it describes *outcomes*, not rules, which is
// exactly what a review screen wants.
// ---------------------------------------------------------------------------

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

// A pool's user-visible identity: title plus size, so a Rage that went 2 → 3
// reads as a change rather than being silently equal.
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
    // `maxUses` is a formula, so compare the stored expression: a pool whose
    // size re-derived (Rage 2 → 3, superiority dice d8 → d10) shows up here.
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
  // The rest of `otherProficiencies` is four differently-shaped lists; flatten
  // each to labelled strings so the diff is one set operation, not four.
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
