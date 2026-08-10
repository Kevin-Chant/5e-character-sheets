// @vitest-environment jsdom
// A session for a character this browser isn't looking at.
//
// The character layer used to hold one session because `CharacterContext` holds
// one character: a session whose sheet wasn't open had no dispatch target, so
// arriving edits went to whatever *was* open and were saved there. Holding one
// session per character is only honest if a closed sheet has somewhere for its
// edits to land — the stored copy, folded through the same pure reducer, and
// written back in order.
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
    // Keyed by topic, unlike the sibling file's simpler mock: a real broker
    // delivers a message to the one subscription for its topic, and a mock that
    // fans it out to all four turns one edit into four applies — which happens
    // to converge here (whole-value actions are idempotent) and would hide a
    // write path that fired more often than it should.
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

// Hosting awaits the `openRealm` fetch before it constructs a connection, so
// the mock isn't there on the next line the way it is for a join.
const untilConnection = async () => {
  for (let i = 0; i < 20 && !mock.holder.connection; i += 1) {
    await Promise.resolve();
  }
  return mock.holder.connection;
};

// Each background apply is load → reduce → save, all async, so settling one
// takes several turns and settling a chain of them takes several more. A macro
// task per round flushes both queues.
const drain = async () => {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const wrapper = ({ children }: React.PropsWithChildren) =>
  React.createElement(SharingSessionsContextProvider, null, children);

// A host whose *open* sheet is `OPEN` while it shares `SHARED` — the shape a DM
// is in the moment they click to a second party sheet.
//
// Which is a shape that has to be *reached*, not declared: a session is opened
// for the character on screen, so `SHARED` is hosted while it is open and the
// sheet is switched to `OPEN` afterwards — `onScreen` below is the switch. The
// short cut of hosting with `OPEN` already on screen and then delivering an
// edit stamped `SHARED` describes something else entirely: a realm named for
// one character carrying an edit for another, which is now dropped at the door.
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
            // Every read is a fresh copy, like a real datastore hand-back —
            // so a queue that doesn't serialise really does lose a write.
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
  // Hosting opens the realm over HTTP first (`create: true`); joining doesn't,
  // which is why the sibling test file gets away without this.
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
    // Shared, then closed: the session stays, the sheet doesn't.
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
    // The sheet actually on screen was never touched — the whole point.
    expect(store.has(OPEN)).toBe(false);
  });

  // Two edits in one tick both read the stored copy. Without the per-uuid
  // chain they read the *same* copy and the second write erases the first,
  // silently and to a file nobody has open to notice.
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

  // A realm is named for one character, and the uuid on the message is only a
  // routing key — so a peer in `SHARED`'s room naming `OPEN` must not reach
  // `OPEN` at all, whether it is on screen or in storage. Nothing this app
  // publishes can produce that pairing; the point is that believing it is what
  // turns a routing key into a write primitive for any uuid a peer can name.
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

  // A failed fold is the only copy of a peer's change, and the peer has already
  // been told it landed. Held, reported, and replayable.
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

  // A sibling tab's edit reaching the realm for a sheet *this* tab isn't
  // looking at. The forward used to hang off the open character, back when the
  // only session a browser could hold was the open sheet's — so a host with a
  // second sheet on screen stopped relaying, and its joiners went quietly stale
  // while everything looked live.
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

    // A second tab of this browser, on its own channel object — a channel never
    // delivers to itself, which is exactly why the app's own posts don't loop.
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
