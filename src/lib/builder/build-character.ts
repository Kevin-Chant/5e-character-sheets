import { uniq, uniqBy } from "lodash";
import {
  Alignment,
  ArmorType,
  Operation,
  SpellLevel,
  StandardDie,
  StatKey,
  OfficialClass,
} from "src/lib/data/data-definitions";
import { randomUUID } from "src/lib/browser";
import { modifier } from "src/lib/rules";
import {
  Character,
  HitDice,
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

const splitLines = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

const text = (title: string, detail?: string): TextComponent =>
  detail
    ? { title, titleFormulas: [], detail, detailFormulas: [] }
    : { title, titleFormulas: [] };

const emptySpells = (): Spells =>
  Object.values(SpellLevel).reduce<Spells>(
    (acc, lvl) => {
      acc[lvl] = [];
      return acc;
    },
    { cantrips: [] },
  );

const emptySpellSlots = (): SpellSlots =>
  Object.values(SpellLevel).reduce((acc, lvl) => {
    acc[lvl] = { expended: 0 };
    return acc;
  }, {} as SpellSlots);

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
    race: "",
    alignment: Alignment["True Neutral"],
    stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    inspiration: 0,
    proficiencies: {
      savingThrows: {},
      skills: {},
      expertise: {},
      isJackOfAllTradesOverride: false,
    },
    otherProficiencies: {
      languages: [],
      armor: emptyArmor(),
      weapons: [],
      toolsAndOther: [],
    },
    acFormula: { operation: Operation.addition, operands: [10, StatKey.dex] },
    speed: 30,
    maxHp: undefined,
    currHp: 0,
    tempHp: 0,
    totalHitDice: undefined,
    expendedHitDice: {},
    exhaustion: 0,
    deathSaves: { successes: 0, failures: 0 },
    attacks: [],
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

function buildSpells(state: BuilderState, className: string): Spells {
  const spells = emptySpells();
  const add = (index: string) => {
    const srd = getSrdSpell(index);
    if (!srd) return;
    const spell: Spell = buildSpellFromSrd(srd, className);
    if (srd.level === 0) spells.cantrips!.push(spell);
    else if (srd.level === 1) spells[SpellLevel.First]!.push(spell);
  };
  state.cantripIndices.forEach(add);
  state.levelOneSpellIndices.forEach(add);
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
  char.race = subraceName ? `${baseRaceName} (${subraceName})` : baseRaceName;

  const className = klass?.name ?? (state.customClassName.trim() || "Custom");
  char.class = [
    {
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
  // Subrace can raise the base speed (e.g. Wood Elf's Fleet of Foot → 35).
  char.speed = subrace?.speed ?? race?.speed ?? 30;

  // Proficiencies — saving throws (class) and skills (class + race + background)
  for (const stat of klass?.savingThrows ?? [])
    char.proficiencies.savingThrows[stat] = true;
  const skills = uniq([
    ...state.classSkillChoices,
    ...state.raceSkillChoices,
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

  // Features — racial traits, class level-1 features, background feature
  char.features = [
    ...(race?.traits ?? []),
    ...(subrace?.traits ?? []),
    ...(klass?.features ?? []),
  ].map((f) => text(f.title, f.detail));
  const bgFeature = background?.feature ?? {
    title: state.customBackgroundFeatureTitle.trim(),
    detail: state.customBackgroundFeatureDetail.trim(),
  };
  if (bgFeature.title)
    char.features.push(text(bgFeature.title, bgFeature.detail || undefined));

  // Spellcasting
  if (klass && castsAtLevelOne(klass)) {
    char.spellcastingClasses = [{ class: className }];
    char.spells = buildSpells(state, className);
    if (className === OfficialClass.Warlock) char.pactSlots = { expended: 0 };
  }

  // Equipment & coin. The class loadout also derives weapon attacks and (when
  // armor/shield is taken) the AC formula from the selected gear.
  const equipmentLines: string[] = [];
  if (state.acceptClassEquipment && klass) {
    const loadout = resolveClassLoadout(
      klass.startingEquipment,
      klass.startingEquipmentOptions,
      state.classEquipmentChoices,
      state.classWeaponChoices,
    );
    equipmentLines.push(...loadout.equipment);
    char.attacks = loadout.attacks;
    if (loadout.acFormula) char.acFormula = loadout.acFormula;
  }
  if (state.acceptBackgroundEquipment && background) {
    equipmentLines.push(...background.equipment);
    if (background.gold) char.coins = { GP: background.gold };
  }
  equipmentLines.push(...state.extraEquipment.filter((l) => l.trim()));
  char.equipment = equipmentLines.map((l) => text(l));

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
