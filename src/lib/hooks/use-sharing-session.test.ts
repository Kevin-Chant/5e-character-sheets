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
const UUID_B = "22222222-2222-2222-2222-222222222222" as UUID;

// The provider holds one session per character now, so "is this the sheet on
// screen" is a real question it has to ask — with several rooms open, a room
// ending in the background must not clear the character the user is looking at.
// Binding a character is what lets a test say which sheet is open; the real app
// binds it from `CharacterContext`.
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

  // The other half of that, and the reason the check exists at all. Holding one
  // session, "the host closed it" and "the sheet on screen is dead" were the
  // same fact. Holding several they aren't: a DM's other room can end while you
  // are looking at a different character, and resetting then would take a sheet
  // nobody said anything about.
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
    // Still told — the session they joined really did end.
    expect(alertSpy).toHaveBeenCalled();
  });
});

// A joiner that gets its socket back re-runs `FULL_SYNC` to collect what it
// missed — and then has to decide where to put the answer. "The realm asked for
// it, so it goes on screen" is the assumption that predates several sessions
// per browser, and it is the same one that scrambled sheets everywhere else it
// survived: join a friend's character, open one of your own, and the first wifi
// handover would replace yours with theirs.
describe("a joiner's reconnect", () => {
  afterEach(() => {
    vi.useRealTimers();
    mock.holder.connection = null;
    vi.restoreAllMocks();
  });

  // Drop the socket without a goodbye, then let the reconnect ladder's first
  // rung fire and hand it a connection that answers `FULL_SYNC` with the host's
  // copy of UUID_A.
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
