// Build-time snapshot of the SRD spell catalog.
//
// Walks every spell in the (open-license, SRD-only) D&D 5e API and flattens each
// into the compact `SrdSpell` shape consumed by `src/lib/spells/srd-spells.ts`.
// The result is committed as `src/lib/data/srd-spells.json` so the app ships the
// whole catalog and makes *zero* network requests at runtime — it works offline
// and never depends on the third-party API being up. Re-run (`pnpm
// generate-spells`) to refresh.
//
// Why bundle instead of fetch-at-runtime: the SRD is static, ~319 spells is a
// small payload, and a backend-less SPA shouldn't fan out live calls (rate
// limits, CORS, uptime) for data that never changes. Same instinct as the
// weapon presets in `src/lib/rules.ts`.
//
// We use the REST detail endpoint rather than one GraphQL query: the GraphQL
// schema declares `damage_at_slot_level` non-nullable but returns null for
// cantrips, which intermittently 500s the whole batch. REST returns the damage
// tables as plain nullable JSON, so per-spell fetches (bounded concurrency, a
// rarely-run build step) are the reliable path.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ORIGIN = process.env.DND5E_ORIGIN ?? "https://www.dnd5eapi.co";
const BASE = `${ORIGIN}/api/2014`;
const CONCURRENCY = 8;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

const STANDARD_FACES = new Set([4, 6, 8, 10, 12, 20]);

// Parse "NdM" → a DieExpression `[count, die, "roll"]` (die = "d6" when standard,
// else a NonStandardDie `{ numFaces }`). Anything else → undefined.
function parseRoll(value) {
  const m = /^(\d+)d(\d+)$/.exec((value ?? "").trim());
  if (!m) return undefined;
  const count = Number(m[1]);
  const faces = Number(m[2]);
  if (count < 1) return undefined;
  const die = STANDARD_FACES.has(faces) ? `d${faces}` : { numFaces: faces };
  return [count, die, "roll"];
}

// Sorted [level, DieExpression] rows for a scaling table, or undefined if any
// entry isn't a clean NdM roll (then we can't model it structurally).
function parseTable(table) {
  const rows = Object.keys(table ?? {})
    .map(Number)
    .sort((a, b) => a - b)
    .map((lvl) => [lvl, parseRoll(table[String(lvl)])]);
  return rows.length && rows.every(([, roll]) => roll) ? rows : undefined;
}

// die is "d6" or { numFaces } — compare structurally.
const sameFaces = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Lowest-level entry of a scaling table is the "base" roll we surface as a live
// formula in the detail line (e.g. Fireball's 8d6). REST returns these tables as
// objects keyed by level ({ "3": "8d6", ... }).
function baseDamageRoll(damage) {
  const table =
    damage?.damage_at_slot_level ?? damage?.damage_at_character_level;
  const levels = Object.keys(table ?? {});
  if (!levels.length) return undefined;
  const lowest = levels.map(Number).sort((a, b) => a - b)[0];
  return table[String(lowest)] || undefined;
}

// Map an SRD save/attack descriptor to a SpellResolution.
function buildResolution(s) {
  if (s.attack_type) return { kind: "attack", range: s.attack_type };
  if (s.dc?.dc_type?.name)
    return {
      kind: "save",
      ability: s.dc.dc_type.name.toLowerCase(), // "DEX" → "dex" (StatKey)
      ...(s.dc.dc_success === "half" ? { halfOnSuccess: true } : {}),
    };
  return { kind: "auto" };
}

// The spell's caster ability modifier, as a spellMod leaf. The class is a
// placeholder the adapter stamps with the real spellcasting class at add time.
const SPELLMOD_CASTER = { spellMod: "@caster" };

// Parse a heal entry: "Nd8 + MOD" (dice + caster mod), "Nd8", or "70" (flat).
function parseHeal(value) {
  const s = (value ?? "").trim();
  const mod = /\+\s*MOD$/i.test(s);
  const core = s.replace(/\s*\+\s*MOD$/i, "").trim();
  const roll = parseRoll(core);
  if (roll) return { roll, mod };
  if (/^\d+$/.test(core)) return { flat: Number(core), mod };
  return undefined;
}

function parseHealRows(table) {
  const rows = Object.keys(table ?? {})
    .map(Number)
    .sort((a, b) => a - b)
    .map((lvl) => [lvl, parseHeal(table[String(lvl)])]);
  return rows.length && rows.every(([, h]) => h) ? rows : undefined;
}

// A healing formula from a parsed entry: dice or flat, plus the caster mod when
// the SRD marked it "+ MOD".
function healFormula(h) {
  const amount = h.roll ?? h.flat;
  return h.mod
    ? { operation: "addition", operands: [amount, SPELLMOD_CASTER] }
    : amount;
}

