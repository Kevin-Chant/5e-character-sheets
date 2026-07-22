import { defaultCharacter } from "src/lib/data/default-data";
import { randomUUID } from "src/lib/browser";
import { CURRENT_SCHEMA_VERSION } from "./version";

// A migration upgrades a plain character object from version `to - 1` to `to`.
// Migrations are PURE and APPEND-ONLY: never edit a shipped migration, only add
// the next one. Characters predating versioning have no `schemaVersion` and are
// treated as version 0.
interface Migration {
  to: number;
  migrate: (character: any) => any;
}

// --- v5 helpers: rewrite name-based class references to stable ids ---------

const STAT_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

// Rewrite the class-referencing leaves inside a single CustomFormula tree:
// `{ spellMod: <name> }` → `{ spellMod: <id> }`, and a bare class-name string
// leaf (the old "level in a class") → `{ classLevel: <id> }`. Other leaves
// (numbers, stat keys, PB, die-expression arrays) pass through untouched.
function remapFormula(node: any, idFor: (name: string) => string): any {
  if (Array.isArray(node)) return node; // DieExpression leaf
  if (typeof node === "number") return node;
  if (typeof node === "string") {
    if (STAT_KEYS.includes(node) || node === "proficiencyBonus") return node;
    return { classLevel: idFor(node) }; // bare class-name → classLevel leaf
  }
  if (node && typeof node === "object") {
    if (typeof node.spellMod === "string")
      return { ...node, spellMod: idFor(node.spellMod) };
    if (node.classLevel !== undefined || node.spellMod !== undefined)
      return node; // already an id-tagged leaf
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
// `spellMod` leaves the SRD importer stamps live here).
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
    // Baseline: stamp the version and backfill any top-level field that the
    // current code assumes exists but very old / truncated saves may lack.
    // Only fills keys that are absent (existing values, including falsy ones
    // like currHp: 0, are preserved), and only for objects that actually look
    // like a character — so a wrong/garbage file isn't silently turned into a
    // default character but is left to fail validation instead.
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
    // Limited-use abilities (Sorcery Points, racial once-per-rest features, …)
    // are now a first-class list. Characters from before this didn't track them,
    // so start them with an empty list.
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
    // `race` became a structured identity object ({ name, subrace?, size }); the
    // numeric `speed` became structured `speeds` ({ walk, … }); and senses gained
    // a structured `senses` home. The old `race` string is parsed into a base
    // name + optional "(subrace)"; size defaults to Medium. `speeds.walk` takes
    // the old `speed` value, the flat `speed` field is dropped, and `senses`
    // starts empty (a legacy save has no structured senses to carry over).
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
    // Spell buckets moved from the "cantrips"/"First"…"Ninth" word keys to plain
    // numbers (0 = cantrips, 1–9 = leveled), matching `SpellMechanics.level`.
    // Remaps both `spells` and `spellSlots`; unknown keys are dropped.
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
          // Already-numeric keys (idempotency) pass through; word keys convert.
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
    // Classes gained a stable `id`, and every class reference moved from the
    // (renameable) name to that id: `spellcastingClasses[].class` → `classId`,
    // `spells[][].spellcastingClass` → the id, and the `spellMod` / bare
    // class-name ("level in a class") formula leaves → id-tagged `{ spellMod }`
    // / `{ classLevel }`. A reference to a class not on the sheet gets a fresh
    // (dangling) id, preserving the old "resolves to nothing" behavior.
    to: 5,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled = { ...character };

      // Assign ids to classes and build a name → id lookup.
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

      // Structured references.
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

      // Formula-bearing scalar fields. (`speeds` are plain numbers, not
      // formulas, so they carry no class-reference leaves.)
      filled.acFormula = remapOptional(filled.acFormula, idFor);
      filled.initiativeFormula = remapOptional(filled.initiativeFormula, idFor);
      filled.maxHp = remapOptional(filled.maxHp, idFor);

      // Attacks (to-hit + per-damage-type formulas).
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

      // Text-component formula slots.
      filled.equipment = remapTextList(filled.equipment, idFor);
      filled.features = remapTextList(filled.features, idFor);
      if (filled.personality && typeof filled.personality === "object")
        filled.personality = {
          traits: remapTextList(filled.personality.traits, idFor),
          ideals: remapTextList(filled.personality.ideals, idFor),
          bonds: remapTextList(filled.personality.bonds, idFor),
          flaws: remapTextList(filled.personality.flaws, idFor),
        };

      // Limited-use abilities (info formulas + the maxUses pool formula).
      if (Array.isArray(filled.limitedUseAbilities))
        filled.limitedUseAbilities = filled.limitedUseAbilities.map(
          (lua: any) => ({
            ...lua,
            info: remapText(lua.info, idFor),
            maxUses: remapFormula(lua.maxUses, idFor),
          }),
        );

      // Spells: retag each to its class id, remap its info + mechanics formulas.
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
    // Attacks gained a stable `id` (so ammunition entries can reference the
    // weapons they feed by id) and an optional `range`. Ammunition itself became
    // a first-class list. Old attacks get a fresh id; ammunition starts empty.
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
    // Damage resistances / immunities / vulnerabilities became a first-class,
    // intrinsic property (`damageModifiers`). Legacy saves tracked none, so start
    // all three lists empty.
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
    // Per-skill bonus formulas got a home (`proficiencies.skillBonuses`) for
    // Remarkable Athlete / Stone of Good Luck / Observant etc. Seed it empty.
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
    // Equipment became a structured list (`EquipmentItem`) instead of free-text
    // `TextComponent[]`, so the sheet can run attunement + encumbrance rules.
    // Each legacy component is wrapped verbatim into an item's `text`, defaulting
    // quantity to 1 and equipped to false; `weight` and `attunement` stay absent
    // (both optional). The new `attunementSlots` override is optional too, so it
    // needs no backfill.
    to: 9,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled = { ...character };
      if (Array.isArray(filled.equipment))
        filled.equipment = filled.equipment.map((entry: any) =>
          // Idempotency guard: a value already shaped like an item is left alone.
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
];

// Sorted, append-only safety: ensures we apply migrations in ascending order
// regardless of array order.
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
