import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each druid subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const DRUID_SUBCLASS_FEATURES: SubclassFeatureTable = {
  Dreams: {
    2: [
      {
        title: "Balm of the Summer Court",
        detail:
          "A pool of d6s equal to your druid level (refills on a long rest); as a bonus action, spend up to half your druid level of dice on one creature within 120 ft. to heal that total and grant it 1 temporary hit point per die spent.",
      },
    ],
    6: [
      {
        title: "Hearth of Moonlight and Shadow",
        detail:
          "While you rest, raise an invisible 30-ft.-radius dome around your resting spot; you and allies inside gain +5 to Stealth and Perception checks until the rest ends or you leave the dome.",
      },
    ],
    10: [
      {
        title: "Hidden Paths",
        detail:
          "A number of uses per long rest equal to your Wisdom modifier (minimum 1): as a bonus action, teleport yourself up to 60 ft. to an unoccupied space you can see, or as an action, teleport a willing creature you touch up to 30 ft.",
      },
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
      {
        title: "Spirit Totem",
        detail:
          "As a bonus action once per short or long rest, summon a spirit within 60 ft. that fills a 30-ft.-radius aura for 1 minute; choose Bear (allies in the aura gain temporary hit points equal to 5 plus your druid level, and advantage on Strength checks and saves), Hawk (you gain a reaction to grant an ally advantage on one attack against a target in the aura, and everyone inside gains advantage on Wisdom (Perception) checks), or Unicorn (everyone in the aura has advantage on checks to detect creatures there, and your healing spells restore extra hit points to others in the aura equal to your druid level).",
      },
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
      {
        title: "Faithful Summons",
        detail:
          "Once per long rest, if you're reduced to 0 hit points or incapacitated, you immediately and without using a spell slot summon spirits as though you had cast Conjure Animals at 9th level (four beasts of challenge rating 2 or lower), lasting 1 hour without requiring concentration.",
      },
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
      {
        title: "Star Map",
        detail:
          "Your spellcasting focus is a map of the stars; you always know the Guidance cantrip, and Guiding Bolt is always prepared without counting against your prepared spells, castable without a slot a number of times per long rest equal to your proficiency bonus.",
      },
      {
        title: "Starry Form",
        detail:
          "As a bonus action, expend a use of Wild Shape to take on a starry form for 10 minutes instead of transforming into a beast, glowing dimly and choosing one of three stances: Archer (bonus action ranged spell attack, 60 ft., 1d8 + Wisdom modifier radiant damage), Chalice (a healing spell you cast also restores 1d8 + Wisdom modifier hit points to another creature within 30 ft.), or Dragon (treat a roll of 9 or lower as a 10 on Intelligence and Wisdom checks and Constitution saves to maintain concentration).",
      },
    ],
    6: [
      {
        title: "Cosmic Omen",
        detail:
          "After each long rest, roll a die to determine whether you're attuned to Weal (even) or Woe (odd); a number of times per long rest equal to your proficiency bonus, use your reaction to add (Weal) or subtract (Woe) 1d6 from another creature's attack roll, save, or ability check within 30 ft. after seeing the roll but before the outcome is known.",
      },
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
      {
        title: "Cauterizing Flames",
        detail:
          "A number of times per long rest equal to your proficiency bonus, when a Small or larger creature dies within 30 ft. of you or your Wildfire Spirit, a flame lingers in its space for 1 minute; as a reaction when a creature enters that space, deal or restore 2d10 + Wisdom modifier fire damage or hit points to it (your choice of harm or healing).",
      },
    ],
    14: [
      {
        title: "Blazing Revival",
        detail:
          "Once per long rest, if your Wildfire Spirit is within 120 ft. of you when you drop to 0 hit points, you can sacrifice it to regain hit points equal to half your maximum and stand back up.",
      },
    ],
  },
};
