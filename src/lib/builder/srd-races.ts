import raceData from "src/lib/data/srd-races.json";
import { PHB_SUBRACES } from "src/lib/data/phb-subraces";
import { SrdRace, SrdSubrace } from "src/lib/builder/types";

export const SRD_RACES = raceData as unknown as SrdRace[];

const BY_INDEX = new Map(SRD_RACES.map((r) => [r.index, r]));

export const getSrdRace = (index?: string): SrdRace | undefined =>
  index ? BY_INDEX.get(index) : undefined;

// The full subrace list for a race: the SRD subrace(s) plus the hand-authored
// PHB extras (Wood Elf, Drow, Mountain Dwarf, …).
export const subracesForRace = (race?: SrdRace): SrdSubrace[] =>
  race ? [...race.subraces, ...(PHB_SUBRACES[race.index] ?? [])] : [];

export const getSubrace = (
  race: SrdRace | undefined,
  index?: string,
): SrdSubrace | undefined =>
  index ? subracesForRace(race).find((s) => s.index === index) : undefined;
