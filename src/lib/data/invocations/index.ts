import { Invocation } from "src/lib/data/invocations/types";
import { PHB_INVOCATIONS } from "./phb";
import { XGE_TCE_INVOCATIONS } from "./xge-tce";

// The full eldritch invocation catalog, sorted by name so the picker reads as
// one alphabetical list rather than book-by-book. Split into per-book files
// only because that's how they were authored and verified; nothing downstream
// cares which book an invocation came from.
export const ALL_INVOCATIONS: Invocation[] = [
  ...PHB_INVOCATIONS,
  ...XGE_TCE_INVOCATIONS,
].sort((a, b) => a.name.localeCompare(b.name));

export type { Invocation };
