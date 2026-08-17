import { defaultCharacter } from "src/lib/data/default-data";
import { randomUUID } from "src/lib/browser";
import { WEAPON_PRESETS, weaponTags } from "src/lib/data/weapon-presets";
import { CURRENT_SCHEMA_VERSION } from "./version";

// v11 helper: look a stored attack's name up in the weapon catalog.
const PRESETS_BY_NAME = new Map(
  WEAPON_PRESETS.flatMap((g) => g.options).map((w) => [w.name, w] as const),
);
const presetByName = (name: string) => PRESETS_BY_NAME.get(name);

// A migration upgrades a character object from version `to - 1` to `to`.
// PURE and APPEND-ONLY: never edit a shipped migration, only add the next one.
// Characters predating versioning have no `schemaVersion` and are version 0.
interface Migration {
  to: number;
  migrate: (character: any) => any;
}

// v5 helpers: rewrite name-based class references to stable ids.

const STAT_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

// Rewrite the class-referencing leaves inside a single CustomFormula tree:
// `{ spellMod: <name> }` → `{ spellMod: <id> }`, and a bare class-name string
// leaf (the old "level in a class") → `{ classLevel: <id> }`. Other leaves
// (numbers, stat keys, PB, die-expression arrays) pass through untouched.
function remapFormula(node: any, idFor: (name: string) => string): any {
  if (Array.isArray(node)) return node;
  if (typeof node === "number") return node;
  if (typeof node === "string") {
    if (STAT_KEYS.includes(node) || node === "proficiencyBonus") return node;
    return { classLevel: idFor(node) };
  }
  if (node && typeof node === "object") {
    if (typeof node.spellMod === "string")
      return { ...node, spellMod: idFor(node.spellMod) };
    if (node.classLevel !== undefined || node.spellMod !== undefined)
      return node; // already id-tagged
    if (node.operand1 !== undefined) {
      const out: any = {
        ...node,
        operand1: remapFormula(node.operand1, idFor),
      };
      if (node.operand2 !== undefined)
        out.operand2 = remapFormula(node.operand2, idFor);
      return out;
    }
    if (Array.isArray(node.operands))
      return {
        ...node,
        operands: node.operands.map((o: any) => remapFormula(o, idFor)),
      };
  }
  return node;
}

const remapOptional = (f: any, idFor: (n: string) => string) =>
  f === undefined ? f : remapFormula(f, idFor);

// Map a TextComponent's title/detail formula slots.
function remapText(tc: any, idFor: (n: string) => string): any {
  if (!tc || typeof tc !== "object") return tc;
  const out = { ...tc };
  if (Array.isArray(tc.titleFormulas))
    out.titleFormulas = tc.titleFormulas.map((f: any) =>
      remapFormula(f, idFor),
    );
  if (Array.isArray(tc.detailFormulas))
    out.detailFormulas = tc.detailFormulas.map((f: any) =>
      remapFormula(f, idFor),
    );
  return out;
}

const remapTextList = (list: any, idFor: (n: string) => string) =>
  Array.isArray(list) ? list.map((tc) => remapText(tc, idFor)) : list;

// Walk a spell's structured mechanics, remapping every embedded formula (the
// `spellMod` leaves the catalog importer stamps live here).
function remapMechanics(m: any, idFor: (n: string) => string): any {
  if (!m || typeof m !== "object") return m;
  const out = { ...m };
  const remapDamage = (arr: any) =>
    Array.isArray(arr)
      ? arr.map((d: any) => ({ ...d, formula: remapFormula(d.formula, idFor) }))
      : arr;
  if (m.damage) out.damage = remapDamage(m.damage);
  if (m.healing !== undefined) out.healing = remapFormula(m.healing, idFor);
  if (m.scaling) {
    out.scaling = { ...m.scaling };
    if (m.scaling.damage) out.scaling.damage = remapDamage(m.scaling.damage);
    if (m.scaling.healing !== undefined)
      out.scaling.healing = remapFormula(m.scaling.healing, idFor);
  }
  if (m.damageTable) {
    out.damageTable = {} as any;
    for (const [lvl, dmg] of Object.entries(m.damageTable))
      out.damageTable[lvl] = remapDamage(dmg);
  }
  return out;
}

