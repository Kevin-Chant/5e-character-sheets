import { SubclassSpellTable } from "src/lib/data/subclass-spells/types";

// By-level subclass spell grants for paladin subclasses (see ./types). Spell
// indices only — identifiers into the bundled catalog, no prose.
export const PALADIN_SUBCLASS_SPELLS: SubclassSpellTable = {
  Ancients: {
    3: ["ensnaring-strike", "speak-with-animals"],
    5: ["misty-step", "moonbeam"],
    9: ["plant-growth", "protection-from-energy"],
    13: ["ice-storm", "stoneskin"],
    17: ["commune-with-nature", "tree-stride"],
  },
  Conquest: {
    3: ["armor-of-agathys", "command"],
    5: ["hold-person", "spiritual-weapon"],
    9: ["bestow-curse", "fear"],
    13: ["dominate-beast", "stoneskin"],
    17: ["cloudkill", "dominate-person"],
  },
  Crown: {
    3: ["command", "compelled-duel"],
    5: ["warding-bond", "zone-of-truth"],
    9: ["aura-of-vitality", "spirit-guardians"],
    13: ["banishment", "guardian-of-faith"],
    17: ["circle-of-power", "geas"],
  },
  Glory: {
    3: ["guiding-bolt", "heroism"],
    5: ["enhance-ability", "magic-weapon"],
    9: ["haste", "protection-from-energy"],
    13: ["compulsion", "freedom-of-movement"],
    17: ["commune", "flame-strike"],
  },
  Oathbreaker: {
    3: ["hellish-rebuke", "inflict-wounds"],
    5: ["crown-of-madness", "darkness"],
    9: ["animate-dead", "bestow-curse"],
    13: ["blight", "confusion"],
    17: ["contagion", "dominate-person"],
  },
  Redemption: {
    3: ["sanctuary", "sleep"],
    5: ["calm-emotions", "hold-person"],
    9: ["counterspell", "hypnotic-pattern"],
    13: ["resilient-sphere", "stoneskin"],
    17: ["hold-monster", "wall-of-force"],
  },
  Vengeance: {
    3: ["bane", "hunters-mark"],
    5: ["hold-person", "misty-step"],
    9: ["haste", "protection-from-energy"],
    13: ["banishment", "dimension-door"],
    17: ["hold-monster", "scrying"],
  },
  Watchers: {
    3: ["alarm", "detect-magic"],
    5: ["moonbeam", "see-invisibility"],
    9: ["counterspell", "nondetection"],
    13: ["banishment"],
    17: ["hold-monster", "scrying"],
  },
};
