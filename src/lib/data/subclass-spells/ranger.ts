import { SubclassSpellTable } from "src/lib/data/subclass-spells/types";

// By-level subclass spell grants for ranger subclasses (see ./types). Spell
// indices only — identifiers into the bundled catalog, no prose.
export const RANGER_SUBCLASS_SPELLS: SubclassSpellTable = {
  "Gloom Stalker": {
    3: ["disguise-self"],
    5: ["rope-trick"],
    9: ["fear"],
    13: ["greater-invisibility"],
    17: ["seeming"],
  },
  "Horizon Walker": {
    3: ["protection-from-evil-and-good"],
    5: ["misty-step"],
    9: ["haste"],
    13: ["banishment"],
    17: ["teleportation-circle"],
  },
  // The 11th-level entry is Fey Reinforcements, not the archetype table — it
  // grants Summon Fey on the same terms, so it rides along here.
  "Fey Wanderer": {
    3: ["charm-person"],
    5: ["misty-step"],
    9: ["dispel-magic"],
    11: ["summon-fey"],
    13: ["dimension-door"],
    17: ["mislead"],
  },
  // No archetype spell table; Draconic Gift hands out one cantrip at 3rd.
  Drakewarden: {
    3: ["thaumaturgy"],
  },
  Swarmkeeper: {
    3: ["faerie-fire", "mage-hand"],
    5: ["web"],
    9: ["gaseous-form"],
    13: ["arcane-eye"],
    17: ["insect-plague"],
  },
  "Monster Slayer": {
    3: ["protection-from-evil-and-good"],
    5: ["zone-of-truth"],
    9: ["magic-circle"],
    13: ["banishment"],
    17: ["hold-monster"],
  },
};
