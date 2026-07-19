// Build-time snapshot of the SRD race catalog.
//
// Walks every race (and subrace) in the open-license D&D 5e API and flattens
// each into the compact `SrdRace` shape consumed by `src/lib/builder/srd-races.ts`.
// Committed as `src/lib/data/srd-races.json` so the app ships the whole catalog
// and makes zero runtime network requests (works offline). Re-run with
// `pnpm generate-races` to refresh. Same instinct as `generate-spells.mjs`.
//
// A couple of race choices the 2014 API does not model structurally (notably
// Half-Elf "Skill Versatility") are supplied via the small hardcoded overrides
// below.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ORIGIN = process.env.DND5E_ORIGIN ?? "https://www.dnd5eapi.co";
const BASE = `${ORIGIN}/api/2014`;

async function getJson(path) {
  // Accept either a bare path ("/races/elf") or a full API url from a $ref
  // ("/api/2014/traits/darkvision").
  const url = path.startsWith("/api/") ? `${ORIGIN}${path}` : `${BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

const ALL_SKILLS = [
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival",
];

// Race skill-choice grants the 2014 API leaves in prose rather than structured
// data. Keyed by race index.
const SKILL_CHOICE_OVERRIDES = {
  "half-elf": { choose: 2, from: ALL_SKILLS },
};

// Resolve an ability-bonuses array → [{ stat, bonus }].
const abilityBonuses = (arr) =>
  (arr ?? []).map((b) => ({ stat: b.ability_score.index, bonus: b.bonus }));

// Half-Elf-style "choose N of these +1s" → { choose, from: [stat, ...] }.
function abilityBonusOptions(opts) {
  if (!opts?.from?.options) return undefined;
  return {
    choose: opts.choose,
    from: opts.from.options.map((o) => o.ability_score.index),
  };
}

// language_options → number of free extra languages (we don't constrain which).
const languageChoices = (opts) => opts?.choose ?? undefined;

// Fetch trait $refs → compact [{ title, detail }] feature lines. The SRD is
// open-license, so bundling the descriptions (as we already do for spells) is
// fine.
async function resolveTraits(refs) {
  const out = [];
  for (const ref of refs ?? []) {
    const t = await getJson(ref.url);
    out.push({ title: t.name, detail: (t.desc ?? []).join("\n\n") });
  }
  return out;
}

// Categorise a starting_proficiencies list into { armor, weapons, tools } by
// fetching each proficiency's `type`.
async function resolveProficiencies(refs) {
  const armor = [];
  const weapons = [];
  const tools = [];
  for (const ref of refs ?? []) {
    const p = await getJson(ref.url);
    const name = p.name.replace(/^Skill: /, "");
    if (p.type === "Armor" || name === "Shields") armor.push(name);
    else if (p.type === "Weapons") weapons.push(name);
    else if (p.type === "Skills")
      continue; // handled as skill proficiencies
    else tools.push(name);
  }
  return { armor, weapons, tools };
}

async function buildSubrace(ref) {
  const s = await getJson(ref.url);
  return {
    index: s.index,
    name: s.name,
    abilityBonuses: abilityBonuses(s.ability_bonuses),
    languageChoices: languageChoices(s.language_options),
    proficiencies: await resolveProficiencies(s.starting_proficiencies),
    traits: await resolveTraits(s.racial_traits),
  };
}

async function buildRace(ref) {
  const r = await getJson(ref.url);
  const subraces = [];
  for (const sr of r.subraces ?? []) subraces.push(await buildSubrace(sr));
  return {
    index: r.index,
    name: r.name,
    size: r.size,
    speed: r.speed,
    abilityBonuses: abilityBonuses(r.ability_bonuses),
    abilityBonusOptions: abilityBonusOptions(r.ability_bonus_options),
    languages: (r.languages ?? []).map((l) => l.name),
    languageChoices: languageChoices(r.language_options),
    skillChoices: SKILL_CHOICE_OVERRIDES[r.index],
    proficiencies: await resolveProficiencies(r.starting_proficiencies),
    traits: await resolveTraits(r.traits),
    subraces,
  };
}

async function main() {
  const { results } = await getJson("/races");
  const races = [];
  for (const ref of results) {
    process.stderr.write(`race: ${ref.index}\n`);
    races.push(await buildRace(ref));
  }
  const outPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../src/lib/data/srd-races.json",
  );
  await writeFile(outPath, JSON.stringify(races, null, 2) + "\n");
  process.stderr.write(`Wrote ${races.length} races → ${outPath}\n`);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exit(1);
});
