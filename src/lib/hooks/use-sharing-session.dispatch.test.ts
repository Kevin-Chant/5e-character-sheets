import { describe, expect, it, vi } from "vitest";
import { UUID } from "crypto";
import { applyRemoteEdit } from "./use-sharing-session";
import { FIELD } from "src/lib/data/data-definitions";
import { updateData } from "./reducers/actions";

// applyRemoteEdit is pure, so it's tested directly rather than through the
// provider (which needs a live WAMP connection).

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
