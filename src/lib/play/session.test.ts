import { describe, expect, it } from "vitest";
import { UUID } from "crypto";
import {
  addParticipant,
  advanceTurn,
  EMPTY_ENCOUNTER,
  Encounter,
  startCombat,
} from "src/lib/play/encounter";
import {
  bumpRevision,
  isValidSessionCode,
  mergeEncounter,
  forgetSession,
  newSessionCode,
  normalizeSessionCode,
  realmForSession,
  REMEMBERED_SESSIONS,
  TOPIC_FOR,
  rememberSession,
  withoutClient,
  withParticipants,
  extractSessionCode,
  inviteLink,
} from "src/lib/play/session";

const ALICE_CHAR = "11111111-1111-1111-1111-111111111111" as UUID;
const CAROL_CHAR = "33333333-3333-3333-3333-333333333333" as UUID;
const BOB_CHAR = "22222222-2222-2222-2222-222222222222" as UUID;

function party(): Encounter {
  let encounter = EMPTY_ENCOUNTER;
  encounter = addParticipant(encounter, {
    id: "self:alice",
    name: "Alice",
    characterUuid: ALICE_CHAR,
    ownerClientId: "client-a",
    initiative: 15,
    vitals: { currHp: 30, maxHp: 30, ac: 16 },
  });
  encounter = addParticipant(encounter, {
    id: "self:bob",
    name: "Bob",
    characterUuid: BOB_CHAR,
    ownerClientId: "client-b",
    initiative: 9,
    vitals: { currHp: 22, maxHp: 25, ac: 14 },
  });
  encounter = addParticipant(encounter, {
    id: "combatant:goblin",
    name: "Goblin",
    ownerClientId: "client-b",
    initiative: 12,
  });
  return encounter;
}

describe("session codes", () => {
  it("generates uuids that validate and round-trip", () => {
    for (let i = 0; i < 20; i++) {
      const code = newSessionCode();
      expect(isValidSessionCode(code)).toBe(true);
      expect(normalizeSessionCode(code)).toBe(code);
    }
  });

  // Codes get pasted out of a group chat, so the mess a paste brings has to
  // work: surrounding whitespace, wrong case, and the dash-less form some tools
  // produce.
  it("accepts a code however it was pasted", () => {
    const code = newSessionCode();
    expect(normalizeSessionCode(`  ${code.toUpperCase()}\n`)).toBe(code);
    expect(normalizeSessionCode(code.replace(/-/g, ""))).toBe(code);
    expect(isValidSessionCode(code.replace(/-/g, ""))).toBe(true);
  });

  // The uuid *is* the authentication, the same trust model the character realms
  // run on — so anything short enough to guess has to be rejected. The six-char
  // codes this replaced were ~9x10^8 against an unauthenticated, unthrottled
  // openRealm.
  it("rejects anything that isn't a uuid", () => {
    expect(isValidSessionCode("")).toBe(false);
    expect(isValidSessionCode("w6bnsu")).toBe(false);
    expect(isValidSessionCode("abcdef12-3456-7890-abcd")).toBe(false);
    expect(isValidSessionCode("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz")).toBe(
      false,
    );
  });

  // A session realm and a shared-character realm live on the same sidecar, and
  // both are uuids now — so the prefix is the only thing keeping them apart.
  it("namespaces its realm away from the character realms", () => {
    const code = "ABCDEF12-3456-7890-ABCD-EF1234567890";
    expect(realmForSession(code)).toBe("sessabcdef1234567890abcdef1234567890");
    expect(realmForSession(code).startsWith("sess")).toBe(true);
  });
});

describe("remembered sessions", () => {
  const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as UUID;
  const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as UUID;

  it("puts the newest first", () => {
    let sessions = rememberSession(undefined, A, 100);
    sessions = rememberSession(sessions, B, 200);
    expect(sessions.map((s) => s.code)).toEqual([B, A]);
  });

  // Rejoining is the common case — the list has to order itself by use rather
  // than fill up with the same code.
  it("moves a rejoined session to the top instead of duplicating it", () => {
    let sessions = rememberSession(undefined, A, 100);
    sessions = rememberSession(sessions, B, 200);
    sessions = rememberSession(sessions, A, 300);
    expect(sessions.map((s) => s.code)).toEqual([A, B]);
    expect(sessions[0].lastJoined).toBe(300);
  });

  it("normalizes before storing, so a pasted variant isn't a second entry", () => {
    let sessions = rememberSession(undefined, A.toUpperCase(), 100);
    sessions = rememberSession(sessions, A.replace(/-/g, ""), 200);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].code).toBe(A);
  });

  it("keeps only the most recent few", () => {
    let sessions: ReturnType<typeof rememberSession> | undefined;
    for (let i = 0; i < REMEMBERED_SESSIONS + 3; i++) {
      sessions = rememberSession(
        sessions,
        `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`,
        i,
      );
    }
    expect(sessions).toHaveLength(REMEMBERED_SESSIONS);
    expect(sessions![0].lastJoined).toBe(REMEMBERED_SESSIONS + 2);
  });

  it("forgets a session by any of its written forms", () => {
    const sessions = rememberSession(undefined, A, 100);
    expect(forgetSession(sessions, A.toUpperCase())).toEqual([]);
  });
});