// The per-slot healing increment, if the table scales linearly (same die, or a
// flat step). The caster mod is fixed and does not scale, so it's not included.
function healScaling(rows) {
  const spacing = rows[1][0] - rows[0][0];
  const [, first] = rows[0];
  const uniform = (ok) =>
    rows.every(
      ([lvl, h], i) =>
        i === 0 || (lvl - rows[i - 1][0] === spacing && ok(h, rows[i - 1][1])),
    );

  if (first.roll) {
    const inc = rows[1][1].roll[0] - first.roll[0];
    if (
      inc > 0 &&
      uniform(
        (h, p) =>
          h.roll &&
          p.roll &&
          sameFaces(h.roll[1], first.roll[1]) &&
          h.roll[0] - p.roll[0] === inc,
      )
    )
      return { perLevels: spacing, healing: [inc, first.roll[1], "roll"] };
  }
  if (first.flat !== undefined) {
    const inc = rows[1][1].flat - first.flat;
    if (
      inc > 0 &&
      uniform((h, p) => h.flat !== undefined && h.flat - p.flat === inc)
    )
      return { perLevels: spacing, healing: inc };
  }
  return undefined;
}

// Build the structured SpellMechanics from an SRD spell's damage and/or healing
// tables. Damage emits a compact `scaling` rule (or an exact `damageTable`);
// healing emits a base formula plus its per-slot increment. Returns undefined
// when the spell has neither.
function buildMechanics(s) {
  const mechanics = { level: s.level, resolution: buildResolution(s) };

  // --- Damage ---
  const dmg = s.damage;
  const type = dmg?.damage_type?.name;
  const charTable = dmg?.damage_at_character_level;
  const rows = parseTable(dmg?.damage_at_slot_level ?? charTable);
  if (type && rows) {
    const driver = charTable ? "character" : "slot";
    const base = rows[0][1];
    mechanics.damage = [{ damageType: type, formula: base }];
    if (rows.length > 1) {
      const spacing = rows[1][0] - rows[0][0];
      const incCount = rows[1][1][0] - rows[0][1][0];
      const die = base[1];
      const linear = rows.every(([lvl, roll], i) => {
        if (i === 0) return true;
        // The character driver uses fixed 5/11/17 tiers, so uneven spacing is
        // expected — only the same-die, +N-per-step shape must hold.
        const spacingOk =
          driver === "character" || lvl - rows[i - 1][0] === spacing;
        return (
          sameFaces(roll[1], die) &&
          spacingOk &&
          roll[0] - rows[i - 1][1][0] === incCount
        );
      });
      if (linear && incCount > 0) {
        mechanics.scaling = {
          driver,
          ...(driver === "slot" ? { perLevels: spacing } : {}),
          damage: [{ damageType: type, formula: [incCount, die, "roll"] }],
        };
      } else {
        mechanics.damageTable = Object.fromEntries(
          rows.map(([lvl, roll]) => [
            lvl,
            [{ damageType: type, formula: roll }],
          ]),
        );
      }
    }
  }

  // --- Healing ---
  const healRows = parseHealRows(s.heal_at_slot_level);
  if (healRows) {
    mechanics.healing = healFormula(healRows[0][1]);
    const hs = healRows.length > 1 ? healScaling(healRows) : undefined;
    if (hs)
      mechanics.scaling = {
        ...(mechanics.scaling ?? {}),
        driver: "slot",
        perLevels: hs.perLevels,
        healing: hs.healing,
      };
  }

  return mechanics.damage || mechanics.healing ? mechanics : undefined;
}

function toSrdSpell(s) {
  const components = s.components ?? [];
  const out = {
    index: s.index,
    name: s.name,
    level: s.level,
    school: s.school?.name ?? "",
    castingTime: s.casting_time ?? "",
    range: s.range ?? "",
    duration: s.duration ?? "",
    concentration: !!s.concentration,
    ritual: !!s.ritual,
    verbal: components.includes("V"),
    somatic: components.includes("S"),
    classes: (s.classes ?? []).map((c) => c.name).sort(),
    desc: (s.desc ?? []).join("\n\n"),
  };
  if (components.includes("M") && s.material) out.material = s.material;
  if (s.higher_level?.length) out.higherLevel = s.higher_level.join("\n\n");
  if (s.dc?.dc_type?.name) out.save = s.dc.dc_type.name;
  if (s.damage?.damage_type?.name) out.damageType = s.damage.damage_type.name;
  const base = baseDamageRoll(s.damage);
  if (base) out.baseDamage = base;
  if (s.area_of_effect)
    out.areaOfEffect = `${s.area_of_effect.size}-foot ${s.area_of_effect.type}`;
  const mechanics = buildMechanics(s);
  if (mechanics) out.mechanics = mechanics;
  return out;
}

// Resolve `tasks` (thunks returning promises) `limit` at a time.
async function pool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function main() {
  process.stdout.write(`Fetching SRD spell index from ${BASE} …\n`);
  const list = await getJson(`${BASE}/spells`);
  process.stdout.write(
    `Fetching ${list.count} spell details (${CONCURRENCY} at a time) …\n`,
  );
  const details = await pool(
    list.results.map((r) => () => getJson(`${ORIGIN}${r.url}`)),
    CONCURRENCY,
  );

  const spells = details
    .map(toSrdSpell)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const outPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../src/lib/data/srd-spells.json",
  );
  await writeFile(outPath, JSON.stringify(spells, null, 2) + "\n");
  process.stdout.write(
    `Wrote ${spells.length} spells (${spells.filter((s) => s.baseDamage).length} with a base damage roll) → ${outPath}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`generate-spells failed: ${err.message}\n`);
  process.exit(1);
});
