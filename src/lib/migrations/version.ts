// The schema version the current code writes. Bump by one when adding a
// migration in migrate-character.ts. Kept separate to avoid a cycle: the
// default character template references this without importing the migration
// runner, which imports the template.
export const CURRENT_SCHEMA_VERSION = 13;
