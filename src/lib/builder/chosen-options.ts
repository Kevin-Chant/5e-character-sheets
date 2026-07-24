import {
  DamageType,
  OfficialClass,
  StandardDie,
} from "src/lib/data/data-definitions";
import { ActionCost, Character, ChosenOption } from "src/lib/types";
import { RaceTrait } from "src/lib/builder/types";
import {
  ELEMENTAL_DISCIPLINES,
  KENSEI_WEAPONS,
  RUNE_KNIGHT_RUNES,
} from "src/lib/data/class-option-lists";

// The closed option lists a class lets you pick a fixed number of things from:
// Metamagic, Battle Master maneuvers, Pact Boon. Distinct from `features`
// (open-ended prose) and from limited-use pools (a resource) — what makes these
// their own model is the pairing of a *closed list* with a *known count*, which
// is what lets the sheet say "3 / 5 known" and offer only the rest.
//
// Licensing: Metamagic and Pact Boon are open-license SRD (both are base-class
// features). The Battle Master is *not* in the SRD, so its maneuver summaries
// below are original paraphrases of mechanical facts only — never published
// prose. Same rule as `nonsrd-classes.ts` / `subclasses.ts`.

export interface OptionDef {
  name: string;
  // What this specific option does. Omitted for "pick a type" lists where every
  // option has the same effect (a ranger's favored enemy) — those describe it
  // once on the group instead.
  summary?: string;
  // SRD spell indices this pick grants (always-prepared / known), gated by the
  // owning class's level. This is what makes a *sub-choice inside a subclass*
  // drive content: a Land druid's terrain sets its circle spells, a Genie
  // warlock's kind sets its expanded list. `byLevel` unlocks spells as the class
  // levels (Circle Spells at 3/5/7/9); `always` are granted the moment the
  // option is picked. Spells absent from the bundled SRD are silently skipped
  // (the prose feature still names them), exactly as `grants.spellIndices` does.
  spellIndices?: {
    always?: string[];
    byLevel?: Record<number, string[]>;
  };
  // Feature prose this pick grants — the counterpart to `spellIndices` for a
  // sub-choice that confers a *feature* rather than a spell (a Totem Warrior's
  // totem, a Genie's kind). Granted when the option is picked, de-duplicated by
  // title against the character's features.
  features?: RaceTrait[];
  // A resource this pick lets you spend, surfaced as a play-mode button. The
  // pick becomes a `maxUses: 0` action host (the same shape a Lore bard's
  // Cutting Words uses) titled after the option, so a chosen Metamagic or
  // Elemental Discipline actually drains Sorcery Points or Ki instead of just
  // naming a cost in prose. `pool` is the *other* ability's title.
  action?: {
    cost: ActionCost;
    costNote?: string;
    pool: string;
    // Fixed cost, or `"choose"` when only the player knows it (Twinned Spell
    // costs the spell's level).
    amount?: number | "choose";
    roll?: { label: string; die: StandardDie; count?: number };
    note: string;
  };
  // Features gated by the owning class's level — for a *single* sub-choice that
  // then unlocks features across several levels (a Storm Herald's environment
  // shapes its aura at 3rd, then Storm Soul/Shielding Storm/Raging Storm at
  // 6th/10th/14th; an Armorer's model at 3rd, Perfected Armor at 15th). Granted
  // idempotently as the class levels, like `spellIndices.byLevel`.
  featuresByLevel?: Record<number, RaceTrait[]>;
}

export interface OptionGroup {
  // Stable key, stored on each `ChosenOption.category`.
  category: string;
  // Shown as the section heading.
  label: string;
  // The effect shared by every option in the group, when the options themselves
  // are just values (see `OptionDef.summary`).
  summary?: string;
  // The class that grants the picks, and (for a subclass feature) which
  // subclass — a fighter only gets maneuvers as a Battle Master.
  className: OfficialClass;
  subclass?: string;
  // How many you know at a given class level: the last threshold reached.
  // `[level, count]` pairs, ascending.
  known: [number, number][];
  options: OptionDef[];
  // A damage resistance the pick confers, keyed by option name. Draconic
  // Bloodline is the only case: the ancestry dragon sets the sorcerer's
  // resistance. Applied by both wizards when the pick lands.
  resistances?: Record<string, DamageType>;
}

// The damage resistances a set of picks confers, via `OptionGroup.resistances`.
export function resistancesFromOptions(picks: ChosenOption[]): DamageType[] {
  const out: DamageType[] = [];
  for (const pick of picks) {
    const dt = optionGroup(pick.category)?.resistances?.[pick.name];
    if (dt && !out.includes(dt)) out.push(dt);
  }
  return out;
}

