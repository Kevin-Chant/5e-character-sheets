import { Character, LimitedUseAbility, TextComponent } from "src/lib/types";
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
import { getCatalogSpell } from "src/lib/spells/spell-catalog";
import { buildSpellFromCatalog } from "src/lib/spells/spell-adapter";
import { getCatalogRace } from "src/lib/builder/race-catalog";
import {
  getSubclassByName,
  subclassFeaturesAt,
} from "src/lib/builder/subclasses";
import { getBackground } from "src/lib/builder/backgrounds";
import {
  classFeaturesAt,
  ELDRITCH_INVOCATIONS,
  getFightingStyle,
} from "src/lib/builder/class-features";
import { syncClassPools } from "src/lib/builder/class-pools";
import { optionGroup } from "src/lib/builder/chosen-options";
import { UUID } from "crypto";

// Sample sheet: a Charisma Hexadin (Paladin 9 / Hexblade Warlock 3), STR 8 / CHA
// 20 since the pact weapon attacks and damages off Charisma. Built via the
// guided builder + level-up wizard, so features/pools/spells are read from the
// same catalog accessors the wizard uses. Hand-edited afterward for magic items,
// the named pact weapon attack, and a half-spent adventuring day (PLAY STATE
// below) so a first-time visitor can try a rest.
const defaultStats = {
  str: 8,
  dex: 14,
  con: 14,
  int: 10,
  wis: 10,
  cha: 20,
};

const paladinId = randomUUID();
const warlockId = randomUUID();

const cha = StatKey.cha;

const tiefling = getCatalogRace("tiefling");
const hexblade = getSubclassByName("warlock", "Hexblade");
const soldier = getBackground("Soldier");

// Converts a {title, detail} catalog entry to a sheet `TextComponent`.
const feature = (f?: { title: string; detail?: string }): TextComponent =>
  f?.detail
    ? {
        title: f.title,
        titleFormulas: [],
        detail: f.detail,
        detailFormulas: [],
      }
    : { title: f?.title ?? "", titleFormulas: [] };

const namedFeature = (
  features: { title: string; detail?: string }[] | undefined,
  title: string,
): TextComponent => feature(features?.find((f) => f.title === title));

// All features a class + subclass confer up to `maxLevel`, via the same
// accessors the level-up wizard uses.
const featuresFor = (
  className: OfficialClass,
  maxLevel: number,
  subclass: string,
): TextComponent[] => {
  const out: TextComponent[] = [];
  for (let level = 1; level <= maxLevel; level++) {
    classFeaturesAt(className, level).forEach((f) => out.push(feature(f)));
    subclassFeaturesAt(className.toLowerCase(), subclass, level).forEach((f) =>
      out.push(feature(f)),
    );
  }
  return out;
};

const fightingStyle = (name: string): TextComponent => {
  const style = getFightingStyle(name);
  return feature(
    style ? { title: style.name, detail: style.summary } : { title: name },
  );
};

const invocation = (name: string): TextComponent => {
  const inv = ELDRITCH_INVOCATIONS.find((i) => i.name === name);
  return feature(
    inv ? { title: inv.name, detail: inv.summary } : { title: name },
  );
};

// A ready-to-edit spell built from the bundled catalog, attributed to a class.
// `prepared` marks a currently-prepared Paladin spell; Warlock spells are
// "known" and leave it unset.
const catalogSpell = (index: string, classId: UUID, prepared?: boolean) => {
  const spell = buildSpellFromCatalog(getCatalogSpell(index)!, classId);
  if (prepared) spell.prepared = true;
  return spell;
};

const paladinClassEntry = {
  id: paladinId,
  name: OfficialClass.Paladin,
  level: 9,
  subclass: "Vengeance",
};
const warlockClassEntry = {
  id: warlockId,
  name: OfficialClass.Warlock,
  level: 3,
  subclass: "Hexblade",
};

const pactOfTheBlade = (() => {
  const group = optionGroup("pactBoon");
  const pick = group?.options.find((o) => o.name === "Pact of the Blade");
  return {
    category: "pactBoon",
    name: "Pact of the Blade",
    detail: pick?.summary,
  };
})();

