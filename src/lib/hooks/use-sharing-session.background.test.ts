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
    session = {
      subscribe: (topic: string, handler: (args: unknown[]) => void) => {
        this.handlers.set(topic, handler);
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
function harness(store: Map<UUID, Character>, writes: Character[]) {
  return renderHook(
    () => {
      const sessions = useSharingSessions();
      useHostSharingSession(
        vi.fn(),
        () => ({ uuid: OPEN, name: "On screen" }) as Character,
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
    const { result } = harness(store, writes);

    await act(async () => {
      const host = result.current.hostSession().catch(() => {});
      const connection = await untilConnection();
      connection.onopen(connection.session);
      await host;
    });

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
    const { result } = harness(store, writes);

    await act(async () => {
      const host = result.current.hostSession().catch(() => {});
      const connection = await untilConnection();
      connection.onopen(connection.session);
      await host;
    });

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
});
