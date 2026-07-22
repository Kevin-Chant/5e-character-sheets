import { uniq, uniqBy } from "lodash";
import {
  Alignment,
  ArmorType,
  LEVELED_SPELL_LEVELS,
  Operation,
  Size,
  StandardDie,
  StatKey,
  OfficialClass,
} from "src/lib/data/data-definitions";
import { randomUUID } from "src/lib/browser";
import { UUID } from "crypto";
import { modifier } from "src/lib/rules";
import {
  Character,
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
import { getSrdRace, getSubrace } from "src/lib/builder/srd-races";
import { resolveFinalStats } from "src/lib/builder/resolve";
import { castsAtLevelOne, getSrdClass } from "src/lib/builder/srd-classes";
import { getSubclassByName } from "src/lib/builder/subclasses";
import { getBackground } from "src/lib/builder/backgrounds";
import { resolveClassLoadout } from "src/lib/builder/equipment";
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

const splitLines = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

const text = (title: string, detail?: string): TextComponent =>
  detail
    ? { title, titleFormulas: [], detail, detailFormulas: [] }
    : { title, titleFormulas: [] };

// Wrap a free-text equipment line into a structured `EquipmentItem` (quantity 1,
// unequipped, no attunement) — the builder only produces mundane starting gear.
const equipmentItem = (title: string): EquipmentItem => ({
  id: randomUUID(),
  text: text(title),
  quantity: 1,
  equipped: false,
});

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
    inspiration: 0,
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
  const raceTraits = [...(race?.traits ?? []), ...(subrace?.traits ?? [])].map(
    (f) => text(f.title, f.detail),
  );

  const className = klass?.name ?? (state.customClassName.trim() || "Custom");
  // Level-1 subclass mechanics, if the chosen subclass carries any (only the
  // classes that pick a subclass at level 1 — cleric/sorcerer/warlock — do).
  const subclassGrant = getSubclassByName(klass?.index, state.subclass)?.grants;
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
  char.speeds = { walk: subrace?.speed ?? race?.speed ?? 30 };
  const darkvision = darkvisionFromTraits(raceTraits);
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
    ...state.raceSkillChoices,
    ...(race?.proficiencies.skills ?? []),
    ...(subrace?.proficiencies.skills ?? []),
    ...(subclassGrant?.proficiencies?.skills ?? []),
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
    ...(subclassGrant?.proficiencies?.armor ?? []),
  ]);
  char.otherProficiencies.weapons = uniq([
    ...(klass?.proficiencies.weapons ?? []),
    ...(race?.proficiencies.weapons ?? []),
    ...(subrace?.proficiencies.weapons ?? []),
    ...(subclassGrant?.proficiencies?.weapons ?? []),
  ]);
  const toolLabels = uniqBy(
    [
      ...(klass?.proficiencies.tools ?? []),
      ...(race?.proficiencies.tools ?? []),
      ...(subrace?.proficiencies.tools ?? []),
      ...(subclassGrant?.proficiencies?.tools ?? []),
      ...(background?.tools ?? []),
      ...(state.backgroundName ? [] : splitLines(state.customBackgroundTools)),
    ].filter(Boolean),
    // Case-insensitive so a class's "Thieves' Tools" and a background's
    // "Thieves' tools" don't both land on the sheet.
    (t) => t.toLowerCase(),
  );
  char.otherProficiencies.toolsAndOther = toolLabels.map((t) => text(t));

  // Features — racial traits, class level-1 features, subclass level-1
  // features, background feature
  char.features = [
    ...raceTraits,
    ...[...(klass?.features ?? []), ...(subclassGrant?.features ?? [])].map(
      (f) => text(f.title, f.detail),
    ),
  ];
  const bgFeature = background?.feature ?? {
    title: state.customBackgroundFeatureTitle.trim(),
    detail: state.customBackgroundFeatureDetail.trim(),
  };
  if (bgFeature.title)
    char.features.push(text(bgFeature.title, bgFeature.detail || undefined));

  // Spellcasting
  if (klass && castsAtLevelOne(klass)) {
    char.spellcastingClasses = [{ classId }];
    // Subclass-granted always-prepared spells (e.g. cleric domain spells) are
    // folded in alongside the player's own picks.
    char.spells = buildSpells(state, classId, subclassGrant?.spellIndices);
    if (className === OfficialClass.Warlock) char.pactSlots = { expended: 0 };
  }

  // Equipment & coin. The class loadout also derives weapon attacks and any
  // granted armor/shield. AC comes from the `equippedArmor` formula leaf (set on
  // the scaffold), so we just tag the granted armor/shield items and mark them
  // equipped — equipping/unequipping then drives AC with no formula rewrite.
  const classItems: EquipmentItem[] = [];
  if (state.acceptClassEquipment && klass) {
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
