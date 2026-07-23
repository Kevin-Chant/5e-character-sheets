import { describe, expect, it } from "vitest";
import {
  computePresenceUpdate,
  EDITOR_PREFIX,
  PRESENCE_FRESH_MS,
  PRESENCE_TTL_MS,
} from "./share-presence";

const NOW = 1_000_000_000;
const self = { clientId: "me", name: "Me" };
const key = (clientId: string) => `${EDITOR_PREFIX}${clientId}`;

describe("computePresenceUpdate", () => {
  it("always refreshes our own heartbeat with name", () => {
    const { patch } = computePresenceUpdate({}, self, NOW);
    expect(patch[key("me")]).toBe(`${NOW}|Me`);
  });

  it("reports a fresh peer and never touches non-editor keys", () => {
    const { patch, others } = computePresenceUpdate(
      {
        fiveECharacter: "true",
        [key("alice")]: `${NOW - 5_000}|Alice`,
      },
      self,
      NOW,
    );
    expect(others).toEqual([
      { clientId: "alice", name: "Alice", at: NOW - 5_000 },
    ]);
    // The SHARED_* marker must be left untouched (absent from the patch).
    expect(patch).not.toHaveProperty("fiveECharacter");
    // A fresh peer is not pruned.
    expect(patch).not.toHaveProperty(key("alice"));
  });

  it("ignores our own heartbeat when listing others", () => {
    const { others } = computePresenceUpdate(
      { [key("me")]: `${NOW - 1_000}|Me (old tab)` },
      self,
      NOW,
    );
    expect(others).toHaveLength(0);
  });

  it("excludes a stale-but-not-expired peer without pruning it", () => {
    const staleAt = NOW - (PRESENCE_FRESH_MS + 5_000);
    const { patch, others } = computePresenceUpdate(
      { [key("bob")]: `${staleAt}|Bob` },
      self,
      NOW,
    );
    expect(others).toHaveLength(0);
    // Not fresh, but not past the TTL — leave it alone (avoid racing Bob's write).
    expect(patch).not.toHaveProperty(key("bob"));
  });

  it("prunes a heartbeat past the TTL", () => {
    const deadAt = NOW - (PRESENCE_TTL_MS + 1);
    const { patch, others } = computePresenceUpdate(
      { [key("ghost")]: `${deadAt}|Ghost` },
      self,
      NOW,
    );
    expect(others).toHaveLength(0);
    expect(patch[key("ghost")]).toBeNull();
  });

  it("falls back to a generic name and skips malformed timestamps", () => {
    const { others } = computePresenceUpdate(
      {
        [key("noname")]: `${NOW}`,
        [key("garbage")]: "not-a-number|X",
      },
      self,
      NOW,
    );
    expect(others).toEqual([{ clientId: "noname", name: "Someone", at: NOW }]);
  });
});

describe("computePresenceUpdate — window boundaries", () => {
  // The freshness and TTL edges decide whether a peer flickers out of the
  // roster or a heartbeat gets pruned out from under a peer that just wrote it,
  // so pin them rather than leaving the comparison operators to inference.
  const peerAt = (at: number) => ({ [key("them")]: `${at}|Them` });

  it("counts a peer seen exactly at the freshness edge as present", () => {
    const { others } = computePresenceUpdate(
      peerAt(NOW - PRESENCE_FRESH_MS),
      self,
      NOW,
    );
    expect(others.map((o) => o.clientId)).toEqual(["them"]);
  });

  it("drops a peer one millisecond past it", () => {
    const { others } = computePresenceUpdate(
      peerAt(NOW - PRESENCE_FRESH_MS - 1),
      self,
      NOW,
    );
    expect(others).toEqual([]);
  });

  it("keeps a heartbeat sitting exactly on the TTL", () => {
    const { patch } = computePresenceUpdate(
      peerAt(NOW - PRESENCE_TTL_MS),
      self,
      NOW,
    );
    expect(patch).not.toHaveProperty(key("them"));
  });

  it("prunes one millisecond past the TTL", () => {
    const { patch } = computePresenceUpdate(
      peerAt(NOW - PRESENCE_TTL_MS - 1),
      self,
      NOW,
    );
    expect(patch[key("them")]).toBeNull();
  });

  it("tolerates a clock-skewed peer heartbeat from the future", () => {
    const { patch, others } = computePresenceUpdate(
      peerAt(NOW + 60_000),
      self,
      NOW,
    );
    expect(others.map((o) => o.clientId)).toEqual(["them"]);
    expect(patch).not.toHaveProperty(key("them"));
  });
});
