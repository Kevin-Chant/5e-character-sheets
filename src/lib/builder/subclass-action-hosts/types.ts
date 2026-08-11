import { StandardDie } from "src/lib/data/data-definitions";
import { ActionCost, AppliedCondition } from "src/lib/mechanics/types";

// A subclass feature that spends a *shared* resource it doesn't own (a monk
// discipline spending Ki, a domain's Channel Divinity option spending Channel
// Divinity). `index.ts` turns each into a `maxUses: 0` `ClassPoolDef` via
// `spendsSharedPool`; per-class files stay pure data, no imports from
// `class-pools.ts`.
export interface SharedPoolHost {
  // Must match the subclass-features prose row it replaces (prune that row or
  // the sheet shows it twice).
  title: string;
  detail: string;
  level: number;
  cost: ActionCost;
  costNote?: string;
  // Shared pool this drains, by title: "Ki", "Channel Divinity", …
  pool: string;
  // Uses to spend (default 1).
  amount?: number;
  // Die rolled for display. Omit for spend-and-remind features.
  roll?: { label: string; die: StandardDie; count?: number };
  // Table prompt shown after spending.
  note: string;
  applies?: AppliedCondition;
}

export type HostTable = Record<string, SharedPoolHost[]>;
