import { randomUUID } from "src/lib/browser";
import { Character, Spell } from "src/lib/types";
import { getCatalogSpell } from "src/lib/spells/spell-catalog";
import { buildSpellFromCatalog } from "src/lib/spells/spell-adapter";
import { isPreparedCaster } from "src/lib/rules";

/**
 * Push a catalog spell (by index) into the right `character.spells` bucket,
 * attributed to `className` when the character has it.
 *
 * Own module to avoid `level-grants.ts` and the level-up wizard importing
 * each other.
 */
export function addCatalogSpell(
  char: Character,
  index: string,
  className: string,
  alwaysPrepared = false,
): void {
  const entry = getCatalogSpell(index);
  if (!entry) return;
  // Spells reference classes by id, not name; fall back to the first class.
  const classId =
    char.class.find((c) => c.name === className)?.id ??
    char.class[0]?.id ??
    randomUUID();
  const spell: Spell = buildSpellFromCatalog(entry, classId);
  // Only a prepared caster has an allowance for this to sit outside; for a
  // known caster an expanded list is still a list of spells to learn.
  if (alwaysPrepared && entry.level > 0 && isPreparedCaster(className)) {
    spell.alwaysPrepared = true;
    spell.prepared = true;
  }
  const bucket = (char.spells[entry.level as keyof typeof char.spells] ??= []);
  bucket.push(spell);
}

/**
 * Like `addCatalogSpell`, but a no-op if the spell is already in its bucket.
 * For sub-choice spell grants (a Land druid's terrain spells) that are
 * re-evaluated on every level-up.
 */
export function addCatalogSpellOnce(
  char: Character,
  index: string,
  className: string,
  alwaysPrepared = false,
): void {
  const entry = getCatalogSpell(index);
  if (!entry) return;
  const bucket = char.spells[entry.level as keyof typeof char.spells] ?? [];
  const name = entry.name.trim().toLowerCase();
  if (bucket.some((s) => s.info.title.trim().toLowerCase() === name)) return;
  addCatalogSpell(char, index, className, alwaysPrepared);
}
