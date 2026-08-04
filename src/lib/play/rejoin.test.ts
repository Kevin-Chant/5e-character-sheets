import { describe, expect, it } from "vitest";
import {
  MAX_REJOIN_ATTEMPTS,
  planRejoin,
  playPathFor,
  rejoinDelayMs,
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

  // Somebody pasted a link to a table this browser has never been at. Which
  // sheet to bring is a real question, and the lobby is where it's asked.
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

  // The memory list is capped and can be forgotten; "the one we were just in"
  // is an independent claim to knowing the table.
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

  // A phone in a pocket must not spend the night reconnecting to a table that
  // ended. The manual button on the session bar still works.
  it("stops trying after the attempt cap", () => {
    expect(
      planRejoin({
        urlCode: CODE,
        status: "offline",
        wasLast: true,
        attempts: MAX_REJOIN_ATTEMPTS,
      }),
    ).toEqual({ action: "wait" });
  });
});

describe("rejoinDelayMs", () => {
  it("backs off and then holds", () => {
    expect(rejoinDelayMs(0)).toBeLessThan(rejoinDelayMs(1));
    expect(rejoinDelayMs(99)).toBe(rejoinDelayMs(5));
  });
});

describe("playPathFor", () => {
  it("names the table in the URL when there is one", () => {
    expect(playPathFor(CODE)).toBe(`/play/${CODE}`);
    expect(playPathFor()).toBe("/play");
  });
});
