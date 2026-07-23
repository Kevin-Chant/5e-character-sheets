import { uniq } from "lodash";
import {
  ArmorType,
  OfficialClass,
  Operation,
  SkillName,
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
  subclassDueAt,
  syncMartialArts,
  toolChoicesFor,
} from "src/lib/builder/class-features";
import { syncClassPools, syncRacePools } from "src/lib/builder/class-pools";
import {
  newOptionPicksAt,
  optionGroup,
  OptionGroup,
  resistancesFromOptions,
} from "src/lib/builder/chosen-options";
import { getSubclassByName } from "src/lib/builder/subclasses";
import { addSrdSpell } from "src/lib/builder/grant-spells";
import { SrdSubclass } from "src/lib/builder/types";

// ---------------------------------------------------------------------------
// The single place that knows what reaching a class level grants.
//
// Creation and level-up used to answer this question separately, and applied
// *different* subsets: creation had chosen options but no per-level feature
// prose, level-up had prose but no tool choices. Every new choice therefore had
// to be wired twice, and the two could silently drift. They now share
// `applyClassLevel` — creation calls it for level 1, the level-up wizard for
// level N — so a grant added here reaches both by construction, and building a
// character above level 1 is a matter of calling it once per level.
//
// What deliberately stays with the callers: things that aren't keyed to a class
// level. Creation owns race/background/equipment and the proficiency aggregate;
// level-up owns HP, the ASI/feat, and learned spells.
// ---------------------------------------------------------------------------

// The player's choices for one class level. Both wizard states embed this
// rather than redeclaring the fields, which is what keeps their names from
// drifting (creation and level-up used to call expertise two different things).
export interface LevelChoices {
  // Subclass chosen at this level, when one is due.
  subclass?: string;
  // Fighting style chosen at this level.
  fightingStyle?: string;
  // Skills gaining expertise (rogue 1/6, bard 3/10).
  expertiseChoices: SkillName[];
  // Tool proficiencies chosen from the class's list (bard instruments).
  toolChoices: string[];
  // Eldritch invocations picked as the warlock's known count grows.
  invocations: string[];
  // Picks from the class's closed option lists, keyed by category.
  chosenOptions: Record<string, string[]>;
}

export const emptyLevelChoices = (): LevelChoices => ({
  expertiseChoices: [],
  toolChoices: [],
  invocations: [],
  chosenOptions: {},
});

const text = (title: string, detail?: string): TextComponent =>
  detail
    ? { title, titleFormulas: [], detail, detailFormulas: [] }
    : { title, titleFormulas: [] };

// OR a set of armor-proficiency grant strings into the sheet's armor map.
// Exported because feats grant armor proficiency the same way subclasses do.
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

// Fold a subclass's `grants` (features, proficiencies, domain spells) into the
// character. Used at whatever level the subclass is chosen — 1st for
// cleric/sorcerer/warlock, later for everyone else.
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
    addSrdSpell(char, index, className);
}

/**
 * Apply everything reaching `klass.level` in `klass.name` grants.
 *
 * Each grant is gated on the same "is this due at this level" table the wizard
 * prompts from, so a choice left stale by switching class mid-wizard is
 * discarded rather than applied — the invariant used to be re-implemented (and
 * occasionally forgotten) at every call site.
 *
 * `char.class` must already contain `klass` at its new level, and for creation
 * the spell buckets must already exist: a subclass's domain spells are added
 * here, so anything that rebuilds `char.spells` wholesale has to run first.
 */
