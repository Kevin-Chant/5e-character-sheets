import { describe, expect, it } from "vitest";
import {
  PresenceEntry,
  prunePresence,
  withoutPresence,
  withPresence,
} from "src/lib/realm/presence";

interface Named {
  name: string;
}
const same = (a: Named, b: Named) => a.name === b.name;
const names = (roster: PresenceEntry<Named>[]) => roster.map((c) => c.name);

describe("presence roster", () => {
  it("upserts without reshuffling", () => {
    let roster = withPresence<Named>([], "a", { name: "Nadia" }, same);
    roster = withPresence(roster, "b", { name: "Theo" }, same);
    // A re-announce (every hello and every heartbeat triggers one) keeps the
    // order the DM's dropdown is already showing.
    roster = withPresence(roster, "a", { name: "Nadia" }, same);
    expect(names(roster)).toEqual(["Nadia", "Theo"]);
    // Renames land in place.
    roster = withPresence(roster, "a", { name: "Nadia the Bold" }, same);
    expect(names(roster)).toEqual(["Nadia the Bold", "Theo"]);
  });

  it("returns the same roster when nothing changed", () => {
    const roster = withPresence<Named>([], "a", { name: "Nadia" }, same);
    expect(withPresence(roster, "a", { name: "Nadia" }, same)).toBe(roster);
    expect(withoutPresence(roster, "ghost")).toBe(roster);
  });

  it("drops a departing client", () => {
    let roster = withPresence<Named>([], "a", { name: "Nadia" }, same);
    roster = withPresence(roster, "b", { name: "Theo" }, same);
    expect(names(withoutPresence(roster, "a"))).toEqual(["Theo"]);
  });
});

describe("pruning", () => {
  const roster: PresenceEntry<Named>[] = [
    { clientId: "a", name: "Nadia" },
    { clientId: "b", name: "Theo" },
  ];

  it("forgets a client that stopped answering", () => {
    const lastSeen = new Map([
      ["a", 1_000],
      ["b", 40_000],
    ]);
    expect(names(prunePresence(roster, lastSeen, 50_000, 30_000))).toEqual([
      "Theo",
    ]);
  });

  // One dropped beat must not flap an active editor out of the list — the
  // timeout is three heartbeats for exactly this reason.
  it("keeps a client that missed a single beat", () => {
    const lastSeen = new Map([
      ["a", 35_000],
      ["b", 40_000],
    ]);
    expect(prunePresence(roster, lastSeen, 50_000, 30_000)).toBe(roster);
  });

  it("forgets a client it has never heard from", () => {
    expect(prunePresence(roster, new Map(), 50_000, 30_000)).toEqual([]);
  });
});
