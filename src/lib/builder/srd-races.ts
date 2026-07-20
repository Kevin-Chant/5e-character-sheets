import raceData from "src/lib/data/srd-races.json";
import { PHB_SUBRACES } from "src/lib/data/phb-subraces";
import { NONSRD_RACES } from "src/lib/data/nonsrd-races";
import { SrdRace, SrdSubrace } from "src/lib/builder/types";

// The bundled SRD races plus the hand-authored official races from other books
// (Volo's, Mordenkainen's, Eberron, Ravnica, Theros, the Feywild books, …).
export const SRD_RACES = [
  ...(raceData as unknown as SrdRace[]),
  ...NONSRD_RACES,
];

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
