import { OptionDef } from "src/lib/builder/chosen-options";

// Closed pick-lists for three sub-choices `chosen-options.ts` doesn't yet
// cover: the Monk's Way of the Four Elements disciplines and Way of the
// Kensei weapon choice, and the Fighter's Rune Knight runes. Same shape as
// the `OPTION_GROUPS` entries there (metamagic, pact boon, maneuvers) — this
// file only supplies the `OptionDef[]` data; wiring into an `OptionGroup` is
// intentionally left to the caller.
//
// Licensing: none of this is SRD (Way of the Four Elements is base-PHB but
// outside the open-license subset; Rune Knight is Tasha's Cauldron of
// Everything). Every summary below is an original paraphrase of mechanical
// facts only — ki/rune costs, dice, save types, ranges, durations, level
// prerequisites — never copied or lightly reworded published prose. Same
// rule as `subclasses.ts` / `nonsrd-classes.ts`.

// Monk: Way of the Four Elements, "Disciple of the Elements" — known at 3rd
// level (Elemental Attunement plus one other), with one more learned at
// 6th/11th/17th. All 17 PHB disciplines.
export const ELEMENTAL_DISCIPLINES: OptionDef[] = [
  {
    name: "Breath of Winter",
    summary: "Requires 17th level. Spend 6 ki to cast Cone of Cold.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 6,
      note: "Cast Cone of Cold.",
    },
  },
  {
    name: "Clench of the North Wind",
    summary: "Requires 6th level. Spend 3 ki to cast Hold Person.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 3,
      note: "Cast Hold Person.",
    },
  },
  {
    name: "Elemental Attunement",
    summary:
      "As an action, work a minor elemental effect within 30 feet at no ki cost — a harmless sensory flourish, lighting or snuffing a small flame, warming or chilling up to a pound of material, or shaping a handful of earth, fire, water, or mist for a minute.",
  },
  {
    name: "Eternal Mountain Defense",
    summary: "Requires 17th level. Spend 5 ki to cast Stoneskin on yourself.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 5,
      note: "Cast Stoneskin on yourself.",
    },
  },
  {
    name: "Fangs of the Fire Snake",
    summary:
      "On an Attack action, spend 1 ki to extend your unarmed-strike reach by 10 feet for the turn and deal fire damage instead of bludgeoning; spend a further ki on a hit for an extra 1d10 fire damage.",
    action: {
      cost: "free",
      pool: "Ki",
      amount: "choose",
      note: "Unarmed strikes gain 10 ft. of reach and deal fire damage this turn (1 ki). Spend 1 more on a hit for an extra 1d10 fire damage.",
    },
  },
  {
    name: "Fist of Four Thunders",
    summary: "Spend 2 ki to cast Thunderwave.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 2,
      note: "Cast Thunderwave.",
    },
  },
  {
    name: "Fist of Unbroken Air",
    summary:
      "As an action, spend 2 ki to blast a creature within 30 feet; on a failed Strength save it takes 3d10 bludgeoning damage (+1d10 per extra ki spent) and is pushed 20 feet and knocked prone, or half damage and no forced movement on a success.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: "choose",
      note: "A creature within 30 ft. makes a Strength save: 3d10 bludgeoning, pushed 20 ft. and knocked prone, or half and no movement. Base cost 2 ki; each extra ki adds 1d10.",
    },
  },
  {
    name: "Flames of the Phoenix",
    summary: "Requires 11th level. Spend 4 ki to cast Fireball.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 4,
      note: "Cast Fireball.",
    },
  },
  {
    name: "Gong of the Summit",
    summary: "Requires 6th level. Spend 3 ki to cast Shatter.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 3,
      note: "Cast Shatter.",
    },
  },
  {
    name: "Mist Stance",
    summary:
      "Requires 11th level. Spend 4 ki to cast Gaseous Form on yourself.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 4,
      note: "Cast Gaseous Form on yourself.",
    },
  },
  {
    name: "Ride the Wind",
    summary: "Requires 11th level. Spend 4 ki to cast Fly on yourself.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 4,
      note: "Cast Fly on yourself.",
    },
  },
  {
    name: "River of Hungry Flame",
    summary: "Requires 17th level. Spend 5 ki to cast Wall of Fire.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 5,
      note: "Cast Wall of Fire.",
    },
  },
  {
    name: "Rush of the Gale Spirits",
    summary: "Spend 2 ki to cast Gust of Wind.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 2,
      note: "Cast Gust of Wind.",
    },
  },
  {
    name: "Shape the Flowing River",
    summary:
      "As an action, spend 1 ki to reshape up to a 30-foot cube of ice or water within 120 feet — freeze it, melt it, or resculpt it into a wall, pillar, trench, or ramp — without trapping or injuring anyone inside it.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 1,
      note: "Reshape up to a 30-ft. cube of ice or water within 120 ft.",
    },
  },
  {
    name: "Sweeping Cinder Strike",
    summary: "Spend 2 ki to cast Burning Hands.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 2,
      note: "Cast Burning Hands.",
    },
  },
  {
    name: "Water Whip",
    summary:
      "As an action, spend 2 ki to lash a creature within 30 feet; on a failed Dexterity save it takes 3d10 bludgeoning damage (+1d10 per extra ki spent) and is knocked prone or pulled 25 feet closer, or half damage and no forced movement on a success.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: "choose",
      note: "A creature within 30 ft. makes a Dexterity save: 3d10 bludgeoning and knocked prone or pulled 25 ft., or half and no movement. Base cost 2 ki; each extra ki adds 1d10.",
    },
  },
  {
    name: "Wave of Rolling Earth",
    summary: "Requires 17th level. Spend 6 ki to cast Wall of Stone.",
    action: {
      cost: "action",
      pool: "Ki",
      amount: 6,
      note: "Cast Wall of Stone.",
    },
  },
];

