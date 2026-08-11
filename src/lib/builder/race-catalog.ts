import raceData from "src/lib/data/srd-races.json";
import { PHB_SUBRACES } from "src/lib/data/phb-subraces";
import { NONSRD_RACES } from "src/lib/data/nonsrd-races";
import { CatalogRace, CatalogSubrace } from "src/lib/builder/types";

// SRD races plus hand-authored non-SRD races.
export const ALL_RACES = [
  ...(raceData as unknown as CatalogRace[]),
  ...NONSRD_RACES,
];

const BY_INDEX = new Map(ALL_RACES.map((r) => [r.index, r]));

export const getCatalogRace = (index?: string): CatalogRace | undefined =>
  index ? BY_INDEX.get(index) : undefined;

// SRD subrace(s) for a race plus hand-authored PHB extras.
export const subracesForRace = (race?: CatalogRace): CatalogSubrace[] =>
  race ? [...race.subraces, ...(PHB_SUBRACES[race.index] ?? [])] : [];

export const getSubrace = (
  race: CatalogRace | undefined,
  index?: string,
): CatalogSubrace | undefined =>
  index ? subracesForRace(race).find((s) => s.index === index) : undefined;

// Whether the chosen race/subrace grants a level-1 feat (Variant Human,
// Custom Lineage).
export function raceGrantsFeat(
  race?: CatalogRace,
  subrace?: CatalogSubrace,
): boolean {
  return !!(race?.grantsFeat || subrace?.grantsFeat);
}