// The SRD spell indices a character's sub-choices grant at a given class level:
// every `always` index of a picked option, plus each `byLevel` tier the class
// level has reached. Only options whose group belongs to `className` count, so a
// druid's terrain pick isn't consulted while leveling a warlock dip. The builder
// grants these idempotently (`addSrdSpellOnce`), so calling at each level-up is
// safe — the list is cumulative and the same spell never lands twice.
export function optionSpellIndicesAt(
  picks: ChosenOption[],
  className: string,
  classLevel: number,
): string[] {
  const out: string[] = [];
  for (const pick of picks) {
    const group = optionGroup(pick.category);
    if (!group || group.className !== className) continue;
    const def = group.options.find((o) => o.name === pick.name);
    const spells = def?.spellIndices;
    if (!spells) continue;
    for (const idx of spells.always ?? []) out.push(idx);
    for (const [lvl, indices] of Object.entries(spells.byLevel ?? {}))
      if (classLevel >= Number(lvl)) out.push(...indices);
  }
  return out;
}

// The feature prose a character's sub-choices grant at a given class level: the
// flat `features` of each pick plus every `featuresByLevel` tier the level has
// reached. Only options whose group belongs to `className` count. The builder
// de-duplicates by title, so calling every level-up is safe.
export function optionFeaturesFor(
  picks: ChosenOption[],
  className: string,
  classLevel: number,
): RaceTrait[] {
  const out: RaceTrait[] = [];
  for (const pick of picks) {
    const group = optionGroup(pick.category);
    if (!group || group.className !== className) continue;
    const def = group.options.find((o) => o.name === pick.name);
    if (def?.features) out.push(...def.features);
    for (const [lvl, feats] of Object.entries(def?.featuresByLevel ?? {}))
      if (classLevel >= Number(lvl)) out.push(...feats);
  }
  return out;
}

// The count from a step table at a level: the last entry the level has reached,
// or 0 before the first. Mirrors `atLevel` in class-pools.ts, but zero-based —
// "you don't have this feature yet" is a real answer here.
const knownAt = (level: number, steps: [number, number][]): number => {
  let value = 0;
  for (const [at, count] of steps) if (level >= at) value = count;
  return value;
};

// A Land druid's terrain, chosen at 3rd — the worked example of a sub-choice
// that *gates spell grants*: the pick sets which circle spells become
// always-prepared, unlocking two at each of 3rd/5th/7th/9th level. The spells
// land in the spellbook via `optionSpellIndicesAt`; the "Circle Spells" prose
// row still names the whole progression. All eight are SRD, so all are granted.
const LAND_TERRAIN: OptionDef[] = [
  {
    name: "Arctic",
    spellIndices: {
      byLevel: {
        3: ["hold-person", "spike-growth"],
        5: ["sleet-storm", "slow"],
        7: ["freedom-of-movement", "ice-storm"],
        9: ["commune-with-nature", "cone-of-cold"],
      },
    },
  },
  {
    name: "Coast",
    spellIndices: {
      byLevel: {
        3: ["mirror-image", "misty-step"],
        5: ["water-breathing", "water-walk"],
        7: ["control-water", "freedom-of-movement"],
        9: ["conjure-elemental", "scrying"],
      },
    },
  },
  {
    name: "Desert",
    spellIndices: {
      byLevel: {
        3: ["blur", "silence"],
        5: ["create-food-and-water", "protection-from-energy"],
        7: ["blight", "hallucinatory-terrain"],
        9: ["insect-plague", "wall-of-stone"],
      },
    },
  },
  {
    name: "Forest",
    spellIndices: {
      byLevel: {
        3: ["barkskin", "spider-climb"],
        5: ["call-lightning", "plant-growth"],
        7: ["divination", "freedom-of-movement"],
        9: ["commune-with-nature", "tree-stride"],
      },
    },
  },
  {
    name: "Grassland",
    spellIndices: {
      byLevel: {
        3: ["invisibility", "pass-without-trace"],
        5: ["daylight", "haste"],
        7: ["divination", "freedom-of-movement"],
        9: ["dream", "insect-plague"],
      },
    },
  },
  {
    name: "Mountain",
    spellIndices: {
      byLevel: {
        3: ["spider-climb", "spike-growth"],
        5: ["lightning-bolt", "meld-into-stone"],
        7: ["stone-shape", "stoneskin"],
        9: ["passwall", "wall-of-stone"],
      },
    },
  },
  {
    name: "Swamp",
    spellIndices: {
      byLevel: {
        3: ["darkness", "acid-arrow"],
        5: ["water-walk", "stinking-cloud"],
        7: ["freedom-of-movement", "locate-creature"],
        9: ["insect-plague", "scrying"],
      },
    },
  },
  {
    name: "Underdark",
    spellIndices: {
      byLevel: {
        3: ["spider-climb", "web"],
        5: ["gaseous-form", "stinking-cloud"],
        7: ["greater-invisibility", "stone-shape"],
        9: ["cloudkill", "insect-plague"],
      },
    },
  },
];