export function applyClassLevel(
  char: Character,
  klass: IClass,
  choices: LevelChoices,
): void {
  const className = klass.name;
  const level = klass.level;

  // 1. Subclass, and its grants, at the level it's chosen.
  if (choices.subclass) {
    klass.subclass = choices.subclass;
    const grant = getSubclassByName(
      className.toLowerCase(),
      choices.subclass,
    )?.grants;
    if (grant) applySubclassGrant(char, grant, className);
  }

  // 2. Feature prose for this class level (level 1 comes from the SRD class
  //    data, 2+ from the hand-authored per-level table — `classFeaturesAt`
  //    hides that seam).
  for (const f of classFeaturesAt(className, level))
    char.features.push(text(f.title, f.detail));

  // 3. Limited-use pools, re-derived for the new level (Rage count, Ki points,
  //    …), then the racial ones whose mechanics scale on total character level.
  syncClassPools(char, klass);
  syncRacePools(
    char,
    (char.limitedUseAbilities ?? []).map((a) => a.info.title),
  );

  // 4. The monk's Unarmed Strike, whose damage die is the Martial Arts die.
  syncMartialArts(char, klass);

  // 5. Fighting style. The bare style name is the feature title so catalog
  //    riders (Great Weapon Fighting) match by title; Defense folds +1 into AC.
  if (
    choices.fightingStyle &&
    fightingStyleDueAt(className, level)?.includes(choices.fightingStyle)
  ) {
    const style = getFightingStyle(choices.fightingStyle);
    if (style) {
      char.features.push(text(style.name, style.summary));
      if (style.acBonus)
        char.acFormula = {
          operation: Operation.addition,
          operands: [char.acFormula, style.acBonus],
        };
    }
  }

  // 6. Expertise, limited to skills the character is actually proficient in —
  //    you can't double a proficiency you don't have.
  if (expertiseDueAt(className, level) > 0)
    for (const skill of choices.expertiseChoices)
      if (char.proficiencies.skills[skill])
        char.proficiencies.expertise[skill] = true;

  // 7. Tool proficiencies chosen from the class's list.
  const offeredTools = toolChoicesFor(className, level);
  if (offeredTools) {
    const picked = choices.toolChoices.filter((t) =>
      offeredTools.from.includes(t),
    );
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

  // 9. Picks from the class's closed option lists, de-duplicated against what
  //    the character already knows so re-running a level can't double an entry.
  const dueGroups = new Set(
    newOptionPicksAt(className, level, klass.subclass).map(
      ({ group }) => group.category,
    ),
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

  // 10. Damage resistances a chosen option confers (draconic ancestry). Raw
  //     characters from legacy flows may lack `damageModifiers` entirely.
  const gained = resistancesFromOptions(char.chosenOptions ?? []);
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

// ---------------------------------------------------------------------------
// What a class level *offers* — the read side of the same tables `applyClassLevel`
// applies from.
//
// The wizard used to ask these questions twice: once in a step's `visible`
// predicate to decide whether to show it, and again inside the step to render
// the pickers. Adding a choice meant editing both, with nothing to catch a
// missed one. `grantsAt` answers once and both consume it.
// ---------------------------------------------------------------------------

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
}

// Everything reaching `level` in `className` offers the player. `subclass` is
// passed separately because it may be chosen in the very same step — a fighter
// taking Battle Master at 3rd is owed their first maneuvers immediately.
export function grantsAt(
  className: string,
  level: number,
  subclass?: string,
): LevelGrants {
  return {
    subclassDue: subclassDueAt(className, level),
    asiDue: isAsiLevel(className, level),
    fightingStyles: fightingStyleDueAt(className, level),
    expertise: expertiseDueAt(className, level),
    invocations:
      className === OfficialClass.Warlock ? newInvocationsAt(level) : 0,
    toolChoices: toolChoicesFor(className, level),
    optionPicks: newOptionPicksAt(className, level, subclass),
  };
}

// Whether this level asks the player for anything on the "class features" step
// — the one predicate that step's visibility needs.
export const hasFeatureChoices = (g: LevelGrants): boolean =>
  !!g.fightingStyles ||
  g.invocations > 0 ||
  g.expertise > 0 ||
  !!g.toolChoices ||
  g.optionPicks.length > 0;
