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
import { getSrdClass } from "src/lib/builder/srd-classes";
import { getSrdRace } from "src/lib/builder/srd-races";
import { getSubclassByName } from "src/lib/builder/subclasses";
import { getBackground } from "src/lib/builder/backgrounds";
import { UUID } from "crypto";

// A Charisma-focused Hexadin: nine levels of Paladin for the aura, the smites,
// and heavy armor; three of Hexblade Warlock for a Charisma-powered pact weapon
// and short-rest slots. STR 8 with CHA 20 is the whole build — the pact weapon
// attacks and damages off Charisma, so Strength is free to be the dump stat.
//
// The spells and most of the features below are *not* hand-written prose: they
// are pulled straight from the bundled SRD catalog and class/subclass/race/
// background data via the same helpers the guided builder and "Browse SRD"
// picker use. Editing those sources updates this sheet for free.
const defaultStats = {
  str: 8,
  dex: 14,
  con: 14,
  int: 10,
  wis: 10,
  cha: 20,
};

// Stable class ids, referenced by the spellcasting entries, the spells, and the
// class-level-scaled Lay on Hands pool below.
const paladinId = randomUUID();
const warlockId = randomUUID();

// Formula leaves reused across the sheet.
const cha = StatKey.cha;

// --- Built-in catalog data (the same sources the builder/picker read) --------
const tiefling = getSrdRace("tiefling");
const paladinClass = getSrdClass("paladin");
const warlockClass = getSrdClass("warlock");
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

// A ready-to-edit spell built from the bundled SRD entry, attributed to a class
// — exactly what the "Browse SRD" picker produces (full description, stat line,
// live base-damage roll, and scaling). `prepared` marks a Paladin (prepared
// caster) spell; Warlock spells are "known", so they leave it unset.
const srdSpell = (index: string, classId: UUID, prepared?: boolean) => {
  const spell = buildSpellFromSrd(getSrdSpell(index)!, classId);
  if (prepared) spell.prepared = true;
  return spell;
};