// A Storm Herald's environment — one choice at 3rd that then shapes the aura,
// the resistance, and the reaction across four levels: the level-gated
// `features` case. Shielding Storm (10th) is the same regardless of
// environment, so it stays a plain prose row rather than living here.
const STORM_ENVIRONMENTS: OptionDef[] = [
  {
    name: "Desert",
    featuresByLevel: {
      3: [
        {
          title: "Storm Aura (Desert)",
          detail:
            "While raging, emanate a 10-foot aura (reactivated each turn as a bonus action): each other creature in it takes fire damage — 2 at 3rd, rising to 3 (5th), 4 (10th), 5 (15th), and 6 (20th) barbarian level.",
        },
      ],
      6: [
        {
          title: "Storm Soul (Desert)",
          detail:
            "Fire resistance, immunity to extreme heat, and the ability to ignite a flammable object within 10 feet as an action.",
        },
      ],
      14: [
        {
          title: "Raging Storm (Desert)",
          detail:
            "As a reaction when a creature within your aura hits you, force a Dexterity save (DC 8 + PB + CON) or it takes fire damage equal to half your barbarian level.",
        },
      ],
    },
  },
  {
    name: "Sea",
    featuresByLevel: {
      3: [
        {
          title: "Storm Aura (Sea)",
          detail:
            "While raging, emanate a 10-foot aura (reactivated each turn as a bonus action): as part of activating it, force one creature in it to make a Dexterity save (DC 8 + PB + CON) or take lightning damage — 1d6, rising to 2d6 (10th), 3d6 (15th), 4d6 (20th) — half on a success.",
        },
      ],
      6: [
        {
          title: "Storm Soul (Sea)",
          detail:
            "Lightning resistance, the ability to breathe underwater, and a 30-foot swim speed.",
        },
      ],
      14: [
        {
          title: "Raging Storm (Sea)",
          detail:
            "As a reaction when you hit a creature within your aura, force a Strength save (DC 8 + PB + CON) or knock it prone.",
        },
      ],
    },
  },
  {
    name: "Tundra",
    featuresByLevel: {
      3: [
        {
          title: "Storm Aura (Tundra)",
          detail:
            "While raging, emanate a 10-foot aura (reactivated each turn as a bonus action): each creature of your choice in it gains temporary hit points — 2 at 3rd, rising to 3 (5th), 4 (10th), 5 (15th), and 6 (20th) barbarian level.",
        },
      ],
      6: [
        {
          title: "Storm Soul (Tundra)",
          detail:
            "Cold resistance, immunity to extreme cold, and the ability to freeze a 5-foot cube of water as an action.",
        },
      ],
      14: [
        {
          title: "Raging Storm (Tundra)",
          detail:
            "When your Storm Aura activates, force one creature in it to make a Strength save (DC 8 + PB + CON) or have its speed drop to 0 until the end of your next turn.",
        },
      ],
    },
  },
];

// An Armorer's model — one choice at 3rd shaping the built-in weapon and a
// special property, and again the capstone at 15th. Arcane Armor itself, Extra
// Attack (5th) and Armor Modifications (9th) are the same for both models, so
// they stay prose rows.
const ARMOR_MODELS: OptionDef[] = [
  {
    name: "Guardian",
    featuresByLevel: {
      3: [
        {
          title: "Guardian Armor",
          detail:
            "Your armor grows Thunder Gauntlets — a melee weapon dealing 1d8 thunder (adds INT to attack and damage); a creature you hit has disadvantage on attacks against anyone but you until your next turn. Defensive Field: as a bonus action, gain temporary hit points equal to your artificer level, a number of times per long rest equal to your proficiency bonus.",
        },
      ],
      15: [
        {
          title: "Perfected Armor (Guardian)",
          detail:
            "As a reaction when a Huge or smaller creature you can see ends its turn within 30 feet, force a Strength save (your spell save DC) and pull a failed target up to 25 feet toward you; if it comes within 5 feet you may make one melee attack against it. Uses equal to your proficiency bonus per long rest.",
        },
      ],
    },
  },
  {
    name: "Infiltrator",
    featuresByLevel: {
      3: [
        {
          title: "Infiltrator Armor",
          detail:
            "Your armor grows a Lightning Launcher — a ranged weapon (90/300 ft.) dealing 1d6 lightning (adds INT to attack and damage), plus 1d6 lightning once per turn on a hit. Powered Steps: +5 feet walking speed. Dampening Field: advantage on Stealth checks, and your armor imposes no Stealth disadvantage.",
        },
      ],
      15: [
        {
          title: "Perfected Armor (Infiltrator)",
          detail:
            "When you hit a creature with your Lightning Launcher, you can make it glow with dim light in a 5-foot radius until your next turn; the next attack against a glowing target has advantage, and on a hit deals an extra 1d6 lightning.",
        },
      ],
    },
  },
];

