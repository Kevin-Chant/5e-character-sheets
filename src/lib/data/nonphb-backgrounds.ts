import { SkillName } from "src/lib/data/data-definitions";
import { Background } from "src/lib/data/phb-backgrounds";

// Backgrounds beyond the Player's Handbook's thirteen — the Sword Coast
// Adventurer's Guide set, the two from Tomb of Annihilation that everyone
// reaches for, Curse of Strahd's Haunted One, and the two PHB variants whose
// *feature* differs from their parent (Knight and Pirate; the other variants
// only change the flavour, so listing them would add cards that do nothing).
//
// Same licensing rule as `nonsrd-races.ts` and `subclasses.ts`: mechanical
// facts only, with original one-line summaries of each feature's benefit.
// Never published prose.

export const NON_PHB_BACKGROUNDS: Background[] = [
  {
    name: "Anthropologist",
    source: "ToA",
    skills: [SkillName.Insight, SkillName.Religion],
    tools: [],
    languages: 2,
    equipment: [
      "Leather-bound diary",
      "Bottle of ink",
      "Ink pen",
      "Traveler's clothes",
      "A trinket from a people you studied",
    ],
    gold: 10,
    feature: {
      title: "Adept Linguist",
      detail:
        "You can communicate simple ideas with humanoids who don't speak a language you know, given an hour and a willing listener.",
    },
  },
  {
    name: "Archaeologist",
    source: "ToA",
    skills: [SkillName.History, SkillName.Survival],
    tools: ["Cartographer's tools or navigator's tools"],
    languages: 1,
    equipment: [
      "Wooden case with a map to a ruin or dungeon",
      "Bullseye lantern",
      "Miner's pick",
      "Shovel",
      "Two-person tent",
      "Traveler's clothes",
      "A trinket from a dig site",
    ],
    gold: 25,
    feature: {
      title: "Historical Knowledge",
      detail:
        "Given a day in a ruin, you can work out its original purpose and roughly when it was built.",
    },
  },
  {
    name: "City Watch",
    source: "SCAG",
    skills: [SkillName.Athletics, SkillName.Insight],
    tools: [],
    languages: 2,
    equipment: [
      "Uniform in your organization's style",
      "Horn to summon help",
      "Set of manacles",
      "Common clothes",
    ],
    gold: 10,
    feature: {
      title: "Watcher's Eye",
      detail:
        "In any city you can quickly find the local watch house, criminal dens, and seedy taverns.",
    },
  },
  {
    name: "Clan Crafter",
    source: "SCAG",
    skills: [SkillName.History, SkillName.Insight],
    tools: ["One type of artisan's tools"],
    languages: 1,
    equipment: [
      "Artisan's tools of your chosen craft",
      "Maker's mark chisel",
      "Traveler's clothes",
      "Gem worth 10 gp",
    ],
    gold: 5,
    feature: {
      title: "Respect of the Stout Folk",
      detail:
        "Dwarves offer you free room and board, and dwarven commoners treat you as a minor celebrity.",
    },
  },
  {
    name: "Cloistered Scholar",
    source: "SCAG",
    skills: [SkillName.History],
    skillChoices: {
      choose: 1,
      from: [SkillName.Arcana, SkillName.Nature, SkillName.Religion],
    },
    tools: [],
    languages: 2,
    equipment: [
      "Scholar's robes",
      "Writing kit",
      "Borrowed book on the subject of your study",
    ],
    gold: 10,
    feature: {
      title: "Library Access",
      detail:
        "You have free access to your cloister's library and its scholars, and can usually get into other libraries on their word.",
    },
  },
  {
    name: "Courtier",
    source: "SCAG",
    skills: [SkillName.Insight, SkillName.Persuasion],
    tools: [],
    languages: 2,
    equipment: ["Fine clothes"],
    gold: 5,
    feature: {
      title: "Court Functionary",
      detail:
        "You know how a bureaucracy runs, so you can get an audience with an official and learn what a government body is currently occupied with.",
    },
  },
  {
    name: "Faction Agent",
    source: "SCAG",
    skills: [SkillName.Insight],
    skillChoices: {
      choose: 1,
      from: [
        SkillName.Arcana,
        SkillName["Animal Handling"],
        SkillName.Deception,
        SkillName.History,
        SkillName.Intimidation,
        SkillName.Investigation,
        SkillName.Medicine,
        SkillName.Nature,
        SkillName.Perception,
        SkillName.Performance,
        SkillName.Persuasion,
        SkillName.Religion,
        SkillName.Survival,
      ],
    },
    tools: [],
    languages: 2,
    equipment: [
      "Badge or emblem of your faction",
      "A faction book, scroll, or pamphlet",
      "Common clothes",
    ],
    gold: 15,
    feature: {
      title: "Safe Haven",
      detail:
        "Your faction's safe houses give you shelter, healing, and answers to questions its agents can answer.",
    },
  },
  {
    name: "Far Traveler",
    source: "SCAG",
    skills: [SkillName.Insight, SkillName.Perception],
    tools: ["One musical instrument or gaming set"],
    languages: 1,
    equipment: [
      "Musical instrument or gaming set of your choice",
      "Poor maps of your homeland",
      "A piece of jewelry worth 10 gp",
      "Traveler's clothes",
    ],
    gold: 5,
    feature: {
      title: "All Eyes on You",
      detail:
        "Your foreignness draws attention wherever you go — locals offer food, lodging, and questions in exchange for stories of home.",
    },
  },
  {
    name: "Haunted One",
    source: "CoS",
    skills: [],
    skillChoices: {
      choose: 2,
      from: [
        SkillName.Arcana,
        SkillName.Investigation,
        SkillName.Religion,
        SkillName.Survival,
      ],
    },
    tools: [],
    // Two exotic languages, or Deep Speech.
    languages: 2,
    equipment: [
      "Monster hunter's pack",
      "One trinket of dread",
      "Common clothes",
    ],
    gold: 0,
    feature: {
      title: "Heart of Darkness",
      detail:
        "Commoners sense the darkness you carry and what you mean to do about it, and will help you fight it even at risk to themselves.",
    },
  },
  {
    name: "Inheritor",
    source: "SCAG",
    skills: [SkillName.Survival],
    skillChoices: {
      choose: 1,
      from: [SkillName.Arcana, SkillName.History, SkillName.Religion],
    },
    tools: ["One gaming set or musical instrument"],
    languages: 1,
    equipment: [
      "Your inheritance",
      "Gaming set or musical instrument of your choice",
      "Traveler's clothes",
    ],
    gold: 15,
    feature: {
      title: "Inheritance",
      detail:
        "You hold an object left to you whose full significance you don't yet know, and people connected to it seek you out.",
    },
  },
  {
    name: "Knight",
    source: "PHB (Noble variant)",
    skills: [SkillName.History, SkillName.Persuasion],
    tools: ["One type of gaming set"],
    languages: 1,
    equipment: [
      "Fine clothes",
      "Signet ring",
      "Scroll of pedigree",
      "Emblem of the person or ideal you serve",
    ],
    gold: 25,
    feature: {
      title: "Retainers",
      detail:
        "Three commoner retainers serve you — a servant and two others of your choosing — loyal but not combatants.",
    },
  },
  {
    name: "Knight of the Order",
    source: "SCAG",
    skills: [SkillName.Persuasion],
    skillChoices: {
      choose: 1,
      from: [
        SkillName.Arcana,
        SkillName.History,
        SkillName.Nature,
        SkillName.Religion,
      ],
    },
    tools: ["One gaming set or musical instrument"],
    languages: 1,
    equipment: [
      "Traveler's clothes",
      "Signet, banner, or seal of your order",
      "Gaming set or musical instrument of your choice",
    ],
    gold: 10,
    feature: {
      title: "Knightly Regard",
      detail:
        "Your order's members and its allies will shelter you, and will help you when the cause doesn't cost them dearly.",
    },
  },
  {
    name: "Mercenary Veteran",
    source: "SCAG",
    skills: [SkillName.Athletics, SkillName.Persuasion],
    tools: ["One type of gaming set", "Vehicles (land)"],
    languages: 0,
    equipment: [
      "Uniform of your company",
      "Insignia of rank",
      "Gaming set of your choice",
      "Common clothes",
    ],
    gold: 10,
    feature: {
      title: "Mercenary Life",
      detail:
        "You know how companies operate: you can identify one by its sigil and find mercenary work for yourself or others.",
    },
  },
  {
    name: "Pirate",
    source: "PHB (Sailor variant)",
    skills: [SkillName.Athletics, SkillName.Perception],
    tools: ["Navigator's tools", "Vehicles (water)"],
    languages: 0,
    equipment: [
      "Belaying pin (club)",
      "50 feet of silk rope",
      "Lucky charm",
      "Common clothes",
    ],
    gold: 10,
    feature: {
      title: "Bad Reputation",
      detail:
        "People in a settlement fear you enough that you can get away with minor criminal acts without being reported.",
    },
  },
  {
    name: "Urban Bounty Hunter",
    source: "SCAG",
    skills: [],
    skillChoices: {
      choose: 2,
      from: [
        SkillName.Deception,
        SkillName.Insight,
        SkillName.Persuasion,
        SkillName.Stealth,
      ],
    },
    tools: ["Two of: thieves' tools, a gaming set, a musical instrument"],
    languages: 0,
    equipment: ["Clothes appropriate to your duties"],
    gold: 20,
    feature: {
      title: "Ear to the Ground",
      detail:
        "You're on friendly terms with the people who trade in information in a city, and can get word to or from them quickly.",
    },
  },
  {
    name: "Uthgardt Tribe Member",
    source: "SCAG",
    skills: [SkillName.Athletics, SkillName.Survival],
    tools: ["One musical instrument or artisan's tools"],
    languages: 1,
    equipment: [
      "Hunting trap",
      "Trophy from an animal you killed",
      "Totemic token or set of tattoos",
      "Traveler's clothes",
    ],
    gold: 10,
    feature: {
      title: "Uthgardt Heritage",
      detail:
        "You can find twice as much food and water foraging in the wild, and your tribe's allies shelter you.",
    },
  },
  {
    name: "Waterdhavian Noble",
    source: "SCAG",
    skills: [SkillName.History, SkillName.Persuasion],
    tools: ["One gaming set or musical instrument"],
    languages: 1,
    equipment: [
      "Fine clothes",
      "Signet ring",
      "Scroll of pedigree",
      "Skin of fine wine",
    ],
    gold: 20,
    feature: {
      title: "Kept in Style",
      detail:
        "Your family covers your living expenses, worth about 20 gp a month, as long as you stay in their good graces.",
    },
  },
];