// Fighter: Rune Knight, "Rune Carver" — 2 runes known at 3rd level, growing to
// 3/4/5 at 7th/10th/15th. Each rune grants a passive while its object is worn
// or carried, plus an invoked effect usable once per short or long rest
// (twice at 15th, via Master of Runes) — the save DC uses the fighter's own
// Rune Magic DC (8 + proficiency bonus + Constitution modifier).
const RUNE_SUMMARIES: OptionDef[] = [
  {
    name: "Cloud Rune",
    summary:
      "Passive: advantage on Sleight of Hand and Deception checks. Invoke as a reaction, once per rest, to redirect an attack that just hit you or a creature within 30 feet onto a different creature within 30 feet, reusing the same roll.",
  },
  {
    name: "Fire Rune",
    summary:
      "Passive: double proficiency bonus on tool checks you're proficient in. Invoke on a weapon hit, once per rest, to add 2d6 fire damage and force a Strength save or restrain the target in fiery shackles for up to a minute, dealing 2d6 fire damage at the start of each of its turns until it saves.",
  },
  {
    name: "Frost Rune",
    summary:
      "Passive: advantage on Animal Handling and Intimidation checks. Invoke as a bonus action, once per rest, for a +2 bonus to Strength and Constitution checks and saves for 10 minutes.",
  },
  {
    name: "Stone Rune",
    summary:
      "Passive: advantage on Insight checks and darkvision to 120 feet. Invoke as a reaction, once per rest, when a creature within 30 feet ends its turn: on a failed Wisdom save it's charmed for a minute, its speed reduced to 0 and it's incapacitated, repeating the save at the end of each of its turns.",
  },
  {
    name: "Hill Rune",
    summary:
      "Requires 7th level. Passive: advantage on saves against poison and resistance to poison damage. Invoke as a bonus action, once per rest, for resistance to bludgeoning, piercing, and slashing damage for 1 minute.",
  },
  {
    name: "Storm Rune",
    summary:
      "Requires 7th level. Passive: advantage on Arcana checks and immunity to being surprised while not incapacitated. Invoke as a bonus action, once per rest, to enter a minute-long prophetic state in which you can use your reaction to impose advantage or disadvantage on an attack roll, save, or ability check made by you or a creature within 60 feet.",
  },
];

// A chosen rune also lands as a feature on the sheet — its title is what the
// once-per-rest invocation pool in `class-pools.ts` (`SUBCLASS_POOLS["Rune
// Knight"]`) gates on via `requiresFeature`, and that pool carries the passive
// advantage rider and the invoke action. The picker still reads `summary`.
export const RUNE_KNIGHT_RUNES: OptionDef[] = RUNE_SUMMARIES.map((rune) => ({
  ...rune,
  features: [{ title: rune.name, detail: rune.summary ?? "" }],
}));

// Monk: Way of the Kensei, "Path of the Kensei" — two kensei weapon types
// chosen at 3rd level (one melee, one ranged), with one more at 6th/11th/17th.
// Eligible types are any simple or martial weapon lacking the heavy and
// special properties, plus the longbow as a named exception. Names match
// `WEAPON_PRESETS` in `weapon-presets.ts` so the two stay in sync; excluded
// there are the heavy martial weapons (Glaive, Greataxe, Greatsword, Halberd,
// Maul, Pike, Heavy Crossbow) and the special-property Lance and Net.
//
// Every option carries a `melee` / `ranged` tag: the group's `tagged` rule uses
// them to make the 3rd-level pair one of each, which is what the feature
// actually says. Thrown melee weapons (Javelin, Spear, Dagger) are tagged
// `melee` — that's the category the feature means, not how you can use them.
export const KENSEI_WEAPONS: OptionDef[] = [
  // Simple melee
  { name: "Club", tag: "melee" },
  { name: "Dagger", tag: "melee" },
  { name: "Greatclub", tag: "melee" },
  { name: "Handaxe", tag: "melee" },
  { name: "Javelin", tag: "melee" },
  { name: "Light Hammer", tag: "melee" },
  { name: "Mace", tag: "melee" },
  { name: "Quarterstaff", tag: "melee" },
  { name: "Sickle", tag: "melee" },
  { name: "Spear", tag: "melee" },
  // Simple ranged
  { name: "Light Crossbow", tag: "ranged" },
  { name: "Dart", tag: "ranged" },
  { name: "Shortbow", tag: "ranged" },
  { name: "Sling", tag: "ranged" },
  // Martial melee
  { name: "Battleaxe", tag: "melee" },
  { name: "Flail", tag: "melee" },
  { name: "Longsword", tag: "melee" },
  { name: "Morningstar", tag: "melee" },
  { name: "Rapier", tag: "melee" },
  { name: "Scimitar", tag: "melee" },
  { name: "Shortsword", tag: "melee" },
  { name: "Trident", tag: "melee" },
  { name: "War Pick", tag: "melee" },
  { name: "Warhammer", tag: "melee" },
  { name: "Whip", tag: "melee" },
  // Martial ranged
  { name: "Blowgun", tag: "ranged" },
  { name: "Hand Crossbow", tag: "ranged" },
  {
    name: "Longbow",
    tag: "ranged",
    summary: "Named exception — allowed despite its heavy property.",
  },
];
