import { describe, expect, it } from "vitest";
import { accept, PROTOCOL_VERSION, stamp } from "src/lib/realm/envelope";

const KINDS = ["state", "syncRequest"] as const;
const inbound = (over: Record<string, unknown>) => ({
  kind: "state",
  clientId: "them",
  v: PROTOCOL_VERSION,
  ...over,
});

describe("stamp", () => {
  it("versions an outgoing message without touching the rest of it", () => {
    expect(stamp({ kind: "syncRequest", clientId: "me", extra: 1 })).toEqual({
      kind: "syncRequest",
      clientId: "me",
      extra: 1,
      v: PROTOCOL_VERSION,
    });
  });
});

describe("accept", () => {
  const options = { clientId: "me", kinds: KINDS };

  it("passes an ordinary message from a peer", () => {
    const message = inbound({});
    expect(accept(message, options)).toEqual({ ok: true, message });
  });

  it("drops our own echo — the broker does not honour exclude_me", () => {
    expect(accept(inbound({ clientId: "me" }), options)).toEqual({
      ok: false,
      reason: "self",
    });
  });

  it("drops a message addressed to somebody else", () => {
    expect(accept(inbound({ toClientId: "someone" }), options)).toEqual({
      ok: false,
      reason: "not-ours",
    });
  });

  it("keeps one addressed to us", () => {
    expect(accept(inbound({ toClientId: "me" }), options).ok).toBe(true);
  });

  it("drops a kind this subscriber doesn't handle", () => {
    expect(accept(inbound({ kind: "gossip" }), options)).toEqual({
      ok: false,
      reason: "unknown-kind",
    });
  });

  it("drops a newer client's message rather than guessing at it", () => {
    expect(accept(inbound({ v: PROTOCOL_VERSION + 1 }), options)).toEqual({
      ok: false,
      reason: "future",
    });
  });

  // v3 changed the convergence model itself: a document from an older build
  // carries no lane counters, so its edits would silently lose every lane tie.
  // The honest failure is a fresh join — drop the message whole and let each
  // side keep its own working state — not a wrong merge.
  it("drops an older client's message the same way", () => {
    expect(accept(inbound({ v: PROTOCOL_VERSION - 1 }), options)).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("treats an unversioned message as older than everything", () => {
    expect(accept(inbound({ v: undefined }), options)).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it.each([
    ["not an object", "state"],
    ["null", null],
    ["missing kind", { clientId: "them" }],
    ["missing clientId", { kind: "state" }],
  ])("drops what isn't a message at all (%s)", (_label, raw) => {
    expect(accept(raw, options)).toEqual({ ok: false, reason: "malformed" });
  });
});
