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
import { getSrdSpell } from "src/lib/spells/srd-spells";
import { buildSpellFromSrd } from "src/lib/spells/srd-spell-adapter";
import { getSrdRace } from "src/lib/builder/srd-races";
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

// A Charisma-focused Hexadin: nine levels of Paladin for the aura, the smites,
// and heavy armor; three of Hexblade Warlock for a Charisma-powered pact weapon
// and short-rest slots. STR 8 with CHA 20 is the whole build — the pact weapon
// attacks and damages off Charisma, so Strength is free to be the dump stat.
//
// PROVENANCE. This sheet is the output of the guided builder plus eleven
// level-ups (Paladin 1→9, then multiclassing Warlock 1→3), driven through the
// actual wizard UI — so every choice on it is one a player can make: the race
// and its ability bonuses, the manual-entry stats, Soldier and its skill picks,
// the Defense fighting style, Oath of Vengeance, both ASIs into Charisma,
// Hexblade, Agonizing Blast + Improved Pact Weapon, Pact of the Blade, and
// every spell. Features, pools, and the oath/patron spell grants below are read
// from the same catalog accessors the wizard reads, so editing a catalog
// updates this sheet for free.
//
// Then it was hand-edited the way a player edits a sheet after twelve levels of
// play: magic items and coins the wizard has no step for, a named pact weapon
// as a custom attack, and a half-spent adventuring day (see PLAY STATE below)
// so a first-time visitor can take a short or long rest and watch it work.
const defaultStats = {
  str: 8,
  dex: 14,
  con: 14,
  int: 10,
  wis: 10,
  cha: 20,
};

// Stable class ids, referenced by the spellcasting entries, the spells, and the
// class-level-scaled pools below.
const paladinId = randomUUID();
const warlockId = randomUUID();

// Formula leaves reused across the sheet.
const cha = StatKey.cha;

// --- Built-in catalog data (the same sources the builder/picker read) --------
const tiefling = getSrdRace("tiefling");
const hexblade = getSubclassByName("warlock", "Hexblade");
const soldier = getBackground("Soldier");

// A {title, detail} catalog entry (race trait, class feature, background
// feature) as a sheet `TextComponent`.
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

// Every feature a class and its subclass confer up to `maxLevel`, in level
// order — `classFeaturesAt` + `subclassFeaturesAt` are exactly what the
// level-up wizard grants at each level, so this can't drift from what the
// wizard would produce for the same build.
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