// Path of the Totem Warrior's three totem choices, one per feature level. Each
// re-picks a totem animal (you can choose the same one again or switch), so
// they're three separate groups rather than one — the engine has no notion of
// "same pick, later feature" reuse.
const TOTEM_SPIRIT: OptionDef[] = [
  {
    name: "Bear",
    features: [
      {
        title: "Bear Totem Spirit",
        detail:
          "While raging, you have resistance to all damage types except psychic.",
      },
    ],
  },
  {
    name: "Eagle",
    features: [
      {
        title: "Eagle Totem Spirit",
        detail:
          "While raging and not wearing heavy armor, other creatures have disadvantage on opportunity attacks against you, and you can take the Dash action as a bonus action.",
      },
    ],
  },
  {
    name: "Elk",
    features: [
      {
        title: "Elk Totem Spirit",
        detail:
          "While raging and not wearing heavy armor, your walking speed increases by 15 feet.",
      },
    ],
  },
  {
    name: "Tiger",
    features: [
      {
        title: "Tiger Totem Spirit",
        detail:
          "While raging, add 10 feet to your long jump distance and 3 feet to your high jump distance.",
      },
    ],
  },
  {
    name: "Wolf",
    features: [
      {
        title: "Wolf Totem Spirit",
        detail:
          "While raging, your allies have advantage on melee attack rolls against a creature within 5 feet of you that's hostile to you.",
      },
    ],
  },
];

const TOTEM_ASPECT: OptionDef[] = [
  {
    name: "Bear",
    features: [
      {
        title: "Bear Aspect of the Beast",
        detail:
          "Your carrying capacity doubles, and you have advantage on Strength checks to push, pull, lift, or break objects.",
      },
    ],
  },
  {
    name: "Eagle",
    features: [
      {
        title: "Eagle Aspect of the Beast",
        detail:
          "You can see up to a mile away with no difficulty, and dim light no longer imposes disadvantage on your Perception checks.",
      },
    ],
  },
  {
    name: "Elk",
    features: [
      {
        title: "Elk Aspect of the Beast",
        detail:
          "Your travel pace doubles for you and up to ten companions within 60 feet.",
      },
    ],
  },
  {
    name: "Tiger",
    features: [
      {
        title: "Tiger Aspect of the Beast",
        detail:
          "You gain proficiency in two of Athletics, Acrobatics, Stealth, or Survival.",
      },
    ],
  },
  {
    name: "Wolf",
    features: [
      {
        title: "Wolf Aspect of the Beast",
        detail:
          "You can track other creatures while traveling at a fast pace, and move stealthily at a normal pace.",
      },
    ],
  },
];

const TOTEM_ATTUNEMENT: OptionDef[] = [
  {
    name: "Bear",
    features: [
      {
        title: "Bear Totemic Attunement",
        detail:
          "Hostile creatures within 5 feet of you that can see or hear you have disadvantage on attack rolls against anyone but you.",
      },
    ],
  },
  {
    name: "Eagle",
    features: [
      {
        title: "Eagle Totemic Attunement",
        detail:
          "While raging, gain a flying speed equal to your walking speed; you fall if you're still aloft when your turn ends.",
      },
    ],
  },
  {
    name: "Elk",
    features: [
      {
        title: "Elk Totemic Attunement",
        detail:
          "As a bonus action, barrel through a Large or smaller creature's space; it makes a Strength save (DC 8 + proficiency bonus + Strength modifier) or is knocked prone and takes 1d12 plus your Strength modifier bludgeoning damage.",
      },
    ],
  },
  {
    name: "Tiger",
    features: [
      {
        title: "Tiger Totemic Attunement",
        detail:
          "After moving at least 20 feet in a straight line toward a target and hitting it, make one additional melee attack against it as a bonus action.",
      },
    ],
  },
  {
    name: "Wolf",
    features: [
      {
        title: "Wolf Totemic Attunement",
        detail:
          "After hitting a Large or smaller creature with a melee attack, knock it prone as a bonus action.",
      },
    ],
  },
];

// Path of the Beast's natural weapon, chosen on entering rage. No attack object
// is created for it — the sheet has no notion of a shapeshifted natural
// weapon slot — so the prose is the honest representation of what it does.
const BEAST_WEAPON: OptionDef[] = [
  {
    name: "Bite",
    features: [
      {
        title: "Bite (Natural Weapon)",
        detail:
          "While raging, your bite deals 1d8 piercing damage using Strength; once per turn, when you damage a creature with it while you're below half your hit point maximum, you regain hit points equal to your proficiency bonus.",
      },
    ],
  },
  {
    name: "Claws",
    features: [
      {
        title: "Claws (Natural Weapon)",
        detail:
          "While raging, your claws deal 1d6 slashing damage using Strength; once per turn when you take the Attack action, make one additional claw attack.",
      },
    ],
  },
  {
    name: "Tail",
    features: [
      {
        title: "Tail (Natural Weapon)",
        detail:
          "While raging, your tail deals 1d8 piercing damage using Strength and has 10 feet of reach; as a reaction when you're hit by an attack from within 10 feet, add a d8 to your AC against it.",
      },
    ],
  },
];

