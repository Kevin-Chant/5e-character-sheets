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
