import { uniq } from "lodash";
import {
  ArmorType,
  OfficialClass,
  Operation,
  RestType,
  SkillName,
  StatKey,
} from "src/lib/data/data-definitions";
import { Character, IClass, TextComponent } from "src/lib/types";
import {
  classFeaturesAt,
  ELDRITCH_INVOCATIONS,
  expertiseDueAt,
  fightingStyleDueAt,
  getFightingStyle,
  isAsiLevel,
  newInvocationsAt,
  statGrantsAt,
  subclassDueAt,
  syncMartialArts,
  toolChoicesFor,
} from "src/lib/builder/class-features";
import { statCapFor } from "src/lib/rules";
import {
  poolTitlesFor,
  syncClassPools,
  syncRacePools,
} from "src/lib/builder/class-pools";
import {
  newOptionPicksAt,
  newRaceOptionPicksAt,
  PickContext,
  optionFeaturesFor,
  optionGroup,
  optionSpellIndicesAt,
  OptionGroup,
  raceOptionFeaturesFor,
  resistancesFromOptions,
} from "src/lib/builder/chosen-options";
import {
  multiclassProficienciesFor,
  multiclassSkillOptions,
  multiclassToolOptions,
} from "src/lib/builder/multiclass";
import {
  getSubclassByName,
  subclassFeaturesAt,
  subclassSpellIndicesAt,
} from "src/lib/builder/subclasses";
import {
  addCatalogSpell,
  addCatalogSpellOnce,
} from "src/lib/builder/grant-spells";
import {
  applyLevelEffects,
  levelEffectsAt,
} from "src/lib/builder/level-effects";
import { CatalogSubclass } from "src/lib/builder/types";
import {
  OptionalClassFeature,
  optionalFeaturesAt,
  optionalGrantsAt,
  takenOptionalFeatures,
} from "src/lib/builder/optional-class-features";
import { spendsSharedPool } from "src/lib/mechanics/catalog";

// The single place that knows what reaching a class level grants. Creation
// calls `applyClassLevel` for level 1, the level-up wizard for level N.
//
// Stays with the callers instead: race/background/equipment and the
// proficiency aggregate (creation), HP, ASI/feat, and learned spells
// (level-up) — none of those are keyed to a class level.

// The player's choices for one class level; both wizard states embed this.
export interface LevelChoices {
  // Subclass chosen at this level, when one is due.
  subclass?: string;
  // Fighting style chosen at this level.
  fightingStyle?: string;
  // Tasha's optional class features taken at this level, by name. Each
  // replaces a feature rather than adding one.
  optionalFeatures?: string[];
  // Skills gaining expertise (rogue 1/6, bard 3/10, Deft Explorer's Canny).
  expertiseChoices: SkillName[];
  // Tool proficiencies chosen from the class's list (bard instruments).
  toolChoices: string[];
  // Eldritch invocations picked as the warlock's known count grows.
  invocations: string[];
  // Picks from the class's closed option lists, keyed by category.
  chosenOptions: Record<string, string[]>;
  // Skills picked from a multiclass proficiency grant (bard/ranger/rogue).
  // Only level-up fills this; creation's first class is never a multiclass.
  multiclassSkills: SkillName[];
  // Skills picked for a subclass's `grants.skillChoices` (Lore Bard's three,
  // Knowledge cleric's two with expertise).
  subclassSkillChoices: SkillName[];
}

export const emptyLevelChoices = (): LevelChoices => ({
  expertiseChoices: [],
  toolChoices: [],
  invocations: [],
  chosenOptions: {},
  multiclassSkills: [],
  subclassSkillChoices: [],
});

