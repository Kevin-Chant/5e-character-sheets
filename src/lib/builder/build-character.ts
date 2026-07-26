import { uniq, uniqBy } from "lodash";
import {
  Alignment,
  ArmorType,
  DamageType,
  DieOperation,
  DRACONIC_ANCESTRIES,
  LEVELED_SPELL_LEVELS,
  Operation,
  RestType,
  Size,
  StandardDie,
  StatKey,
  OfficialClass,
} from "src/lib/data/data-definitions";
import { randomUUID } from "src/lib/browser";
import { UUID } from "crypto";
import { modifier } from "src/lib/rules";
import {
  Attack,
  Character,
  CustomFormulaWithDamage,
  EquipmentItem,
  HitDice,
  isTextComponentWithDetail,
  Spell,
  Spells,
  SpellSlots,
  TextComponent,
} from "src/lib/types";
import { CURRENT_SCHEMA_VERSION } from "src/lib/migrations/version";
import { defaultCharacter } from "src/lib/data/default-data";
import { BuilderState, CUSTOM_SUBRACE } from "src/lib/builder/types";
import { syncMartialArts } from "src/lib/builder/class-features";

import { syncRacePools } from "src/lib/builder/class-pools";
import {
  applyClassLevel,
  applyRaceOptions,
} from "src/lib/builder/level-grants";
import {
  getSrdRace,
  getSubrace,
  raceGrantsFeat,
} from "src/lib/builder/srd-races";
import { applyFeat, getFeat } from "src/lib/builder/feats";

import { resolveFinalStats } from "src/lib/builder/resolve";
import { castsAtLevelOne, getSrdClass } from "src/lib/builder/srd-classes";
import { getBackground } from "src/lib/builder/backgrounds";
import { resolveClassLoadout } from "src/lib/builder/equipment";
import { splitItemCount, weightForItem } from "src/lib/data/equipment-weights";
import { getSrdSpell } from "src/lib/spells/srd-spells";
import { buildSpellFromSrd } from "src/lib/spells/srd-spell-adapter";

const DIE_BY_FACES: Record<number, StandardDie> = {
  4: StandardDie.d4,
  6: StandardDie.d6,
  8: StandardDie.d8,
  10: StandardDie.d10,
  12: StandardDie.d12,
};

// Map an SRD race's free-text size label ("Medium", "Small") onto the Size enum,
// defaulting to Medium for anything unrecognized (homebrew, missing data).
const sizeFromLabel = (label?: string): Size =>
  (Object.values(Size) as string[]).includes(label ?? "")
    ? (label as Size)
    : Size.Medium;

// Damage resistances certain racial traits confer, keyed by normalized trait
// title — so Hellish Resistance lands as a structured Fire resistance, not
// just prose. Dragonborn's Damage Resistance is ancestry-dependent and stays
// prose-only (the sheet doesn't model the ancestry choice yet).
// A few resistance traits name the damage type only in the feature title, not
// the prose the generic scanner reads — keep an explicit map for those.
const TRAIT_RESISTANCES: Record<string, DamageType[]> = {
  "hellish resistance": [DamageType.Fire],
  "dwarven resilience": [DamageType.Poison],
  "stout resilience": [DamageType.Poison],
  "celestial resistance": [DamageType.Necrotic, DamageType.Radiant],
};

// Damage words → DamageType, for scanning trait prose ("resistance to cold
// damage", "immunity to poison").
const DAMAGE_BY_WORD = new Map<string, DamageType>(
  Object.values(DamageType).map((dt) => [String(dt).toLowerCase(), dt]),
);