// A Genie warlock's vessel kind, chosen at 1st level: it sets the damage type
// of Genie's Wrath and the Elemental Gift resistance, and unlocks one
// kind-specific spell per spell level (1st-5th) in the expanded list, on top
// of the spells every genie kind shares (kept as prose — see
// warlock.ts). All ten kind-specific spells are SRD.
const GENIE_KIND: OptionDef[] = [
  {
    name: "Dao",
    features: [
      {
        title: "Genie's Wrath",
        detail:
          "Once on each of your turns when you hit with an attack, deal extra bludgeoning damage equal to your proficiency bonus.",
      },
    ],
    spellIndices: {
      byLevel: {
        1: ["sanctuary"],
        3: ["spike-growth"],
        5: ["meld-into-stone"],
        7: ["stone-shape"],
        9: ["wall-of-stone"],
      },
    },
  },
  {
    name: "Djinni",
    features: [
      {
        title: "Genie's Wrath",
        detail:
          "Once on each of your turns when you hit with an attack, deal extra thunder damage equal to your proficiency bonus.",
      },
    ],
    spellIndices: {
      byLevel: {
        1: ["thunderwave"],
        3: ["gust-of-wind"],
        5: ["wind-wall"],
        7: ["greater-invisibility"],
        9: ["seeming"],
      },
    },
  },
  {
    name: "Efreeti",
    features: [
      {
        title: "Genie's Wrath",
        detail:
          "Once on each of your turns when you hit with an attack, deal extra fire damage equal to your proficiency bonus.",
      },
    ],
    spellIndices: {
      byLevel: {
        1: ["burning-hands"],
        3: ["scorching-ray"],
        5: ["fireball"],
        7: ["fire-shield"],
        9: ["flame-strike"],
      },
    },
  },
  {
    name: "Marid",
    features: [
      {
        title: "Genie's Wrath",
        detail:
          "Once on each of your turns when you hit with an attack, deal extra cold damage equal to your proficiency bonus.",
      },
    ],
    spellIndices: {
      byLevel: {
        1: ["fog-cloud"],
        3: ["blur"],
        5: ["sleet-storm"],
        7: ["control-water"],
        9: ["cone-of-cold"],
      },
    },
  },
];

// A Divine Soul's affinity, chosen at 1st level. Each one grants a single
// always-known bonus spell that doesn't count against spells known — the only
// mechanical difference between the five, so they carry no feature prose.
const DIVINE_SOUL_AFFINITY: OptionDef[] = [
  { name: "Good", spellIndices: { always: ["cure-wounds"] } },
  { name: "Evil", spellIndices: { always: ["inflict-wounds"] } },
  { name: "Law", spellIndices: { always: ["bless"] } },
  { name: "Chaos", spellIndices: { always: ["bane"] } },
  {
    name: "Neutrality",
    spellIndices: { always: ["protection-from-evil-and-good"] },
  },
];

