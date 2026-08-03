import { describe, expect, it } from "vitest";
import {
  beatsAc,
  exchanges,
  formatFaces,
  REPORT_CAP,
  RollReport,
  withoutExchange,
  withReport,
} from "src/lib/play/reports";

const report = (over: Partial<RollReport> = {}): RollReport => ({
  reportId: "r1",
  exchangeId: "x1",
  stage: "toHit",
  attempt: 1,
  fromClientId: "c1",
  fromName: "Brakka",
  label: "Greatsword",
  total: 15,
  ...over,
});

describe("withReport", () => {
  it("ignores a repeat of a report it already has", () => {
    const first = [report()];
    expect(withReport(first, report())).toBe(first);
  });

  it("keeps the newest reports once the cap is reached", () => {
    let queue: RollReport[] = [];
    for (let i = 0; i < REPORT_CAP + 5; i += 1) {
      queue = withReport(queue, report({ reportId: `r${i}`, total: i }));
    }
    expect(queue).toHaveLength(REPORT_CAP);
    expect(queue[queue.length - 1].total).toBe(REPORT_CAP + 4);
  });
});

describe("withoutExchange", () => {
  it("drops every stage of one act and leaves the rest", () => {
    const queue = [
      report({ reportId: "a", exchangeId: "x1" }),
      report({ reportId: "b", exchangeId: "x1", stage: "damage" }),
      report({ reportId: "c", exchangeId: "x2" }),
    ];
    expect(withoutExchange(queue, "x1").map((r) => r.reportId)).toEqual(["c"]);
  });

  it("returns the same list when nothing matches", () => {
    const queue = [report()];
    expect(withoutExchange(queue, "nope")).toBe(queue);
  });
});

describe("exchanges", () => {
  it("groups an attack's stages into one card, in play order", () => {
    const [card] = exchanges([
      report({ reportId: "a", stage: "toHit", total: 15 }),
      report({ reportId: "b", stage: "damage", total: 9 }),
    ]);
    expect(card.stages.map((s) => s.stage)).toEqual(["toHit", "damage"]);
    expect(card.stages[1].latest.total).toBe(9);
  });

  it("keeps re-rolls as a trail behind the roll that stands", () => {
    const [card] = exchanges([
      report({ reportId: "a", attempt: 1, total: 8 }),
      report({ reportId: "b", attempt: 2, total: 19 }),
    ]);
    const [toHit] = card.stages;
    expect(toHit.latest.total).toBe(19);
    expect(toHit.superseded.map((r) => r.total)).toEqual([8]);
  });

  it("lets the highest attempt stand however the messages arrived", () => {
    const [card] = exchanges([
      report({ reportId: "b", attempt: 2, total: 19 }),
      report({ reportId: "a", attempt: 1, total: 8 }),
    ]);
    expect(card.stages[0].latest.total).toBe(19);
    expect(card.stages[0].superseded).toHaveLength(1);
  });

  it("adopts a target named by a later stage than the first", () => {
    const [card] = exchanges([
      report({ reportId: "a", stage: "toHit" }),
      report({
        reportId: "b",
        stage: "damage",
        targetId: "p2",
        targetName: "Goblin 2",
      }),
    ]);
    expect(card.targets).toEqual([{ id: "p2", name: "Goblin 2" }]);
  });

  it("normalises a multi-target report into the card's target list", () => {
    const [card] = exchanges([
      report({
        reportId: "a",
        stage: "damage",
        label: "Fireball (3rd)",
        targetIds: ["p2", "p3"],
        targetNames: ["Orc 1", "Orc 2"],
      }),
    ]);
    expect(card.targets).toEqual([
      { id: "p2", name: "Orc 1" },
      { id: "p3", name: "Orc 2" },
    ]);
  });

  it("orders a cast announcement ahead of the damage it precedes", () => {
    const [card] = exchanges([
      report({ reportId: "a", stage: "damage", total: 24 }),
      report({ reportId: "b", stage: "cast", total: 0 }),
    ]);
    expect(card.stages.map((s) => s.stage)).toEqual(["cast", "damage"]);
  });

  it("keeps separate acts apart, oldest first", () => {
    const cards = exchanges([
      report({ reportId: "a", exchangeId: "x1" }),
      report({ reportId: "b", exchangeId: "x2", label: "Dagger" }),
    ]);
    expect(cards.map((c) => c.label)).toEqual(["Greatsword", "Dagger"]);
  });
});

describe("beatsAc", () => {
  it("calls a hit on a tie — 5e's rule is meet-or-beat", () => {
    expect(beatsAc(13, 13)).toBe("hits");
    expect(beatsAc(12, 13)).toBe("misses");
  });

  it("offers no opinion about an untracked target", () => {
    expect(beatsAc(13, 0)).toBeUndefined();
    expect(beatsAc(13, undefined)).toBeUndefined();
  });
});

describe("formatFaces", () => {
  it("shows advantage as the two dice it was", () => {
    expect(
      formatFaces(report({ faces: [4, 18], kept: 18, mode: "advantage" })),
    ).toBe("d20 adv 4, 18 → 18");
  });

  it("shows a single die plainly", () => {
    expect(formatFaces(report({ faces: [12], kept: 12 }))).toBe("d20 12");
  });

  it("says nothing about a typed total", () => {
    expect(formatFaces(report({ manual: true }))).toBeUndefined();
  });
});