// Pull damage types out of a trait's sentences that mention `keyword`
// (resistan… / immun…). Sentence-scoped so an unrelated damage word elsewhere
// in the trait isn't swept in.
const damageTypesForKeyword = (
  traits: TextComponent[],
  keyword: RegExp,
): DamageType[] => {
  const out: DamageType[] = [];
  const add = (dt: DamageType) => {
    if (!out.includes(dt)) out.push(dt);
  };
  for (const t of traits) {
    const detail = isTextComponentWithDetail(t) ? t.detail : "";
    for (const sentence of `${t.title}. ${detail}`.split(/[.;]/)) {
      if (!keyword.test(sentence)) continue;
      for (const [word, dt] of DAMAGE_BY_WORD)
        if (new RegExp(`\\b${word}\\b`, "i").test(sentence)) add(dt);
    }
  }
  return out;
};

const resistancesFromTraits = (traits: TextComponent[]): DamageType[] => {
  const out: DamageType[] = [];
  const add = (dt: DamageType) => {
    if (!out.includes(dt)) out.push(dt);
  };
  for (const t of traits)
    for (const dt of TRAIT_RESISTANCES[t.title.trim().toLowerCase()] ?? [])
      add(dt);
  for (const dt of damageTypesForKeyword(traits, /resistan/i)) add(dt);
  return out;
};

const immunitiesFromTraits = (traits: TextComponent[]): DamageType[] =>
  damageTypesForKeyword(traits, /immun/i);

// Pull a darkvision range out of a race's traits. SRD traits title the feature
// "Darkvision" and put the range in the detail prose ("…within 60 feet…"), so
// scan both; a darkvision trait with no explicit number defaults to 60 (the
// standard range). Undefined when the race grants no darkvision at all.
const darkvisionFromTraits = (traits: TextComponent[]): number | undefined => {
  for (const t of traits) {
    const text = `${t.title} ${isTextComponentWithDetail(t) ? t.detail : ""}`;
    if (!/darkvision/i.test(text)) continue;
    const m =
      /(\d+)\s*(?:ft|feet)/i.exec(text) ?? /darkvision[^0-9]*(\d+)/i.exec(text);
    return m ? Number(m[1]) : 60;
  }
  return undefined;
};

// Seed fly/swim/climb speeds from race/subrace trait text (Aarakocra's Flight,
// Triton/Water Genasi/Sea Elf swim, Tabaxi climb, Fairy/Owlin "equal to your
// walking speed"). Editable afterward like every seeded value.
const speedsFromTraits = (
  traits: TextComponent[],
  walk: number,
): { fly?: number; swim?: number; climb?: number } => {
  const out: { fly?: number; swim?: number; climb?: number } = {};
  for (const t of traits) {
    const text = `${t.title} ${isTextComponentWithDetail(t) ? t.detail : ""}`;
    for (const [key, word] of [
      ["fly", "fly(?:ing)?"],
      ["swim", "swim(?:ming)?"],
      ["climb", "climb(?:ing)?"],
    ] as const) {
      if (out[key] !== undefined) continue;
      const num = new RegExp(`${word}\\s+speed[^0-9]*(\\d+)`, "i").exec(text);
      if (num) out[key] = Number(num[1]);
      else if (
        new RegExp(`${word}\\s+speed\\s+equal to your walking speed`, "i").test(
          text,
        )
      )
        out[key] = walk;
    }
  }
  return out;
};

// Turn a race's natural-weapon traits into rollable attacks — a Lizardfolk's
// Bite, a Tabaxi's Cat's Claws, a Minotaur's Horns. The traits already state
// their own numbers in a consistent shape ("…natural weapon(s) dealing 1d6 +
// Strength piercing damage…"), so this reads the prose rather than duplicating
// the table beside it, exactly as `resistancesFromTraits` and `speedsFromTraits`
// do. Requiring the words "natural weapon" is what keeps conditional attacks out
// — a Shifter's bite exists only while shifted, and says so instead.
//
// The attack is seeded once at creation and editable like any other; nothing
// re-derives it, because no natural weapon scales with level.
const NATURAL_WEAPON =
  /natural weapons?\b[^.]*?(\d+)d(\d+)\s*\+\s*(\w+)\s+(\w+)\s+damage/i;