describe("mergeEncounter", () => {
  it("accepts a newer revision", () => {
    const local = bumpRevision(party(), "client-a");
    const incoming = bumpRevision(startCombat(local), "client-b");
    expect(mergeEncounter(local, incoming, ALICE_CHAR).round).toBe(1);
  });

  it("ignores an older revision", () => {
    const older = bumpRevision(party(), "client-b");
    const local = bumpRevision(startCombat(older), "client-a");
    expect(mergeEncounter(local, older, ALICE_CHAR)).toBe(local);
  });

  // Two clients writing at once must not sit swapping states forever, so the
  // tie is broken the same way in every browser.
  it("breaks a same-revision tie deterministically", () => {
    const base = party();
    const fromA = { ...base, revision: 4, revisedBy: "client-a" };
    const fromB = { ...base, revision: 4, revisedBy: "client-b" };
    // Both browsers agree that B wins, whichever side is asking.
    expect(mergeEncounter(fromA, fromB, ALICE_CHAR).revisedBy).toBe("client-b");
    expect(mergeEncounter(fromB, fromA, ALICE_CHAR).revisedBy).toBe("client-b");
  });

  // A peer's copy of your HP is only as fresh as the last state they received.
  // Accepting it wholesale makes your own HP bar jump backwards whenever anyone
  // else advances the turn.
  it("keeps your own vitals when a peer's copy of them is stale", () => {
    const local = bumpRevision(party(), "client-a");
    const hurt = {
      ...local,
      participants: local.participants.map((p) =>
        p.characterUuid === ALICE_CHAR
          ? { ...p, vitals: { currHp: 4, maxHp: 30, ac: 16 } }
          : p,
      ),
    };
    // A peer publishes a newer encounter still carrying Alice at full HP.
    const stale = bumpRevision(bumpRevision(party(), "client-b"), "client-b");
    const merged = mergeEncounter(hurt, stale, ALICE_CHAR);
    expect(
      merged.participants.find((p) => p.characterUuid === ALICE_CHAR)?.vitals
        ?.currHp,
    ).toBe(4);
    // Everyone else's vitals come from the peer, as they should.
    expect(
      merged.participants.find((p) => p.characterUuid === BOB_CHAR)?.vitals
        ?.currHp,
    ).toBe(22);
  });

  // The join case, and the one that silently breaks a party: you announce
  // yourself, the peer replies with a state that predates you, and accepting it
  // wholesale deletes you from your own roster.
  it("keeps participants this client contributed that the peer hasn't seen", () => {
    let local = EMPTY_ENCOUNTER;
    local = addParticipant(local, {
      id: "self:carol",
      name: "Carol",
      characterUuid: "33333333-3333-3333-3333-333333333333" as UUID,
      ownerClientId: "client-c",
      initiative: 0,
    });
    // The party's state, from before Carol arrived.
    const incoming = bumpRevision(
      bumpRevision(party(), "client-a"),
      "client-a",
    );
    const merged = mergeEncounter(
      local,
      incoming,
      "33333333-3333-3333-3333-333333333333" as UUID,
      "client-c",
    );
    expect(merged.participants.map((p) => p.name)).toEqual([
      "Alice",
      "Bob",
      "Goblin",
      "Carol",
    ]);
    // The caller uses this length difference to decide the merge is worth
    // publishing back — otherwise nobody else ever learns Carol is here.
    expect(merged.participants.length).toBeGreaterThan(
      incoming.participants.length,
    );
  });

  // The bug this guards: a joiner and the room routinely reach the *same*
  // revision independently — each counted its own participant and its own
  // vitals, neither has heard of the other — and the clientId tiebreak then
  // decides who exists by comparing two random uuids. About half the time the
  // joiner "won" and silently discarded the room. It failed intermittently and
  // only against a live peer, which is exactly the kind of bug a unit test
  // should be able to state.
  describe("a joiner adopts the room instead of racing it", () => {
    const joining = () => {
      const local = bumpRevision(
        addParticipant(EMPTY_ENCOUNTER, {
          id: "self:carol",
          name: "Carol",
          characterUuid: CAROL_CHAR,
          ownerClientId: "client-c",
          initiative: 0,
        }),
        // Deliberately sorts *above* the room's writer, so the tiebreak would
        // hand this client the win.
        "zzz-client-c",
      );
      const room = bumpRevision(startCombat(party()), "aaa-client-a");
      return { local, room };
    };

    it("would otherwise discard the room's roster", () => {
      const { local, room } = joining();
      expect(local.revision).toBe(room.revision);
      // Without `adopt`, the tiebreak keeps the newcomer's local *membership*
      // — the whole party vanishes from their copy. (The fight's position now
      // survives on its own lane, `turnSeq`; membership is what adoption is
      // still for.)
      const raced = mergeEncounter(local, room, CAROL_CHAR, "client-c");
      expect(raced.participants.map((p) => p.name)).toEqual(["Carol"]);
      expect(raced.round).toBe(1);
    });

    it("takes the room's round, order and DM seat", () => {
      const { local, room } = joining();
      const withDm = { ...room, dmClientId: "aaa-client-a" };
      const merged = mergeEncounter(
        local,
        withDm,
        CAROL_CHAR,
        "client-c",
        true,
      );
      expect(merged.round).toBe(1);
      expect(merged.dmClientId).toBe("aaa-client-a");
    });

    it("still contributes its own participant", () => {
      const { local, room } = joining();
      const merged = mergeEncounter(local, room, CAROL_CHAR, "client-c", true);
      expect(merged.participants.map((p) => p.name)).toContain("Carol");
      expect(merged.participants.map((p) => p.name)).toContain("Alice");
    });

    // Adoption is one-shot, for the first reply after joining. A host that kept
    // adopting would let the next arrival's empty state wipe its own fight.
    it("is not how ordinary updates are merged", () => {
      const { local, room } = joining();
      const merged = mergeEncounter(local, room, CAROL_CHAR, "client-c");
      // An ordinary merge still runs the document race on membership: the
      // newcomer's tiebreak win keeps their own roster.
      expect(merged.participants.map((p) => p.name)).toEqual(["Carol"]);
    });
  });

  it("does not re-add a participant the peer legitimately removed", () => {
    const local = bumpRevision(party(), "client-b");
    // Alice's client dropped Bob deliberately; Bob is client-b's, and this is
    // client-a merging, so nothing of ours is missing.
    const incoming = bumpRevision(withoutClient(local, "client-b"), "client-a");
    const merged = mergeEncounter(local, incoming, ALICE_CHAR, "client-a");
    expect(merged.participants.map((p) => p.name)).toEqual(["Alice", "Goblin"]);
  });

  it("takes conditions on you from the peer — the DM may be setting them", () => {
    const local = bumpRevision(party(), "client-a");
    const incoming = bumpRevision(
      {
        ...local,
        participants: local.participants.map((p) =>
          p.characterUuid === ALICE_CHAR
            ? { ...p, conditions: [{ name: "Frightened" }] }
            : p,
        ),
      },
      "client-b",
    );
    const merged = mergeEncounter(local, incoming, ALICE_CHAR);
    expect(
      merged.participants.find((p) => p.characterUuid === ALICE_CHAR)
        ?.conditions,
    ).toEqual([{ name: "Frightened" }]);
  });
});

