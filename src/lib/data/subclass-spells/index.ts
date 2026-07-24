import { SubclassSpellTable } from "src/lib/data/subclass-spells/types";
import { PALADIN_SUBCLASS_SPELLS } from "./paladin";
import { WARLOCK_SUBCLASS_SPELLS } from "./warlock";
import { CLERIC_SUBCLASS_SPELLS } from "./cleric";
import { SORCERER_SUBCLASS_SPELLS } from "./sorcerer";
import { RANGER_SUBCLASS_SPELLS } from "./ranger";
import { ARTIFICER_SUBCLASS_SPELLS } from "./artificer";
import { DRUID_SUBCLASS_SPELLS } from "./druid";

// Class index -> subclass name -> class level -> spell indices.
export const SUBCLASS_SPELLS: Record<string, SubclassSpellTable> = {
  paladin: PALADIN_SUBCLASS_SPELLS,
  warlock: WARLOCK_SUBCLASS_SPELLS,
  cleric: CLERIC_SUBCLASS_SPELLS,
  sorcerer: SORCERER_SUBCLASS_SPELLS,
  ranger: RANGER_SUBCLASS_SPELLS,
  artificer: ARTIFICER_SUBCLASS_SPELLS,
  druid: DRUID_SUBCLASS_SPELLS,
};