export const OPTION_GROUPS: OptionGroup[] = [
  {
    category: "divineAffinity",
    label: "Divine Affinity",
    summary:
      "Your affinity grants one bonus spell, always known and not counted against your spells known.",
    className: OfficialClass.Sorcerer,
    subclass: "Divine Soul",
    known: [[1, 1]],
    options: DIVINE_SOUL_AFFINITY,
  },
  {
    category: "landTerrain",
    label: "Land's Circle Spells",
    summary:
      "Your chosen land grants always-prepared circle spells that don't count against your prepared total, two unlocking at each of 3rd, 5th, 7th, and 9th druid level.",
    className: OfficialClass.Druid,
    subclass: "Land",
    known: [[3, 1]],
    options: LAND_TERRAIN,
  },
  // The two ranger lists are the only groups available at level 1, which makes
  // them the only ones the character-creation wizard ever prompts for — the
  // rest all start at class level 3.
  {
    category: "favoredEnemy",
    label: "Favored Enemy",
    summary:
      "Advantage on Survival checks to track them and on Intelligence checks to recall information about them. You also learn one language of your choice that they speak.",
    className: OfficialClass.Ranger,
    known: [
      [1, 1],
      [6, 2],
      [14, 3],
    ],
    options: [
      { name: "Aberrations" },
      { name: "Beasts" },
      { name: "Celestials" },
      { name: "Constructs" },
      { name: "Dragons" },
      { name: "Elementals" },
      { name: "Fey" },
      { name: "Fiends" },
      { name: "Giants" },
      { name: "Monstrosities" },
      { name: "Oozes" },
      { name: "Plants" },
      { name: "Undead" },
      {
        name: "Two humanoid races",
        summary: "Counts as one choice — pick two races of humanoid.",
      },
    ],
  },
  {
    category: "naturalExplorer",
    label: "Natural Explorer",
    summary:
      "In this terrain: difficult terrain doesn't slow your group, you can't get lost except by magic, you stay alert while tracking/foraging/navigating, you travel stealthily at a normal pace alone, you forage twice as much, and you learn the exact number and size of creatures you track. Intelligence and Wisdom checks related to it are doubly proficient.",
    className: OfficialClass.Ranger,
    known: [
      [1, 1],
      [6, 2],
      [10, 3],
    ],
    options: [
      { name: "Arctic" },
      { name: "Coast" },
      { name: "Desert" },
      { name: "Forest" },
      { name: "Grassland" },
      { name: "Mountain" },
      { name: "Swamp" },
    ],
  },
  {
    category: "draconicAncestry",
    label: "Draconic Ancestry",
    summary:
      "Your dragon ancestor sets the damage type of your Dragon Ancestor and Elemental Affinity features, and you gain resistance to that type at 6th level.",
    className: OfficialClass.Sorcerer,
    subclass: "Draconic Bloodline",
    known: [[1, 1]],
    resistances: {
      "Black (acid)": DamageType.Acid,
      "Blue (lightning)": DamageType.Lightning,
      "Brass (fire)": DamageType.Fire,
      "Bronze (lightning)": DamageType.Lightning,
      "Copper (acid)": DamageType.Acid,
      "Gold (fire)": DamageType.Fire,
      "Green (poison)": DamageType.Poison,
      "Red (fire)": DamageType.Fire,
      "Silver (cold)": DamageType.Cold,
      "White (cold)": DamageType.Cold,
    },
    options: [
      { name: "Black (acid)" },
      { name: "Blue (lightning)" },
      { name: "Brass (fire)" },
      { name: "Bronze (lightning)" },
      { name: "Copper (acid)" },
      { name: "Gold (fire)" },
      { name: "Green (poison)" },
      { name: "Red (fire)" },
      { name: "Silver (cold)" },
      { name: "White (cold)" },
    ],
  },
  {
    category: "metamagic",
    label: "Metamagic",
    className: OfficialClass.Sorcerer,
    known: [
      [3, 2],
      [10, 3],
      [17, 4],
    ],
    options: [
      {
        name: "Careful Spell",
        summary:
          "Spend 1 sorcery point to let up to your Charisma modifier of creatures automatically succeed on the spell's saving throw.",
        action: {
          cost: "free",
          pool: "Sorcery Points",
          amount: 1,
          note: "Choose up to your Charisma modifier of creatures; each automatically succeeds on its saving throw against the spell.",
        },
      },
      {
        name: "Distant Spell",
        summary:
          "Spend 1 sorcery point to double a spell's range, or to give a touch spell a range of 30 feet.",
        action: {
          cost: "free",
          pool: "Sorcery Points",
          amount: 1,
          note: "Double the spell's range, or give a touch spell a range of 30 feet.",
        },
      },
      {
        name: "Empowered Spell",
        summary:
          "Spend 1 sorcery point to reroll up to your Charisma modifier of a spell's damage dice, keeping the new rolls.",
        action: {
          cost: "free",
          pool: "Sorcery Points",
          amount: 1,
          note: "Reroll up to your Charisma modifier of the spell's damage dice; you must keep the new rolls.",
        },
      },
      {
        name: "Extended Spell",
        summary:
          "Spend 1 sorcery point to double a spell's duration, to a maximum of 24 hours.",
        action: {
          cost: "free",
          pool: "Sorcery Points",
          amount: 1,
          note: "Double the spell's duration, to a maximum of 24 hours.",
        },
      },
      {
        name: "Heightened Spell",
        summary:
          "Spend 3 sorcery points to give one target disadvantage on its first saving throw against the spell.",
        action: {
          cost: "free",
          pool: "Sorcery Points",
          amount: 3,
          note: "One target of the spell has disadvantage on its first saving throw against it.",
        },
      },
      {
        name: "Quickened Spell",
        summary:
          "Spend 2 sorcery points to cast a 1-action spell as a bonus action instead.",
        action: {
          cost: "free",
          pool: "Sorcery Points",
          amount: 2,
          note: "Cast a spell with a casting time of 1 action as a bonus action instead.",
        },
      },
      {
        name: "Subtle Spell",
        summary:
          "Spend 1 sorcery point to cast without verbal or somatic components.",
        action: {
          cost: "free",
          pool: "Sorcery Points",
          amount: 1,
          note: "Cast the spell without verbal or somatic components.",
        },
      },
      {
        name: "Twinned Spell",
        summary:
          "Spend sorcery points equal to the spell's level (1 for a cantrip) to target a second creature with a single-target spell.",
        action: {
          cost: "free",
          costNote: "costs the spell's level",
          pool: "Sorcery Points",
          amount: "choose",
          note: "Target a second creature with a single-target spell. Costs the spell's level, or 1 for a cantrip.",
        },
      },
    ],
  },
  {
    category: "pactBoon",
    label: "Pact Boon",
    className: OfficialClass.Warlock,
    known: [[3, 1]],
    options: [
      {
        name: "Pact of the Blade",
        summary:
          "Create a pact weapon as an action; you're proficient with it, and can bond an existing magic weapon to it.",
      },
      {
        name: "Pact of the Chain",
        summary:
          "Learn Find Familiar; the familiar can take an extra exotic form, and can forgo its attack so you can use yours.",
      },
      {
        name: "Pact of the Tome",
        summary:
          "Gain a Book of Shadows holding three cantrips from any class's list, castable at will.",
      },
      {
        // Tasha's, so a paraphrase of mechanical facts only — and the
        // prerequisite of three TCE invocations, which is why it matters here.
        name: "Pact of the Talisman",
        summary:
          "Hang a talisman on a creature; while worn, it can add 1d4 to one failed ability check per long rest.",
      },
    ],
  },
  {
    // Elemental Attunement is granted outright and isn't in the list, so these
    // counts are the *additional* disciplines: one at 3rd, then 6/11/17.
    category: "elementalDiscipline",
    label: "Elemental Disciplines",
    className: OfficialClass.Monk,
    subclass: "Four Elements",
    known: [
      [3, 1],
      [6, 2],
      [11, 3],
      [17, 4],
    ],
    options: ELEMENTAL_DISCIPLINES,
  },
  {
    category: "kenseiWeapon",
    label: "Kensei Weapons",
    summary:
      "Your chosen weapons count as monk weapons, and gain the subclass's Kensei features.",
    className: OfficialClass.Monk,
    subclass: "Kensei",
    // Two at 3rd and no more — one melee, one ranged. The count doesn't grow;
    // RAW you may *swap* one on each monk level, which the picker can't model
    // (see the swapping note on Rune Knight below).
    known: [[3, 2]],
    options: KENSEI_WEAPONS,
  },
  {
    category: "rune",
    label: "Runes",
    className: OfficialClass.Fighter,
    subclass: "Rune Knight",
    known: [
      [3, 2],
      [7, 3],
      [10, 4],
      [15, 5],
    ],
    options: RUNE_KNIGHT_RUNES,
  },
  {
    category: "maneuvers",
    label: "Maneuvers",
    className: OfficialClass.Fighter,
    subclass: "Battle Master",
    known: [
      [3, 3],
      [7, 5],
      [10, 7],
      [15, 9],
    ],
    options: [
      {
        name: "Ambush",
        summary: "Add the die to a Stealth check or initiative roll.",
      },
      {
        name: "Bait and Switch",
        summary:
          "Swap places with a willing adjacent creature; one of you gains the die as an AC bonus for a round.",
      },
      {
        name: "Commander's Strike",
        summary:
          "Give up one attack to let an ally use its reaction to attack, adding the die to its damage.",
      },
      {
        name: "Disarming Attack",
        summary:
          "Add the die to damage; the target makes a STR save or drops an item of your choice.",
      },
      {
        name: "Distracting Strike",
        summary:
          "Add the die to damage; the next attack against that target by another creature has advantage.",
      },
      {
        name: "Evasive Footwork",
        summary: "Add the die to your AC while you move.",
      },
      {
        name: "Feinting Attack",
        summary:
          "Spend a bonus action to gain advantage against an adjacent creature, adding the die to damage on a hit.",
      },
      {
        name: "Goading Attack",
        summary:
          "Add the die to damage; the target makes a WIS save or has disadvantage attacking anyone but you.",
      },
      {
        name: "Grappling Strike",
        summary:
          "After hitting, spend a bonus action to grapple, adding the die to the contested check.",
      },
      {
        name: "Lunging Attack",
        summary: "Add 5 feet of reach to a melee attack and the die to damage.",
      },
      {
        name: "Maneuvering Attack",
        summary:
          "Add the die to damage; an ally can use its reaction to move half its speed without provoking from the target.",
      },
      {
        name: "Menacing Attack",
        summary:
          "Add the die to damage; the target makes a WIS save or is frightened of you until your next turn ends.",
      },
      {
        name: "Parry",
        summary:
          "As a reaction, reduce melee damage taken by the die plus your DEX modifier.",
      },
      {
        name: "Precision Attack",
        summary:
          "Add the die to an attack roll, before or after seeing it miss.",
      },
      {
        name: "Pushing Attack",
        summary:
          "Add the die to damage; a Large or smaller target makes a STR save or is pushed 15 feet.",
      },
      {
        name: "Quick Toss",
        summary:
          "Draw and throw a weapon as a bonus action, adding the die to its damage.",
      },
      {
        name: "Rally",
        summary:
          "As a bonus action, give an ally temporary hit points equal to the die plus your CHA modifier.",
      },
      {
        name: "Riposte",
        summary:
          "As a reaction to a melee miss against you, attack that creature and add the die to damage.",
      },
      {
        name: "Sweeping Attack",
        summary:
          "On a hit, deal the die as damage to a second creature within reach of the same attack.",
      },
      {
        name: "Tripping Attack",
        summary:
          "Add the die to damage; a Large or smaller target makes a STR save or is knocked prone.",
      },
    ],
  },
  {
    category: "totemSpirit",
    label: "Totem Spirit",
    summary:
      "Your totem animal grants a benefit while you rage — see the option for what it does.",
    className: OfficialClass.Barbarian,
    subclass: "Totem Warrior",
    known: [[3, 1]],
    options: TOTEM_SPIRIT,
  },
  {
    category: "totemAspect",
    label: "Aspect of the Beast",
    summary:
      "Your totem animal grants a permanent benefit — see the option for what it does.",
    className: OfficialClass.Barbarian,
    subclass: "Totem Warrior",
    known: [[6, 1]],
    options: TOTEM_ASPECT,
  },
  {
    category: "totemAttunement",
    label: "Totemic Attunement",
    summary:
      "Your totem animal grants a further benefit — see the option for what it does.",
    className: OfficialClass.Barbarian,
    subclass: "Totem Warrior",
    known: [[14, 1]],
    options: TOTEM_ATTUNEMENT,
  },
  {
    category: "beastWeapon",
    label: "Form of the Beast",
    summary:
      "The natural weapon your rage manifests. Requires no free hand, uses Strength, and lasts until your rage ends.",
    className: OfficialClass.Barbarian,
    subclass: "Beast",
    known: [[3, 1]],
    options: BEAST_WEAPON,
  },
  {
    category: "stormAura",
    label: "Storm Aura Environment",
    summary:
      "The environment your storm channels — it shapes your Storm Aura (3rd), Storm Soul (6th), and Raging Storm (14th). Shielding Storm (10th) is the same whichever you pick.",
    className: OfficialClass.Barbarian,
    subclass: "Storm Herald",
    known: [[3, 1]],
    options: STORM_ENVIRONMENTS,
  },
  {
    category: "armorModel",
    label: "Armor Model",
    summary:
      "Your Arcane Armor's model — it sets your built-in weapon and special property (3rd) and your Perfected Armor (15th). You can change models on a rest.",
    className: OfficialClass.Artificer,
    subclass: "Armorer",
    known: [[3, 1]],
    options: ARMOR_MODELS,
  },
  {
    category: "genieKind",
    label: "Genie Kind",
    summary:
      "Your vessel's kind sets Genie's Wrath's damage type, your Elemental Gift resistance at 6th level, and one kind-specific spell per spell level in your expanded list.",
    className: OfficialClass.Warlock,
    subclass: "Genie",
    known: [[1, 1]],
    resistances: {
      Dao: DamageType.Bludgeoning,
      Djinni: DamageType.Thunder,
      Efreeti: DamageType.Fire,
      Marid: DamageType.Cold,
    },
    options: GENIE_KIND,
  },
];

