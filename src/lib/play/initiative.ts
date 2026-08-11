import { FIELD } from "src/lib/data/data-definitions";
import { calculateCustomFormula } from "src/lib/formula";
import { getOptionalInitializer } from "src/lib/rules";
import { Character } from "src/lib/types";

// `initiativeFormula` is optional; unset means derive from DEX via the same
// initializer the sheet's Initiative box uses.
export function initiativeModifierFor(character: Character): number {
  const formula =
    character.initiativeFormula ??
    getOptionalInitializer(FIELD.initiativeFormula, undefined, character);
  return formula ? calculateCustomFormula(formula, character) : 0;
}
