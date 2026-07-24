import { SubclassSpellTable } from "src/lib/data/subclass-spells/types";

// By-level subclass spell grants for warlock subclasses (see ./types). Spell
// indices only — identifiers into the bundled catalog, no prose.
export const WARLOCK_SUBCLASS_SPELLS: SubclassSpellTable = {
  Archfey: {
    1: ["faerie-fire", "sleep"],
    3: ["calm-emotions", "phantasmal-force"],
    5: ["blink", "plant-growth"],
    7: ["dominate-beast", "greater-invisibility"],
    9: ["dominate-person", "seeming"],
  },
  Celestial: {
    1: ["cure-wounds", "guiding-bolt"],
    3: ["flaming-sphere", "lesser-restoration"],
    5: ["daylight", "revivify"],
    7: ["guardian-of-faith", "wall-of-fire"],
    9: ["flame-strike", "greater-restoration"],
  },
  Fathomless: {
    1: ["create-or-destroy-water", "thunderwave"],
    3: ["gust-of-wind", "silence"],
    5: ["lightning-bolt", "sleet-storm"],
    7: ["control-water", "conjure-elemental"],
    9: ["bigbys-hand", "cone-of-cold"],
  },
  Fiend: {
    1: ["burning-hands", "command"],
    3: ["blindness-deafness", "scorching-ray"],
    5: ["fireball", "stinking-cloud"],
    7: ["fire-shield", "wall-of-fire"],
    9: ["flame-strike", "hallow"],
  },
  Genie: {
    1: ["detect-evil-and-good"],
    3: ["phantasmal-force"],
    5: ["create-food-and-water"],
    7: ["phantasmal-killer"],
    9: ["creation", "wish"],
  },
  "Great Old One": {
    1: ["dissonant-whispers", "hideous-laughter"],
    3: ["detect-thoughts", "phantasmal-force"],
    5: ["clairvoyance", "sending"],
    7: ["dominate-beast", "black-tentacles"],
    9: ["dominate-person", "telekinesis"],
  },
  Hexblade: {
    1: ["shield", "wrathful-smite"],
    3: ["blur", "branding-smite"],
    5: ["blink", "elemental-weapon"],
    7: ["phantasmal-killer"],
    9: ["banishing-smite", "cone-of-cold"],
  },
  Undead: {
    1: ["bane", "false-life"],
    3: ["blindness-deafness", "phantasmal-force"],
    5: ["phantom-steed", "speak-with-dead"],
    7: ["death-ward", "greater-invisibility"],
    9: ["antilife-shell", "cloudkill"],
  },
  Undying: {
    1: ["false-life", "ray-of-sickness"],
    3: ["blindness-deafness", "silence"],
    5: ["feign-death", "speak-with-dead"],
    7: ["death-ward"],
    9: ["contagion", "legend-lore"],
  },
};
