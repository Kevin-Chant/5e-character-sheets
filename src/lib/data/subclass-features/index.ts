import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";
import { ARTIFICER_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/artificer";
import { BARBARIAN_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/barbarian";
import { BARD_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/bard";
import { CLERIC_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/cleric";
import { DRUID_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/druid";
import { FIGHTER_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/fighter";
import { MONK_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/monk";
import { PALADIN_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/paladin";
import { RANGER_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/ranger";
import { ROGUE_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/rogue";
import { SORCERER_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/sorcerer";
import { WARLOCK_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/warlock";
import { WIZARD_SUBCLASS_FEATURES } from "src/lib/data/subclass-features/wizard";

// Class index -> subclass name -> class level -> features.
export const SUBCLASS_FEATURES: Record<string, SubclassFeatureTable> = {
  artificer: ARTIFICER_SUBCLASS_FEATURES,
  barbarian: BARBARIAN_SUBCLASS_FEATURES,
  bard: BARD_SUBCLASS_FEATURES,
  cleric: CLERIC_SUBCLASS_FEATURES,
  druid: DRUID_SUBCLASS_FEATURES,
  fighter: FIGHTER_SUBCLASS_FEATURES,
  monk: MONK_SUBCLASS_FEATURES,
  paladin: PALADIN_SUBCLASS_FEATURES,
  ranger: RANGER_SUBCLASS_FEATURES,
  rogue: ROGUE_SUBCLASS_FEATURES,
  sorcerer: SORCERER_SUBCLASS_FEATURES,
  warlock: WARLOCK_SUBCLASS_FEATURES,
  wizard: WIZARD_SUBCLASS_FEATURES,
};