const naturalWeaponAttacks = (traits: TextComponent[]): Attack[] => {
  const out: Attack[] = [];
  for (const t of traits) {
    const detail = isTextComponentWithDetail(t) ? t.detail : "";
    const m = NATURAL_WEAPON.exec(`${t.title}. ${detail}`);
    if (!m) continue;
    const [, count, faces, abilityWord, damageWord] = m;
    const die = DIE_BY_FACES[Number(faces)];
    const ability = STAT_BY_NAME[abilityWord.toLowerCase()];
    const damageType = DAMAGE_BY_WORD.get(damageWord.toLowerCase());
    if (!die || !ability || !damageType) continue;
    out.push({
      id: randomUUID(),
      name: t.title,
      bonus: {
        operation: Operation.addition,
        operands: [ability, "proficiencyBonus"],
      },
      formula: {
        [damageType]: {
          operation: Operation.addition,
          operands: [[Number(count), die, DieOperation.roll], ability],
        },
      } as CustomFormulaWithDamage,
    });
  }
  return out;
};

// Ability names as the trait prose spells them, for the scanner above.
const STAT_BY_NAME: Record<string, StatKey> = {
  strength: StatKey.str,
  dexterity: StatKey.dex,
  constitution: StatKey.con,
  intelligence: StatKey.int,
  wisdom: StatKey.wis,
  charisma: StatKey.cha,
};

// Rewrite a Dragonborn's ancestry-dependent traits (Draconic Ancestry, Breath
// Weapon, Damage Resistance) with the specifics of the chosen dragon, so the
// concrete damage type/shape/save show on the sheet — and, because
// `resistancesFromTraits` scans the prose, the resistance is actually conferred.
const applyDraconicAncestry = (
  traits: TextComponent[],
  color: string,
): TextComponent[] => {
  const info = DRACONIC_ANCESTRIES[color];
  if (!info) return traits;
  const dmg = info.damage.toLowerCase();
  const dragon = color.split(" (")[0];
  const shape =
    info.breath === "line" ? "a 5-ft.-wide, 30-ft. line" : "a 15-ft. cone";
  const save = info.save === StatKey.dex ? "Dexterity" : "Constitution";
  return traits.map((t) => {
    switch (t.title.trim().toLowerCase()) {
      case "draconic ancestry":
        return text(
          t.title,
          `Your draconic ancestry is ${dragon} dragon, tied to ${dmg} damage.`,
        );
      case "damage resistance":
        return text(t.title, `You have resistance to ${dmg} damage.`);
      case "breath weapon":
        return text(
          t.title,
          `As an action, exhale ${dmg} damage in ${shape}; each creature in the area makes a ${save} saving throw (DC 8 + your Constitution modifier + your proficiency bonus) for half. It deals 2d6, rising to 3d6 at 6th level, 4d6 at 11th, and 5d6 at 16th. You can't use it again until you finish a short or long rest.`,
        );
      default:
        return t;
    }
  });
};

const splitLines = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

const text = (title: string, detail?: string): TextComponent =>
  detail
    ? { title, titleFormulas: [], detail, detailFormulas: [] }
    : { title, titleFormulas: [] };

// Wrap a free-text equipment line into a structured `EquipmentItem` (unequipped,
// no attunement) — the builder only produces mundane starting gear.
//
// A grant of several of something arrives as one line with the count in the name
// ("Javelin (4)"), so the count is lifted into `quantity` and the SRD per-unit
// weight attached. Both matter to encumbrance, which multiplies the two; before
// this, every builder-made character carried 0 lb. Items we have no weight for
// keep `weight` unset and contribute nothing, exactly as they used to.
const equipmentItem = (title: string): EquipmentItem => {
  const { name, count } = splitItemCount(title);
  const weight = weightForItem(title);
  return {
    id: randomUUID(),
    text: text(count > 1 ? `${name} (${count})` : name),
    quantity: count,
    equipped: false,
    ...(weight === undefined ? {} : { weight }),
  };
};

