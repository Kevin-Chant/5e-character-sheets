import type { SrdSpell } from "src/lib/spells/srd-spells";
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

// Non-SRD spells — the ~165 official spells (PHB/XGE/TCE/…) that aren't in the
// open-license SRD 5.1 the `srd-spells.json` snapshot covers. Unearthed Arcana
// (beta) content is deliberately excluded.
//
// LICENSING (non-negotiable, same rule as `nonsrd-races.ts`/`subclasses.ts`):
// these store only **mechanical facts** — level, school, casting time, range,
// duration, components, save/attack, damage dice and type, area, class lists —
// which are not copyrightable. Every `desc` is an **original paraphrase** of
// what the spell does, written from scratch; never the published prose. Kept in
// separate hand-authored files (not the SRD JSON) so the line stays bright.
//
// Merged into the searchable/grantable catalog by `src/lib/spells/srd-spells.ts`
// exactly like SRD spells, so the picker shows them and `getSrdSpell(index)`
// (used by the subclass spell grants) resolves them by index.
export const NONSRD_SPELLS: SrdSpell[] = [
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
];
