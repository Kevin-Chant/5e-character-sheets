// @vitest-environment jsdom
// A session for a character this browser isn't looking at — edits fold into
// the stored copy instead of the open sheet.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import React from "react";
import type { UUID } from "crypto";
import {
  SharingSessionsContextProvider,
  TOPIC_FOR,
  useHostSharingSession,
  useSharingSessions,
} from "./use-sharing-session";
import { PROTOCOL_VERSION } from "src/lib/realm/envelope";
import { TAB_SYNC_CHANNEL } from "src/lib/tab-sync";
import { updateData } from "./reducers/actions";
import { FIELD } from "src/lib/data/data-definitions";
import type { Character } from "src/lib/types";

const mock = vi.hoisted(() => ({ holder: { connection: null as any } }));

vi.mock("autobahn-browser", () => {
  class MockConnection {
    onopen: ((session: unknown) => void) | undefined;
    onclose: (() => boolean) | undefined;
    // Keyed by topic, unlike the sibling file's mock — delivers to only the
    // one subscription for a topic, as a real broker would.
    handlers = new Map<string, (args: unknown[]) => void>();
    published: Record<string, unknown>[] = [];
    session = {
      subscribe: (topic: string, handler: (args: unknown[]) => void) => {
        this.handlers.set(topic, handler);
        return Promise.resolve({});
      },
      publish: (_topic: string, args: unknown[]) => {
        this.published.push(args[0] as Record<string, unknown>);
      },
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

const SHARED = "11111111-1111-1111-1111-111111111111" as UUID;
const OPEN = "22222222-2222-2222-2222-222222222222" as UUID;

const deliver = (connection: any, message: Record<string, unknown>) => {
  const topic = TOPIC_FOR[message.kind as keyof typeof TOPIC_FOR];
  connection.handlers.get(topic)?.([{ ...message, v: PROTOCOL_VERSION }]);
};

// Hosting awaits an `openRealm` fetch before constructing a connection, so the
// mock isn't there on the next line the way it is for a join.
const untilConnection = async () => {
  for (let i = 0; i < 20 && !mock.holder.connection; i += 1) {
    await Promise.resolve();
  }
  return mock.holder.connection;
};

// Each background apply is load -> reduce -> save, all async; a few macro
// tasks flush a chain of them.
const drain = async () => {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const wrapper = ({ children }: React.PropsWithChildren) =>
  React.createElement(SharingSessionsContextProvider, null, children);

// A host whose open sheet is `OPEN` while it shares `SHARED` — a DM who
// clicked to a second party sheet. Hosts `SHARED` while it's open, then
// switches `onScreen` to `OPEN` — hosting with `OPEN` already on screen would
// test a different case (a realm carrying an edit for a character it isn't
// named for).
function harness(
  store: Map<UUID, Character>,
  writes: Character[],
  onScreen: { uuid: UUID },
) {
  return renderHook(
    () => {
      const sessions = useSharingSessions();
      useHostSharingSession(
        vi.fn(),
        () => ({ uuid: onScreen.uuid, name: "On screen" }) as Character,
        {
          loadStored: async (uuid) => {
            // Fresh copy each read, like a real datastore hand-back.
            const found = store.get(uuid);
            return found ? structuredClone(found) : undefined;
          },
          saveStored: async (character) => {
            store.set(character.uuid, structuredClone(character));
            writes.push(structuredClone(character));
          },
        },
      );
      return sessions;
    },
    { wrapper },
  );
}

describe("edits for a character that isn't open", () => {
  // Hosting opens the realm over HTTP first (`create: true`); joining doesn't.
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200 }) as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mock.holder.connection = null;
    vi.restoreAllMocks();
  });

  it("folds them into the stored copy instead of the open sheet", async () => {
    const store = new Map<UUID, Character>([
      [SHARED, { uuid: SHARED, name: "Before" } as Character],
    ]);
    const writes: Character[] = [];
    const onScreen = { uuid: SHARED };
    const { result } = harness(store, writes, onScreen);

    await act(async () => {
      const host = result.current.hostSession().catch(() => {});
      const connection = await untilConnection();
      connection.onopen(connection.session);
      await host;
    });
    onScreen.uuid = OPEN;

    await act(async () => {
      deliver(mock.holder.connection, {
        kind: "dispatch",
        clientId: "a-peer",
        uuid: SHARED,
        action: updateData(FIELD.name, { value: "After" }),
      });
      await drain();
    });

    expect(store.get(SHARED)?.name).toBe("After");
    expect(store.has(OPEN)).toBe(false);
  });

  // Without the per-uuid write chain, two edits in the same tick would read
  // the same stored copy and the second write would erase the first.
  it("serialises two edits landing in the same tick", async () => {
    const store = new Map<UUID, Character>([
      [
        SHARED,
        { uuid: SHARED, name: "Before", maxHp: 10 } as unknown as Character,
      ],
    ]);
    const writes: Character[] = [];
    const onScreen = { uuid: SHARED };
    const { result } = harness(store, writes, onScreen);

    await act(async () => {
      const host = result.current.hostSession().catch(() => {});
      const connection = await untilConnection();
      connection.onopen(connection.session);
      await host;
    });
    onScreen.uuid = OPEN;

    await act(async () => {
      const connection = mock.holder.connection;
      deliver(connection, {
        kind: "dispatch",
        clientId: "a-peer",
        uuid: SHARED,
        action: updateData(FIELD.name, { value: "Renamed" }),
      });
      deliver(connection, {
        kind: "dispatch",
        clientId: "another-peer",
        uuid: SHARED,
        action: updateData(FIELD.maxHp, { value: 17 }),
      });
      await drain();
    });

    const settled = store.get(SHARED)!;
    expect(settled.name).toBe("Renamed");
    expect(settled.maxHp).toBe(17);
    expect(writes).toHaveLength(2);
  });

  it("ignores an edit stamped with a character this realm isn't for", async () => {
    const store = new Map<UUID, Character>([
      [SHARED, { uuid: SHARED, name: "Shared" } as Character],
      [OPEN, { uuid: OPEN, name: "Not shared" } as Character],
    ]);
    const writes: Character[] = [];
    const onScreen = { uuid: SHARED };
    const { result } = harness(store, writes, onScreen);

    await act(async () => {
      const host = result.current.hostSession().catch(() => {});
      const connection = await untilConnection();
      connection.onopen(connection.session);
      await host;
    });
    onScreen.uuid = OPEN;

    await act(async () => {
      deliver(mock.holder.connection, {
        kind: "dispatch",
        clientId: "a-peer",
        uuid: OPEN,
        action: updateData(FIELD.name, { value: "Renamed by a stranger" }),
      });
      await drain();
    });

    expect(store.get(OPEN)?.name).toBe("Not shared");
    expect(writes).toHaveLength(0);
  });

  it("holds a failed fold and replays it on retry", async () => {
    const store = new Map<UUID, Character>([
      [SHARED, { uuid: SHARED, name: "Before" } as Character],
    ]);
    const writes: Character[] = [];
    const onScreen = { uuid: SHARED };
    let failWrites = true;
    const { result } = renderHook(
      () => {
        const sessions = useSharingSessions();
        useHostSharingSession(
          vi.fn(),
          () => ({ uuid: onScreen.uuid, name: "On screen" }) as Character,
          {
            loadStored: async (uuid) => {
              const found = store.get(uuid);
              return found ? structuredClone(found) : undefined;
            },
            saveStored: async (character) => {
              if (failWrites) throw new Error("offline");
              store.set(character.uuid, structuredClone(character));
              writes.push(structuredClone(character));
            },
          },
        );
        return sessions;
      },
      { wrapper },
    );

    await act(async () => {
      const host = result.current.hostSession().catch(() => {});
      const connection = await untilConnection();
      connection.onopen(connection.session);
      await host;
    });
    onScreen.uuid = OPEN;

    vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      deliver(mock.holder.connection, {
        kind: "dispatch",
        clientId: "a-peer",
        uuid: SHARED,
        action: updateData(FIELD.name, { value: "After" }),
      });
      await drain();
    });

    expect(store.get(SHARED)?.name).toBe("Before");
    expect(result.current.backgroundSaveErrors).toEqual([
      { uuid: SHARED, kind: "error" },
    ]);

    failWrites = false;
    await act(async () => {
      result.current.retryBackgroundSaves();
      await drain();
    });

    expect(store.get(SHARED)?.name).toBe("After");
    expect(result.current.backgroundSaveErrors).toEqual([]);
  });

  it("forwards a sibling tab's edit into a session whose sheet is closed", async () => {
    const store = new Map<UUID, Character>([
      [SHARED, { uuid: SHARED, name: "Before" } as Character],
    ]);
    const onScreen = { uuid: SHARED };
    const { result } = harness(store, [], onScreen);

    await act(async () => {
      const host = result.current.hostSession().catch(() => {});
      const connection = await untilConnection();
      connection.onopen(connection.session);
      await host;
    });
    onScreen.uuid = OPEN;
    mock.holder.connection.published.length = 0;

    // A second tab of this browser — a BroadcastChannel never delivers to
    // itself.
    const sibling = new BroadcastChannel(TAB_SYNC_CHANNEL);
    await act(async () => {
      sibling.postMessage({
        kind: "dispatch",
        uuid: SHARED,
        action: updateData(FIELD.name, { value: "Edited next door" }),
        dirtyAction: true,
        origin: "local",
      });
      await drain();
    });
    sibling.close();

    const dispatches = mock.holder.connection.published.filter(
      (message: Record<string, unknown>) => message.kind === "dispatch",
    );
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({ uuid: SHARED });
  });
});