function buildDefaultCharacter(): Character {
  const character: Character = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    uuid: randomUUID(),
    name: "Vaelith Ashmourn",
    class: [paladinClassEntry, warlockClassEntry],
    background: "Soldier",
    playerName: "The Forever DM",
    race: {
      name: "Tiefling",
      size: Size.Medium,
    },
    alignment: Alignment["Lawful Neutral"],
    exp: undefined,
    stats: defaultStats,
    inspiration: false,
    proficiencies: {
      // Saves from Paladin; skills from Soldier (Athletics, Intimidation) plus
      // the class step's Persuasion, Religion.
      savingThrows: { wis: true, cha: true },
      skills: {
        Athletics: true,
        Intimidation: true,
        Persuasion: true,
        Religion: true,
      },
      expertise: {},
      isJackOfAllTradesOverride: false,
      skillBonuses: {},
    },
    otherProficiencies: {
      languages: ["Common", "Infernal"],
      // Heavy armor from Paladin; medium/shields also from Hex Warrior.
      armor: {
        [ArmorType.Light]: true,
        [ArmorType.Medium]: true,
        [ArmorType.Heavy]: true,
        [ArmorType.Shields]: true,
      },
      weapons: ["Simple Weapons", "Martial Weapons"],
      toolsAndOther: [
        feature({ title: "One type of gaming set" }),
        feature({ title: "Vehicles (land)" }),
      ],
    },
    // Tiefling resistance to fire (Hellish Resistance). Divine Health (disease
    // immunity) lives in the features list since disease isn't a damage type.
    damageModifiers: {
      resistances: ["Fire"],
      immunities: [],
      vulnerabilities: [],
    },
    // Plate (18) + Shield +1 (3) = 21, plus Defense fighting style and the
    // Cloak of Protection (+1 each) = 23; drops if plate/shield are unequipped.
    acFormula: {
      operation: Operation.addition,
      operands: [{ equippedArmor: true }, 1, 1],
    },
    speeds: { walk: 30 },
    senses: { darkvision: 60 },
    // Maxed d10 at Paladin 1, average per level thereafter, plus 3 × average
    // d8 for Warlock levels — 97 total, re-derives if level changes.
    maxHp: {
      operation: Operation.addition,
      operands: [
        {
          operation: Operation.addition,
          operands: [
            [1, StandardDie.d10, DieOperation.max],
            StatKey.con,
            {
              operation: Operation.multiplication,
              operands: [
                {
                  operation: Operation.addition,
                  operands: [
                    [1, StandardDie.d10, DieOperation["average-roundedup"]],
                    StatKey.con,
                  ],
                },
                {
                  operation: Operation.subtraction,
                  operand1: { classLevel: paladinId },
                  operand2: 1,
                },
              ],
            },
          ],
        },
        {
          operation: Operation.multiplication,
          operands: [
            { classLevel: warlockId },
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
    // PLAY STATE — mid-adventuring-day, so a rest has something to do.
    currHp: 48,
    tempHp: 5, // Armor of Agathys, still up.
    totalHitDice: { d10: 9, d8: 3 },
    // Seven of twelve spent; a long rest gives back half of total (six), so
    // one stays spent.
    expendedHitDice: { d10: 5, d8: 2 },
    exhaustion: 1,
    deathSaves: { successes: 0, failures: 0 },
    attacks: [
      {
        // Hand-added: sentient greatsword and Hexblade patron. Hex Warrior lets
        // it attack/damage with Charisma; Improved Pact Weapon makes it +1; the
        // necrotic rider is its hunger. No attack step in the wizard for this.
        id: randomUUID(),
        name: "Wormwood, the Last Argument",
        bonus: { operation: Operation.addition, operands: [PB, cha, 1] },
        formula: {
          Slashing: {
            operation: Operation.addition,
            operands: [[2, StandardDie.d6, DieOperation.roll], cha, 1],
          },
          Necrotic: {
            operation: Operation.addition,
            operands: [[1, StandardDie.d6, DieOperation.roll]],
          },
        },
      },
      {
        // From the equipment step: a javelin, thrown with STR 8.
        id: randomUUID(),
        name: "Javelin",
        bonus: {
          operation: Operation.addition,
          operands: [PB, StatKey.str],
        },
        formula: {
          Piercing: {
            operation: Operation.addition,
            operands: [[1, StandardDie.d6, DieOperation.roll], StatKey.str],
          },
        },
        range: { normal: 30, long: 120 },
        tags: ["melee", "thrown"],
      },
    ],
    ammunition: [],
    coins: { PP: 4, GP: 340, SP: 12 },
    equipment: [
      {
        id: randomUUID(),
        text: { title: "Plate Armor", titleFormulas: [] },
        quantity: 1,
        weight: 65,
        equipped: true,
        armor: { base: 18, category: "heavy", dex: "none" },
      },
      {
        id: randomUUID(),
        text: { title: "Shield, +1", titleFormulas: [] },
        quantity: 1,
        weight: 6,
        equipped: true,
        shield: { bonus: 3 },
      },
      {
        id: randomUUID(),
        text: {
          title: "Wormwood, the Last Argument",
          titleFormulas: [],
          detail:
            "A sentient greatsword and his Hexblade patron, said to carry the spirit of the mentor who forged it. Serves as his pact weapon and spellcasting focus.",
          detailFormulas: [],
        },
        quantity: 1,
        weight: 6,
        equippable: true,
        equipped: true,
        attunement: { attuned: true },
      },
      {
        id: randomUUID(),
        text: {
          title: "Cloak of Protection",
          titleFormulas: [],
          detail: "+1 to AC and saving throws (already folded into your AC).",
          detailFormulas: [],
        },
        quantity: 1,
        weight: 1,
        equippable: true,
        equipped: true,
        attunement: { attuned: true },
      },
      {
        id: randomUUID(),
        text: {
          title: "Rod of the Pact Keeper, +1",
          titleFormulas: [],
          detail:
            "+1 to Warlock spell attack rolls and save DC (already folded in). Recover one expended pact slot, once per long rest.",
          detailFormulas: [],
        },
        quantity: 1,
        weight: 2,
        equippable: true,
        equipped: true,
        attunement: { attuned: true },
      },
      {
        id: randomUUID(),
        text: {
          title: "Potion of Healing",
          titleFormulas: [],
          detail: "Restores 2d4 + 2 hit points as a bonus action.",
          detailFormulas: [],
        },
        quantity: 3,
        weight: 0.5,
        equipped: false,
      },
      {
        id: randomUUID(),
        text: {
          title: "Bag of Holding",
          titleFormulas: [],
          detail:
            "Holds up to 500 pounds in an extradimensional space. The party's shared storage — the priest's pack lives in here, which is why it isn't weighing him down.",
          detailFormulas: [],
        },
        quantity: 1,
        weight: 15,
        equipped: false,
      },
      {
        id: randomUUID(),
        text: { title: "Holy Symbol", titleFormulas: [] },
        quantity: 1,
        weight: 1,
        equippable: true,
        equipped: true,
      },
      {
        id: randomUUID(),
        text: { title: "Javelin", titleFormulas: [] },
        quantity: 5,
        weight: 2,
        equipped: false,
      },
      {
        id: randomUUID(),
        text: { title: "Insignia of Rank", titleFormulas: [] },
        quantity: 1,
        weight: 0,
        equipped: false,
      },
    ],
    personality: {
      traits: [
        {
          title: "Slow to trust, but I don't leave people behind.",
          titleFormulas: [],
        },
        {
          title: "My weapon speaks, and I answer it.",
          titleFormulas: [],
        },
      ],
      ideals: [
        {
          title: "Those who prey on the weak should be brought to justice.",
          titleFormulas: [],
        },
      ],
      bonds: [
        {
          title:
            "His spirit is bound to Wormwood's steel; I carry his teachings with it.",
          titleFormulas: [],
        },
      ],
      flaws: [
        {
          title: "I reach for vengeance more readily than mercy.",
          titleFormulas: [],
        },
      ],
    },
    features: [
      // Racial traits (Tiefling), from the bundled SRD race data.
      namedFeature(tiefling?.traits, "Darkvision"),
      namedFeature(tiefling?.traits, "Hellish Resistance"),
      namedFeature(tiefling?.traits, "Infernal Legacy"),
      feature(soldier?.feature),
      // Paladin 1–9 + Oath of Vengeance features, read from the level tables.
      ...featuresFor(OfficialClass.Paladin, 9, "Vengeance"),
      fightingStyle("Defense"),
      ...featuresFor(OfficialClass.Warlock, 3, "Hexblade"),
      // Hexblade's Curse is skipped here; it's listed below as a pool instead.
      namedFeature(hexblade?.grants?.features, "Hex Warrior"),
      invocation("Agonizing Blast"),
      invocation("Improved Pact Weapon"),
    ],
    spellcastingClasses: [
      { classId: paladinId },
      // Rod of the Pact Keeper +1 folded into these overrides.
      {
        classId: warlockId,
        saveDcOverride: {
          operation: Operation.addition,
          operands: [8, PB, cha, 1],
        },
        attackBonusOverride: {
          operation: Operation.addition,
          operands: [PB, cha, 1],
        },
      },
    ],
    spells: {
      // key 0 = cantrips; 1–9 = leveled spells.
      0: [
        catalogSpell("eldritch-blast", warlockId),
        catalogSpell("booming-blade", warlockId),
      ],
      1: [
        catalogSpell("bless", paladinId, true),
        catalogSpell("divine-favor", paladinId, true),
        catalogSpell("cure-wounds", paladinId, true),
        catalogSpell("shield-of-faith", paladinId),
        catalogSpell("bane", paladinId),
        catalogSpell("hunters-mark", paladinId),
        catalogSpell("shield", warlockId),
        catalogSpell("wrathful-smite", warlockId),
        catalogSpell("hellish-rebuke", warlockId),
        catalogSpell("armor-of-agathys", warlockId),
        catalogSpell("hex", warlockId),
      ],
      2: [
        catalogSpell("hold-person", paladinId),
        catalogSpell("misty-step", paladinId),
        catalogSpell("branding-smite", paladinId, true),
        catalogSpell("magic-weapon", paladinId),
        catalogSpell("blur", warlockId),
        catalogSpell("darkness", warlockId),
      ],
      3: [
        catalogSpell("haste", paladinId),
        catalogSpell("protection-from-energy", paladinId),
        catalogSpell("revivify", paladinId, true),
        catalogSpell("dispel-magic", paladinId, true),
      ],
      4: [],
      5: [],
      6: [],
      7: [],
      8: [],
      9: [],
    },
    // PLAY STATE — most of the day's slots are gone.
    spellSlots: {
      1: { expended: 3 },
      2: { expended: 3 },
      3: { expended: 1 },
      4: { expended: 0 },
      5: { expended: 0 },
      6: { expended: 0 },
      7: { expended: 0 },
      8: { expended: 0 },
      9: { expended: 0 },
    },
    pactSlots: { expended: 2 },
    limitedUseAbilities: [], // filled in below by syncClassPools
    chosenOptions: [pactOfTheBlade],
  };

  // Divine Sense, Lay on Hands, Channel Divinity, Hexblade's Curse, and the
  // Channel Divinity option hosts, generated via the same function the
  // level-up wizard uses so sizes/recharges re-derive from class-pools.ts.
  character.class.forEach((klass) => syncClassPools(character, klass));

  // PLAY STATE — pools part-spent.
  const spend = (title: string, uses: number) => {
    const pool = character.limitedUseAbilities.find(
      (a) => a.info.title === title,
    );
    if (pool) pool.expended = uses;
  };
  spend("Lay on Hands", 25);
  spend("Divine Sense", 3);
  spend("Channel Divinity", 1);
  spend("Hexblade's Curse", 1);

  return character;
}

export const defaultCharacter: Character = buildDefaultCharacter();

// Blank ability seeded into the modal draft for a new entry; persisted only on save.
export const newLimitedUseAbility = (): LimitedUseAbility => ({
  info: { title: "New ability", titleFormulas: [] },
  maxUses: 1,
  recharge: RestType.longRest,
  expended: 0,
});
