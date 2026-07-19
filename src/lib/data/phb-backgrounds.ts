import { SkillName } from "src/lib/data/data-definitions";

// The standard Player's Handbook backgrounds, reduced to the mechanical facts
// the guided builder needs. Only game mechanics (which are not copyrightable)
// are stored here; the `feature.detail` strings are original short summaries of
// each feature's benefit, not the published flavour text.
//
// A background grants two fixed skill proficiencies plus a mix of tool
// proficiencies, extra languages, starting equipment, and a feature. Tool
// grants that are player choices ("one type of artisan's tools") are kept as
// free-form label strings, since we don't model the full tool taxonomy.

export interface Background {
  name: string;
  skills: [SkillName, SkillName];
  // Free-form tool proficiency labels (may describe a choice).
  tools: string[];
  // Number of additional languages of the player's choice.
  languages: number;
  // Starting equipment lines (added to the sheet as equipment entries).
  equipment: string[];
  // Starting coin, in gold pieces.
  gold: number;
  feature: { title: string; detail: string };
}

export const PHB_BACKGROUNDS: Background[] = [
  {
    name: "Acolyte",
    skills: [SkillName.Insight, SkillName.Religion],
    tools: [],
    languages: 2,
    equipment: [
      "Holy symbol",
      "Prayer book or prayer wheel",
      "5 sticks of incense",
      "Vestments",
      "Common clothes",
    ],
    gold: 15,
    feature: {
      title: "Shelter of the Faithful",
      detail:
        "You and your companions can expect free healing and care at temples of your faith, and the priests there will support you (though not fund you) as one of their own.",
    },
  },
  {
    name: "Charlatan",
    skills: [SkillName.Deception, SkillName["Sleight of Hand"]],
    tools: ["Disguise kit", "Forgery kit"],
    languages: 0,
    equipment: [
      "Fine clothes",
      "Disguise kit",
      "Tools of your chosen con (e.g. weighted dice, marked cards, signet ring)",
    ],
    gold: 15,
    feature: {
      title: "False Identity",
      detail:
        "You have a second, documented identity, and you can forge papers and imitate handwriting well enough to pass casual scrutiny.",
    },
  },
  {
    name: "Criminal",
    skills: [SkillName.Deception, SkillName.Stealth],
    tools: ["One type of gaming set", "Thieves' tools"],
    languages: 0,
    equipment: ["Crowbar", "Dark common clothes with a hood"],
    gold: 15,
    feature: {
      title: "Criminal Contact",
      detail:
        "You have a reliable contact in the criminal underworld who can relay messages for you and connect you to a network of other criminals.",
    },
  },
  {
    name: "Entertainer",
    skills: [SkillName.Acrobatics, SkillName.Performance],
    tools: ["Disguise kit", "One type of musical instrument"],
    languages: 0,
    equipment: [
      "A musical instrument",
      "The favor of an admirer (love letter, lock of hair, or trinket)",
      "Costume",
    ],
    gold: 15,
    feature: {
      title: "By Popular Demand",
      detail:
        "You can always find a place to perform, earning modest lodging and food, and locals tend to know and welcome you.",
    },
  },
  {
    name: "Folk Hero",
    skills: [SkillName["Animal Handling"], SkillName.Survival],
    tools: ["One type of artisan's tools", "Vehicles (land)"],
    languages: 0,
    equipment: [
      "A set of artisan's tools",
      "Shovel",
      "Iron pot",
      "Common clothes",
    ],
    gold: 10,
    feature: {
      title: "Rustic Hospitality",
      detail:
        "Common folk will shelter and hide you (unless you've shown yourself a danger), sharing what they have to help you recover or evade pursuit.",
    },
  },
  {
    name: "Guild Artisan",
    skills: [SkillName.Insight, SkillName.Persuasion],
    tools: ["One type of artisan's tools"],
    languages: 1,
    equipment: [
      "A set of artisan's tools",
      "Letter of introduction from your guild",
      "Traveler's clothes",
    ],
    gold: 15,
    feature: {
      title: "Guild Membership",
      detail:
        "Your guild provides lodging and food when needed, political influence, and the aid of fellow members — in exchange for monthly dues.",
    },
  },
  {
    name: "Hermit",
    skills: [SkillName.Medicine, SkillName.Religion],
    tools: ["Herbalism kit"],
    languages: 1,
    equipment: [
      "Scroll case of notes from your studies or prayers",
      "Winter blanket",
      "Common clothes",
      "Herbalism kit",
    ],
    gold: 5,
    feature: {
      title: "Discovery",
      detail:
        "Your seclusion granted a unique and powerful discovery — a great truth, a hidden location, or a forgotten secret — that shapes your goals.",
    },
  },
  {
    name: "Noble",
    skills: [SkillName.History, SkillName.Persuasion],
    tools: ["One type of gaming set"],
    languages: 1,
    equipment: ["Fine clothes", "Signet ring", "Scroll of pedigree"],
    gold: 25,
    feature: {
      title: "Position of Privilege",
      detail:
        "Commoners defer to you and the powerful treat you as a peer, so you can secure audiences, lodging among the elite, and the benefit of the doubt.",
    },
  },
  {
    name: "Outlander",
    skills: [SkillName.Athletics, SkillName.Survival],
    tools: ["One type of musical instrument"],
    languages: 1,
    equipment: [
      "Staff",
      "Hunting trap",
      "A trophy from an animal you killed",
      "Traveler's clothes",
    ],
    gold: 10,
    feature: {
      title: "Wanderer",
      detail:
        "You have an excellent memory for geography and can always recall the lay of the land; you can also find food and fresh water for yourself and up to five others each day in the wild.",
    },
  },
  {
    name: "Sage",
    skills: [SkillName.Arcana, SkillName.History],
    tools: [],
    languages: 2,
    equipment: [
      "Bottle of ink and a quill",
      "Small knife",
      "A letter from a dead colleague posing an unanswered question",
      "Common clothes",
    ],
    gold: 10,
    feature: {
      title: "Researcher",
      detail:
        "When you don't know something, you usually know where and from whom to learn it — a library, a sage, or another knowledgeable source.",
    },
  },
  {
    name: "Sailor",
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
      title: "Ship's Passage",
      detail:
        "You can secure free passage on a sailing ship for yourself and your companions, repaying the fare with shipboard labor.",
    },
  },
  {
    name: "Soldier",
    skills: [SkillName.Athletics, SkillName.Intimidation],
    tools: ["One type of gaming set", "Vehicles (land)"],
    languages: 0,
    equipment: [
      "Insignia of rank",
      "A trophy taken from a fallen enemy",
      "A gaming set",
      "Common clothes",
    ],
    gold: 10,
    feature: {
      title: "Military Rank",
      detail:
        "Soldiers loyal to your former organization recognize your rank and defer to it, and you can invoke it for access to friendly encampments and supplies.",
    },
  },
  {
    name: "Urchin",
    skills: [SkillName["Sleight of Hand"], SkillName.Stealth],
    tools: ["Disguise kit", "Thieves' tools"],
    languages: 0,
    equipment: [
      "Small knife",
      "Map of the city you grew up in",
      "A pet mouse",
      "A token to remember your parents",
      "Common clothes",
    ],
    gold: 10,
    feature: {
      title: "City Secrets",
      detail:
        "You know the secret patterns and flow of cities and can find passages through the urban sprawl, moving twice as fast between locations as normal.",
    },
  },
];
