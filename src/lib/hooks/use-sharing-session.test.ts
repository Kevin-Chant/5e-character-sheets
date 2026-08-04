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
import { PROTOCOL_VERSION } from "src/lib/realm/envelope";

// Capture the mock autobahn connection the transport constructs, so the test
// can drive its onopen/onclose lifecycle by hand.
const mock = vi.hoisted(() => ({ holder: { connection: null as any } }));

vi.mock("autobahn-browser", () => {
  class MockConnection {
    onopen: ((session: unknown) => void) | undefined;
    onclose: (() => boolean) | undefined;
    // Subscriptions are captured so a test can deliver a peer's message —
    // which is now the only way to say "the host ended it on purpose", as
    // against "the socket went away", which is a different story with a
    // different ending.
    handlers: ((args: unknown[]) => void)[] = [];
    session = {
      subscribe: (_topic: string, handler: (args: unknown[]) => void) => {
        this.handlers.push(handler);
        return Promise.resolve({});
      },
      publish: () => {},
      register: () => Promise.resolve({}),
      call: () => Promise.resolve(undefined),
    };
    close = () => {};
    open = () => {};
    constructor() {
      mock.holder.connection = this;
    }
  }
  return { default: { Connection: MockConnection } };
});

// Deliver a message as a peer would. Every subscription gets it; the envelope
// check drops the ones it isn't for.
const deliver = (connection: any, message: Record<string, unknown>) => {
  for (const handler of connection.handlers) {
    handler([{ ...message, v: PROTOCOL_VERSION }]);
  }
};

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

  // The socket going away is not the host saying goodbye, and treating it as
  // one is the bug this pins. On a phone a dropped connection is a routine
  // event — a wifi handover, a tunnel, a backgrounded tab — and it used to cost
  // the joiner the borrowed sheet plus an alert blaming their friend.
  it("does not end the session when the socket merely drops", async () => {
    const dispatch = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const { result } = renderHook(() => useRemoteSharingSession(dispatch), {
      wrapper,
    });
    await act(async () => {
      const join = result.current.joinSession(UUID_A).catch(() => {});
      const connection = mock.holder.connection;
      connection.onopen(connection.session);
      await join;
      // Gone, with nothing said about why.
      connection.onclose();
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  // The host's explicit goodbye still ends it at once — no retry, because
  // there is nothing to retry into and we've been told so.
  it("clears the character and alerts when the host closes the session", async () => {
    const dispatch = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const { result } = renderHook(() => useRemoteSharingSession(dispatch), {
      wrapper,
    });
    await act(async () => {
      const join = result.current.joinSession(UUID_A).catch(() => {});
      const connection = mock.holder.connection;
      connection.onopen(connection.session);
      await join;
      deliver(connection, { kind: "closeSession", clientId: "the-host" });
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "reset_character" }),
      false,
      true,
    );
    expect(alertSpy).toHaveBeenCalled();
  });
});
