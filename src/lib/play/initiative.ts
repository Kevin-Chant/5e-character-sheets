import { FIELD } from "src/lib/data/data-definitions";
import { calculateCustomFormula } from "src/lib/formula";
import { getOptionalInitializer } from "src/lib/rules";
import { Character } from "src/lib/types";

// The one modifier the app can genuinely roll on a character's behalf.
// `initiativeFormula` is an optional override, so it resolves through the
// initializer the way the sheet's Initiative box does — unset means "derive
// it from DEX", not "no initiative". Shared by the player rail's roll button
// and the DM's "roll for the sheets I brought".
export function initiativeModifierFor(character: Character): number {
  const formula =
    character.initiativeFormula ??
    getOptionalInitializer(FIELD.initiativeFormula, undefined, character);
  return formula ? calculateCustomFormula(formula, character) : 0;
}
