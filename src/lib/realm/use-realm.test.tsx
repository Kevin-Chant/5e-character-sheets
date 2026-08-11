// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRealm } from "src/lib/realm/use-realm";

// Tests the transport's connection hardening: a socket that died without
// saying so, and a message published into one. The autobahn connection is
// mocked and driven by hand since these need a broker that misbehaves.

const mock = vi.hoisted(() => ({
  holder: { connection: null as any },
  published: [] as any[],
  // Dead socket: the liveness probe's self-call never answers.
  callAnswers: true,
  // A broker holding a stale registration under our name refuses with
  // procedure_already_exists.
  registerAccepted: true,
  // A zombie socket accepts the publish and never confirms it.
  ackAnswers: true,
}));

vi.mock("autobahn-browser", () => {
  class MockConnection {
    onopen: ((session: unknown) => void) | undefined;
    onclose: (() => boolean) | undefined;
    session = {
      subscribe: () => Promise.resolve({}),
      register: () =>
        mock.registerAccepted
          ? Promise.resolve({})
          : Promise.reject(new Error("wamp.error.procedure_already_exists")),
      publish: (
        topic: string,
        args: unknown[],
        _kwargs?: unknown,
        options?: { acknowledge?: boolean },
      ) => {
        mock.published.push({ topic, message: (args as any[])[0] });
        if (options?.acknowledge) {
          return mock.ackAnswers ? Promise.resolve({}) : new Promise(() => {});
        }
        return undefined;
      },
      call: () =>
        mock.callAnswers ? Promise.resolve(1) : new Promise(() => {}),
    };
    close = () => {};
    open = () => {};
    constructor() {
      mock.holder.connection = this;
    }
  }
  return { default: { Connection: MockConnection } };
});

type Kind = "edit" | "chatter";

const TOPICS: Record<Kind, string> = {
  edit: "test.edit",
  chatter: "test.chatter",
};

const openRealm = async (
  result: { current: ReturnType<typeof useRealm<Kind>> },
  name = "testrealm",
) => {
  await act(async () => {
    const connecting = result.current.connect(name);
    const connection = mock.holder.connection;
    connection.onopen(connection.session);
    await connecting;
  });
};

const setup = (over: Partial<Parameters<typeof useRealm<Kind>>[0]> = {}) => {
  const onClosed = vi.fn();
  const { result } = renderHook(() =>
    useRealm<Kind>({
      clientId: "me",
      topics: TOPICS,
      onMessage: () => {},
      onClosed,
      queueWhileOffline: (kind) => kind === "edit",
      ...over,
    }),
  );
  return { result, onClosed };
};

afterEach(() => {
  mock.holder.connection = null;
  mock.published = [];
  mock.callAnswers = true;
  mock.registerAccepted = true;
  mock.ackAnswers = true;
  vi.useRealTimers();
});

