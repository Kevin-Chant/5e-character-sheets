// @vitest-environment jsdom
// Renders the provider and stubs `window.alert`.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import React from "react";
import type { UUID } from "crypto";
import {
  SharingSessionsContextProvider,
  useRemoteSharingSession,
  useSharingSessions,
} from "./use-sharing-session";
import type { Character } from "src/lib/types";
import { PROTOCOL_VERSION } from "src/lib/realm/envelope";

// Capture the mock autobahn connection so the test can drive onopen/onclose.
const mock = vi.hoisted(() => ({ holder: { connection: null as any } }));

vi.mock("autobahn-browser", () => {
  class MockConnection {
    onopen: ((session: unknown) => void) | undefined;
    onclose: (() => boolean) | undefined;
    // Captured subscriptions, so a test can deliver a peer's message.
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

// Deliver a message as a peer would; the envelope check drops mismatches.
const deliver = (connection: any, message: Record<string, unknown>) => {
  for (const handler of connection.handlers) {
    handler([{ ...message, v: PROTOCOL_VERSION }]);
  }
};

const UUID_A = "11111111-1111-1111-1111-111111111111" as UUID;
const UUID_B = "22222222-2222-2222-2222-222222222222" as UUID;

// Binds which sheet is "open" for the test; the real app binds this from
// `CharacterContext`.
const useJoinerWithOpenSheet = (
  dispatch: (...args: unknown[]) => void,
  openUuid: UUID | undefined,
) => {
  const sessions = useSharingSessions();
  sessions.bind({
    getCharacter: () =>
      openUuid ? ({ uuid: openUuid } as Character) : undefined,
  });
  return useRemoteSharingSession(dispatch as never);
};

// Render under the real provider rather than making its own sockets.
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
      // Join rejects when the realm isn't there — swallow it.
      const join = result.current.joinSession(UUID_A).catch(() => {});
      // Connection closes before ever opening.
      mock.holder.connection.onclose();
      await join;
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

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
      connection.onclose();
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("clears the character and alerts when the host closes the session", async () => {
    const dispatch = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const { result } = renderHook(
      () => useJoinerWithOpenSheet(dispatch, UUID_A),
      { wrapper },
    );
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

  it("leaves a different open sheet alone when a background session ends", async () => {
    const dispatch = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const { result } = renderHook(
      () => useJoinerWithOpenSheet(dispatch, UUID_B),
      { wrapper },
    );
    await act(async () => {
      const join = result.current.joinSession(UUID_A).catch(() => {});
      const connection = mock.holder.connection;
      connection.onopen(connection.session);
      await join;
      deliver(connection, { kind: "closeSession", clientId: "the-host" });
    });

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "reset_character" }),
      expect.anything(),
      expect.anything(),
    );
    expect(alertSpy).toHaveBeenCalled();
  });
});

// A reconnected joiner's FULL_SYNC answer must only land on the sheet it's
// actually for — not just whichever session asked.
describe("a joiner's reconnect", () => {
  afterEach(() => {
    vi.useRealTimers();
    mock.holder.connection = null;
    vi.restoreAllMocks();
  });

  // Drop the socket without a goodbye, then let the first reconnect attempt
  // fire and answer FULL_SYNC with the host's copy of UUID_A.
  const reconnectWith = async (
    result: { current: { joinSession: (uuid: UUID) => Promise<void> } },
    hostCopy: Character,
  ) => {
    await act(async () => {
      const join = result.current.joinSession(UUID_A).catch(() => {});
      const connection = mock.holder.connection;
      connection.onopen(connection.session);
      await join;
      connection.onclose();
    });
    await act(async () => {
      // Past the first backoff delay, into the retry's own connect.
      await vi.advanceTimersByTimeAsync(600);
      const fresh = mock.holder.connection;
      fresh.session.call = () => Promise.resolve(hostCopy);
      fresh.onopen(fresh.session);
      await vi.advanceTimersByTimeAsync(10);
    });
  };

  it("does not pull a background session's sheet over the open one", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    const { result } = renderHook(
      () => useJoinerWithOpenSheet(dispatch, UUID_B),
      { wrapper },
    );

    await reconnectWith(result, { uuid: UUID_A, name: "Theirs" } as Character);

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "load_character" }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("still resyncs the sheet it is looking at", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    const { result } = renderHook(
      () => useJoinerWithOpenSheet(dispatch, UUID_A),
      { wrapper },
    );

    await reconnectWith(result, { uuid: UUID_A, name: "Theirs" } as Character);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "load_character",
        payload: expect.objectContaining({ uuid: UUID_A }),
      }),
      false,
      true,
    );
  });
});
