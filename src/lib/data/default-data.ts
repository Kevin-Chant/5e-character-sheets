import { Character } from "src/lib/types";
import {
  Alignment,
  DieOperation,
  OfficialClass,
  Operation,
  PB,
  SpellLevel,
  StandardDie,
  StatKey,
} from "./data-definitions";
import { UUID } from "crypto";

const defaultStats = {
  str: 8,
  dex: 14,
  con: 14,
  int: 8,
  wis: 12,
  cha: 18,
};

export const defaultCharacter: Character = {
  uuid: crypto.randomUUID() as UUID,
  name: "Character name here",
  class: [
    { name: OfficialClass.Fighter, level: 2 },
    { name: OfficialClass.Warlock, level: 3, subclass: "Hexblade" },
  ],
  background: "Soldier",
  playerName: "Your Name Here",
  race: "Custom Lineage",
  alignment: Alignment["Lawful Neutral"],
  exp: undefined,
  stats: defaultStats,
  inspiration: 0,
  proficiencies: {
    savingThrows: { str: true, con: true },
    skills: {
      Acrobatics: true,
      Athletics: true,
      Intimidation: true,
      Perception: true,
      Persuasion: true,
    },
    expertise: {},
    isJackOfAllTradesOverride: false,
  },
  otherProficiencies: [
    {
      title: "Languages",
      titleFormulas: [],
      detail: "Just common",
      detailFormulas: [],
    },
  ],
  acFormula: { operation: Operation.addition, operands: [14, StatKey.dex] },
  speed: 30,
  maxHp: undefined,
  currHp: 10,
  tempHp: 0,
  totalHitDice: undefined,
  expendedHitDice: {},
  exhaustion: 0,
  deathSaves: { successes: 0, failures: 0 },
  attacks: [
    {
      name: "Longsword",
      bonus: { operation: Operation.addition, operands: [PB, StatKey.str] },
      formula: {
        Slashing: {
          operation: Operation.addition,
          operands: [[1, StandardDie.d8, DieOperation.roll], StatKey.str],
        },
      },
    },
    {
      name: "Bullshit McHomebrew",
      bonus: {
        operation: Operation.addition,
        operands: [PB, StatKey.con, StatKey.str],
      },
      formula: {
        Slashing: {
          operation: Operation.addition,
          operands: [
            [1, StandardDie.d8, DieOperation.roll],
            [1, StandardDie.d12, DieOperation.roll],
            StatKey.str,
            2,
          ],
        },
        Fire: {
          operation: Operation.addition,
          operands: [[3, StandardDie.d4, DieOperation.roll], StatKey.int],
        },
      },
    },
  ],
  coins: { GP: 5, SP: 3 },
  equipment: [
    {
      title: "Starting gear",
      titleFormulas: [],
      detail: "TODO",
      detailFormulas: [],
    },
  ],
  personality: {
    traits: [
      {
        title: "Boring",
        titleFormulas: [],
        detail: "The default character is as boring as humanly possible",
        detailFormulas: [],
      },
    ],
    ideals: [
      {
        title: "Being filled in",
        titleFormulas: [],
        detail: "The default character really wants to be given more details",
        detailFormulas: [],
      },
    ],
    bonds: [
      {
        title: "You",
        titleFormulas: [],
        detail: "The default character is glad you're using this tool",
        detailFormulas: [],
      },
    ],
    flaws: [
      {
        title: "Not being filled in",
        titleFormulas: [],
        detail: "The default character's only flaw is not being finished yet",
        detailFormulas: [],
      },
    ],
  },
  features: [
    { title: "Darkvision: {{}}ft", titleFormulas: [30] },
    {
      title: "Example ability",
      titleFormulas: [],
      detail: "An example ability that you can use {{}} times per long rest",
      detailFormulas: [{ operation: "minimum", operands: [5, StatKey.str] }],
    },
  ],
  spellcastingClasses: [{ class: OfficialClass.Warlock }],
  spells: {
    cantrips: [
      {
        spellcastingClass: OfficialClass.Warlock,
        info: {
          title: "Eldritch Blast",
          titleFormulas: [],
          detail:
            "A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage. The spell creates more than one beam when you reach higher levels: two beams at 5th level, three beams at 11th level, and four beams at 17th level. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam.",
          detailFormulas: [],
        },
      },
    ],
    [SpellLevel.First]: [],
    [SpellLevel.Second]: [],
    [SpellLevel.Third]: [],
    [SpellLevel.Fourth]: [],
    [SpellLevel.Fifth]: [],
    [SpellLevel.Sixth]: [],
    [SpellLevel.Seventh]: [],
    [SpellLevel.Eighth]: [],
    [SpellLevel.Ninth]: [],
  },
  spellSlots: {
    [SpellLevel.First]: { expended: 0 },
    [SpellLevel.Second]: { expended: 0 },
    [SpellLevel.Third]: { expended: 0 },
    [SpellLevel.Fourth]: { expended: 0 },
    [SpellLevel.Fifth]: { expended: 0 },
    [SpellLevel.Sixth]: { expended: 0 },
    [SpellLevel.Seventh]: { expended: 0 },
    [SpellLevel.Eighth]: { expended: 0 },
    [SpellLevel.Ninth]: { expended: 0 },
  },
  pactSlots: { expended: 0 },
};
