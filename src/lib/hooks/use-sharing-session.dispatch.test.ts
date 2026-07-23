import { describe, expect, it, vi } from "vitest";
import { makeDispatchHandler } from "./use-sharing-session";
import { FIELD } from "src/lib/data/data-definitions";
import { updateData } from "./reducers/actions";

// The live-edit message handler. The provider around it needs a WAMP
// connection, but this decision is pure — and it encodes the two rules that
// keep co-editing from looping or echoing.

const action = updateData(FIELD.name, { value: "Vex" });

describe("makeDispatchHandler", () => {
  it("applies an edit from another tab", () => {
    const dispatch = vi.fn();
    makeDispatchHandler(dispatch, "me")({ action, senderId: "them" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toBe(action);
  });

  it("drops this tab's own echo", () => {
    // nightlife-rabbit ignores WAMP `exclude_me`, so a publisher receives its
    // own events — filtering by senderId is the only thing stopping a loop.
    const dispatch = vi.fn();
    makeDispatchHandler(dispatch, "me")({ action, senderId: "me" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("replays with suppressBroadcast so the edit isn't re-published", () => {
    const dispatch = vi.fn();
    makeDispatchHandler(dispatch, "me")({ action, senderId: "them" });
    // Third argument is the suppress flag.
    expect(dispatch.mock.calls[0][2]).toBe(true);
  });

  it("passes the dirty flag through untouched", () => {
    const dispatch = vi.fn();
    const handler = makeDispatchHandler(dispatch, "me");
    handler({ action, dirtyAction: false, senderId: "them" });
    expect(dispatch.mock.calls[0][1]).toBe(false);
    handler({ action, dirtyAction: true, senderId: "them" });
    expect(dispatch.mock.calls[1][1]).toBe(true);
  });

  it("treats a missing senderId as someone else's edit", () => {
    // An older peer that doesn't stamp messages shouldn't be silently ignored.
    const dispatch = vi.fn();
    makeDispatchHandler(dispatch, "me")({ action } as never);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
