import { RestType } from "src/lib/data/data-definitions";
import { spendsSharedPool } from "src/lib/mechanics/catalog";
import type { ClassPoolDef } from "src/lib/builder/class-pools";
import { HostTable, SharedPoolHost } from "./types";
import { MONK_ACTION_HOSTS } from "./monk";
import { CLERIC_ACTION_HOSTS } from "./cleric";
import { PALADIN_ACTION_HOSTS } from "./paladin";

const slugId = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// One data host → a `maxUses: 0` pool whose only action drains the named pool.
const toPoolDef = (h: SharedPoolHost): ClassPoolDef => ({
  title: h.title,
  detail: h.detail,
  level: h.level,
  recharge: () => RestType.longRest, // irrelevant for a 0-use host
  maxUses: () => 0,
  mechanics: () =>
    spendsSharedPool({
      id: slugId(h.title),
      name: h.title,
      cost: h.cost,
      ...(h.costNote ? { costNote: h.costNote } : {}),
      pool: h.pool,
      ...(h.amount ? { amount: h.amount } : {}),
      ...(h.roll ? { roll: h.roll } : {}),
      note: h.note,
      ...(h.applies ? { applies: h.applies } : {}),
    }),
});

const convert = (table: HostTable): Record<string, ClassPoolDef[]> =>
  Object.fromEntries(
    Object.entries(table).map(([subclass, hosts]) => [
      subclass,
      hosts.map(toPoolDef),
    ]),
  );

// Subclass action hosts, keyed by subclass name, merged into the pool grants by
// `syncClassPools` alongside `SUBCLASS_POOLS`. Separate registry so each class
// gets its own file (the tables are large and were authored per class), and so
// the shared-resource spenders stay visibly distinct from the pools that own a
// resource of their own.
export const SUBCLASS_ACTION_HOSTS: Record<string, ClassPoolDef[]> = {
  ...convert(MONK_ACTION_HOSTS),
  ...convert(CLERIC_ACTION_HOSTS),
  ...convert(PALADIN_ACTION_HOSTS),
};
