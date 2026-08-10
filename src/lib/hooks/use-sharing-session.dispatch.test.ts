import { describe, expect, it, vi } from "vitest";
import { UUID } from "crypto";
import { applyRemoteEdit } from "./use-sharing-session";
import { FIELD } from "src/lib/data/data-definitions";
import { updateData } from "./reducers/actions";

// Applying a peer's edit. The provider around it needs a WAMP connection, but
// this decision is pure — and it encodes the rule that keeps co-editing from
// echoing. (Dropping this tab's own echo used to be tested here too; that
// check moved to the envelope, `realm/envelope.test.ts`.)

const action = updateData(FIELD.name, { value: "Vex" });

const A = "11111111-1111-4111-8111-111111111111" as UUID;
const B = "22222222-2222-4222-8222-222222222222" as UUID;

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

  // The session is a property of the browser, not of the open sheet: nothing
  // ends one when you open a different character. So a host with sheet B on
  // screen still holds sheet A's realm, and sheet A's edits used to be
  // dispatched into B — then autosaved there, because the save gate only skips
  // sheets joined *remotely*. A DM who owns the party's shared sheets and
  // clicks between them scrambled them into each other.
  it("drops an edit addressed to a character other than the open one", () => {
    const dispatch = vi.fn();
    applyRemoteEdit(dispatch, { uuid: A, action }, B);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("applies an edit addressed to the open character", () => {
    const dispatch = vi.fn();
    applyRemoteEdit(dispatch, { uuid: A, action }, A);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
