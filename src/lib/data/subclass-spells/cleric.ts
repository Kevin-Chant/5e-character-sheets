import { SubclassSpellTable } from "src/lib/data/subclass-spells/types";

// By-level subclass spell grants for cleric subclasses (see ./types). Spell
// indices only — identifiers into the bundled catalog, no prose.
//
// Level 1 domain spells are already granted inline via `grants.spellIndices`
// in subclasses.ts; only the 3rd/5th/7th/9th-level domain spell tiers live
// here.
export const CLERIC_SUBCLASS_SPELLS: SubclassSpellTable = {
  Knowledge: {
    3: ["augury", "suggestion"],
    5: ["nondetection", "speak-with-dead"],
    7: ["arcane-eye", "confusion"],
    9: ["legend-lore", "scrying"],
  },
  Life: {
    3: ["lesser-restoration", "spiritual-weapon"],
    5: ["beacon-of-hope", "revivify"],
    7: ["death-ward", "guardian-of-faith"],
    9: ["mass-cure-wounds", "raise-dead"],
  },
  Light: {
    3: ["flaming-sphere", "scorching-ray"],
    5: ["daylight", "fireball"],
    7: ["guardian-of-faith", "wall-of-fire"],
    9: ["flame-strike", "scrying"],
  },
  Nature: {
    3: ["barkskin", "spike-growth"],
    5: ["plant-growth", "wind-wall"],
    7: ["dominate-beast"],
    9: ["insect-plague", "tree-stride"],
  },
  Tempest: {
    3: ["gust-of-wind", "shatter"],
    5: ["call-lightning", "sleet-storm"],
    7: ["control-water", "ice-storm"],
    9: ["destructive-wave", "insect-plague"],
  },
  Trickery: {
    3: ["mirror-image", "pass-without-trace"],
    5: ["blink", "dispel-magic"],
    7: ["dimension-door", "polymorph"],
    9: ["dominate-person", "modify-memory"],
  },
  War: {
    3: ["magic-weapon", "spiritual-weapon"],
    5: ["crusaders-mantle", "spirit-guardians"],
    7: ["freedom-of-movement", "stoneskin"],
    9: ["flame-strike", "hold-monster"],
  },
  Death: {
    3: ["blindness-deafness", "ray-of-enfeeblement"],
    5: ["animate-dead", "vampiric-touch"],
    7: ["blight", "death-ward"],
    9: ["antilife-shell", "cloudkill"],
  },
  Forge: {
    3: ["heat-metal", "magic-weapon"],
    5: ["elemental-weapon", "protection-from-energy"],
    7: ["fabricate", "wall-of-fire"],
    9: ["animate-objects", "creation"],
  },
  Grave: {
    3: ["gentle-repose", "ray-of-enfeeblement"],
    5: ["revivify", "vampiric-touch"],
    7: ["blight", "death-ward"],
    9: ["antilife-shell", "raise-dead"],
  },
  Order: {
    3: ["hold-person", "zone-of-truth"],
    5: ["mass-healing-word", "slow"],
    7: ["compulsion", "locate-creature"],
    9: ["commune", "dominate-person"],
  },
  Peace: {
    3: ["aid", "warding-bond"],
    5: ["beacon-of-hope", "sending"],
    7: [],
    9: ["greater-restoration", "telepathic-bond"],
  },
  Twilight: {
    3: ["moonbeam", "see-invisibility"],
    5: ["tiny-hut"],
    7: [],
    9: ["circle-of-power", "mislead"],
  },
  Arcana: {
    3: ["magic-weapon", "arcanists-magic-aura"],
    5: ["dispel-magic", "magic-circle"],
    7: ["arcane-eye", "secret-chest"],
    9: ["planar-binding", "teleportation-circle"],
  },
};
