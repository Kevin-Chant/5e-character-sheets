import { FEATS } from "src/lib/data/feats";
import { Feat } from "src/lib/builder/types";

export { FEATS };

const BY_INDEX = new Map(FEATS.map((f) => [f.index, f]));

export const getFeat = (index?: string): Feat | undefined =>
  index ? BY_INDEX.get(index) : undefined;
