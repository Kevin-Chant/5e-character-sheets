import { Character } from "src/lib/types";
import { syncClassPools, syncRacePools } from "src/lib/builder/class-pools";
import { syncOptionHosts } from "src/lib/builder/level-grants";

// Content counterpart to migrate-character.ts, not a migration: runs the same
// idempotent convergers a level-up runs (create missing pools/action hosts,
// re-derive level-scaled numbers, leave hand-edits alone) on every load, so a
// catalog addition reaches existing sheets without a new migration per change.
//
// Can only re-derive what the sheet recorded — a pool gated on a feature the
// character never picked (`requiresFeature`) stays absent until that choice is
// recorded. Runs after validation (assumes a valid Character), unlike
// migrations which run on raw storage. Mutates in place; returns whether
// anything changed.
export function reconcileCharacterContent(character: Character): boolean {
  const before = JSON.stringify(character.limitedUseAbilities ?? []);
  for (const klass of character.class) syncClassPools(character, klass);
  syncRacePools(character, [
    // Same list applyClassLevel passes.
    ...(character.limitedUseAbilities ?? []).map((a) => a.info.title),
    ...(character.features ?? []).map((f) => f.title),
  ]);
  syncOptionHosts(character);
  return JSON.stringify(character.limitedUseAbilities) !== before;
}