const emptySpells = (): Spells => {
  const spells: Spells = { 0: [] }; // key 0 = cantrips
  for (const lvl of LEVELED_SPELL_LEVELS) spells[lvl] = [];
  return spells;
};

const emptySpellSlots = (): SpellSlots => {
  const slots = {} as SpellSlots;
  for (const lvl of LEVELED_SPELL_LEVELS) slots[lvl] = { expended: 0 };
  return slots;
};

const emptyArmor = (): Record<ArmorType, boolean> => ({
  [ArmorType.Light]: false,
  [ArmorType.Medium]: false,
  [ArmorType.Heavy]: false,
  [ArmorType.Shields]: false,
});

// A clean, empty level-nothing sheet — the "Blank sheet" escape hatch and the
// base every guided character is layered onto. Deliberately free of the joke
// placeholder data that the old default character carried.
function emptyScaffold(): Character {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    uuid: randomUUID(),
    name: "",
    class: [],
    background: "",
    playerName: "",
    race: { name: "", size: Size.Medium },
    alignment: Alignment["True Neutral"],
    stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    inspiration: false,
    proficiencies: {
      savingThrows: {},
      skills: {},
      expertise: {},
      isJackOfAllTradesOverride: false,
      skillBonuses: {},
    },
    otherProficiencies: {
      languages: [],
      armor: emptyArmor(),
      weapons: [],
      toolsAndOther: [],
    },
    damageModifiers: { resistances: [], immunities: [], vulnerabilities: [] },
    // AC is driven by equipped armor/shields via the `equippedArmor` leaf, which
    // falls back to 10 + DEX when nothing is equipped.
    acFormula: { equippedArmor: true },
    speeds: { walk: 30 },
    senses: {},
    maxHp: undefined,
    currHp: 0,
    tempHp: 0,
    totalHitDice: undefined,
    expendedHitDice: {},
    exhaustion: 0,
    deathSaves: { successes: 0, failures: 0 },
    attacks: [],
    ammunition: [],
    coins: {},
    equipment: [],
    personality: { traits: [], ideals: [], bonds: [], flaws: [] },
    features: [],
    spellcastingClasses: [],
    spells: emptySpells(),
    spellSlots: emptySpellSlots(),
    limitedUseAbilities: [],
  };
}

// Map armor-proficiency grant strings ("Light Armor", "All armor", "Shields")
// onto the sheet's boolean armor map.
function armorFromGrants(grants: string[]): Record<ArmorType, boolean> {
  const armor = emptyArmor();
  for (const g of grants) {
    const lc = g.toLowerCase();
    if (lc === "all armor") {
      armor[ArmorType.Light] =
        armor[ArmorType.Medium] =
        armor[ArmorType.Heavy] =
          true;
    } else if (lc.includes("light")) armor[ArmorType.Light] = true;
    else if (lc.includes("medium")) armor[ArmorType.Medium] = true;
    else if (lc.includes("heavy")) armor[ArmorType.Heavy] = true;
    else if (lc.includes("shield")) armor[ArmorType.Shields] = true;
  }
  return armor;
}

function buildSpells(
  state: BuilderState,
  classId: UUID,
  // Always-prepared extras a subclass grants (e.g. cleric domain spells),
  // added on top of the player's own selections.
  grantedIndices: string[] = [],
): Spells {
  const spells = emptySpells();
  const add = (index: string) => {
    const srd = getSrdSpell(index);
    if (!srd) return;
    const spell: Spell = buildSpellFromSrd(srd, classId);
    if (srd.level === 0) spells[0]!.push(spell);
    else if (srd.level === 1) spells[1]!.push(spell);
  };
  state.cantripIndices.forEach(add);
  state.levelOneSpellIndices.forEach(add);
  grantedIndices.forEach(add);
  return spells;
}

