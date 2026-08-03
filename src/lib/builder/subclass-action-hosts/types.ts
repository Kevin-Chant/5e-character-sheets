import { StandardDie } from "src/lib/data/data-definitions";
import { ActionCost } from "src/lib/mechanics/types";

// A pool-less "action host" as plain data: a subclass feature that spends a
// *shared* resource it doesn't own (a monk discipline spending Ki, a domain's
// Channel Divinity option spending Channel Divinity). One file per class holds
// these; `index.ts` turns each into a `maxUses: 0` `ClassPoolDef` via
// `spendsSharedPool`, so the per-class files stay pure data — no functions, no
// imports from `class-pools.ts`, nothing that could cycle.
//
// Keep the same content rule as the rest: mechanical facts, original wording.
export interface SharedPoolHost {
  // The feature's name — must match the subclass-features prose row it replaces
  // (which should be pruned, or the sheet shows it twice).
  title: string;
  detail: string;
  // Class level the feature is gained.
  level: number;
  // Action-economy cost of using it.
  cost: ActionCost;
  costNote?: string;
  // The shared pool this drains, by title: "Ki", "Channel Divinity", …
  pool: string;
  // Uses to spend (default 1). A monk discipline may cost several Ki.
  amount?: number;
  // A die rolled for display (a maneuver/ability die). Omit for spend-and-remind
  // features whose effect the sheet can't compute.
  roll?: { label: string; die: StandardDie; count?: number };
  // The table prompt shown after spending — what the feature does.
  note: string;
  // The condition this use puts on a chosen target (see `AbilityAction`).
  applies?: { name: string; rounds?: number; note?: string };
}

export type HostTable = Record<string, SharedPoolHost[]>;
