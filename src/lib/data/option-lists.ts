import { GroupedOptionsList, SingleOptionsList } from "src/lib/types";

// Typeahead/suggestion lists for free-text fields. These are suggestions only —
// every consumer also accepts arbitrary custom values.

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

export const DEFAULT_BACKGROUNDS: SingleOptionsList<string> = [
  "Acolyte",
  "Charlatan",
  "Criminal",
  "Entertainer",
  "Folk Hero",
  "Guild Artisan",
  "Hermit",
  "Noble",
  "Outlander",
  "Sage",
  "Sailor",
  "Soldier",
  "Urchin",
];

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
