import { describe, expect, it } from "vitest";
import {
  adoptsResponse,
  connectionReducer,
  ConnectionState,
  encounterForTable,
  OFFLINE,
} from "src/lib/play/connection";
import {
  DEFAULT_SHARING,
  EMPTY_ENCOUNTER,
  Encounter,
  TableDefaults,
} from "src/lib/play/encounter";

// A DM whose defaults match the built-in policy, so these cases isolate the
// table-vs-stored decision from the defaults being copied on.
const DEFAULTS: TableDefaults = {
  sharing: DEFAULT_SHARING,
  hideDeathSaves: false,
};

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
    const state = connectionReducer(joined(), {
      type: "sync-response",
      requestId: "r1",
    });
    expect(state).toEqual({ phase: "live", code: CODE });
    expect(adoptsResponse(state, "r1")).toBe(false);
  });

  it("concludes the room is empty when nobody answers, and stops waiting", () => {
    const state = connectionReducer(joined(), {
      type: "sync-window-closed",
      requestId: "r1",
    });
    expect(state.phase).toBe("live");
    expect(adoptsResponse(state, "some-other-request")).toBe(false);
  });

  it("still adopts the answer to its own request when it arrives late", () => {
    const state = connectionReducer(joined(), {
      type: "sync-window-closed",
      requestId: "r1",
    });
    expect(adoptsResponse(state, "r1")).toBe(true);
    const after = connectionReducer(state, {
      type: "sync-response",
      requestId: "r1",
    });
    expect(adoptsResponse(after, "r1")).toBe(false);
  });

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

  it("never offers a fresh host adoption of a late answer", () => {
    const state = connectionReducer(hosted(), {
      type: "sync-window-closed",
      requestId: "r1",
    });
    expect(adoptsResponse(state, "r1")).toBe(false);
  });

  it("ignores an answer to a join we are no longer waiting on", () => {
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
  it("never adopts on a fresh code", () => {
    expect(adoptsResponse(hosted(), "r1")).toBe(false);
  });

  it("still asks — reopening a code can find a fight already in it", () => {
    expect(hosted().phase).toBe("syncing");
  });

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
      encounterForTable(
        fight,
        "last-weeks-code",
        { kind: "host", reopening: false },
        DEFAULTS,
      ),
    ).toBe(EMPTY_ENCOUNTER);
  });

  it("keeps a stored fight that belongs to no table", () => {
    expect(
      encounterForTable(
        fight,
        undefined,
        { kind: "host", reopening: false },
        DEFAULTS,
      ),
    ).toBe(fight);
  });

  it("keeps it when reopening the table it came from", () => {
    expect(
      encounterForTable(
        fight,
        "the-code",
        { kind: "host", reopening: true },
        DEFAULTS,
      ),
    ).toBe(fight);
  });

  const OWN_DEFAULTS: TableDefaults = {
    sharing: "exact",
    hideDeathSaves: true,
  };

  it("copies the DM's defaults onto a table they open", () => {
    const opened = encounterForTable(
      fight,
      "last-weeks-code",
      { kind: "host", reopening: false },
      OWN_DEFAULTS,
    );
    expect(opened.sharing).toBe("exact");
    expect(opened.hideDeathSaves).toBe(true);
  });

  it("copies them onto local prep carried into a new table too", () => {
    const opened = encounterForTable(
      fight,
      undefined,
      { kind: "host", reopening: false },
      OWN_DEFAULTS,
    );
    expect(opened.participants).toEqual(fight.participants);
    expect(opened.sharing).toBe("exact");
  });

  it("leaves a reopened table on the policy it already had", () => {
    const running: Encounter = { ...fight, sharing: "private" };
    expect(
      encounterForTable(
        running,
        "the-code",
        { kind: "host", reopening: true },
        OWN_DEFAULTS,
      ).sharing,
    ).toBe("private");
  });

  it("leaves a joined table's policy to the room", () => {
    const running: Encounter = { ...fight, sharing: "private" };
    expect(
      encounterForTable(running, "any-code", { kind: "join" }, OWN_DEFAULTS)
        .sharing,
    ).toBe("private");
  });

  it("keeps it when joining", () => {
    expect(
      encounterForTable(fight, "any-code", { kind: "join" }, DEFAULTS),
    ).toBe(fight);
  });
});