// The guided path: assemble a full level-1 character from the wizard selections.
function guidedCharacter(state: BuilderState): Character {
  const char = emptyScaffold();
  const race = getSrdRace(state.raceIndex);
  const subrace = getSubrace(race, state.subraceIndex);
  const klass = getSrdClass(state.classIndex);
  const background = getBackground(state.backgroundName);

  // Identity
  char.name = state.name.trim() || "New Character";
  char.playerName = state.playerName.trim();
  char.alignment = state.alignment;
  const baseRaceName = race
    ? race.name
    : state.customRaceName.trim() || "Custom";
  const subraceName =
    state.subraceIndex === CUSTOM_SUBRACE
      ? state.customSubraceName.trim()
      : subrace?.name;
  // Racial traits as TextComponents — reused for both the structured race source
  // and the flattened `features` aggregate below.
  const baseRaceTraits = [
    ...(race?.traits ?? []),
    ...(subrace?.traits ?? []),
  ].map((f) => text(f.title, f.detail));
  const raceTraits =
    race?.draconicAncestry && state.draconicAncestry
      ? applyDraconicAncestry(baseRaceTraits, state.draconicAncestry)
      : baseRaceTraits;

  const className = klass?.name ?? (state.customClassName.trim() || "Custom");
  // Level-1 subclass mechanics, if the chosen subclass carries any (only the
  // classes that pick a subclass at level 1 — cleric/sorcerer/warlock — do).
  const classId = randomUUID();
  char.class = [
    {
      id: classId,
      name: className,
      level: 1,
      ...(state.subclass && { subclass: state.subclass }),
    },
  ];
  char.background = background?.name ?? "Custom";

  // Ability scores
  char.stats = resolveFinalStats(state);
  const conMod = modifier(char.stats.con);

  // Hit points & hit dice (level 1: max hit die + CON mod)
  const hitDieFaces = klass?.hitDie ?? Number(state.customHitDie.slice(1));
  const die = DIE_BY_FACES[hitDieFaces];
  if (die) {
    char.totalHitDice = { [die]: 1 } as HitDice;
    char.maxHp = {
      operation: Operation.addition,
      operands: [hitDieFaces, StatKey.con],
    };
    char.currHp = hitDieFaces + conMod;
  }
  // Seed the character's walking speed and darkvision from the race/subrace
  // (e.g. Wood Elf's Fleet of Foot → 35); both are fully editable afterward. The
  // race object keeps only identity — languages/traits are seeded into their own
  // homes (below) rather than mirrored here.
  const walkSpeed = subrace?.speed ?? race?.speed ?? 30;
  char.speeds = { walk: walkSpeed, ...speedsFromTraits(raceTraits, walkSpeed) };
  // A `darkvisionOrSkill` race decides by the player's pick rather than by its
  // trait text — the text names darkvision as one of two options, and scanning
  // it would grant the sense to everyone, including those who took the skill.
  const darkvision = race?.darkvisionOrSkill
    ? state.raceTookDarkvision
      ? race.darkvisionOrSkill
      : undefined
    : darkvisionFromTraits(raceTraits);
  char.senses = darkvision !== undefined ? { darkvision } : {};
  char.race = {
    name: baseRaceName,
    ...(subraceName && { subrace: subraceName }),
    size: sizeFromLabel(race?.size),
  };

  // Proficiencies — saving throws (class) and skills (class + race + background)
  for (const stat of klass?.savingThrows ?? [])
    char.proficiencies.savingThrows[stat] = true;
  const skills = uniq([
    ...state.classSkillChoices,
    // Taking the darkvision side of an either/or forfeits the skill.
    ...(race?.darkvisionOrSkill && state.raceTookDarkvision
      ? []
      : state.raceSkillChoices),
    ...(race?.proficiencies.skills ?? []),
    ...(subrace?.proficiencies.skills ?? []),
    ...(background?.skills ?? []),
    ...(state.backgroundName ? [] : state.customBackgroundSkills),
  ]);
  for (const skill of skills) char.proficiencies.skills[skill] = true;

  // Other proficiencies
  char.otherProficiencies.languages = uniq([
    ...(race?.languages ?? []),
    ...state.raceLanguageChoices,
    ...state.backgroundLanguageChoices,
  ]).filter(Boolean);
  char.otherProficiencies.armor = armorFromGrants([
    ...(klass?.proficiencies.armor ?? []),
    ...(race?.proficiencies.armor ?? []),
    ...(subrace?.proficiencies.armor ?? []),
  ]);
  char.otherProficiencies.weapons = uniq([
    ...(klass?.proficiencies.weapons ?? []),
    ...(race?.proficiencies.weapons ?? []),
    ...(subrace?.proficiencies.weapons ?? []),
  ]);
  const toolLabels = uniqBy(
    [
      ...(klass?.proficiencies.tools ?? []),
      // Only the picks the class actually offers, so a stale choice left over
      // from switching class mid-wizard can't leak through.
      ...(klass?.toolChoices
        ? state.toolChoices.filter((t) => klass.toolChoices!.from.includes(t))
        : []),
      ...(race?.proficiencies.tools ?? []),
      ...(subrace?.proficiencies.tools ?? []),
      ...(background?.tools ?? []),
      ...(state.backgroundName ? [] : splitLines(state.customBackgroundTools)),
    ].filter(Boolean),
    // Case-insensitive so a class's "Thieves' Tools" and a background's
    // "Thieves' tools" don't both land on the sheet.
    (t) => t.toLowerCase(),
  );
  char.otherProficiencies.toolsAndOther = toolLabels.map((t) => text(t));

  // Features — racial traits and the background feature. The class's and
  // subclass's level-1 features are added by `applyClassLevel` below, the same
  // way every later level gets them.
  char.features = [...raceTraits];
  const bgFeature = background?.feature ?? {
    title: state.customBackgroundFeatureTitle.trim(),
    detail: state.customBackgroundFeatureDetail.trim(),
  };
  if (bgFeature.title)
    char.features.push(text(bgFeature.title, bgFeature.detail || undefined));

  // Racial pools (a dragonborn's Breath Weapon) and structured racial
  // resistances. Keyed to race traits rather than a class level, so they stay
  // here; `applyClassLevel` only refreshes what already exists.
  syncRacePools(
    char,
    raceTraits.map((t) => t.title),
  );
  char.damageModifiers.resistances = resistancesFromTraits(raceTraits);
  char.damageModifiers.immunities = immunitiesFromTraits(raceTraits);

  // High Elf's chosen wizard cantrip. Racial spells have no spellcasting class,
  // so — like Drow/Tiefling innate magic — it rides as an at-will limited-use
  // ability rather than a slot-cast repertoire spell.
  const hasHighElfCantrip = raceTraits.some(
    (t) => t.title.trim().toLowerCase() === "high elf cantrip",
  );
  if (hasHighElfCantrip && state.highElfCantrip) {
    const srd = getSrdSpell(state.highElfCantrip);
    if (srd) {
      char.limitedUseAbilities ??= [];
      char.limitedUseAbilities.push({
        info: {
          title: srd.name,
          titleFormulas: [],
          detail: `At-will wizard cantrip you know as a High Elf (Intelligence). ${srd.desc.split("\n")[0]}`,
          detailFormulas: [],
        },
        maxUses: 0,
        recharge: RestType.longRest,
        expended: 0,
      });
    }
  }

  // Spellcasting
  if (klass && castsAtLevelOne(klass)) {
    char.spellcastingClasses = [{ classId }];
    // A subclass's always-prepared spells (cleric domain spells) are added by
    // `applyClassLevel`, which runs after this — `buildSpells` replaces the
    // whole spell object, so it has to go first.
    char.spells = buildSpells(state, classId);
    if (className === OfficialClass.Warlock) char.pactSlots = { expended: 0 };
  }

  // Equipment & coin. The class loadout also derives weapon attacks and any
  // granted armor/shield. AC comes from the `equippedArmor` formula leaf (set on
  // the scaffold), so we just tag the granted armor/shield items and mark them
  // equipped — equipping/unequipping then drives AC with no formula rewrite.
  const classItems: EquipmentItem[] = [];
  const tookGold = state.startingWealth === "gold";
  if (state.acceptClassEquipment && klass && !tookGold) {
    const loadout = resolveClassLoadout(
      klass.startingEquipment,
      klass.startingEquipmentOptions,
      state.classEquipmentChoices,
      state.classWeaponChoices,
    );
    char.attacks = loadout.attacks;
    for (const line of loadout.equipment) {
      const isArmor = loadout.armor?.label === line;
      const isShield = loadout.shield && line === "Shield";
      classItems.push({
        ...equipmentItem(line),
        equipped: isArmor || isShield,
        ...(isArmor && loadout.armor ? { armor: loadout.armor.mechanics } : {}),
        ...(isShield ? { shield: { bonus: 2 } } : {}),
      });
    }
  }
  const otherLines: string[] = [];
  if (state.acceptBackgroundEquipment && background) {
    otherLines.push(...background.equipment);
    if (background.gold) char.coins = { GP: background.gold };
  }
  otherLines.push(...state.extraEquipment.filter((l) => l.trim()));
  char.equipment = [...classItems, ...otherLines.map((l) => equipmentItem(l))];
  // Rolled starting wealth stacks with a background's coin rather than
  // replacing it — the trade was class equipment for gold.
  if (tookGold && state.startingGold)
    char.coins = {
      ...char.coins,
      GP: (char.coins.GP ?? 0) + state.startingGold,
    };

  // Everything reaching class level 1 grants — the class's and subclass's
  // features, pools, fighting style, expertise, tool picks, chosen options.
  // The same call the level-up wizard makes for level N, which is what keeps
  // the two wizards from applying different sets.
  if (char.class[0]) applyClassLevel(char, char.class[0], state);

  // Picks a *race* owes at 1st level (Simic Hybrid's first Animal Enhancement).
  // After `char.race` is set and after the class grants, so a race feature reads
  // below the class ones in the features list.
  applyRaceOptions(char, state, 1);

  // A level-1 feat, for the two races that grant one. Applied through the same
  // `applyFeat` the level-up wizard uses, and last of all so its grants layer
  // over the class/race/background proficiencies rather than being overwritten.
  if (raceGrantsFeat(race, subrace) && state.featIndex) {
    const feat = getFeat(state.featIndex);
    if (feat) applyFeat(char, feat, { ...state, className });
  }

  // The monk's Unarmed Strike, whose damage die is the Martial Arts die. After
  // the loadout, since that's what populates `char.attacks`.
  if (char.class[0]) syncMartialArts(char, char.class[0]);

  // Racial natural weapons (a Lizardfolk's Bite, a Tabaxi's claws) become real
  // attacks rather than prose you have to translate mid-combat. Also after the
  // loadout, and skipping any name the loadout already used.
  const attackNames = new Set(char.attacks.map((a) => a.name.toLowerCase()));
  for (const attack of naturalWeaponAttacks(raceTraits))
    if (!attackNames.has(attack.name.toLowerCase())) char.attacks.push(attack);

  // Personality
  const p = state.personality;
  char.personality = {
    traits: p.traits.filter(Boolean).map((t) => text(t)),
    ideals: p.ideals.filter(Boolean).map((t) => text(t)),
    bonds: p.bonds.filter(Boolean).map((t) => text(t)),
    flaws: p.flaws.filter(Boolean).map((t) => text(t)),
  };

  return char;
}

// Turn the wizard's collected selections into a persisted `Character`. The
// formula engine derives AC/HP/modifiers/spell slots from these source fields,
// so this only needs to set the inputs. SRD casting abilities are the standard
// ones, so no `abilityOverride` is needed; custom casters adjust on the sheet.
export function buildCharacter(state: BuilderState): Character {
  if (state.mode === "sample")
    return { ...structuredClone(defaultCharacter), uuid: randomUUID() };
  if (state.mode === "blank") return emptyScaffold();
  return guidedCharacter(state);
}
