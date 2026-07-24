// Subclass name -> class level -> SRD/non-SRD spell indices granted (always
// prepared) on reaching that level. The by-level spell counterpart to
// `subclass-features/` — a paladin oath's spells at 3/5/9/13/17, a warlock
// patron's expanded list at 1/3/5/7/9, a cleric domain's higher tiers, an
// artificer subclass's spells.
//
// Merged onto `subclassSpellIndicesAt` alongside the inline
// `grants.spellIndicesByLevel`, and granted idempotently by `applyClassLevel`.
// Indices reference the full bundled catalog (SRD + non-SRD); any that still
// don't resolve are silently skipped, so a spell not yet in the catalog just
// isn't handed out (the feature prose still names it).
export type SubclassSpellTable = Record<string, Record<number, string[]>>;
