import { describe, expect, it } from "vitest";
import {
  MAX_REJOIN_ATTEMPTS,
  planRejoin,
  playPathFor,
  rejoinDelayMs,
  shouldRestamp,
} from "src/lib/play/rejoin";

const CODE = "3f8a91c2-1111-4222-8333-444455556666";

describe("planRejoin", () => {
  it("has nothing to do without a code in the URL", () => {
    expect(planRejoin({ status: "offline" })).toEqual({ action: "wait" });
  });

  it("waits while a connection is in flight", () => {
    expect(planRejoin({ urlCode: CODE, status: "connecting" })).toEqual({
      action: "wait",
    });
  });

  it("is satisfied once connected", () => {
    expect(planRejoin({ urlCode: CODE, status: "connected" })).toEqual({
      action: "connected",
    });
  });

  it("reports connected even before the URL names the table", () => {
    expect(planRejoin({ status: "connected" })).toEqual({
      action: "connected",
    });
  });

  it("sends an unknown code to the lobby", () => {
    expect(planRejoin({ urlCode: CODE, status: "offline" })).toEqual({
      action: "lobby",
      code: CODE,
    });
  });

  it("rejoins a table this browser remembers, as the seat it sat in", () => {
    expect(
      planRejoin({
        urlCode: CODE,
        status: "offline",
        memory: { code: CODE, lastJoined: 1, seat: "dm" },
      }),
    ).toEqual({ action: "rejoin", code: CODE, seat: "dm" });
  });

  it("rejoins the last session even with no memory entry", () => {
    expect(
      planRejoin({ urlCode: CODE, status: "offline", wasLast: true }),
    ).toEqual({ action: "rejoin", code: CODE, seat: "player" });
  });

  it("normalizes a code pasted in the wrong case or without dashes", () => {
    const plan = planRejoin({
      urlCode: CODE.replace(/-/g, "").toUpperCase(),
      status: "offline",
      wasLast: true,
    });
    expect(plan).toEqual({ action: "rejoin", code: CODE, seat: "player" });
  });

  it("keeps trying past the attempt cap while the tab is on screen", () => {
    expect(
      planRejoin({
        urlCode: CODE,
        status: "offline",
        wasLast: true,
        attempts: MAX_REJOIN_ATTEMPTS,
      }),
    ).toEqual({ action: "rejoin", code: CODE, seat: "player" });
  });

  it("stops once past the cap and out of sight", () => {
    expect(
      planRejoin({
        urlCode: CODE,
        status: "offline",
        wasLast: true,
        attempts: MAX_REJOIN_ATTEMPTS,
        visible: false,
      }),
    ).toEqual({ action: "wait" });
  });

  it("keeps trying out of sight while inside the cap", () => {
    expect(
      planRejoin({
        urlCode: CODE,
        status: "offline",
        wasLast: true,
        attempts: 1,
        visible: false,
      }),
    ).toEqual({ action: "rejoin", code: CODE, seat: "player" });
  });
});

describe("rejoinDelayMs", () => {
  it("backs off and then holds", () => {
    expect(rejoinDelayMs(0)).toBeLessThan(rejoinDelayMs(1));
    for (const attempt of [6, 99]) {
      expect(rejoinDelayMs(attempt)).toBeGreaterThanOrEqual(60_000);
      expect(rejoinDelayMs(attempt)).toBeLessThanOrEqual(75_000);
    }
  });

  it("spreads retries so a whole table doesn't reconnect in lockstep", () => {
    const spread = new Set(Array.from({ length: 50 }, () => rejoinDelayMs(3)));
    expect(spread.size).toBeGreaterThan(1);
  });
});

describe("playPathFor", () => {
  it("names the table in the URL when there is one", () => {
    expect(playPathFor(CODE)).toBe(`/play/${CODE}`);
    expect(playPathFor()).toBe("/play");
  });
});

describe("shouldRestamp", () => {
  it("writes a connected code into a URL that lacks it", () => {
    expect(shouldRestamp(undefined, CODE)).toBe(true);
  });

  it("never drops the URL's code for a session with none to give", () => {
    expect(shouldRestamp(CODE, undefined)).toBe(false);
  });

  it("replaces one table's code with another's", () => {
    expect(shouldRestamp(CODE, CODE.replace(/^3/, "4"))).toBe(true);
    expect(shouldRestamp(CODE, CODE)).toBe(false);
  });
});
