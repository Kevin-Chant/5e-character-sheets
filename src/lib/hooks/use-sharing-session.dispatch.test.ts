import { describe, expect, it, vi } from "vitest";
import { applyRemoteEdit } from "./use-sharing-session";
import { FIELD } from "src/lib/data/data-definitions";
import { updateData } from "./reducers/actions";

// Applying a peer's edit. The provider around it needs a WAMP connection, but
// this decision is pure — and it encodes the rule that keeps co-editing from
// echoing. (Dropping this tab's own echo used to be tested here too; that
// check moved to the envelope, `realm/envelope.test.ts`.)

const action = updateData(FIELD.name, { value: "Vex" });

describe("applyRemoteEdit", () => {
  it("applies the edit", () => {
    const dispatch = vi.fn();
    applyRemoteEdit(dispatch, { action });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toBe(action);
  });

  it("replays with suppressBroadcast so the edit isn't re-published", () => {
    const dispatch = vi.fn();
    applyRemoteEdit(dispatch, { action });
    // Third argument is the suppress flag.
    expect(dispatch.mock.calls[0][2]).toBe(true);
  });

  it("passes the dirty flag through untouched", () => {
    const dispatch = vi.fn();
    applyRemoteEdit(dispatch, { action, dirtyAction: false });
    expect(dispatch.mock.calls[0][1]).toBe(false);
    applyRemoteEdit(dispatch, { action, dirtyAction: true });
    expect(dispatch.mock.calls[1][1]).toBe(true);
  });
});