describe("roster changes", () => {
  it("adds a newcomer's participants without duplicating known ones", () => {
    const base = party();
    const newcomer = addParticipant(EMPTY_ENCOUNTER, {
      id: "self:carol",
      name: "Carol",
      characterUuid: "33333333-3333-3333-3333-333333333333" as UUID,
      ownerClientId: "client-c",
      initiative: 3,
    });
    const merged = withParticipants(base, newcomer.participants);
    expect(merged.participants.map((p) => p.name)).toEqual([
      "Alice",
      "Bob",
      "Goblin",
      "Carol",
    ]);
    // Re-merging the same roster is a no-op, including object identity.
    expect(withParticipants(merged, newcomer.participants)).toBe(merged);
  });

  // A player closing their laptop takes their character out of the order. The
  // monsters they typed in stay: the fight still contains them, and somebody
  // else is tracking them now.
  it("drops a departing client's character but keeps what they typed in", () => {
    const after = withoutClient(party(), "client-b");
    expect(after.participants.map((p) => p.name)).toEqual(["Alice", "Goblin"]);
  });

  it("keeps the turn index inside the roster when someone leaves", () => {
    const encounter = { ...startCombat(party()), turnIndex: 2 };
    const after = withoutClient(encounter, "client-b");
    expect(after.turnIndex).toBeLessThan(after.participants.length);
  });

  it("is a no-op for a client that owns nothing", () => {
    const base = party();
    expect(withoutClient(base, "client-z")).toBe(base);
  });

  // Found by driving two real browsers: the DM left, the seat stayed claimed to
  // a client no longer in the realm, and everyone else lost the combat controls
  // permanently — the exact failure the seat is a UI gate (not a lock) to avoid.
  it("releases the DM seat when its holder leaves", () => {
    const held = { ...party(), dmClientId: "client-b" };
    expect(withoutClient(held, "client-b").dmClientId).toBeUndefined();
  });

  it("leaves someone else's DM seat alone", () => {
    const held = { ...party(), dmClientId: "client-a" };
    expect(withoutClient(held, "client-b").dmClientId).toBe("client-a");
  });

  it("releases the seat even for a client that owned no participants", () => {
    const held = { ...party(), dmClientId: "client-z" };
    expect(withoutClient(held, "client-z").dmClientId).toBeUndefined();
  });
});

