import { Character } from "src/lib/types";
import { syncClassPools, syncRacePools } from "src/lib/builder/class-pools";
import { syncOptionHosts } from "src/lib/builder/level-grants";

// The content counterpart to migrate-character.ts, and deliberately not a
// migration: schema migrations are frozen once shipped and run exactly once,
// which is the wrong shape for catalog wiring that keeps growing — a character
// built before a subclass's pools were authored would need a new migration per
// catalog change, each duplicating what the sync helpers already do. Instead
// this runs the same idempotent convergers a level-up runs (create missing
// pools/action hosts, re-derive level-scaled numbers, leave hand-edits alone)
// on every load, so a catalog addition reaches existing sheets with no
// bookkeeping.
//
// It can only re-derive what the sheet recorded: a pool gated on a feature the
// character never picked (`requiresFeature`) stays absent until the player
// records that choice. Riders need no reconciling at all — they resolve at
// roll time by title against the catalog.
//
// Runs after validation (the syncs assume a valid Character), unlike
// migrations, which run before it on raw storage. Mutates in place, like the
// syncs it wraps; returns whether anything changed so the caller can fold it
// into write-on-read persistence.
export function reconcileCharacterContent(character: Character): boolean {
  const before = JSON.stringify(character.limitedUseAbilities ?? []);
  for (const klass of character.class) syncClassPools(character, klass);
  syncRacePools(character, [
    // Same list applyClassLevel passes: existing pools refresh by their own
    // title, feature titles let racial pools and innate-spell tiers appear.
    ...(character.limitedUseAbilities ?? []).map((a) => a.info.title),
    ...(character.features ?? []).map((f) => f.title),
  ]);
  syncOptionHosts(character);
  return JSON.stringify(character.limitedUseAbilities) !== before;
}
