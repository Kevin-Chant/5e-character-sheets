// @vitest-environment jsdom
// Renders the provider and stubs `window.alert`.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import React from "react";
import type { UUID } from "crypto";
import {
  SharingSessionsContextProvider,
  useRemoteSharingSession,
} from "./use-sharing-session";

// Capture the mock autobahn connection the transport constructs, so the test
// can drive its onopen/onclose lifecycle by hand.
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

// The join flow lives in the provider now (one transport for the layer), so
// the hook is rendered under the real one rather than making its own sockets.
const wrapper = ({ children }: React.PropsWithChildren) =>
  React.createElement(SharingSessionsContextProvider, null, children);

describe("useRemoteSharingSession quiet-failure guard", () => {
  afterEach(() => {
    mock.holder.connection = null;
    vi.restoreAllMocks();
  });

  it("does not clear the character when the realm never opened (owner offline)", async () => {
    const dispatch = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const { result } = renderHook(() => useRemoteSharingSession(dispatch), {
      wrapper,
    });
    await act(async () => {
      // Kick off a join; it rejects when the realm isn't there — swallow it.
      const join = result.current.joinSession(UUID_A).catch(() => {});
      // Simulate a connection that closes before ever opening.
      mock.holder.connection.onclose();
      await join;
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("clears the character and alerts when a joined session is closed by the host", async () => {
    const dispatch = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const { result } = renderHook(() => useRemoteSharingSession(dispatch), {
      wrapper,
    });
    await act(async () => {
      const join = result.current.joinSession(UUID_A).catch(() => {});
      // Realm opened (we joined)…
      const connection = mock.holder.connection;
      connection.onopen(connection.session);
      await join;
      // …then the host tore it down.
      connection.onclose();
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "reset_character" }),
      false,
      true,
    );
    expect(alertSpy).toHaveBeenCalled();
  });
});
