import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each druid subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const DRUID_SUBCLASS_FEATURES: SubclassFeatureTable = {
  Dreams: {
    2: [
      // Balm of the Summer Court is a limited-use pool — see SUBCLASS_POOLS["Dreams"].
    ],
    6: [
      {
        title: "Hearth of Moonlight and Shadow",
        detail:
          "While you rest, raise an invisible 30-ft.-radius dome around your resting spot; you and allies inside gain +5 to Stealth and Perception checks until the rest ends or you leave the dome.",
      },
    ],
    10: [
      // Hidden Paths is a limited-use pool — see SUBCLASS_POOLS["Dreams"].
    ],
    14: [
      {
        title: "Walker in Dreams",
        detail:
          "Once per long rest, after finishing a short rest, cast Dream, Scrying, or a special Teleportation Circle linked to your last long-rest site, using no spell slot or material components.",
      },
    ],
  },
  Land: {
    3: [
      {
        title: "Circle Spells",
        detail:
          "At 3rd, 5th, 7th, and 9th level your chosen terrain grants always-prepared spells that don't count against your prepared total — Arctic: hold person, spike growth (3), sleet storm, slow (5), freedom of movement, ice storm (7), commune with nature, cone of cold (9); Coast: mirror image, misty step (3), water breathing, water walk (5), control water, freedom of movement (7), conjure elemental, scrying (9); Desert: blur, silence (3), create food and water, protection from energy (5), blight, hallucinatory terrain (7), insect plague, wall of stone (9); Forest: barkskin, spider climb (3), call lightning, plant growth (5), divination, freedom of movement (7), commune with nature, tree stride (9); Grassland: invisibility, pass without trace (3), daylight, haste (5), divination, freedom of movement (7), dream, insect plague (9); Mountain: spider climb, spike growth (3), lightning bolt, meld into stone (5), stone shape, stoneskin (7), passwall, wall of stone (9); Swamp: darkness, acid arrow (3), water walk, stinking cloud (5), freedom of movement, locate creature (7), insect plague, scrying (9); Underdark: spider climb, web (3), gaseous form, stinking cloud (5), greater invisibility, stone shape (7), cloudkill, insect plague (9).",
      },
    ],
    6: [
      {
        title: "Land's Stride",
        detail:
          "Moving through nonmagical difficult terrain costs no extra movement, and you can move through nonmagical plants that are thorned, overgrown, or similarly hazardous without taking damage from them; you also have advantage on saves against plants that are magically created or manipulated to impede movement.",
      },
    ],
    10: [
      {
        title: "Nature's Ward",
        detail:
          "You can't be charmed or frightened by elementals or fey, and you're immune to poison and disease.",
      },
    ],
    14: [
      {
        title: "Nature's Sanctuary",
        detail:
          "A beast or plant creature that attacks you must succeed on a Wisdom save (your spellcasting save DC) or choose a different target, or lose the attack if there's no other option; a creature that succeeds is immune to this effect for 24 hours.",
      },
    ],
  },
  Moon: {
    2: [
      {
        title: "Combat Wild Shape",
        detail:
          "Wild Shape becomes a bonus action instead of an action; while transformed, you can also use a bonus action and expend a spell slot to heal 1d8 hit points per level of the slot.",
      },
      {
        title: "Circle Forms",
        detail:
          "Wild Shape lets you transform into a beast with a challenge rating as high as 1 (no longer limited by the normal maximum CR table for your level).",
      },
    ],
    6: [
      {
        title: "Primal Strike",
        detail:
          "Your attacks in beast form count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks and damage.",
      },
      {
        title: "Circle Forms",
        detail:
          "The maximum challenge rating for your Wild Shape beast form rises to your druid level divided by 3, rounded down.",
      },
    ],
    10: [
      {
        title: "Elemental Wild Shape",
        detail:
          "Expend two uses of Wild Shape at once to transform into an air, earth, fire, or water elemental instead of a beast.",
      },
    ],
    14: [
      {
        title: "Thousand Forms",
        detail: "Cast Alter Self at will, without expending a spell slot.",
      },
    ],
  },
  Shepherd: {
    2: [
      {
        title: "Speech of the Woods",
        detail:
          "Learn Sylvan, and beasts can understand your speech, though you must succeed on a Wisdom (Animal Handling) check to communicate more than simple concepts; you can also decipher animal sounds and gestures.",
      },
      // Spirit Totem is a limited-use pool — see SUBCLASS_POOLS["Shepherd"].
    ],
    6: [
      {
        title: "Mighty Summoner",
        detail:
          "Beasts and fey you summon or create gain 2 extra hit points per Hit Die, and their natural weapons count as magical for overcoming resistance and immunity to nonmagical attacks.",
      },
    ],
    10: [
      {
        title: "Guardian Spirit",
        detail:
          "Beasts and fey under your control that end a turn within your Spirit Totem's aura regain hit points equal to half your druid level.",
      },
    ],
    14: [
      // Faithful Summons is a limited-use pool — see SUBCLASS_POOLS["Shepherd"].
    ],
  },
  Spores: {
    2: [
      // Halo of Spores is granted as a pool-less action host by SUBCLASS_POOLS,
      // not as prose here — listing it in both would show it twice.
      {
        title: "Symbiotic Entity",
        detail:
          "Expend a use of Wild Shape to gain temporary hit points equal to 4 times your druid level for 10 minutes (ending early if the temporary hit points run out or you Wild Shape again); while active, Halo of Spores damage is rolled twice (take the higher) and your melee weapon attacks deal an extra 1d6 necrotic damage.",
      },
    ],
    6: [
      {
        title: "Fungal Infestation",
        detail:
          "A number of times per long rest equal to your Wisdom modifier (minimum 1), when a Small or Medium beast or humanoid dies within 10 ft. of you, use your reaction to animate its corpse as a zombie-like minion with 1 hit point for 1 hour.",
      },
    ],
    10: [
      {
        title: "Spreading Spores",
        detail:
          "As a bonus action while Symbiotic Entity is active, hurl spores to fill a 10-ft. cube within 30 ft. for 1 minute; a creature that enters the area or starts its turn there takes Halo of Spores damage on a failed Constitution save (once per turn), and your Halo of Spores reaction is disabled while the cube persists.",
      },
    ],
    14: [
      {
        title: "Fungal Body",
        detail:
          "You're immune to being blinded, deafened, frightened, or poisoned; a critical hit against you counts as a normal hit unless the attacker is incapacitated.",
      },
    ],
  },
  Stars: {
    2: [
      // Star Map is a limited-use pool — see SUBCLASS_POOLS["Stars"].
      {
        title: "Starry Form",
        detail:
          "As a bonus action, expend a use of Wild Shape to take on a starry form for 10 minutes instead of transforming into a beast, glowing dimly and choosing one of three stances: Archer (bonus action ranged spell attack, 60 ft., 1d8 + Wisdom modifier radiant damage), Chalice (a healing spell you cast also restores 1d8 + Wisdom modifier hit points to another creature within 30 ft.), or Dragon (treat a roll of 9 or lower as a 10 on Intelligence and Wisdom checks and Constitution saves to maintain concentration).",
      },
    ],
    6: [
      // Cosmic Omen is a limited-use pool — see SUBCLASS_POOLS["Stars"].
    ],
    10: [
      {
        title: "Twinkling Constellations",
        detail:
          "Your Starry Form stances improve: Archer's and Chalice's dice rise to 2d8, and Dragon grants a 20-ft. flying speed with the ability to hover; you can also switch which stance you're in at the start of each of your turns while the form lasts.",
      },
    ],
    14: [
      {
        title: "Full of Stars",
        detail:
          "While in Starry Form, you have resistance to bludgeoning, piercing, and slashing damage.",
      },
    ],
  },
  Wildfire: {
    2: [
      {
        title: "Circle Spells",
        detail:
          "At 2nd, 3rd, 5th, 7th, and 9th level you gain always-prepared spells that don't count against your prepared total: burning hands, cure wounds (2); flaming sphere, scorching ray (3); plant growth, revivify (5); aura of life, fire shield (7); flame strike, mass cure wounds (9).",
      },
      {
        title: "Summon Wildfire Spirit",
        detail:
          "Expend a use of Wild Shape to summon a Wildfire Spirit within 30 ft. instead of transforming; each creature within 10 ft. of the space where it appears takes 2d6 fire damage on a failed Dexterity save (half on a success). The spirit fights at your side for 1 hour with its own statistics.",
      },
    ],
    6: [
      {
        title: "Enhanced Bond",
        detail:
          "While your Wildfire Spirit is present, whenever you cast a spell that deals fire damage or restores hit points, roll a d8 and add it to one damage or healing roll of that spell; you can also cast your spells as though standing in the spirit's space.",
      },
    ],
    10: [
      // Cauterizing Flames is a limited-use pool — see SUBCLASS_POOLS["Wildfire"].
    ],
    14: [
      // Blazing Revival is a limited-use pool — see SUBCLASS_POOLS["Wildfire"].
    ],
  },
};