const slugId = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Action hosts for chosen options that spend a resource (a picked Metamagic
// spending Sorcery Points, an Elemental Discipline spending Ki). `maxUses: 0`,
// same shape as subclass action hosts, so no new UI is needed.
//
// Lives here rather than in `class-pools.ts` to avoid an import cycle (pools
// sit below `chosen-options`, and this needs both).
//
// Created once, then left alone — never removed even if un-picked, so a
// hand-edit sticks.
export function syncOptionHosts(char: Character): void {
  char.limitedUseAbilities ??= [];
  const known = new Set(
    char.limitedUseAbilities.map((a) => a.info.title.trim().toLowerCase()),
  );
  for (const chosen of char.chosenOptions ?? []) {
    const def = optionGroup(chosen.category)?.options.find(
      (o) => o.name === chosen.name,
    );
    if (!def?.action) continue;
    if (known.has(chosen.name.trim().toLowerCase())) continue;
    known.add(chosen.name.trim().toLowerCase());
    const { note, ...rest } = def.action;
    char.limitedUseAbilities.push({
      info: {
        title: chosen.name,
        titleFormulas: [],
        detail: def.summary ?? note,
        detailFormulas: [],
      },
      maxUses: 0,
      recharge: RestType.longRest, // unused: 0-use host
      expended: 0,
      mechanics: spendsSharedPool({
        id: slugId(chosen.name),
        name: chosen.name,
        note,
        ...rest,
      }),
    });
  }
}

const text = (title: string, detail?: string): TextComponent =>
  detail
    ? { title, titleFormulas: [], detail, detailFormulas: [] }
    : { title, titleFormulas: [] };

// OR a set of armor-proficiency grant strings into the sheet's armor map.
// Exported for reuse by feats.ts.
export function grantArmor(
  armor: Record<ArmorType, boolean>,
  grants: string[],
): void {
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

// Fold a subclass's `grants` (features, proficiencies, domain spells) into
// the character, at whatever level the subclass is chosen.
function applySubclassGrant(
  char: Character,
  grant: NonNullable<CatalogSubclass["grants"]>,
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
  for (const skill of grant.expertiseSkills ?? []) {
    char.proficiencies.skills[skill] = true;
    char.proficiencies.expertise[skill] = true;
  }
  for (const f of grant.features ?? [])
    char.features.push(text(f.title, f.detail));
  for (const index of grant.spellIndices ?? [])
    addCatalogSpell(char, index, className);
}

// The tool picks a class level offers, narrowed to the multiclass allowance
// when the class is being joined rather than started in. Shared by the apply
// and read sides so offered and granted counts can't diverge.
function multiclassAwareToolChoices(
  className: string,
  level: number,
  isMulticlassEntry: boolean,
): { choose: number; from: string[] } | undefined {
  if (!isMulticlassEntry) return toolChoicesFor(className, level);
  const choose = multiclassProficienciesFor(className).chooseTools;
  if (choose === 0) return undefined;
  return { choose, from: multiclassToolOptions(className) };
}

/**
 * Record the picks a race owes at this total character level, and add each
 * pick's prose to the features list.
 *
 * Race counterpart to step 9 of `applyClassLevel`, kept separate because a
 * racial allowance advances on total character level — folding it into a
 * per-class call would re-award it on every multiclass dip. Idempotent.
 */
export function applyRaceOptions(
  char: Character,
  choices: LevelChoices,
  totalCharacterLevel: number,
): void {
  const raceName = char.race?.name;
  const due = new Set(
    newRaceOptionPicksAt(raceName, totalCharacterLevel).map(
      ({ group }) => group.category,
    ),
  );
  for (const [category, names] of Object.entries(choices.chosenOptions)) {
    if (!due.has(category)) continue;
    const group = optionGroup(category);
    if (!group) continue;
    for (const name of names) {
      const def = group.options.find((o) => o.name === name);
      if (!def) continue;
      const already = (char.chosenOptions ?? []).some(
        (o) => o.category === category && o.name === name,
      );
      if (already) continue;
      (char.chosenOptions ??= []).push({
        category,
        name,
        ...(def.summary ? { detail: def.summary } : {}),
      });
    }
  }

  const haveFeature = new Set(
    char.features.map((f) => f.title.trim().toLowerCase()),
  );
  for (const f of raceOptionFeaturesFor(
    char.chosenOptions ?? [],
    raceName,
    totalCharacterLevel,
  )) {
    const key = f.title.trim().toLowerCase();
    if (haveFeature.has(key)) continue;
    haveFeature.add(key);
    char.features.push(text(f.title, f.detail));
  }
}

/**
 * Apply everything reaching `klass.level` in `klass.name` grants. Each grant
 * is gated on the same "due at this level" table the wizard prompts from, so
 * a stale choice (class switched mid-wizard) is discarded rather than applied.
 *
 * `char.class` must already contain `klass` at its new level. Spell buckets
 * must already exist on the character: a subclass's domain spells are added
 * here, so anything that rebuilds `char.spells` wholesale must run first.
 */
export function applyClassLevel(
  char: Character,
  klass: IClass,
  choices: LevelChoices,
): void {
  const className = klass.name;
  const level = klass.level;
  // Level 1 in a class that isn't the character's first is a multiclass;
  // PHB p.163 grants a smaller proficiency subset than the class's own
  // level-1 list. Derived from the class list so callers can't forget it.
  const isMulticlassEntry = level === 1 && char.class[0]?.id !== klass.id;

  // 0. Multiclass proficiencies (PHB p.163). Runs before step 6 (expertise),
  //    since a rogue joined at 3rd picks a skill and two expertises in one step.
  if (isMulticlassEntry) {
    const mc = multiclassProficienciesFor(className);
    grantArmor(char.otherProficiencies.armor, mc.armor);
    char.otherProficiencies.weapons = uniq([
      ...char.otherProficiencies.weapons,
      ...mc.weapons,
    ]);
    const knownTools = new Set(
      char.otherProficiencies.toolsAndOther.map((t) =>
        t.title.trim().toLowerCase(),
      ),
    );
    for (const t of mc.tools)
      if (!knownTools.has(t.trim().toLowerCase()))
        char.otherProficiencies.toolsAndOther.push(text(t));
    if (mc.chooseSkills > 0) {
      const options = multiclassSkillOptions(className);
      for (const skill of choices.multiclassSkills
        .filter((s) => options.includes(s))
        .slice(0, mc.chooseSkills))
        char.proficiencies.skills[skill] = true;
    }
  }

  // 1. Subclass, and its grants, at the level it's chosen.
  if (choices.subclass) {
    klass.subclass = choices.subclass;
    const grant = getSubclassByName(
      className.toLowerCase(),
      choices.subclass,
    )?.grants;
    if (grant) applySubclassGrant(char, grant, className);
    // "Choose N skills" at the subclass's choice level (Lore Bard, Knowledge
    // cleric), with optional expertise (Knowledge Domain).
    if (grant?.skillChoices) {
      const picks = choices.subclassSkillChoices
        .filter((s) => grant.skillChoices!.from.includes(s))
        .slice(0, grant.skillChoices.choose);
      for (const skill of picks) {
        char.proficiencies.skills[skill] = true;
        if (grant.skillChoices.expertise)
          char.proficiencies.expertise[skill] = true;
      }
    }
  }

  // 1b. Tasha's optional class features: earlier swaps read back off the
  //     sheet (their feature row is the record), this level's from `choices`.
  //     Both are needed before the prose below, since a swap suppresses the
  //     feature it replaces.
  const optionalFeatures = uniq([
    ...takenOptionalFeatures(char).map((f) => f.name),
    ...(choices.optionalFeatures ?? []).filter((name) =>
      optionalFeaturesAt(className, level).some((f) => f.name === name),
    ),
  ]);
  for (const swap of optionalFeaturesAt(className, level))
    if (
      optionalFeatures.includes(swap.name) &&
      !char.features.some((f) => f.title === swap.name)
    )
      char.features.push(text(swap.name, swap.summary));
  // What taken swaps grant at *this* level (Deft Explorer's Roving at 6th,
  // Tireless at 10th arrive long after the choice was made).
  for (const grant of optionalGrantsAt(optionalFeatures, className, level)) {
    const fresh = (grant.features ?? []).filter(
      (f) => !char.features.some((x) => x.title === f.title),
    );
    for (const f of fresh) char.features.push(text(f.title, f.detail));
    // Roving's +5 is additive (not idempotent), so it rides on its feature
    // row being new; a re-run finds the row and leaves the speed alone.
    if (grant.speedBonus && fresh.length) char.speeds.walk += grant.speedBonus;
    if (grant.effects) applyLevelEffects(char, grant.effects);
    for (const index of grant.spellIndices ?? [])
      addCatalogSpellOnce(char, index, className);
  }

  // 2. Feature prose for this class level (level 1 from SRD class data, 2+
  //    from the hand-authored per-level table; `classFeaturesAt` hides the
  //    seam), minus anything a swap above replaced.
  for (const f of classFeaturesAt(className, level, optionalFeatures))
    char.features.push(text(f.title, f.detail));

  // 2a. Feature prose the subclass confers at this level. Runs after the
  //     subclass is set above. De-duplicated by title.
  const knownFeatures = new Set(
    char.features.map((f) => f.title.trim().toLowerCase()),
  );
  // Features that arrive as limited-use pools (Portent, Bladesong, Balm of
  // the Summer Court) are dropped here so they don't duplicate the pool's
  // own description; mirrors the filter `classFeaturesAt` applies.
  const poolBacked = new Set(
    poolTitlesFor(className).map((t) => t.trim().toLowerCase()),
  );
  for (const f of subclassFeaturesAt(
    className.toLowerCase(),
    klass.subclass,
    level,
  )) {
    const key = f.title.trim().toLowerCase();
    if (knownFeatures.has(key) || poolBacked.has(key)) continue;
    knownFeatures.add(key);
    char.features.push(text(f.title, f.detail));
  }

  // 2c. Subclass by-level spell grants (oath spells at 5/9/13/17, a patron's
  //     expanded list). Idempotent; runs after subclass is set above.
  for (const index of subclassSpellIndicesAt(
    className.toLowerCase(),
    klass.subclass,
    level,
  ))
    addCatalogSpellOnce(char, index, className);

  // 2d. Effects this level writes straight to a character field: save
  //     proficiencies, resistances, speeds, initiative modifier (`LevelEffects`).
  for (const effects of levelEffectsAt(className, klass.subclass, level))
    applyLevelEffects(char, effects);

  // 2b. Ability scores a class feature raises outright (Primal Champion's +4).
  //     Runs after the prose above: that feature is what lifts the ceiling
  //     `statCapFor` reads, so granting the +4 first would clip at 20.
  const statGrants = statGrantsAt(className, level);
  if (statGrants)
    for (const [stat, delta] of Object.entries(statGrants)) {
      const key = stat as StatKey;
      char.stats[key] = Math.min(
        char.stats[key] + (delta ?? 0),
        statCapFor(char, key),
      );
    }

  // 3. Limited-use pools, re-derived for the new level (Rage count, Ki
  //    points), then racial pools scaling on total character level.
  syncClassPools(char, klass);
  syncRacePools(char, [
    // Race feature titles (e.g. "Drow Magic") let level-gated innate spells
    // appear as the character reaches their tier (Faerie Fire at 3rd, Darkness
    // at 5th).
    ...(char.limitedUseAbilities ?? []).map((a) => a.info.title),
    ...(char.features ?? []).map((f) => f.title),
  ]);

  // 4. The monk's Unarmed Strike, whose damage die is the Martial Arts die.
  syncMartialArts(char, klass);

  // 5. Fighting style. The bare style name is the feature title so catalog
  //    riders (Great Weapon Fighting) match by title; Defense folds +1 into AC.
  if (
    choices.fightingStyle &&
    fightingStyleDueAt(
      className,
      level,
      choices.subclass ?? klass.subclass,
    )?.includes(choices.fightingStyle)
  ) {
    const style = getFightingStyle(choices.fightingStyle);
    // Guard against re-granting a style already known (Champion's second pick
    // at 10th must differ from the first).
    const alreadyKnown = char.features.some((f) => f.title === style?.name);
    if (style && !alreadyKnown) {
      char.features.push(text(style.name, style.summary));
      if (style.acBonus)
        char.acFormula = {
          operation: Operation.addition,
          operands: [char.acFormula, style.acBonus],
        };
      if (style.effects) applyLevelEffects(char, style.effects);
      // Superior Technique's superiority die: fixed at d6, never re-derives
      // with level (unlike a Battle Master's), so a hand-edit sticks.
      const pool = style.pool;
      if (pool) {
        char.limitedUseAbilities ??= [];
        if (!char.limitedUseAbilities.some((a) => a.info.title === pool.name))
          char.limitedUseAbilities.push({
            info: text(pool.name, pool.detail),
            maxUses: pool.maxUses,
            recharge: pool.recharge,
            expended: 0,
            ...(pool.save ? { save: pool.save } : {}),
          });
      }
    }
  }

  // 6. Expertise, limited to skills the character is proficient in.
  if (expertiseDueAt(className, level, optionalFeatures) > 0)
    for (const skill of choices.expertiseChoices)
      if (char.proficiencies.skills[skill])
        char.proficiencies.expertise[skill] = true;

  // 7. Tool proficiencies chosen from the class's list. A multiclass entry
  //    uses the smaller multiclass allowance (a bard joined at 3rd brings one
  //    instrument, not three).
  const offeredTools = multiclassAwareToolChoices(
    className,
    level,
    isMulticlassEntry,
  );
  if (offeredTools) {
    const picked = choices.toolChoices
      .filter((t) => offeredTools.from.includes(t))
      .slice(0, offeredTools.choose);
    const known = new Set(
      char.otherProficiencies.toolsAndOther.map((t) =>
        t.title.trim().toLowerCase(),
      ),
    );
    for (const t of picked)
      if (!known.has(t.trim().toLowerCase()))
        char.otherProficiencies.toolsAndOther.push(text(t));
  }

  // 8. Eldritch invocations picked as the warlock's known count grew.
  if (className === OfficialClass.Warlock && newInvocationsAt(level) > 0)
    for (const name of choices.invocations) {
      const inv = ELDRITCH_INVOCATIONS.find((i) => i.name === name);
      if (inv && !char.features.some((f) => f.title.trim() === inv.name))
        char.features.push(text(inv.name, inv.summary));
    }

  // 8b. Paladin's Aura of Protection (6th): bonus to every saving throw equal
  //     to CHA modifier (min +1). Seeded once as a formula, then left alone so
  //     a hand-edit (e.g. a Cloak of Protection) survives level-ups.
  if (
    className === OfficialClass.Paladin &&
    level >= 6 &&
    char.savingThrowBonus === undefined
  )
    char.savingThrowBonus = {
      operation: Operation.maximum,
      operands: [1, StatKey.cha],
    };

  // 9. Picks from the class's closed option lists, de-duplicated against what
  //    the character already knows.
  const dueGroups = new Set(
    newOptionPicksAt(className, level, {
      subclass: klass.subclass,
      fightingStyle: choices.fightingStyle,
      optionalFeatures,
    }).map(({ group }) => group.category),
  );
  for (const [category, names] of Object.entries(choices.chosenOptions)) {
    if (!dueGroups.has(category)) continue;
    const group = optionGroup(category);
    if (!group) continue;
    for (const name of names) {
      if (!group.options.some((o) => o.name === name)) continue;
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

  // 9a. Action hosts for picks that spend a resource (a Metamagic draining
  //     Sorcery Points). Runs after step 9 so this level-up's pick is recorded.
  syncOptionHosts(char);

  // 9b. Spells a sub-choice inside the subclass grants (a Land druid's chosen
  //     terrain, a Genie warlock's kind). Re-evaluated every level so
  //     level-gated spells unlock over time. Runs after step 9.
  for (const index of optionSpellIndicesAt(
    char.chosenOptions ?? [],
    className,
    level,
  ))
    addCatalogSpellOnce(char, index, className);

  // 9c. Feature prose a sub-choice confers (a Totem Warrior's totem, a Storm
  //     Herald's environment).
  const haveFeature = new Set(
    char.features.map((f) => f.title.trim().toLowerCase()),
  );
  for (const f of optionFeaturesFor(
    char.chosenOptions ?? [],
    className,
    level,
  )) {
    const key = f.title.trim().toLowerCase();
    if (haveFeature.has(key)) continue;
    haveFeature.add(key);
    char.features.push(text(f.title, f.detail));
  }

  // 9d. Re-sync pools now that sub-choice features exist: a pool gated on one
  //     (`requiresFeature`, e.g. a Rune Knight's per-rune invocation) was
  //     withheld by the step-3 sync since its feature is only pushed at 9c.
  syncClassPools(char, klass);

  // 10. Damage resistances a chosen option confers (draconic ancestry).
  const gained = resistancesFromOptions(char.chosenOptions ?? [], char);
  if (gained.length) {
    char.damageModifiers ??= {
      resistances: [],
      immunities: [],
      vulnerabilities: [],
    };
    char.damageModifiers.resistances = uniq([
      ...(char.damageModifiers.resistances ?? []),
      ...gained,
    ]);
  }
}

// What a class level offers: the read side of the tables `applyClassLevel`
// applies from. `grantsAt` answers once; both a step's `visible` predicate and
// its picker UI consume the same result.

export interface LevelGrants {
  // A subclass is chosen at this level.
  subclassDue: boolean;
  // An Ability Score Improvement / feat is due.
  asiDue: boolean;
  // Fighting styles to choose from, when the class offers one here.
  fightingStyles?: string[];
  // How many expertise picks, tool picks, and invocations this level grants.
  expertise: number;
  invocations: number;
  toolChoices?: { choose: number; from: string[] };
  // Closed option lists with how many *new* picks this level allows.
  optionPicks: { group: OptionGroup; count: number }[];
  // Same, for race-granted lists (Simic Hybrid's second Animal Enhancement at
  // 5th). Filled by the caller: `grantsAt` only knows class and level.
  raceOptionPicks?: { group: OptionGroup; count: number }[];
  // Skill picks owed by a multiclass proficiency grant. Absent unless this
  // level is a multiclass entry.
  multiclassSkills?: { choose: number; from: SkillName[] };
  // "Choose N skills" at a subclass's choice level (Lore Bard's three,
  // Knowledge cleric's two with expertise).
  subclassSkillChoices?: {
    choose: number;
    from: SkillName[];
    expertise?: boolean;
  };
  // Tasha's swaps this level offers, each replacing the feature beside it.
  optionalFeatures?: OptionalClassFeature[];
}

// Everything reaching `level` in `className` offers the player. `ctx` is
// passed rather than read off the sheet because it can be chosen in this same
// step (a fighter taking Battle Master at 3rd is owed maneuvers immediately).
export function grantsAt(
  className: string,
  level: number,
  ctx: PickContext = {},
  isMulticlassEntry = false,
): LevelGrants {
  const mcSkills = isMulticlassEntry
    ? multiclassProficienciesFor(className).chooseSkills
    : 0;
  const optional = ctx.optionalFeatures ?? [];
  return {
    subclassDue: subclassDueAt(className, level),
    asiDue: isAsiLevel(className, level),
    fightingStyles: fightingStyleDueAt(className, level, ctx.subclass),
    expertise: expertiseDueAt(className, level, optional),
    invocations:
      className === OfficialClass.Warlock ? newInvocationsAt(level) : 0,
    toolChoices: multiclassAwareToolChoices(
      className,
      level,
      isMulticlassEntry,
    ),
    optionPicks: newOptionPicksAt(className, level, ctx),
    ...(optionalFeaturesAt(className, level).length && {
      optionalFeatures: optionalFeaturesAt(className, level),
    }),
    ...(mcSkills > 0 && {
      multiclassSkills: {
        choose: mcSkills,
        from: multiclassSkillOptions(className),
      },
    }),
    // A subclass being chosen at this level may owe skill picks (Lore/Knowledge).
    ...(subclassDueAt(className, level) && ctx.subclass
      ? (() => {
          const sc = getSubclassByName(className.toLowerCase(), ctx.subclass)
            ?.grants?.skillChoices;
          return sc ? { subclassSkillChoices: sc } : {};
        })()
      : {}),
  };
}

// Whether this level asks the player for anything on the "class features" step
// — the one predicate that step's visibility needs.
export const hasFeatureChoices = (g: LevelGrants): boolean =>
  !!g.fightingStyles ||
  g.invocations > 0 ||
  g.expertise > 0 ||
  !!g.toolChoices ||
  !!g.multiclassSkills ||
  !!g.subclassSkillChoices ||
  (g.optionalFeatures?.length ?? 0) > 0 ||
  g.optionPicks.length > 0 ||
  (g.raceOptionPicks?.length ?? 0) > 0;
