import {
  DamageType,
  DieOperation,
  OfficialClass,
  Operation,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { randomUUID } from "src/lib/browser";
import { getSrdClass } from "src/lib/builder/srd-classes";
import { poolTitlesFor } from "src/lib/builder/class-pools";
import {
  Character,
  CustomFormula,
  CustomFormulaWithDamage,
  DieExpression,
  IClass,
} from "src/lib/types";

// Class-feature choice catalogs and per-level feature prose for the builder /
// level-up wizards. As with the other non-SRD-JSON content files: mechanical
// facts with terse original summaries, never published prose.

// ---------------------------------------------------------------------------
// Fighting styles

export interface FightingStyle {
  name: string;
  summary: string;
  // Fold +1 into the AC formula when taken (Defense).
  acBonus?: number;
}

// Names are bare (no "Fighting Style:" prefix) so features land with titles
// the mechanics catalog recognizes — "Great Weapon Fighting" lights up its
// damage-reroll rider by title match.
export const FIGHTING_STYLES: FightingStyle[] = [
  {
    name: "Archery",
    summary: "+2 bonus to attack rolls with ranged weapons.",
  },
  {
    name: "Defense",
    summary: "+1 AC while wearing armor (folded into your AC formula).",
    acBonus: 1,
  },
  {
    name: "Dueling",
    summary:
      "+2 damage with a one-handed melee weapon when no other weapon is held.",
  },
  {
    name: "Great Weapon Fighting",
    summary:
      "Reroll 1s and 2s on damage dice of two-handed/versatile melee weapons.",
  },
  {
    name: "Protection",
    summary:
      "While holding a shield, use your reaction to impose disadvantage on an attack against a creature within 5 ft.",
  },
  {
    name: "Two-Weapon Fighting",
    summary: "Add your ability modifier to off-hand attack damage.",
  },
];

// Which styles each class may pick, and the class level that grants the
// choice (fighter picks at 1 — the guided builder's job; the rest via
// level-up).
export const FIGHTING_STYLE_ACCESS: Partial<
  Record<OfficialClass, { level: number; styles: string[] }>
> = {
  [OfficialClass.Fighter]: {
    level: 1,
    styles: FIGHTING_STYLES.map((s) => s.name),
  },
  [OfficialClass.Paladin]: {
    level: 2,
    styles: ["Defense", "Dueling", "Great Weapon Fighting", "Protection"],
  },
  [OfficialClass.Ranger]: {
    level: 2,
    styles: ["Archery", "Defense", "Dueling", "Two-Weapon Fighting"],
  },
};

export const getFightingStyle = (name?: string): FightingStyle | undefined =>
  FIGHTING_STYLES.find((s) => s.name === name);

export function fightingStyleDueAt(
  className: string,
  level: number,
): string[] | undefined {
  const oc = Object.values(OfficialClass).find((c) => c === className);
  const access = oc && FIGHTING_STYLE_ACCESS[oc];
  return access && access.level === level ? access.styles : undefined;
}

// ---------------------------------------------------------------------------
// Eldritch invocations (warlock)

export interface Invocation {
  name: string;
  summary: string;
  prerequisite?: string;
}

// The SRD invocation list, summarized.
export const ELDRITCH_INVOCATIONS: Invocation[] = [
  {
    name: "Agonizing Blast",
    summary: "Add your Charisma modifier to Eldritch Blast damage.",
  },
  {
    name: "Armor of Shadows",
    summary: "Cast Mage Armor on yourself at will, without a slot.",
  },
  {
    name: "Beast Speech",
    summary: "Cast Speak with Animals at will, without a slot.",
  },
  {
    name: "Beguiling Influence",
    summary: "Gain proficiency in Deception and Persuasion.",
  },
  {
    name: "Book of Ancient Secrets",
    summary:
      "Inscribe and ritual-cast spells from any class list in your Book of Shadows.",
    prerequisite: "Pact of the Tome",
  },
  {
    name: "Devil's Sight",
    summary: "See normally in darkness, magical or not, to 120 ft.",
  },
  {
    name: "Eldritch Sight",
    summary: "Cast Detect Magic at will, without a slot.",
  },
  {
    name: "Eyes of the Rune Keeper",
    summary: "Read all writing.",
  },
  {
    name: "Fiendish Vigor",
    summary: "Cast False Life on yourself at will as a 1st-level spell.",
  },
  {
    name: "Mask of Many Faces",
    summary: "Cast Disguise Self at will, without a slot.",
  },
  {
    name: "Misty Visions",
    summary: "Cast Silent Image at will, without a slot.",
  },
  {
    name: "Repelling Blast",
    summary: "Eldritch Blast pushes a hit creature 10 ft. away.",
  },
  {
    name: "Thief of Five Fates",
    summary: "Cast Bane once per long rest using a warlock spell slot.",
  },
  {
    name: "Thirsting Blade",
    summary:
      "Attack twice with your pact weapon when you take the Attack action.",
    prerequisite: "5th level, Pact of the Blade",
  },
  {
    name: "Voice of the Chain Master",
    summary:
      "Communicate telepathically with your familiar and perceive through its senses at any distance.",
    prerequisite: "Pact of the Chain",
  },
];

// How many invocations a warlock knows at a given level (PHB table). The
// wizard offers picks whenever the count increases at the target level.
export function invocationsKnownAt(level: number): number {
  if (level < 2) return 0;
  const thresholds = [2, 5, 7, 9, 12, 15, 18];
  return 1 + thresholds.filter((t) => level >= t).length;
}

export function newInvocationsAt(level: number): number {
  return Math.max(0, invocationsKnownAt(level) - invocationsKnownAt(level - 1));
}

// ---------------------------------------------------------------------------
// Per-level class feature prose

// Features gained at class levels past 1, excluding: subclass features, ASIs,
// choice features handled elsewhere (fighting styles, invocations), and
// features that already land as limited-use pools (`class-pools.ts` carries
// their descriptions). Scaling features are entered once, at their first
// level, with the scaling described in the detail.
export const CLASS_FEATURES: Partial<
  Record<OfficialClass, Record<number, { title: string; detail: string }[]>>
> = {
  [OfficialClass.Barbarian]: {
    2: [
      {
        title: "Reckless Attack",
        detail:
          "Attack recklessly on your first attack: advantage on STR melee attacks this turn, but attacks against you have advantage until your next turn.",
      },
      {
        title: "Danger Sense",
        detail:
          "Advantage on DEX saves against effects you can see (traps, spells) while not blinded, deafened, or incapacitated.",
      },
    ],
    5: [
      {
        title: "Extra Attack",
        detail: "Attack twice whenever you take the Attack action.",
      },
      {
        title: "Fast Movement",
        detail: "+10 ft. speed while not wearing heavy armor.",
      },
    ],
    7: [
      {
        title: "Feral Instinct",
        detail:
          "Advantage on initiative; act normally on a surprise round if you rage first.",
      },
    ],
    9: [
      {
        title: "Brutal Critical",
        detail:
          "Roll one extra weapon damage die on a melee critical hit (two at 13th, three at 17th level).",
      },
    ],
    11: [
      {
        title: "Relentless Rage",
        detail:
          "While raging, dropping to 0 HP lets you make a DC 10 CON save to drop to 1 instead (+5 DC each use until a rest).",
      },
    ],
    15: [
      {
        title: "Persistent Rage",
        detail: "Your rage only ends early if you fall unconscious or end it.",
      },
    ],
    18: [
      {
        title: "Indomitable Might",
        detail: "A STR check total below your STR score becomes your score.",
      },
    ],
    20: [
      {
        title: "Primal Champion",
        detail: "STR and CON increase by 4 (maximum 24).",
      },
    ],
  },
  [OfficialClass.Bard]: {
    2: [
      {
        title: "Jack of All Trades",
        detail:
          "Add half your proficiency bonus to ability checks you aren't proficient in.",
      },
      {
        title: "Song of Rest",
        detail:
          "Allies who hear you perform during a short rest regain an extra 1d6 HP (d8 at 9th, d10 at 13th, d12 at 17th level).",
      },
    ],
    3: [
      {
        title: "Expertise",
        detail:
          "Double proficiency bonus for two chosen skill proficiencies (two more at 10th level).",
      },
    ],
    6: [
      {
        title: "Countercharm",
        detail:
          "Perform as an action to give allies within 30 ft. advantage on saves against being frightened or charmed.",
      },
    ],
    10: [
      {
        title: "Magical Secrets",
        detail:
          "Learn two spells from any class lists (again at 14th and 18th level).",
      },
    ],
    20: [
      {
        title: "Superior Inspiration",
        detail:
          "Regain one Bardic Inspiration use when you roll initiative with none left.",
      },
    ],
  },
  [OfficialClass.Cleric]: {
    5: [
      {
        title: "Destroy Undead",
        detail:
          "Turned undead of CR 1/2 or lower are destroyed (threshold rises with cleric level).",
      },
    ],
  },
  [OfficialClass.Druid]: {
    18: [
      {
        title: "Timeless Body",
        detail: "Age one year for every ten that pass.",
      },
      {
        title: "Beast Spells",
        detail:
          "Cast druid spells in beast shape (no material components with a cost).",
      },
    ],
    20: [
      {
        title: "Archdruid",
        detail:
          "Unlimited Wild Shape; ignore verbal/somatic and costless material components of druid spells.",
      },
    ],
  },
  [OfficialClass.Fighter]: {
    5: [
      {
        title: "Extra Attack",
        detail:
          "Attack twice whenever you take the Attack action (three times at 11th, four at 20th level).",
      },
    ],
  },
  [OfficialClass.Monk]: {
    2: [
      {
        title: "Unarmored Movement",
        detail:
          "+10 ft. speed while unarmored and shieldless, rising with monk level; at 9th, run along vertical surfaces and across liquids.",
      },
    ],
    3: [
      {
        title: "Deflect Missiles",
        detail:
          "Use your reaction to reduce ranged weapon damage by 1d10 + DEX + monk level; at 0, catch and throw it back for 1 ki.",
      },
    ],
    4: [
      {
        title: "Slow Fall",
        detail: "Use your reaction to reduce falling damage by 5 × monk level.",
      },
    ],
    5: [
      {
        title: "Extra Attack",
        detail: "Attack twice whenever you take the Attack action.",
      },
      {
        title: "Stunning Strike",
        detail:
          "On a melee weapon hit, spend 1 ki to force a CON save or the target is stunned until the end of your next turn.",
      },
    ],
    6: [
      {
        title: "Ki-Empowered Strikes",
        detail:
          "Your unarmed strikes count as magical against resistance and immunity.",
      },
    ],
    7: [
      {
        title: "Evasion",
        detail:
          "On a DEX save for half damage: no damage on a success, half on a failure.",
      },
      {
        title: "Stillness of Mind",
        detail:
          "Use your action to end one charmed or frightened effect on yourself.",
      },
    ],
    10: [
      {
        title: "Purity of Body",
        detail: "Immune to disease and poison.",
      },
    ],
    13: [
      {
        title: "Tongue of the Sun and Moon",
        detail:
          "Understand all spoken languages; all creatures understand you.",
      },
    ],
    14: [
      {
        title: "Diamond Soul",
        detail:
          "Proficiency in all saving throws; spend 1 ki to reroll a failed save.",
      },
    ],
    15: [
      {
        title: "Timeless Body",
        detail: "Suffer no frailty of age; need no food or water.",
      },
    ],
    18: [
      {
        title: "Empty Body",
        detail:
          "Spend 4 ki to become invisible for a minute (resistance to all but force damage), or 8 ki to cast Astral Projection on yourself.",
      },
    ],
    20: [
      {
        title: "Perfect Self",
        detail: "Regain 4 ki when you roll initiative with none left.",
      },
    ],
  },
  [OfficialClass.Paladin]: {
    2: [
      {
        title: "Divine Smite",
        detail:
          "When you hit with a melee weapon, expend a spell slot for +2d8 radiant damage, +1d8 per slot level above 1st (max 5d8), +1d8 against fiends and undead.",
      },
    ],
    3: [
      {
        title: "Divine Health",
        detail: "You are immune to disease.",
      },
    ],
    5: [
      {
        title: "Extra Attack",
        detail: "Attack twice whenever you take the Attack action.",
      },
    ],
    6: [
      {
        title: "Aura of Protection",
        detail:
          "You and friendly creatures within 10 ft. add your CHA modifier to saving throws (30 ft. at 18th level).",
      },
    ],
    10: [
      {
        title: "Aura of Courage",
        detail:
          "You and friendly creatures within 10 ft. can't be frightened (30 ft. at 18th level).",
      },
    ],
    11: [
      {
        title: "Improved Divine Smite",
        detail: "Your melee weapon hits deal an extra 1d8 radiant damage.",
      },
    ],
    14: [
      {
        title: "Cleansing Touch",
        detail:
          "Use your action to end one spell on yourself or a willing creature; CHA modifier uses per long rest.",
      },
    ],
  },
  [OfficialClass.Ranger]: {
    3: [
      {
        title: "Primeval Awareness",
        detail:
          "Expend a spell slot to sense aberrations, celestials, dragons, elementals, fey, fiends, and undead within 1 mile for 1 minute per slot level.",
      },
    ],
    5: [
      {
        title: "Extra Attack",
        detail: "Attack twice whenever you take the Attack action.",
      },
    ],
    8: [
      {
        title: "Land's Stride",
        detail:
          "Nonmagical difficult terrain costs no extra movement; advantage on saves against magical plants.",
      },
    ],
    10: [
      {
        title: "Hide in Plain Sight",
        detail:
          "Spend a minute camouflaging to gain +10 to Stealth while still against solid cover.",
      },
    ],
    14: [
      {
        title: "Vanish",
        detail:
          "Hide as a bonus action; you can't be tracked nonmagically unless you choose to leave a trail.",
      },
    ],
    18: [
      {
        title: "Feral Senses",
        detail:
          "Fight invisible creatures without disadvantage; sense hidden creatures within 30 ft.",
      },
    ],
    20: [
      {
        title: "Foe Slayer",
        detail:
          "Once per turn, add your WIS modifier to an attack or damage roll against a favored enemy.",
      },
    ],
  },
  [OfficialClass.Rogue]: {
    2: [
      {
        title: "Cunning Action",
        detail: "Dash, Disengage, or Hide as a bonus action.",
      },
    ],
    5: [
      {
        title: "Uncanny Dodge",
        detail:
          "Use your reaction to halve the damage of an attack from a visible attacker.",
      },
    ],
    7: [
      {
        title: "Evasion",
        detail:
          "On a DEX save for half damage: no damage on a success, half on a failure.",
      },
    ],
    11: [
      {
        title: "Reliable Talent",
        detail:
          "Treat a d20 roll of 9 or lower as a 10 on ability checks you're proficient in.",
      },
    ],
    14: [
      {
        title: "Blindsense",
        detail:
          "While you can hear, know the location of hidden or invisible creatures within 10 ft.",
      },
    ],
    15: [
      {
        title: "Slippery Mind",
        detail: "Gain proficiency in Wisdom saving throws.",
      },
    ],
    18: [
      {
        title: "Elusive",
        detail:
          "No attack roll has advantage against you while you aren't incapacitated.",
      },
    ],
    // Stroke of Luck (20) is a pool-backed feature — see class-pools.ts.
  },
  [OfficialClass.Sorcerer]: {
    3: [
      {
        title: "Metamagic",
        detail:
          "Learn two Metamagic options fueled by sorcery points (one more at 10th and 17th level).",
      },
    ],
    20: [
      {
        title: "Sorcerous Restoration",
        detail: "Regain 4 sorcery points on a short rest.",
      },
    ],
  },
  [OfficialClass.Warlock]: {
    3: [
      {
        title: "Pact Boon",
        detail:
          "Choose your patron's gift: Pact of the Chain (improved familiar), Pact of the Blade (summonable pact weapon), or Pact of the Tome (Book of Shadows with three any-list cantrips).",
      },
    ],
    // Mystic Arcanum (11/13/15/17) is pool-backed — see class-pools.ts.
    20: [
      {
        title: "Eldritch Master",
        detail:
          "Once per long rest, entreat your patron for a minute to regain all pact slots.",
      },
    ],
  },
  [OfficialClass.Wizard]: {
    18: [
      {
        title: "Spell Mastery",
        detail:
          "Choose one 1st- and one 2nd-level wizard spell; cast them at their lowest level without slots.",
      },
    ],
    20: [
      {
        title: "Signature Spells",
        detail:
          "Choose two 3rd-level spells; each is always prepared and castable once per rest without a slot.",
      },
    ],
  },
  [OfficialClass.Artificer]: {
    2: [
      {
        title: "Infuse Items",
        detail:
          "Imbue mundane items with magical infusions after a long rest; infusions known and active items scale with level.",
      },
    ],
    6: [
      {
        title: "Tool Expertise",
        detail: "Double proficiency bonus for tool checks.",
      },
    ],
    7: [
      {
        title: "Flash of Genius",
        detail:
          "Use your reaction to add your INT modifier to a nearby creature's check or save; INT modifier uses per long rest.",
      },
    ],
    10: [
      {
        title: "Magic Item Adept",
        detail:
          "Attune to four items; craft common/uncommon magic items faster and cheaper.",
      },
    ],
    14: [
      {
        title: "Magic Item Savant",
        detail:
          "Attune to five items; ignore class/race/spell requirements on magic items.",
      },
    ],
    18: [
      {
        title: "Magic Item Master",
        detail: "Attune to six items.",
      },
    ],
    20: [
      {
        title: "Soul of Artifice",
        detail:
          "+1 to saves per attuned item; drop to 1 HP instead of 0 by ending one infusion.",
      },
    ],
  },
};

// The features a class gains at a given level. Level 1 comes from the bundled
// SRD class data (whose `features` array is the level-1 set), levels 2+ from
// the hand-authored table above — callers shouldn't have to know which. Before
// this, creation read `klass.features` directly and level-up read the table, an
// implicit split that made building a character above level 1 impossible to do
// through one path.
export function classFeaturesAt(
  className: string,
  level: number,
): { title: string; detail: string }[] {
  const oc = Object.values(OfficialClass).find((c) => c === className);
  if (level === 1) {
    // The SRD level-1 list includes features that the sheet grants as
    // limited-use pools (Rage, Second Wind, …). Drop those here, the same way
    // the hand-authored 2+ table omits them, so they aren't listed twice.
    const pooled = new Set(
      poolTitlesFor(className).map((t) => t.trim().toLowerCase()),
    );
    return (getSrdClass(className.toLowerCase())?.features ?? []).filter(
      (f) => !pooled.has(f.title.trim().toLowerCase()),
    );
  }
  return (oc && CLASS_FEATURES[oc]?.[level]) ?? [];
}

// The "choose N tool proficiencies" a class offers at a given level — bard
// instruments, monk artisan tools. Only ever at level 1 today, but keyed by
// level so the grant path can ask uniformly.
export function toolChoicesFor(
  className: string,
  level: number,
): { choose: number; from: string[] } | undefined {
  if (level !== 1) return undefined;
  return getSrdClass(className.toLowerCase())?.toolChoices;
}

// ---------------------------------------------------------------------------
// Martial Arts (monk)

// The monk's Martial Arts die by monk level: d4 → d6 (5th) → d8 (11th) →
// d10 (17th).
export function martialArtsDie(level: number): StandardDie {
  if (level >= 17) return StandardDie.d10;
  if (level >= 11) return StandardDie.d8;
  if (level >= 5) return StandardDie.d6;
  return StandardDie.d4;
}

// Martial Arts *substitutes* the damage die of unarmed strikes and monk weapons
// rather than adding to them, so it's the one scaling feature that doesn't fit
// the `extraDamage` rider shape — a rider adds a second expression, and there's
// no "replace the weapon's die" kind (adding one would mean the roll dialog
// rewriting an attack's stored formula, which nothing else does).
//
// What a monk actually lacked was the attack itself: the sheet had the prose but
// no Unarmed Strike to roll. So this grants one and re-derives its die on every
// level-up, exactly like `syncClassPools` does for pool sizes — and with the
// same trade-off: **the table is authoritative**, so a hand-edited Unarmed
// Strike is overwritten the next time the monk levels. Rename it (or add a
// second attack) to keep a custom one.
export function syncMartialArts(char: Character, klass: IClass): void {
  if (klass.name !== OfficialClass.Monk) return;
  // Martial Arts lets you use DEX in place of STR; taking the better of the two
  // is what that always resolves to in practice.
  const ability: CustomFormula = {
    operation: Operation.maximum,
    operands: [StatKey.str, StatKey.dex],
  };
  const die = martialArtsDie(klass.level);
  const existing = char.attacks.find(
    (a) => a.name.trim().toLowerCase() === UNARMED_STRIKE,
  );
  const bonus: CustomFormula = {
    operation: Operation.addition,
    operands: [ability, "proficiencyBonus"],
  };
  const formula: CustomFormulaWithDamage = {
    [DamageType.Bludgeoning]: {
      operation: Operation.addition,
      operands: [[1, die, DieOperation.roll] as DieExpression, ability],
    } as CustomFormula,
  };
  if (existing) {
    existing.bonus = bonus;
    existing.formula = formula;
  } else {
    char.attacks.push({
      id: randomUUID(),
      name: "Unarmed Strike",
      bonus,
      formula,
    });
  }
}

const UNARMED_STRIKE = "unarmed strike";

// ---------------------------------------------------------------------------
// Expertise (rogue, bard)

// How many skills gain expertise at a given class level. Rogues pick two at 1st
// and two more at 6th; bards at 3rd and 10th. The sheet models Thieves' Tools
// as a pseudo-skill, so a rogue can spend a pick on it exactly as RAW allows.
const EXPERTISE_GRANTS: Partial<Record<OfficialClass, Record<number, number>>> =
  {
    [OfficialClass.Rogue]: { 1: 2, 6: 2 },
    [OfficialClass.Bard]: { 3: 2, 10: 2 },
  };

// How many expertise picks reaching `level` in `className` grants (0 for most).
export function expertiseDueAt(className: string, level: number): number {
  const oc = Object.values(OfficialClass).find((c) => c === className);
  return (oc && EXPERTISE_GRANTS[oc]?.[level]) ?? 0;
}

// ---------------------------------------------------------------------------
// Class progression tables
//
// These moved here from the level-up wizard: they're per-class level data, the
// same shape as everything else in this file, and `level-grants.ts` needs to
// read them without importing the wizard (which imports it).

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

// Does reaching `level` in `className` grant a subclass choice?
export const subclassDueAt = (className: string, level: number): boolean => {
  const oc = Object.values(OfficialClass).find((c) => c === className);
  return oc ? SUBCLASS_LEVEL[oc] === level : false;
};

// Does reaching `level` in `className` grant an ASI / feat?
export const isAsiLevel = (className: string, level: number): boolean => {
  const oc = Object.values(OfficialClass).find((c) => c === className);
  const extra = (oc && EXTRA_ASI_LEVELS[oc]) || [];
  return BASE_ASI_LEVELS.includes(level) || extra.includes(level);
};
