// The type layer, re-exported as one module.
//
// This file used to *be* the type layer — 1,100 lines in which 29 runtime
// typeguards, the formula engine's data model, the ability-mechanics types and
// the persisted character model all sat together, so the only way to find
// anything was to scroll. It's now a barrel over `src/lib/types/`, split by the
// same concerns the rest of `src/lib` is split by:
//
// - `types/formula.ts`    — `CustomFormula` and the dice/class primitives
//                           (pairs with `src/lib/formula.ts`, the engine).
// - `types/mechanics.ts`  — what abilities *do*: actions, effects, riders
//                           (pairs with `src/lib/mechanics/`).
// - `types/character.ts`  — the persisted `Character` and everything it holds.
// - `types/app.ts`        — non-persisted contracts: `Datastore`, `Dispatch`.
// - `types/guards.ts`     — the `is*` runtime guards, the one piece of this
//                           layer that isn't erased at compile time.
//
// The barrel is deliberate rather than a migration step: `import { Character }
// from "src/lib/types"` is the established spelling across ~150 files, and the
// split is about where code *lives*, not about churning every import. Import
// from a specific module when you want the narrower dependency (the guards
// pull in lodash; most consumers of `Character` shouldn't).
export * from "src/lib/types/formula";
export * from "src/lib/types/mechanics";
export * from "src/lib/types/character";
export * from "src/lib/types/app";
export * from "src/lib/types/guards";
