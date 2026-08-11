import type { CatalogSpell } from "src/lib/spells/spell-catalog";
import { NONSRD_SPELLS_PART1 } from "./part1";
import { NONSRD_SPELLS_PART2 } from "./part2";
import { NONSRD_SPELLS_PART3 } from "./part3";
import { NONSRD_SPELLS_PART4 } from "./part4";
import { NONSRD_SPELLS_PART5 } from "./part5";
import { NONSRD_SPELLS_PART6 } from "./part6";
import { NONSRD_SPELLS_PART7 } from "./part7";
import { NONSRD_SPELLS_PART8 } from "./part8";
import { NONSRD_SPELLS_PART9 } from "./part9";
import { NONSRD_SPELLS_PART10 } from "./part10";
import { NONSRD_SPELLS_PART11 } from "./part11";
import { GAP_SPELLS_L0 } from "./gap-L0";
import { GAP_SPELLS_L1 } from "./gap-L1";
import { GAP_SPELLS_L2 } from "./gap-L2";
import { GAP_SPELLS_L3 } from "./gap-L3";
import { GAP_SPELLS_L4 } from "./gap-L4";
import { GAP_SPELLS_L5 } from "./gap-L5";
import { GAP_SPELLS_L6 } from "./gap-L6";
import { GAP_SPELLS_L7 } from "./gap-L7";
import { GAP_SPELLS_L8 } from "./gap-L8";
import { GAP_SPELLS_L9 } from "./gap-L9";

// Non-SRD spells — the ~165 official spells (PHB/XGE/TCE/…) that aren't in the
// open-license SRD 5.1 the `srd-spells.json` snapshot covers. Unearthed Arcana
// (beta) content is deliberately excluded.
//
// LICENSING (same rule as `nonsrd-races.ts`/`subclasses.ts`): only mechanical
// facts are stored (level, school, casting time, range, duration, components,
// save/attack, damage dice and type, area, class lists), which are not
// copyrightable. Every `desc` is an original paraphrase, never published prose.
//
// Merged into the searchable/grantable catalog by `src/lib/spells/spell-catalog.ts`
// exactly like SRD spells, so the picker shows them and `getCatalogSpell(index)`
// (used by the subclass spell grants) resolves them by index.
export const NONSRD_SPELLS: CatalogSpell[] = [
  ...NONSRD_SPELLS_PART1,
  ...NONSRD_SPELLS_PART2,
  ...NONSRD_SPELLS_PART3,
  ...NONSRD_SPELLS_PART4,
  ...NONSRD_SPELLS_PART5,
  ...NONSRD_SPELLS_PART6,
  ...NONSRD_SPELLS_PART7,
  ...NONSRD_SPELLS_PART8,
  ...NONSRD_SPELLS_PART9,
  ...NONSRD_SPELLS_PART10,
  ...NONSRD_SPELLS_PART11,
  ...GAP_SPELLS_L0,
  ...GAP_SPELLS_L1,
  ...GAP_SPELLS_L2,
  ...GAP_SPELLS_L3,
  ...GAP_SPELLS_L4,
  ...GAP_SPELLS_L5,
  ...GAP_SPELLS_L6,
  ...GAP_SPELLS_L7,
  ...GAP_SPELLS_L8,
  ...GAP_SPELLS_L9,
];
