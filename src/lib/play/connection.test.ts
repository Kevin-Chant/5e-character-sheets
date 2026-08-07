import { describe, expect, it } from "vitest";
import {
  adoptsResponse,
  connectionReducer,
  ConnectionState,
  encounterForTable,
  OFFLINE,
} from "src/lib/play/connection";
import { EMPTY_ENCOUNTER, Encounter } from "src/lib/play/encounter";

const CODE = "1f0d2c3b-4a59-4687-9c01-2d3e4f5a6b7c";

const run = (...events: Parameters<typeof connectionReducer>[1][]) =>
  events.reduce(connectionReducer, OFFLINE);

const joined = (requestId = "r1"): ConnectionState =>
  run(
    { type: "connect", intent: { kind: "join" } },
    { type: "opened", code: CODE, requestId },
  );

const hosted = (requestId = "r1", reopening = false): ConnectionState =>
  run(
    { type: "connect", intent: { kind: "host", reopening } },
    { type: "opened", code: CODE, requestId },
  );

describe("joining", () => {
  it("waits for the room, and adopts the answer it asked for", () => {
    const state = joined();
    expect(state.phase).toBe("syncing");
    expect(adoptsResponse(state, "r1")).toBe(true);
  });

  it("stops adopting once an answer has arrived", () => {
    // A second peer's reply is an ordinary merge — otherwise two answers race
    // over which one gets to replace our state.
    const state = connectionReducer(joined(), {
      type: "sync-response",
      requestId: "r1",
    });
    expect(state).toEqual({ phase: "live", code: CODE });
    expect(adoptsResponse(state, "r1")).toBe(false);
  });

  // The bug this whole machine exists for: the flag used to stay armed until
  // *some* state arrived, and an empty room never sends any — so the next
  // arrival's stale encounter was adopted over the fight in progress. What
  // stays armed now is far narrower: the answer to *this* request, and nothing
  // else. An ordinary broadcast from a peer is still unadoptable.
  it("concludes the room is empty when nobody answers, and stops waiting", () => {
    const state = connectionReducer(joined(), {
      type: "sync-window-closed",
      requestId: "r1",
    });
    expect(state.phase).toBe("live");
    expect(adoptsResponse(state, "some-other-request")).toBe(false);
  });

  // A phone on mobile data can take longer to hear back than a laptop on the
  // same wifi as the broker, and the old cost of being slow was a different
  // *outcome*: the late answer merged, so a joiner's long-lived local encounter
  // could win the revision race and push its own history over the room's. The
  // answer to the request we sent is adoptable whenever it lands.
  it("still adopts the answer to its own request when it arrives late", () => {
    const state = connectionReducer(joined(), {
      type: "sync-window-closed",
      requestId: "r1",
    });
    expect(adoptsResponse(state, "r1")).toBe(true);
    // And consuming it ends the offer, so a second peer's reply is a merge.
    const after = connectionReducer(state, {
      type: "sync-response",
      requestId: "r1",
    });
    expect(adoptsResponse(after, "r1")).toBe(false);
  });

  // Unless something happened here in the meantime. Once this browser has
  // edited the encounter, what it holds is its own rather than a stale copy of
  // the room's, and replacing it wholesale would throw that edit away.
  it("stops offering adoption once there is a local edit to lose", () => {
    const state = connectionReducer(
      connectionReducer(joined(), {
        type: "sync-window-closed",
        requestId: "r1",
      }),
      { type: "local-change" },
    );
    expect(adoptsResponse(state, "r1")).toBe(false);
  });

  // A fresh host is the room; there is nothing to adopt, late or otherwise.
  it("never offers a fresh host adoption of a late answer", () => {
    const state = connectionReducer(hosted(), {
      type: "sync-window-closed",
      requestId: "r1",
    });
    expect(adoptsResponse(state, "r1")).toBe(false);
  });

  it("ignores an answer to a join we are no longer waiting on", () => {
    // Rejoined since: the in-flight answer to the previous request must not
    // replace the state we have now.
    const state = joined("r2");
    expect(adoptsResponse(state, "r1")).toBe(false);
    expect(
      connectionReducer(state, { type: "sync-response", requestId: "r1" }),
    ).toBe(state);
  });

  it("ignores a window closing on a join we are no longer waiting on", () => {
    const state = joined("r2");
    expect(
      connectionReducer(state, {
        type: "sync-window-closed",
        requestId: "r1",
      }),
    ).toBe(state);
  });
});

describe("hosting", () => {
  // A fresh host *is* the room: a brand-new code has no room to defer to, so
  // an answer from a peer merges by revision rather than replacing anything.
  it("never adopts on a fresh code", () => {
    expect(adoptsResponse(hosted(), "r1")).toBe(false);
  });

  it("still asks — reopening a code can find a fight already in it", () => {
    expect(hosted().phase).toBe("syncing");
  });

  // A *reopening* host adopts the way a joiner does, and for the same reason:
  // an answer means the table is live without them — their own drop, or a
  // second device — and their stored copy can be high-revision solo prep that
  // would win the document race and roll back a fight in progress. The
  // empty-room reopen (the ordinary Thursday) costs nothing: no answer, no
  // adoption, prep stands.
  it("adopts the room's answer when reopening a code it finds occupied", () => {
    expect(adoptsResponse(hosted("r1", true), "r1")).toBe(true);
  });

  it("stops a reopening host adopting once a local edit would be lost", () => {
    const state = run(
      { type: "connect", intent: { kind: "host", reopening: true } },
      { type: "opened", code: CODE, requestId: "r1" },
      { type: "sync-window-closed", requestId: "r1" },
      { type: "local-change" },
    );
    expect(adoptsResponse(state, "r1")).toBe(false);
  });
});

describe("dropping", () => {
  it("goes offline and stops waiting", () => {
    const state = connectionReducer(joined(), {
      type: "closed",
      error: "gone",
    });
    expect(state).toEqual({ phase: "offline", error: "gone" });
    expect(adoptsResponse(state, "r1")).toBe(false);
  });
});

describe("what a table opens with", () => {
  const fight: Encounter = {
    ...EMPTY_ENCOUNTER,
    round: 3,
    participants: [
      {
        id: "goblin",
        name: "Goblin",
        initiative: 12,
        spent: { action: false, bonusAction: false, reaction: false },
        conditions: [],
      },
    ],
  };

  it("starts a new table empty when the stored fight belongs to another one", () => {
    expect(
      encounterForTable(fight, "last-weeks-code", {
        kind: "host",
        reopening: false,
      }),
    ).toBe(EMPTY_ENCOUNTER);
  });

  // Prep: built offline, belongs to nobody, must survive being hosted.
  it("keeps a stored fight that belongs to no table", () => {
    expect(
      encounterForTable(fight, undefined, { kind: "host", reopening: false }),
    ).toBe(fight);
  });

  it("keeps it when reopening the table it came from", () => {
    expect(
      encounterForTable(fight, "the-code", { kind: "host", reopening: true }),
    ).toBe(fight);
  });

  // A joiner's local state is about to be replaced by the room's anyway.
  it("keeps it when joining", () => {
    expect(encounterForTable(fight, "any-code", { kind: "join" })).toBe(fight);
  });
});
