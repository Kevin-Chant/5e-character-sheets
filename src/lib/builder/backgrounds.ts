import { Background, PHB_BACKGROUNDS } from "src/lib/data/phb-backgrounds";
import { NON_PHB_BACKGROUNDS } from "src/lib/data/nonphb-backgrounds";

export type { Background };
export { PHB_BACKGROUNDS };

// Every background the builder offers: the Player's Handbook's thirteen first,
// then the rest alphabetically. The PHB set leads rather than sorting in with
// the others because it's the one a player is most likely to be looking for —
// the same reason the class grid isn't alphabetised past the core twelve.
export const ALL_BACKGROUNDS: Background[] = [
  ...PHB_BACKGROUNDS,
  ...[...NON_PHB_BACKGROUNDS].sort((a, b) => a.name.localeCompare(b.name)),
];

export const getBackground = (name?: string): Background | undefined =>
  name ? ALL_BACKGROUNDS.find((b) => b.name === name) : undefined;
