import { Background, PHB_BACKGROUNDS } from "src/lib/data/phb-backgrounds";
import { NON_PHB_BACKGROUNDS } from "src/lib/data/nonphb-backgrounds";

export type { Background };
export { PHB_BACKGROUNDS };

// PHB backgrounds first, then the rest alphabetically.
export const ALL_BACKGROUNDS: Background[] = [
  ...PHB_BACKGROUNDS,
  ...[...NON_PHB_BACKGROUNDS].sort((a, b) => a.name.localeCompare(b.name)),
];

export const getBackground = (name?: string): Background | undefined =>
  name ? ALL_BACKGROUNDS.find((b) => b.name === name) : undefined;
