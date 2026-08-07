import { afterEach, describe, expect, it } from "vitest";
import { UUID } from "crypto";
import {
  publishTabEdit,
  publishTabEncounter,
  subscribeTabEdits,
  subscribeTabEncounters,
  TAB_SYNC_CHANNEL,
  TabEditMessage,
  TabEncounterMessage,
} from "./tab-sync";
import { updateData } from "src/lib/hooks/reducers/actions";
import { FIELD } from "src/lib/data/data-definitions";

// Node ships a real BroadcastChannel, so "the other tab" here is simply a
// second channel object on the same name — delivery excludes the poster, which
// is exactly the same-tab/self-echo property the module relies on.

const UUID_A = "11111111-1111-4111-8111-111111111111" as UUID;

function otherTab(): BroadcastChannel {
  const channel = new BroadcastChannel(TAB_SYNC_CHANNEL);
  (channel as { unref?: () => void }).unref?.();
  return channel;
}

// Delivery is queued, never synchronous; wait for it.
function nextMessage(channel: BroadcastChannel): Promise<unknown> {
  return new Promise((resolve) => {
    channel.onmessage = (event: MessageEvent) => resolve(event.data);
  });
}

const openChannels: BroadcastChannel[] = [];
afterEach(() => {
  openChannels.splice(0).forEach((channel) => channel.close());
});

describe("tab-sync", () => {
  it("delivers a published edit to another tab's channel", async () => {
    const peer = otherTab();
    openChannels.push(peer);
    const arrived = nextMessage(peer);
    const action = updateData(FIELD.currHp, { value: 7 });
    publishTabEdit({
      uuid: UUID_A,
      action,
      dirtyAction: true,
      origin: "local",
    });
    expect(await arrived).toEqual({
      kind: "dispatch",
      uuid: UUID_A,
      action,
      dirtyAction: true,
      origin: "local",
    });
  });

  it("hands a subscriber messages posted by another tab", async () => {
    const peer = otherTab();
    openChannels.push(peer);
    const received: TabEditMessage[] = [];
    const seen = new Promise<void>((resolve) => {
      const unsubscribe = subscribeTabEdits((message) => {
        received.push(message);
        unsubscribe();
        resolve();
      });
    });
    peer.postMessage({
      kind: "dispatch",
      uuid: UUID_A,
      action: updateData(FIELD.currHp, { value: 3 }),
      dirtyAction: false,
      origin: "remote",
    });
    await seen;
    expect(received).toHaveLength(1);
    expect(received[0].origin).toBe("remote");
    expect(received[0].action.type).toBe("update_currHp");
  });

  it("drops malformed posts instead of handing them to the subscriber", async () => {
    const peer = otherTab();
    openChannels.push(peer);
    const received: TabEditMessage[] = [];
    const unsubscribe = subscribeTabEdits((message) => received.push(message));
    peer.postMessage("not a message");
    peer.postMessage({ kind: "presence" });
    peer.postMessage({ kind: "dispatch", uuid: UUID_A }); // no action
    // A trailing valid message proves the bad ones were already delivered
    // (channel delivery is ordered) and dropped, rather than still in flight.
    const flushed = new Promise<void>((resolve) => {
      const stop = subscribeTabEdits(() => {
        stop();
        resolve();
      });
    });
    peer.postMessage({
      kind: "dispatch",
      uuid: UUID_A,
      action: updateData(FIELD.currHp, { value: 1 }),
      origin: "local",
    });
    await flushed;
    expect(received).toHaveLength(1);
    unsubscribe();
  });

  it("carries the encounter on its own kind, invisible to the edit subscriber", async () => {
    const peer = otherTab();
    openChannels.push(peer);
    const edits: TabEditMessage[] = [];
    const stopEdits = subscribeTabEdits((message) => edits.push(message));
    const received: TabEncounterMessage[] = [];
    const seen = new Promise<void>((resolve) => {
      const stop = subscribeTabEncounters((message) => {
        received.push(message);
        stop();
        resolve();
      });
    });
    const arrivedAtPeer = nextMessage(peer);
    publishTabEncounter({
      encounter: { round: 2, turnIndex: 1, participants: [] },
      code: "1f0d2c3b-4a59-4687-9c01-2d3e4f5a6b7c",
    });
    // Round-trip our own publish through the peer, back to a subscriber here.
    peer.postMessage(await arrivedAtPeer);
    await seen;
    expect(received).toHaveLength(1);
    expect(received[0].code).toBe("1f0d2c3b-4a59-4687-9c01-2d3e4f5a6b7c");
    expect((received[0].encounter as { round: number }).round).toBe(2);
    expect(edits).toHaveLength(0);
    stopEdits();
  });

  it("stops delivering after unsubscribe", async () => {
    const peer = otherTab();
    openChannels.push(peer);
    const received: TabEditMessage[] = [];
    const unsubscribe = subscribeTabEdits((message) => received.push(message));
    unsubscribe();
    const flushed = new Promise<void>((resolve) => {
      const stop = subscribeTabEdits(() => {
        stop();
        resolve();
      });
    });
    peer.postMessage({
      kind: "dispatch",
      uuid: UUID_A,
      action: updateData(FIELD.currHp, { value: 5 }),
      origin: "local",
    });
    await flushed;
    expect(received).toHaveLength(0);
  });
});