// A ready-to-edit spell built from the bundled catalog entry, attributed to a
// class — exactly what the level-up spell picker and "Browse SRD" produce (full
// description, stat line, live base-damage roll, and scaling). `prepared` marks
// a Paladin spell the character currently has prepared; Warlock spells are
// "known", so they leave it unset.
const srdSpell = (index: string, classId: UUID, prepared?: boolean) => {
  const spell = buildSpellFromSrd(getSrdSpell(index)!, classId);
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

// The Pact Boon pick, with the catalog's own summary as its detail.
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
    inspiration: 1,
    proficiencies: {
      // Saves from Paladin; skills from Soldier (Athletics, Intimidation) plus
      // the two the class step offers (Persuasion, Religion).
      savingThrows: { wis: true, cha: true },
      skills: {
        Athletics: true, // proficient, and still only +3 — the STR 8 tax
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
      // Heavy armor from Paladin; medium and shields also from Hex Warrior.
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
    // Tiefling: resistance to fire (Hellish Resistance). Divine Health (immunity
    // to disease) lives in the features list, since disease isn't a damage type.
    damageModifiers: {
      resistances: ["Fire"],
      immunities: [],
      vulnerabilities: [],
    },
    // Equipped armor resolves to Plate (18) + the +1 Shield (3) = 21. The two
    // trailing +1s are the Defense fighting style (which the wizard folds in
    // itself) and the hand-added Cloak of Protection, so AC reads 23 — and drops
    // the moment you unequip the plate or the shield.
    acFormula: {
      operation: Operation.addition,
      operands: [{ equippedArmor: true }, 1, 1],
    },
    speeds: { walk: 30 },
    senses: { darkvision: 60 },
    // The level-up wizard's derived HP formula: a maxed d10 at Paladin 1, then
    // the average per level for the other eight, plus 3 × average d8 for the
    // Warlock levels — 97 in total, and it re-derives if a level changes.
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
    // Armor of Agathys, still up.
    tempHp: 5,
    totalHitDice: { d10: 9, d8: 3 },
    // Seven of twelve dice spent. A long rest gives back half your *total*
    // (six), so one stays spent — the rule the settings can override.
    expendedHitDice: { d10: 5, d8: 2 },
    exhaustion: 1,
    deathSaves: { successes: 0, failures: 0 },
    attacks: [
      {
        // Hand-added: the homebrew centerpiece, a sentient greatsword that is
        // also his Hexblade patron. Hex Warrior lets it attack and damage with
        // Charisma; Improved Pact Weapon makes it a +1 weapon, and it hungers —
        // hence the rider of necrotic damage. There is no attack step in the
        // wizard, so this is the kind of thing you add on the sheet.
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
        // Straight from the equipment step, and kept only to prove a point about
        // the dump stat: a plain javelin, thrown with a Strength of 8, for a
        // heroic 1d6 minus one.
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
    // Hand-edited: the wizard's Soldier package starts you with 10 gp.
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
    // One line each, as typed into the wizard's finishing-details step.
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
      // Racial traits (Tiefling), straight from the bundled SRD race data.
      namedFeature(tiefling?.traits, "Darkvision"),
      namedFeature(tiefling?.traits, "Hellish Resistance"),
      namedFeature(tiefling?.traits, "Infernal Legacy"),
      // Background feature (Soldier), from the bundled background data.
      feature(soldier?.feature),
      // Paladin 1–9 and the Oath of Vengeance's own features (Oath Spells at 3,
      // Relentless Avenger at 7) — read from the level tables, not retyped.
      ...featuresFor(OfficialClass.Paladin, 9, "Vengeance"),
      fightingStyle("Defense"),
      // Warlock 1–3 and the Hexblade's (Expanded Spell List, Pact Boon).
      ...featuresFor(OfficialClass.Warlock, 3, "Hexblade"),
      // The Hexblade's choice-level grants. Hexblade's Curse is deliberately
      // skipped: it lands below as a limited-use pool, and listing it here too
      // would show it twice.
      namedFeature(hexblade?.grants?.features, "Hex Warrior"),
      invocation("Agonizing Blast"),
      invocation("Improved Pact Weapon"),
    ],
    spellcastingClasses: [
      // Paladin casts on Charisma at the default DC/attack.
      { classId: paladinId },
      // Warlock also casts on Charisma; the hand-added Rod of the Pact Keeper +1
      // is folded into these overrides (base 8 + PB + CHA and PB + CHA, +1 each).
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
    // Exactly the spells the wizard ended up with: the ones picked in each
    // level-up's spell step, plus the ones the subclasses grant on their own —
    // Bane and Hunter's Mark (oath, 3rd), Hold Person and Misty Step (oath,
    // 5th), Haste and Protection from Energy (oath, 9th), and Shield, Wrathful
    // Smite and Blur from the Hexblade's expanded list.
    spells: {
      // key 0 = cantrips; 1–9 = leveled spells.
      0: [
        srdSpell("eldritch-blast", warlockId),
        srdSpell("booming-blade", warlockId),
      ],
      1: [
        srdSpell("bless", paladinId, true),
        srdSpell("divine-favor", paladinId, true),
        srdSpell("cure-wounds", paladinId, true),
        srdSpell("shield-of-faith", paladinId),
        srdSpell("bane", paladinId),
        srdSpell("hunters-mark", paladinId),
        srdSpell("shield", warlockId),
        srdSpell("wrathful-smite", warlockId),
        srdSpell("hellish-rebuke", warlockId),
        srdSpell("armor-of-agathys", warlockId),
        srdSpell("hex", warlockId),
      ],
      2: [
        srdSpell("hold-person", paladinId),
        srdSpell("misty-step", paladinId),
        srdSpell("branding-smite", paladinId, true),
        srdSpell("magic-weapon", paladinId),
        srdSpell("blur", warlockId),
        srdSpell("darkness", warlockId),
      ],
      3: [
        srdSpell("haste", paladinId),
        srdSpell("protection-from-energy", paladinId),
        srdSpell("revivify", paladinId, true),
        srdSpell("dispel-magic", paladinId, true),
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
    // Both pact slots spent — a short rest brings these back, a long rest isn't
    // needed.
    pactSlots: { expended: 2 },
    // Filled in below by `syncClassPools`.
    limitedUseAbilities: [],
    chosenOptions: [pactOfTheBlade],
  };

  // The pools the classes and subclasses confer — Divine Sense, Lay on Hands,
  // Channel Divinity and Hexblade's Curse, plus the two Channel Divinity option
  // hosts that spend from that shared pool. Generated by the same function the
  // level-up wizard calls, so their sizes, recharges and mechanics re-derive
  // from `class-pools.ts` instead of being frozen here.
  character.class.forEach((klass) => syncClassPools(character, klass));

  // PLAY STATE — pools part-spent. Channel Divinity and Hexblade's Curse both
  // recharge on a short rest; the other two need a long one.
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

// A blank ability seeded into the modal draft when the user adds a new entry,
// so the editor has a target; it's only persisted to the character on save.
export const newLimitedUseAbility = (): LimitedUseAbility => ({
  info: { title: "New ability", titleFormulas: [] },
  maxUses: 1,
  recharge: RestType.longRest,
  expended: 0,
});
