import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { UUID } from "crypto";
import { useRemoteSharingSession } from "./use-sharing-session";

// Capture the mock autobahn connection the hook constructs, so the test can
// drive its onopen/onclose lifecycle by hand.
const mock = vi.hoisted(() => ({ holder: { connection: null as any } }));

vi.mock("autobahn-browser", () => {
  class MockConnection {
    onopen: ((session: unknown) => void) | undefined;
    onclose: (() => boolean) | undefined;
    session = { subscribe: () => {}, publish: () => {}, call: () => {} };
    close = () => {};
    open = () => {};
    constructor() {
      mock.holder.connection = this;
    }
  }
  return { default: { Connection: MockConnection } };
});

const UUID_A = "11111111-1111-1111-1111-111111111111" as UUID;

describe("useRemoteSharingSession quiet-failure guard", () => {
  afterEach(() => {
    mock.holder.connection = null;
    vi.restoreAllMocks();
  });

  it("does not clear the character when the realm never opened (owner offline)", () => {
    const dispatch = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const { result } = renderHook(() => useRemoteSharingSession(dispatch));
    // Kick off a join; the returned promise rejects on close — swallow it.
    result.current.joinSession(UUID_A).catch(() => {});

    // Simulate a connection that closes before ever opening.
    mock.holder.connection.onclose();

    expect(dispatch).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("clears the character and alerts when a joined session is closed by the host", () => {
    const dispatch = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const { result } = renderHook(() => useRemoteSharingSession(dispatch));
    result.current.joinSession(UUID_A).catch(() => {});

    const connection = mock.holder.connection;
    // Realm opened (we joined), then the host tore it down.
    connection.onopen(connection.session);
    connection.onclose();

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "reset_character" }),
      false,
      true,
    );
    expect(alertSpy).toHaveBeenCalled();
  });
});
