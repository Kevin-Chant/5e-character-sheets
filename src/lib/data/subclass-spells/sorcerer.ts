import { SubclassSpellTable } from "src/lib/data/subclass-spells/types";

// By-level subclass spell grants for sorcerer subclasses (see ./types). Spell
// indices only — identifiers into the bundled catalog, no prose.
export const SORCERER_SUBCLASS_SPELLS: SubclassSpellTable = {
  "Aberrant Mind": {
    1: ["arms-of-hadar", "dissonant-whispers", "mind-sliver"],
    3: ["calm-emotions", "detect-thoughts"],
    5: ["hunger-of-hadar", "sending"],
    7: ["black-tentacles", "summon-aberration"],
    9: ["telepathic-bond", "telekinesis"],
  },
  // Level 1 (alarm, protection-from-evil-and-good) is already granted inline
  // in subclasses.ts; only the later tiers go here.
  "Clockwork Soul": {
    3: ["aid", "lesser-restoration"],
    5: ["dispel-magic", "protection-from-energy"],
    7: ["freedom-of-movement", "summon-construct"],
    9: ["greater-restoration", "wall-of-force"],
  },
};
