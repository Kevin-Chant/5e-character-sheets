import { SubclassSpellTable } from "src/lib/data/subclass-spells/types";

// By-level subclass spell grants for artificer subclasses (see ./types). Spell
// indices only — identifiers into the bundled catalog, no prose.
export const ARTIFICER_SUBCLASS_SPELLS: SubclassSpellTable = {
  Alchemist: {
    3: ["healing-word", "ray-of-sickness"],
    5: ["flaming-sphere", "acid-arrow"],
    9: ["gaseous-form", "mass-healing-word"],
    13: ["blight", "death-ward"],
    17: ["cloudkill", "raise-dead"],
  },
  Armorer: {
    3: ["magic-missile", "thunderwave"],
    5: ["mirror-image", "shatter"],
    9: ["hypnotic-pattern", "lightning-bolt"],
    13: ["fire-shield", "greater-invisibility"],
    17: ["passwall", "wall-of-force"],
  },
  Artillerist: {
    3: ["shield", "thunderwave"],
    5: ["scorching-ray", "shatter"],
    9: ["fireball", "wind-wall"],
    13: ["ice-storm", "wall-of-fire"],
    17: ["cone-of-cold", "wall-of-force"],
  },
  "Battle Smith": {
    3: ["heroism", "shield"],
    5: ["branding-smite", "warding-bond"],
    9: ["aura-of-vitality", "conjure-barrage"],
    13: ["fire-shield"],
    17: ["banishing-smite", "mass-cure-wounds"],
  },
};
