// Build-time snapshot of the SRD class catalog (level-1 slice).
//
// Walks every class in the open-license D&D 5e API and flattens the level-1
// facts the guided character builder needs into the compact `SrdClass` shape
// consumed by `src/lib/builder/srd-classes.ts`. Committed as
// `src/lib/data/srd-classes.json` (offline, zero runtime network). Re-run with
// `pnpm generate-classes`. Mirrors `generate-spells.mjs` / `generate-races.mjs`.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ORIGIN = process.env.DND5E_ORIGIN ?? "https://www.dnd5eapi.co";
const BASE = `${ORIGIN}/api/2014`;

async function getJson(path) {
  const url = path.startsWith("/api/") ? `${ORIGIN}${path}` : `${BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

// Classes whose subclass ("Divine Domain", "Sorcerous Origin", "Otherworldly
// Patron") is chosen at level 1. Everyone else defers to a later level.
const SUBCLASS_AT_1 = new Set(["cleric", "sorcerer", "warlock"]);

// Categorise fixed class proficiencies by fetching each one's `type`. Saving
// throws and skills are handled through their own dedicated fields.
async function resolveProficiencies(refs) {
  const armor = [];
  const weapons = [];
  const tools = [];
  for (const ref of refs ?? []) {
    const p = await getJson(ref.url);
    if (p.type === "Saving Throws" || p.type === "Skills") continue;
    if (p.type === "Armor") armor.push(p.name);
    else if (p.type === "Weapons") weapons.push(p.name);
    else tools.push(p.name);
  }
  return { armor, weapons, tools };
}

// The skill-typed proficiency_choice → { choose, from: [skillName, ...] }.
function skillChoices(choices) {
  for (const pc of choices ?? []) {
    const opts = pc.from?.options ?? [];
    const skills = opts
      .map((o) => o.item?.name)
      .filter((n) => n?.startsWith("Skill: "))
      .map((n) => n.replace(/^Skill: /, ""));
    if (skills.length) return { choose: pc.choose, from: skills };
  }
  return undefined;
}

// starting_equipment_options carry a ready-made human string, e.g.
// "(a) a quarterstaff or (b) a dagger" — perfect as a builder choice label.
const equipmentOptions = (opts) =>
  (opts ?? []).map((o) => o.desc).filter(Boolean);

const fixedEquipment = (eq) =>
  (eq ?? []).map((e) =>
    e.quantity > 1 ? `${e.equipment.name} (${e.quantity})` : e.equipment.name,
  );

async function resolveFeatures(refs) {
  const out = [];
  for (const ref of refs ?? []) {
    const f = await getJson(ref.url);
    out.push({ title: f.name, detail: (f.desc ?? []).join("\n\n") });
  }
  return out;
}

// level-1 spellcasting, or undefined for non/late casters (Paladin/Ranger start
// at level 2 and so have no level-1 spellcasting block).
function spellcasting(classDetail, levelOne) {
  const sc = levelOne.spellcasting;
  if (!sc) return undefined;
  return {
    ability: classDetail.spellcasting?.spellcasting_ability?.index,
    cantripsKnown: sc.cantrips_known ?? 0,
    // Prepared casters (Wizard/Cleric/Druid) have no spells_known count.
    spellsKnown: sc.spells_known ?? null,
    slotsLevel1: sc.spell_slots_level_1 ?? 0,
  };
}

async function buildClass(ref) {
  const c = await getJson(ref.url);
  const levelOne = await getJson(`/classes/${c.index}/levels/1`);
  return {
    index: c.index,
    name: c.name,
    hitDie: c.hit_die,
    savingThrows: (c.saving_throws ?? []).map((s) => s.index),
    skillChoices: skillChoices(c.proficiency_choices),
    proficiencies: await resolveProficiencies(c.proficiencies),
    startingEquipment: fixedEquipment(c.starting_equipment),
    startingEquipmentOptions: equipmentOptions(c.starting_equipment_options),
    spellcasting: spellcasting(c, levelOne),
    subclassAtLevel1: SUBCLASS_AT_1.has(c.index),
    features: await resolveFeatures(levelOne.features),
  };
}

async function main() {
  const { results } = await getJson("/classes");
  const classes = [];
  for (const ref of results) {
    process.stderr.write(`class: ${ref.index}\n`);
    classes.push(await buildClass(ref));
  }
  const outPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../src/lib/data/srd-classes.json",
  );
  await writeFile(outPath, JSON.stringify(classes, null, 2) + "\n");
  process.stderr.write(`Wrote ${classes.length} classes → ${outPath}\n`);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exit(1);
});
