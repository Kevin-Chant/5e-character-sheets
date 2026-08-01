import { RaceTrait } from "src/lib/builder/types";

// Subclass name -> class level -> the features gained at that level.
//
// Split into one file per class because the tables are large and were authored
// class-by-class; `index.ts` merges them into the shape `subclasses.ts` attaches
// to each `CatalogSubclass.levelFeatures`.
//
// Keys are the subclass's catalog `name` exactly (that's what the character
// stores), so a typo here silently grants nothing — `subclass-features.test.ts`
// asserts every key resolves to a real subclass.
export type SubclassFeatureTable = Record<string, Record<number, RaceTrait[]>>;