export const optionGroup = (category: string): OptionGroup | undefined =>
  OPTION_GROUPS.find((g) => g.category === category);

// The groups this character has access to, with how many picks each allows at
// their current level. A group whose class isn't on the sheet — or whose
// subclass doesn't match, or whose level threshold isn't reached — is omitted,
// so the sheet shows nothing until the choice is actually available.
export function availableOptionGroups(
  character: Character,
): { group: OptionGroup; known: number }[] {
  return OPTION_GROUPS.flatMap((group) => {
    const klass = character.class.find(
      (k) =>
        k.name === group.className &&
        (!group.subclass || k.subclass === group.subclass),
    );
    if (!klass) return [];
    const known = knownAt(klass.level, group.known);
    return known > 0 ? [{ group, known }] : [];
  });
}

// How many *new* picks reaching `level` in a class grants, per group: the
// count at that level minus the count at the one below. Used by both wizards to
// prompt only for what this level actually adds.
//
// `subclass` is passed separately rather than read off the character because
// the subclass is often chosen in the *same* step — a fighter picking Battle
// Master at 3rd gets their first three maneuvers immediately.
export function newOptionPicksAt(
  className: string,
  level: number,
  subclass?: string,
): { group: OptionGroup; count: number }[] {
  return OPTION_GROUPS.flatMap((group) => {
    if (group.className !== className) return [];
    if (group.subclass && group.subclass !== subclass) return [];
    const count = knownAt(level, group.known) - knownAt(level - 1, group.known);
    return count > 0 ? [{ group, count }] : [];
  });
}

// The character's picks in one category, in catalog order.
export const chosenIn = (
  character: Character,
  category: string,
): ChosenOption[] =>
  (character.chosenOptions ?? []).filter((o) => o.category === category);
