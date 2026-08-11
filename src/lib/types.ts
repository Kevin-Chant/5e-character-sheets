// The type layer, re-exported as one module — a barrel over `src/lib/types/`:
//
// - `types/formula.ts`    — `CustomFormula` and dice/class primitives (pairs
//                           with `src/lib/formula.ts`).
// - `types/mechanics.ts`  — what abilities do: actions, effects, riders
//                           (pairs with `src/lib/mechanics/`).
// - `types/character.ts`  — the persisted `Character` and everything it holds.
// - `types/app.ts`        — non-persisted contracts: `Datastore`, `Dispatch`.
// - `types/guards.ts`     — the `is*` runtime guards.
//
// `import { Character } from "src/lib/types"` is the established spelling
// across the codebase; import a specific module for a narrower dependency
// (the guards pull in lodash; most `Character` consumers shouldn't).
export * from "src/lib/types/formula";
export * from "src/lib/types/mechanics";
export * from "src/lib/types/character";
export * from "src/lib/types/app";
export * from "src/lib/types/guards";