export const defaultCharacter: Character = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  uuid: randomUUID(),
  name: "Vaelith Ashmourn",
  class: [
    {
      id: paladinId,
      name: OfficialClass.Paladin,
      level: 9,
      subclass: "Vengeance",
    },
    {
      id: warlockId,
      name: OfficialClass.Warlock,
      level: 3,
      subclass: "Hexblade",
    },
  ],
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
    savingThrows: { wis: true, cha: true },
    skills: {
      Athletics: true, // proficient, and still only +3 — the STR 8 tax
      Insight: true,
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
    armor: {
      [ArmorType.Light]: true,
      [ArmorType.Medium]: true,
      [ArmorType.Heavy]: true,
      [ArmorType.Shields]: true,
    },
    weapons: ["Simple Weapons", "Martial Weapons"],
    toolsAndOther: [feature({ title: "Gaming Set (Playing Cards)" })],
  },
  // Tiefling: resistance to fire (Hellish Resistance). Divine Health (immunity
  // to disease) lives in the features list, since disease isn't a damage type.
  damageModifiers: {
    resistances: ["Fire"],
    immunities: [],
    vulnerabilities: [],
  },
  // Equipped armor resolves to Plate (18) + the +1 Shield (3) = 21. The two
  // trailing +1s are the Defense fighting style and the Cloak of Protection, so
  // AC reads 23 — and drops the moment you unequip the plate or the shield.
  acFormula: {
    operation: Operation.addition,
    operands: [{ equippedArmor: true }, 1, 1],
  },
  speeds: { walk: 30 },
  senses: { darkvision: 60 },
  maxHp: 97,
  currHp: 97,
  tempHp: 0,
  totalHitDice: { d10: 9, d8: 3 },
  expendedHitDice: {},
  exhaustion: 0,
  deathSaves: { successes: 0, failures: 0 },
  attacks: [
    {
      // The homebrew centerpiece: a sentient greatsword that is also his
      // Hexblade patron. Hex Warrior lets it attack and damage with Charisma;
      // it's a +1 weapon, and it hungers — hence the rider of necrotic damage.
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
      // The mundane backup, kept only to prove a point about the dump stat: a
      // plain javelin, thrown with a Strength of 8, for a heroic 1d6 minus one.
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
          "Holds up to 500 pounds in an extradimensional space. The party's shared storage.",
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
      equipped: true,
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
        title: "Vengeance",
        titleFormulas: [],
        detail: "Those who prey on the weak should be brought to justice.",
        detailFormulas: [],
      },
    ],
    bonds: [
      {
        title: "Sir Aldric, my mentor",
        titleFormulas: [],
        detail:
          "His spirit is bound to Wormwood's steel; I carry his teachings with it.",
        detailFormulas: [],
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
    // Warlock level-1 features, from the SRD class data.
    namedFeature(warlockClass?.features, "Otherworldly Patron"),
    namedFeature(warlockClass?.features, "Pact Magic"),
    // Hexblade's level-1 grant (Hexblade's Curse is tracked below as a
    // limited-use pool, so only Hex Warrior is listed here).
    namedFeature(hexblade?.grants?.features, "Hex Warrior"),
    // Higher-level features the SRD data doesn't model — hand-authored, still
    // fully editable like anything the builder produces.
    {
      title: "Fighting Style: Defense",
      titleFormulas: [],
      detail: "+1 to AC while wearing armor (already folded into your AC).",
      detailFormulas: [],
    },
    {
      title: "Extra Attack",
      titleFormulas: [],
      detail: "You can attack twice whenever you take the Attack action.",
      detailFormulas: [],
    },
    {
      title: "Divine Smite",
      titleFormulas: [],
      detail:
        "When you hit with a melee weapon, expend a spell slot to deal an extra 2d8 radiant damage, +1d8 per slot level above 1st, and an extra 1d8 against fiends and undead.",
      detailFormulas: [],
    },
    {
      title: "Aura of Protection",
      titleFormulas: [],
      detail:
        "You and friendly creatures within 10 feet add +{{}} (your Charisma modifier) to every saving throw.",
      detailFormulas: [cha],
    },
    {
      title: "Oath of Vengeance",
      titleFormulas: [],
      detail:
        "Relentless Avenger, Channel Divinity (Abjure Enemy and Vow of Enmity), and the extended oath spell list.",
      detailFormulas: [],
    },
    {
      title: "Eldritch Invocations",
      titleFormulas: [],
      detail:
        "Agonizing Blast (add your Charisma modifier to Eldritch Blast damage) and Improved Pact Weapon (your pact weapon is a +1 weapon and a spellcasting focus).",
      detailFormulas: [],
    },
    {
      title: "Divine Health",
      titleFormulas: [],
      detail: "You are immune to disease.",
      detailFormulas: [],
    },
    // Background feature (Soldier), from the bundled background data.
    feature(soldier?.feature),
  ],
  spellcastingClasses: [
    // Paladin casts on Charisma at the default DC/attack.
    { classId: paladinId },
    // Warlock also casts on Charisma; the Rod of the Pact Keeper +1 is folded
    // into these overrides (base 8 + PB + CHA and PB + CHA, each plus one).
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
  // Every spell here is produced by `buildSpellFromSrd` from the bundled SRD
  // catalog — same output as the in-app "Browse SRD" picker, including live,
  // recomputing base-damage rolls and upcast scaling (e.g. Branding Smite).
  spells: {
    // key 0 = cantrips; 1–9 = leveled spells.
    0: [
      srdSpell("eldritch-blast", warlockId),
      srdSpell("chill-touch", warlockId),
    ],
    1: [
      srdSpell("divine-favor", paladinId, true),
      srdSpell("bless", paladinId, true),
      srdSpell("hellish-rebuke", warlockId),
      srdSpell("charm-person", warlockId),
    ],
    2: [
      srdSpell("branding-smite", paladinId, true),
      srdSpell("magic-weapon", paladinId, true),
      srdSpell("misty-step", warlockId),
      srdSpell("darkness", warlockId),
    ],
    3: [
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
      // A pool that scales as 5 × Paladin level (45 at level 9) — the canonical
      // `classLevel` formula leaf. Description is the built-in SRD feature text.
      info: feature(
        paladinClass?.features.find((f) => f.title === "Lay on Hands"),
      ),
      maxUses: {
        operation: Operation.multiplication,
        operands: [5, { classLevel: paladinId }],
      },
      recharge: RestType.longRest,
      expended: 0,
    },
    {
      // 1 + Charisma modifier uses — a `cha` leaf resolving to the modifier (+5).
      // Description is the built-in SRD feature text.
      info: feature(
        paladinClass?.features.find((f) => f.title === "Divine Sense"),
      ),
      maxUses: { operation: Operation.addition, operands: [1, cha] },
      recharge: RestType.longRest,
      expended: 0,
    },
    {
      // Hexblade's level-1 grant, tracked as a per-short-rest pool.
      info: feature(
        hexblade?.grants?.features?.find((f) => f.title === "Hexblade's Curse"),
      ),
      maxUses: 1,
      recharge: RestType.shortRest,
      expended: 0,
    },
    {
      info: {
        title: "Channel Divinity: Vow of Enmity",
        titleFormulas: [],
        detail:
          "As a bonus action, mark one creature; you have advantage on attack rolls against it for 1 minute.",
        detailFormulas: [],
      },
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