describe("re-adding into a fight in progress", () => {
  // The merge's re-add and the local addParticipant share `insertParticipant`:
  // a joiner arriving mid-combat lands where their roll says on every peer's
  // copy, not just their own.
  it("seats the re-added participant by initiative", () => {
    let local = EMPTY_ENCOUNTER;
    local = addParticipant(local, {
      id: "self:carol",
      name: "Carol",
      characterUuid: CAROL_CHAR,
      ownerClientId: "client-c",
      initiative: 14,
    });
    // Order: Alice 15, Goblin 12, Bob 9 — Alice is acting.
    const incoming = bumpRevision(
      bumpRevision(startCombat(party()), "client-a"),
      "client-a",
    );
    const merged = mergeEncounter(local, incoming, CAROL_CHAR, "client-c");
    expect(merged.participants.map((p) => p.name)).toEqual([
      "Alice",
      "Carol",
      "Goblin",
      "Bob",
    ]);
    expect(merged.participants[merged.turnIndex].name).toBe("Alice");
  });

  it("keeps the current actor current when the seat is behind them", () => {
    let local = EMPTY_ENCOUNTER;
    local = addParticipant(local, {
      id: "self:carol",
      name: "Carol",
      characterUuid: CAROL_CHAR,
      ownerClientId: "client-c",
      initiative: 14,
    });
    // Advance the room to the Goblin (12) before Carol's state merges in.
    let room = startCombat(party());
    room = advanceTurn(room).encounter;
    expect(room.participants[room.turnIndex].name).toBe("Goblin");
    const incoming = bumpRevision(bumpRevision(room, "client-a"), "client-a");
    const merged = mergeEncounter(local, incoming, CAROL_CHAR, "client-c");
    expect(merged.participants.map((p) => p.name)).toEqual([
      "Alice",
      "Carol",
      "Goblin",
      "Bob",
    ]);
    // Carol's count already passed this round; the Goblin keeps acting.
    expect(merged.participants[merged.turnIndex].name).toBe("Goblin");
  });
});

describe("invites", () => {
  const code = "1f0d2c3b-4a59-4687-9c01-2d3e4f5a6b7c";

  it("pulls the code out of a pasted link, which is what people forward", () => {
    expect(
      extractSessionCode(`https://dndcharactersheets.net/join/${code}`),
    ).toBe(code);
    expect(extractSessionCode(`  ${code.toUpperCase()}  `)).toBe(code);
  });

  it("hands back the normalized input when there is no code in it, so the caller's own error message still fires", () => {
    expect(extractSessionCode("come to my game")).toBe("cometomygame");
  });

  it("builds a link that lands on the join route", () => {
    expect(inviteLink("https://dndcharactersheets.net", code)).toBe(
      `https://dndcharactersheets.net/join/${code}`,
    );
    // A trailing slash on the origin shouldn't double up.
    expect(inviteLink("http://localhost:3000/", code)).toBe(
      `http://localhost:3000/join/${code}`,
    );
  });
});

describe("the topic table", () => {
  it("gives every message kind its own topic", () => {
    // A copy-paste collision here is silent and awful: two kinds sharing a
    // topic means both handlers see both messages and each drops the other's
    // as "wrong kind", so a feature simply stops working with nothing logged.
    const topics = Object.values(TOPIC_FOR);
    expect(new Set(topics).size).toBe(topics.length);
  });

  it("namespaces every one of them, so a realm can't collide with a peer app", () => {
    for (const topic of Object.values(TOPIC_FOR)) {
      expect(topic.startsWith("net.dndcharactersheets.")).toBe(true);
    }
  });
});
