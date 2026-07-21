import { Character, LimitedUseAbility } from "src/lib/types";
import {
  Alignment,
  DieOperation,
  ArmorType,
  OfficialClass,
  Operation,
  PB,
  RestType,
  Size,
  StandardDie,
  StatKey,
} from "./data-definitions";
import { randomUUID } from "src/lib/browser";
import { CURRENT_SCHEMA_VERSION } from "src/lib/migrations/version";

const defaultStats = {
  str: 8,
  dex: 14,
  con: 14,
  int: 8,
  wis: 12,
  cha: 18,
};

// Stable class ids, referenced by the spellcasting entry, the demo spell, and
// the class-level-scaled limited-use pool below.
const fighterId = randomUUID();
const warlockId = randomUUID();

export const defaultCharacter: Character = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  uuid: randomUUID(),
  name: "Character name here",
  class: [
    { id: fighterId, name: OfficialClass.Fighter, level: 2 },
    {
      id: warlockId,
      name: OfficialClass.Warlock,
      level: 3,
      subclass: "Hexblade",
    },
  ],
  background: "Soldier",
  playerName: "Your Name Here",
  race: {
    name: "Custom Lineage",
    size: Size.Medium,
  },
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
    skillBonuses: {},
  },
  otherProficiencies: {
    languages: ["Common", "Infernal"],
    armor: {
      [ArmorType.Light]: true,
      [ArmorType.Medium]: true,
      [ArmorType.Heavy]: true,
      [ArmorType.Shields]: true,
    },
    weapons: ["Simple Weapons", "Martial Weapons"],
    toolsAndOther: [
      {
        title: "Smith's Tools",
        titleFormulas: [],
        detail: "",
        detailFormulas: [],
      },
    ],
  },
  damageModifiers: { resistances: [], immunities: [], vulnerabilities: [] },
  acFormula: { operation: Operation.addition, operands: [14, StatKey.dex] },
  speeds: { walk: 30 },
  senses: { darkvision: 60 },
  maxHp: undefined,
  currHp: 10,
  tempHp: 0,
  totalHitDice: undefined,
  expendedHitDice: {},
  exhaustion: 0,
  deathSaves: { successes: 0, failures: 0 },
  attacks: [
    {
      id: randomUUID(),
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
      id: randomUUID(),
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
  ammunition: [],
  coins: { GP: 5, SP: 3 },
  equipment: [
    {
      title: "Starting gear",
      titleFormulas: [],
      detail: "What your character starts with",
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
    {
      title: "Example ability",
      titleFormulas: [],
      detail: "An example ability that you can use {{}} times per long rest",
      detailFormulas: [
        {
          operation: "maximum",
          operands: [1, { operation: "minimum", operands: [5, StatKey.str] }],
        },
      ],
    },
  ],
  spellcastingClasses: [{ classId: warlockId }],
  spells: {
    // key 0 = cantrips; 1–9 = leveled spells.
    0: [
      {
        spellcastingClass: warlockId,
        castingTime: "1 action",
        range: "120 feet",
        duration: "Instantaneous",
        components: { verbal: true, somatic: true },
        info: {
          title: "Eldritch Blast",
          titleFormulas: [],
          detail:
            "A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage. The spell creates more than one beam when you reach higher levels: two beams at 5th level, three beams at 11th level, and four beams at 17th level. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam.",
          detailFormulas: [],
        },
      },
    ],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
    8: [],
    9: [],
  },
  spellSlots: {
    1: { expended: 0 },
    2: { expended: 0 },
    3: { expended: 0 },
    4: { expended: 0 },
    5: { expended: 0 },
    6: { expended: 0 },
    7: { expended: 0 },
    8: { expended: 0 },
    9: { expended: 0 },
  },
  pactSlots: { expended: 0 },
  limitedUseAbilities: [
    {
      // A scaling pool whose max uses equal the character's level in a class
      // (here the Warlock entry) — demonstrates a `classLevel` formula leaf.
      info: {
        title: "Sorcery Points",
        titleFormulas: [],
        detail: "Spend to create spell slots or fuel Metamagic.",
        detailFormulas: [],
      },
      maxUses: { classLevel: warlockId },
      recharge: RestType.longRest,
      expended: 0,
    },
    {
      info: { title: "Blessing of the Raven Queen", titleFormulas: [] },
      maxUses: 1,
      recharge: RestType.shortRest,
      expended: 0,
    },
  ],
};

// A blank ability seeded into the modal draft when the user adds a new entry,
// so the editor has a target; it's only persisted to the character on save.
export const newLimitedUseAbility = (): LimitedUseAbility => ({
  info: { title: "New ability", titleFormulas: [] },
  maxUses: 1,
  recharge: RestType.longRest,
  expended: 0,
});
