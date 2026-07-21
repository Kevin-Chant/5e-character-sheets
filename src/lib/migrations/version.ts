// The schema version the current code writes. Bump this by one whenever you add
// a migration in migrate-character.ts. Kept in its own file so the default
// character template can reference it without importing the migration runner
// (which imports the default template) and creating a cycle.
export const CURRENT_SCHEMA_VERSION = 5;
