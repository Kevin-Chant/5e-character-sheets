import { randomUUID } from "src/lib/browser";
import { Character, Spell } from "src/lib/types";
import { getSrdSpell } from "src/lib/spells/srd-spells";
import { buildSpellFromSrd } from "src/lib/spells/srd-spell-adapter";

/**
 * Push an SRD spell (by index) into the right `character.spells` bucket,
 * attributed to `className` when the character has it.
 *
 * Lives in its own module because both the grant path (`level-grants.ts`, for a
 * subclass's domain spells) and the level-up wizard (for feat- and
 * level-granted spells) need it — putting it in either would make the two
 * import each other.
 */
export function addSrdSpell(
  char: Character,
  index: string,
  className: string,
): void {
  const srd = getSrdSpell(index);
  if (!srd) return;
  // Resolve the class name to its stable id (spells reference classes by id),
  // falling back to the character's first class when the name doesn't match.
  const classId =
    char.class.find((c) => c.name === className)?.id ??
    char.class[0]?.id ??
    randomUUID();
  const spell: Spell = buildSpellFromSrd(srd, classId);
  const bucket = (char.spells[srd.level as keyof typeof char.spells] ??= []);
  bucket.push(spell);
}

/**
 * Like `addSrdSpell`, but a no-op if the spell is already in its bucket for this
 * class. Used by the sub-choice spell grants (a Land druid's terrain spells),
 * which are re-evaluated on every level-up — so re-running a level can't stack
 * duplicate copies the way a plain `addSrdSpell` would.
 */
export function addSrdSpellOnce(
  char: Character,
  index: string,
  className: string,
): void {
  const srd = getSrdSpell(index);
  if (!srd) return;
  const bucket = char.spells[srd.level as keyof typeof char.spells] ?? [];
  const name = srd.name.trim().toLowerCase();
  if (bucket.some((s) => s.info.title.trim().toLowerCase() === name)) return;
  addSrdSpell(char, index, className);
}
