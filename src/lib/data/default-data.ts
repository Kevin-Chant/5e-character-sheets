import { Character } from "src/lib/types";
import {
  Alignment,
  DieOperation,
  OfficialClass,
  Operation,
  PB,
  StandardDie,
  StatKey,
} from "./data-definitions";

const defaultStats = {
  str: 16,
  dex: 9,
  con: 15,
  int: 11,
  wis: 14,
  cha: 13,
};

export const defaultCharacter: Character = {
  name: "Character name here",
  class: [
    { name: OfficialClass.Fighter, level: 2 },
    { name: OfficialClass.Warlock, level: 3, subclass: "Fiend" },
  ],
  background: "Soldier",
  playerName: "Your Name Here",
  race: "Human",
  alignment: Alignment["Lawful Neutral"],
  exp: 0,
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
  },
  otherProficiencies: [{ title: "Languages", detail: "Just common" }],
  acFormula: { operation: Operation.addition, operands: [14, StatKey.dex] },
  speed: 30,
  maxHp: {
    operation: Operation.addition,
    operands: [
      [1, StandardDie.d10, DieOperation.max],
      StatKey.con,
      {
        operation: Operation.multiplication,
        operands: [
          {
            operation: Operation.subtraction,
            operand1: OfficialClass.Fighter,
            operand2: 1,
          },
          {
            operation: Operation.addition,
            operands: [
              [1, StandardDie.d10, DieOperation["average-roundedup"]],
              StatKey.con,
            ],
          },
        ],
      },
      {
        operation: Operation.multiplication,
        operands: [
          OfficialClass.Warlock,
          {
            operation: Operation.addition,
            operands: [
              [1, StandardDie.d8, DieOperation["average-roundedup"]],
              StatKey.con,
            ],
          },
        ],
      },
    ],
  },
  currHp: 10,
  tempHp: 0,
  hitDice: {
    d10: { total: 1, expended: 0 },
  },
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
  equipment: [{ title: "Starting gear", detail: "TODO" }],
  personality: {
    traits: [
      {
        title: "Boring",
        detail: "The default character is as boring as humanly possible",
      },
    ],
    ideals: [
      {
        title: "Being filled in",
        detail: "The default character really wants to be given more details",
      },
    ],
    bonds: [
      {
        title: "You",
        detail: "The default character is glad you're using this tool",
      },
    ],
    flaws: [
      {
        title: "Not being filled in",
        detail: "The default character's only flaw is not being finished yet",
      },
    ],
  },
  features: [{ title: "Darkvision: {{30}}ft" }],
};