describe("publishing into a socket that isn't there", () => {
  it("holds the kinds the layer says are worth holding, and replays them", async () => {
    const { result } = setup();
    await openRealm(result);

    act(() => {
      mock.holder.connection.onclose();
    });
    mock.published = [];

    act(() => {
      result.current.publish({ kind: "edit", clientId: "me" });
      // "chatter" is superseded by whatever comes next, not worth replaying.
      result.current.publish({ kind: "chatter", clientId: "me" });
    });
    expect(mock.published).toHaveLength(0);

    await openRealm(result);
    expect(mock.published.map((p) => p.message.kind)).toEqual(["edit"]);
  });

  it("won't replay into a different room", async () => {
    const { result } = setup();
    await openRealm(result, "one");
    act(() => {
      mock.holder.connection.onclose();
      result.current.publish({ kind: "edit", clientId: "me" });
    });
    mock.published = [];

    await openRealm(result, "two");
    expect(mock.published).toHaveLength(0);
  });

  it("holds a publish the broker never confirmed, and replays it on reconnect", async () => {
    vi.useFakeTimers();
    const { result } = setup();
    await openRealm(result);

    mock.ackAnswers = false;
    act(() => {
      result.current.publish({ kind: "edit", clientId: "me" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    act(() => {
      mock.holder.connection.onclose();
    });
    mock.published = [];
    mock.ackAnswers = true;

    await openRealm(result);
    expect(mock.published.map((p) => p.message.kind)).toEqual(["edit"]);
  });

  it("does not hold a publish the broker confirmed", async () => {
    vi.useFakeTimers();
    const { result } = setup();
    await openRealm(result);

    act(() => {
      result.current.publish({ kind: "edit", clientId: "me" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    act(() => {
      mock.holder.connection.onclose();
    });
    mock.published = [];

    await openRealm(result);
    expect(mock.published).toHaveLength(0);
  });

  it("drops what it held when the session is closed deliberately", async () => {
    const { result } = setup();
    await openRealm(result);
    act(() => {
      mock.holder.connection.onclose();
      result.current.publish({ kind: "edit", clientId: "me" });
      result.current.close();
    });
    mock.published = [];

    await openRealm(result);
    expect(mock.published).toHaveLength(0);
  });
});

describe("a socket that died without saying so", () => {
  it("is noticed, and reported as the closure it is", async () => {
    vi.useFakeTimers();
    const { result, onClosed } = setup();
    await openRealm(result);
    expect(result.current.status).toBe("connected");

    // Wifi-handover case: browser thinks it's open, nothing ever arrives.
    mock.callAnswers = false;
    await act(async () => {
      // Beat, then both probes timing out — two failures required, since a
      // resumed tab fires its pending timers all at once.
      await vi.advanceTimersByTimeAsync(21_000);
      await vi.advanceTimersByTimeAsync(9_000);
      await vi.advanceTimersByTimeAsync(9_000);
    });

    expect(onClosed).toHaveBeenCalled();
    expect(result.current.status).toBe("offline");
  });

  // A refused registration means every probe would fail regardless of socket
  // health, so the probe must not run in that case.
  it("keeps a connection whose probe couldn't register, instead of probing a name it doesn't hold", async () => {
    vi.useFakeTimers();
    mock.registerAccepted = false;
    mock.callAnswers = false;
    const { result, onClosed } = setup();
    await openRealm(result);
    expect(result.current.status).toBe("connected");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(80_000);
    });

    expect(onClosed).not.toHaveBeenCalled();
    expect(result.current.status).toBe("connected");
  });

  it("leaves a healthy connection alone", async () => {
    vi.useFakeTimers();
    const { result, onClosed } = setup();
    await openRealm(result);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(80_000);
    });

    expect(onClosed).not.toHaveBeenCalled();
    expect(result.current.status).toBe("connected");
  });
});

describe("an attempt superseded while still opening", () => {
  it("does not let a slow first attempt steal the session from its replacement", async () => {
    const { result } = setup();

    let first: any;
    let firstResult: Promise<{ ok: boolean }>;
    await act(async () => {
      firstResult = result.current.connect("one");
      first = mock.holder.connection;
      const second = result.current.connect("two");
      mock.holder.connection.onopen(mock.holder.connection.session);
      await second;
    });
    expect(result.current.realm).toBe("two");

    await act(async () => {
      first.onopen(first.session);
      expect((await firstResult).ok).toBe(false);
    });
    expect(result.current.realm).toBe("two");
    expect(result.current.status).toBe("connected");
  });

  it("does not let an attempt in flight survive a deliberate close", async () => {
    const { result } = setup();

    let attempt: Promise<{ ok: boolean }>;
    let connection: any;
    await act(async () => {
      attempt = result.current.connect("one");
      connection = mock.holder.connection;
      result.current.close();
      connection.onopen(connection.session);
      expect((await attempt).ok).toBe(false);
    });
    expect(result.current.status).toBe("offline");
    expect(result.current.connected()).toBe(false);
  });
});
