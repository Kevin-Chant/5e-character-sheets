import { Background, PHB_BACKGROUNDS } from "src/lib/data/phb-backgrounds";

export { PHB_BACKGROUNDS };
export type { Background };

export const getBackground = (name?: string): Background | undefined =>
  name ? PHB_BACKGROUNDS.find((b) => b.name === name) : undefined;
