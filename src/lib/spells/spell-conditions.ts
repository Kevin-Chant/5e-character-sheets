import { normalizeTitle } from "src/lib/mechanics/catalog";
import { ConditionName } from "src/lib/play/conditions";
import { Spell } from "src/lib/types";

// Which condition a spell puts on its targets — an overlay keyed by title,
// looked up at cast time, deliberately NOT a field on `Spell.mechanics`:
//
// - A character's spells are embedded copies, so a mechanics field would miss
//   every already-imported sheet and need a migration; a title lookup reaches
//   them all today.
// - The SRD mechanics JSON is generator-owned (`pnpm generate-spells`), and a
//   hand-added field there would be silently regenerated away. This file is
//   hand-authored and survives.
//
// The `name` keys the bundled `CONDITION_MECHANICS` catalog (wired riders,
// summary) when an entry exists there; otherwise the condition is a plain
// advisory chip on the target's row. `rounds` is the duration in rounds where
// one is defined and combat-shaped — the encounter ticks it down.
//
// Seeded with exemplars for each class the fan-out will fill in: a wired
// party buff (Bless), a wired cantrip buff (Guidance), and a save-gated
// debuff with no riders (Hideous Laughter).

export interface SpellConditionGrant {
  name: ConditionName;
  rounds?: number;
  note?: string;
}

const SPELL_CONDITIONS: Record<string, SpellConditionGrant> = {
  bless: { name: "Bless", rounds: 10, note: "Concentration, up to 1 minute" },
  guidance: {
    name: "Guidance",
    note: "Concentration; ends after the check it boosts",
  },
  // The SRD's title (no "Tasha's" — that name isn't open content).
  "hideous laughter": {
    name: "Hideous Laughter",
    rounds: 10,
    note: "On a failed save; repeats the save when damaged",
  },
};

export function spellConditionFor(
  spell: Spell | undefined,
): SpellConditionGrant | undefined {
  if (!spell) return undefined;
  return SPELL_CONDITIONS[normalizeTitle(spell.info.title)];
}
