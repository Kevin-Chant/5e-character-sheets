// Eldritch invocations as bundled catalog data. Warlock invocations are not
// SRD content, so — like `nonsrd-races.ts` and `subclasses.ts` — only
// mechanical facts are stored, with ORIGINAL paraphrased summaries. Never
// published prose.
//
// `prerequisite` stays free text and is advisory only: the picker shows it,
// nothing enforces it (the same call already made for feat and multiclass
// prerequisites).
export interface Invocation {
  name: string;
  summary: string;
  prerequisite?: string;
}