const migrations: Migration[] = [
  {
    // Baseline: stamp the version and backfill any top-level field missing on
    // an old/truncated save. Only fills absent keys (falsy values like
    // currHp: 0 are preserved), and only when the object looks like a
    // character, so garbage input fails validation instead of becoming a
    // default character.
    to: 1,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled: any = { ...character };
      const looksLikeCharacter =
        typeof filled.uuid === "string" && typeof filled.name === "string";
      if (looksLikeCharacter) {
        for (const [key, value] of Object.entries(defaultCharacter)) {
          if (filled[key] === undefined) filled[key] = value;
        }
      }
      filled.schemaVersion = 1;
      return filled;
    },
  },
  {
    // Limited-use abilities became a first-class list; seed it empty.
    to: 2,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled = { ...character };
      if (filled.limitedUseAbilities === undefined)
        filled.limitedUseAbilities = [];
      filled.schemaVersion = 2;
      return filled;
    },
  },
  {
    // `race` becomes `{ name, subrace?, size }` (parsed from "Name (Subrace)",
    // size defaults to Medium); numeric `speed` becomes `speeds.walk`, then is
    // dropped; `senses` starts empty.
    to: 3,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled = { ...character };
      if (typeof filled.race === "string") {
        const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(filled.race.trim());
        const name = (match ? match[1] : filled.race).trim();
        const subrace = match ? match[2].trim() : undefined;
        filled.race = {
          name,
          ...(subrace ? { subrace } : {}),
          size: "Medium",
        };
      }
      if (filled.speeds === undefined)
        filled.speeds = {
          walk: typeof filled.speed === "number" ? filled.speed : 30,
        };
      delete filled.speed;
      if (filled.senses === undefined) filled.senses = {};
      filled.schemaVersion = 3;
      return filled;
    },
  },
  {
    // Spell buckets: word keys ("cantrips"/"First"…"Ninth") → numbers (0-9),
    // matching `SpellMechanics.level`. Remaps `spells` and `spellSlots`;
    // unknown keys are dropped.
    to: 4,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const WORD_TO_NUM: Record<string, number> = {
        cantrips: 0,
        First: 1,
        Second: 2,
        Third: 3,
        Fourth: 4,
        Fifth: 5,
        Sixth: 6,
        Seventh: 7,
        Eighth: 8,
        Ninth: 9,
      };
      const remap = (obj: any): any => {
        if (!obj || typeof obj !== "object") return obj;
        const out: Record<number, any> = {};
        for (const [key, value] of Object.entries(obj)) {
          // Already-numeric keys pass through; word keys convert.
          const num = /^\d+$/.test(key) ? Number(key) : WORD_TO_NUM[key];
          if (num !== undefined) out[num] = value;
        }
        return out;
      };
      const filled = { ...character };
      if (filled.spells) filled.spells = remap(filled.spells);
      if (filled.spellSlots) filled.spellSlots = remap(filled.spellSlots);
      filled.schemaVersion = 4;
      return filled;
    },
  },
  {
    // Classes gain a stable `id`; every name-based class reference is rewritten
    // to it: `spellcastingClasses[].class` → `classId`,
    // `spells[][].spellcastingClass` → the id, `spellMod`/bare class-name
    // formula leaves → `{ spellMod }`/`{ classLevel }`. A reference to a class
    // not on the sheet gets a fresh dangling id (resolves to nothing, as before).
    to: 5,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled = { ...character };

      const nameToIdMap = new Map<string, string>();
      filled.class = (Array.isArray(filled.class) ? filled.class : []).map(
        (klass: any) => {
          const id = typeof klass?.id === "string" ? klass.id : randomUUID();
          if (typeof klass?.name === "string" && !nameToIdMap.has(klass.name))
            nameToIdMap.set(klass.name, id);
          return { ...klass, id };
        },
      );
      const idFor = (name: string): string =>
        nameToIdMap.get(name) ?? randomUUID();

      if (Array.isArray(filled.spellcastingClasses))
        filled.spellcastingClasses = filled.spellcastingClasses.map(
          (sc: any) => {
            if (typeof sc?.classId === "string") return sc; // already migrated
            const { class: className, ...rest } = sc ?? {};
            return {
              ...rest,
              classId:
                typeof className === "string" ? idFor(className) : randomUUID(),
              ...(rest.saveDcOverride !== undefined && {
                saveDcOverride: remapFormula(rest.saveDcOverride, idFor),
              }),
              ...(rest.attackBonusOverride !== undefined && {
                attackBonusOverride: remapFormula(
                  rest.attackBonusOverride,
                  idFor,
                ),
              }),
            };
          },
        );

      filled.acFormula = remapOptional(filled.acFormula, idFor);
      filled.initiativeFormula = remapOptional(filled.initiativeFormula, idFor);
      filled.maxHp = remapOptional(filled.maxHp, idFor);

      if (Array.isArray(filled.attacks))
        filled.attacks = filled.attacks.map((a: any) => {
          const out = { ...a, bonus: remapFormula(a.bonus, idFor) };
          if (a.formula && typeof a.formula === "object") {
            out.formula = {};
            for (const [dt, f] of Object.entries(a.formula))
              out.formula[dt] = remapFormula(f, idFor);
          }
          return out;
        });

      filled.equipment = remapTextList(filled.equipment, idFor);
      filled.features = remapTextList(filled.features, idFor);
      if (filled.personality && typeof filled.personality === "object")
        filled.personality = {
          traits: remapTextList(filled.personality.traits, idFor),
          ideals: remapTextList(filled.personality.ideals, idFor),
          bonds: remapTextList(filled.personality.bonds, idFor),
          flaws: remapTextList(filled.personality.flaws, idFor),
        };

      if (Array.isArray(filled.limitedUseAbilities))
        filled.limitedUseAbilities = filled.limitedUseAbilities.map(
          (lua: any) => ({
            ...lua,
            info: remapText(lua.info, idFor),
            maxUses: remapFormula(lua.maxUses, idFor),
          }),
        );

      if (filled.spells && typeof filled.spells === "object") {
        const spells: any = {};
        for (const [lvl, list] of Object.entries(filled.spells))
          spells[lvl] = Array.isArray(list)
            ? list.map((sp: any) => ({
                ...sp,
                spellcastingClass:
                  typeof sp?.spellcastingClass === "string"
                    ? idFor(sp.spellcastingClass)
                    : sp?.spellcastingClass,
                info: remapText(sp.info, idFor),
                ...(sp.mechanics && {
                  mechanics: remapMechanics(sp.mechanics, idFor),
                }),
              }))
            : list;
        filled.spells = spells;
      }

      filled.schemaVersion = 5;
      return filled;
    },
  },
  {
    // Attacks gain a stable `id` (so ammunition can reference the weapon it
    // feeds) and an optional `range`. Ammunition becomes a first-class list.
    to: 6,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled = { ...character };
      if (Array.isArray(filled.attacks))
        filled.attacks = filled.attacks.map((a: any) => ({
          ...a,
          id: typeof a?.id === "string" ? a.id : randomUUID(),
        }));
      if (filled.ammunition === undefined) filled.ammunition = [];
      filled.schemaVersion = 6;
      return filled;
    },
  },
  {
    // Damage resistances/immunities/vulnerabilities become `damageModifiers`;
    // seed all three lists empty.
    to: 7,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled = { ...character };
      if (filled.damageModifiers === undefined)
        filled.damageModifiers = {
          resistances: [],
          immunities: [],
          vulnerabilities: [],
        };
      filled.schemaVersion = 7;
      return filled;
    },
  },
  {
    // Per-skill bonus formulas get a home: `proficiencies.skillBonuses`. Seed
    // it empty.
    to: 8,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled = { ...character };
      if (filled.proficiencies && typeof filled.proficiencies === "object") {
        filled.proficiencies = { ...filled.proficiencies };
        if (filled.proficiencies.skillBonuses === undefined)
          filled.proficiencies.skillBonuses = {};
      }
      filled.schemaVersion = 8;
      return filled;
    },
  },
  {
    // Equipment moves from free-text `TextComponent[]` to structured
    // `EquipmentItem[]`. Each legacy component is wrapped verbatim into an
    // item's `text`, quantity defaults to 1, equipped to false; `weight` and
    // `attunement` stay absent (optional).
    to: 9,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled = { ...character };
      if (Array.isArray(filled.equipment))
        filled.equipment = filled.equipment.map((entry: any) =>
          entry && typeof entry === "object" && "text" in entry && "id" in entry
            ? entry
            : {
                id: randomUUID(),
                text: entry,
                quantity: 1,
                equipped: false,
              },
        );
      filled.schemaVersion = 9;
      return filled;
    },
  },
  {
    // Equipment items gain an `equippable` flag (only equippable items show an
    // equip toggle). Backfill true for anything already equipped or with
    // armor/shield mechanics; otherwise omit (optional, defaults falsy).
    to: 10,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled = { ...character };
      if (Array.isArray(filled.equipment))
        filled.equipment = filled.equipment.map((item: any) => {
          if (!item || typeof item !== "object") return item;
          if (item.equippable !== undefined) return item;
          const equippable = !!item.equipped || !!item.armor || !!item.shield;
          return equippable ? { ...item, equippable: true } : item;
        });
      filled.schemaVersion = 10;
      return filled;
    },
  },
  {
    // Attacks gain `tags` (weapon properties deciding which features apply to a
    // roll). Backfill by matching the attack's name against the preset
    // catalog, including the "(2H)" versatile variant. An unrecognised name is
    // left untagged — every conditional feature is offered as a prompt, as
    // before tags existed.
    to: 11,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled = { ...character };
      if (Array.isArray(filled.attacks))
        filled.attacks = filled.attacks.map((attack: any) => {
          if (!attack || typeof attack !== "object") return attack;
          if (attack.tags !== undefined) return attack;
          const name = String(attack.name ?? "").trim();
          const twoHanded = name.endsWith("(2H)");
          const preset = presetByName(
            twoHanded ? name.slice(0, -4).trim() : name,
          );
          return preset
            ? { ...attack, tags: weaponTags(preset, twoHanded) }
            : attack;
        });
      filled.schemaVersion = 11;
      return filled;
    },
  },
  {
    to: 12,
    // Inspiration becomes a boolean (5e has no quantity for it). Any stored
    // count above zero maps to true; house-ruled stacking loses the count.
    // Must survive garbage input (null/undefined etc.) without throwing.
    migrate: (character: any) => ({
      ...character,
      inspiration: Number(character?.inspiration) > 0,
      schemaVersion: 12,
    }),
  },
  {
    to: 13,
    // Hit-dice pools drop d20: no class or creature in 5e has one, and the
    // editor used to offer every standard die, so a stray entry could be
    // sitting in either pool.
    migrate: (character: any) => {
      const withoutD20 = (pool: any) => {
        if (!pool || typeof pool !== "object" || !("d20" in pool)) return pool;
        const { d20: _dropped, ...rest } = pool;
        void _dropped;
        return rest;
      };
      return {
        ...character,
        ...(character?.totalHitDice
          ? { totalHitDice: withoutD20(character.totalHitDice) }
          : {}),
        expendedHitDice: withoutD20(character?.expendedHitDice),
        schemaVersion: 13,
      };
    },
  },
];

// Apply migrations in ascending order regardless of array order.
const orderedMigrations = [...migrations].sort((a, b) => a.to - b.to);

export function migrateCharacter(raw: any): any {
  const fromVersion =
    typeof raw?.schemaVersion === "number" ? raw.schemaVersion : 0;
  let character = raw;
  for (const { to, migrate } of orderedMigrations) {
    if (to > fromVersion) character = migrate(character);
  }
  return character;
}

export { CURRENT_SCHEMA_VERSION };
