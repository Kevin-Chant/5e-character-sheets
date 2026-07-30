import { GroupedOptionsList, SingleOptionsList } from "src/lib/types";
import { DamageType } from "./data-definitions";
import { ALL_BACKGROUNDS } from "src/lib/builder/backgrounds";

// Typeahead/suggestion lists for free-text fields. These are suggestions only —
// every consumer also accepts arbitrary custom values.

// The standard damage types, suggested for damage resistances / immunities /
// vulnerabilities. Custom entries (e.g. "nonmagical B/P/S") are still accepted.
export const DEFAULT_DAMAGE_TYPES: SingleOptionsList<string> =
  Object.values(DamageType);

export const DEFAULT_LANGUAGES: GroupedOptionsList<string> = [
  {
    label: "Standard Languages",
    options: [
      "Common",
      "Dwarvish",
      "Elvish",
      "Giant",
      "Gnomish",
      "Goblin",
      "Halfling",
      "Orc",
    ],
  },
  {
    label: "Exotic Languages",
    options: [
      "Abyssal",
      "Celestial",
      "Deep Speech",
      "Draconic",
      "Infernal",
      "Primordial",
      "Sylvan",
      "Undercommon",
    ],
  },
];

// The standard tool proficiencies, for the fields that ask for one in prose
// ("one type of artisan's tools") rather than from a class's closed list. The
// sheet doesn't model a tool taxonomy — these are labels, and a custom entry
// is as valid as any of them.
export const DEFAULT_TOOLS: GroupedOptionsList<string> = [
  {
    label: "Artisan's Tools",
    options: [
      "Alchemist's supplies",
      "Brewer's supplies",
      "Calligrapher's supplies",
      "Carpenter's tools",
      "Cartographer's tools",
      "Cobbler's tools",
      "Cook's utensils",
      "Glassblower's tools",
      "Jeweler's tools",
      "Leatherworker's tools",
      "Mason's tools",
      "Painter's supplies",
      "Potter's tools",
      "Smith's tools",
      "Tinker's tools",
      "Weaver's tools",
      "Woodcarver's tools",
    ],
  },
  {
    label: "Gaming Sets",
    options: [
      "Dice set",
      "Dragonchess set",
      "Playing card set",
      "Three-Dragon Ante set",
    ],
  },
  {
    label: "Musical Instruments",
    options: [
      "Bagpipes",
      "Drum",
      "Dulcimer",
      "Flute",
      "Horn",
      "Lute",
      "Lyre",
      "Pan flute",
      "Shawm",
      "Viol",
    ],
  },
  {
    label: "Kits & Vehicles",
    options: [
      "Disguise kit",
      "Forgery kit",
      "Herbalism kit",
      "Navigator's tools",
      "Poisoner's kit",
      "Thieves' tools",
      "Vehicles (land)",
      "Vehicles (water)",
    ],
  },
];

// Suggestions for the sheet's free-text background field. Read off the same
// catalog the builder offers, so a background added there can't go missing
// here — this list used to be a hand-kept copy of the PHB thirteen.
export const DEFAULT_BACKGROUNDS: SingleOptionsList<string> =
  ALL_BACKGROUNDS.map((b) => b.name);

export const DEFAULT_RACES: SingleOptionsList<string> = [
  "Dragonborn",
  "Dwarf",
  "Elf",
  "Gnome",
  "Half-Elf",
  "Half-Orc",
  "Halfling",
  "Human",
  "Tiefling",
];

export const DEFAULT_SPELL_RANGES: SingleOptionsList<string> = [
  "Self",
  "Touch",
  "5 feet",
  "10 feet",
  "30 feet",
  "60 feet",
  "90 feet",
  "120 feet",
  "150 feet",
  "300 feet",
  "500 feet",
  "1 mile",
  "Sight",
  "Unlimited",
  "Special",
];

export const DEFAULT_SPELL_DURATIONS: SingleOptionsList<string> = [
  "Instantaneous",
  "1 round",
  "1 minute",
  "10 minutes",
  "1 hour",
  "8 hours",
  "24 hours",
  "7 days",
  "Until dispelled",
  "Concentration, up to 1 minute",
  "Concentration, up to 10 minutes",
  "Concentration, up to 1 hour",
  "Concentration, up to 8 hours",
  "Special",
];
