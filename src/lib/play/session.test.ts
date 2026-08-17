import { describe, expect, it } from "vitest";
import { UUID } from "crypto";
import { SkillName } from "src/lib/data/data-definitions";
import {
  addParticipant,
  advanceTurn,
  EMPTY_ENCOUNTER,
  Encounter,
  startCombat,
} from "src/lib/play/encounter";
import {
  bumpRevision,
  conditionOffersFor,
  isEncounter,
  isValidSessionCode,
  mergeEncounter,
  forgetSession,
  newSessionCode,
  normalizeSessionCode,
  realmForSession,
  RollCall,
  sessionForRealm,
  rollCallReaches,
  REMEMBERED_SESSIONS,
  TOPIC_FOR,
  rememberSession,
  withoutClient,
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

  it("accepts a code however it was pasted", () => {
    const code = newSessionCode();
    expect(normalizeSessionCode(`  ${code.toUpperCase()}\n`)).toBe(code);
    expect(normalizeSessionCode(code.replace(/-/g, ""))).toBe(code);
    expect(isValidSessionCode(code.replace(/-/g, ""))).toBe(true);
  });

  it("rejects anything that isn't a uuid", () => {
    expect(isValidSessionCode("")).toBe(false);
    expect(isValidSessionCode("w6bnsu")).toBe(false);
    expect(isValidSessionCode("abcdef12-3456-7890-abcd")).toBe(false);
    expect(isValidSessionCode("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz")).toBe(
      false,
    );
  });

  it("namespaces its realm away from the character realms", () => {
    const code = "ABCDEF12-3456-7890-ABCD-EF1234567890";
    expect(realmForSession(code)).toBe("sessabcdef1234567890abcdef1234567890");
    expect(realmForSession(code).startsWith("sess")).toBe(true);
  });

  it("reads the code back off a realm name, and refuses anything else", () => {
    const code = "abcdef12-3456-7890-abcd-ef1234567890";
    expect(sessionForRealm(realmForSession(code))).toBe(code);
    expect(
      sessionForRealm("2f8a91c21111422283334444555566667"),
    ).toBeUndefined();
    expect(sessionForRealm("sessnotauuid")).toBeUndefined();
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

describe("isEncounter", () => {
  it("accepts a real encounter", () => {
    expect(isEncounter(EMPTY_ENCOUNTER)).toBe(true);
    expect(isEncounter(startCombat(party()))).toBe(true);
  });

  it("rejects what a peer on another build might send instead", () => {
    for (const raw of [
      undefined,
      null,
      42,
      "an encounter",
      [],
      {},
      { round: 1, turnIndex: 0 },
      { round: 1, participants: [] },
      { turnIndex: 0, participants: [] },
      { round: "1", turnIndex: 0, participants: [] },
      { round: 1, turnIndex: 0, participants: "none" },
    ]) {
      expect(isEncounter(raw)).toBe(false);
    }
  });
});

describe("mergeEncounter", () => {
  it("accepts a newer revision", () => {
    const local = bumpRevision(party(), "client-a");
    const incoming = bumpRevision(startCombat(local), "client-b");
    expect(
      mergeEncounter(local, incoming, { characterUuid: ALICE_CHAR }).round,
    ).toBe(1);
  });

  it("ignores an older revision", () => {
    const older = bumpRevision(party(), "client-b");
    const local = bumpRevision(startCombat(older), "client-a");
    expect(mergeEncounter(local, older, { characterUuid: ALICE_CHAR })).toBe(
      local,
    );
  });

  it("breaks a same-revision tie deterministically", () => {
    const base = party();
    const fromA = { ...base, revision: 4, revisedBy: "client-a" };
    const fromB = { ...base, revision: 4, revisedBy: "client-b" };
    // Both sides agree B wins, whichever side is asking.
    expect(
      mergeEncounter(fromA, fromB, { characterUuid: ALICE_CHAR }).revisedBy,
    ).toBe("client-b");
    expect(
      mergeEncounter(fromB, fromA, { characterUuid: ALICE_CHAR }).revisedBy,
    ).toBe("client-b");
  });

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
    const merged = mergeEncounter(hurt, stale, { characterUuid: ALICE_CHAR });
    expect(
      merged.participants.find((p) => p.characterUuid === ALICE_CHAR)?.vitals
        ?.currHp,
    ).toBe(4);
    expect(
      merged.participants.find((p) => p.characterUuid === BOB_CHAR)?.vitals
        ?.currHp,
    ).toBe(22);
  });

  it("keeps participants this client contributed that the peer hasn't seen", () => {
    let local = EMPTY_ENCOUNTER;
    local = addParticipant(local, {
      id: "self:carol",
      name: "Carol",
      characterUuid: "33333333-3333-3333-3333-333333333333" as UUID,
      ownerClientId: "client-c",
      initiative: 0,
    });
    const incoming = bumpRevision(
      bumpRevision(party(), "client-a"),
      "client-a",
    );
    const merged = mergeEncounter(local, incoming, {
      characterUuid: "33333333-3333-3333-3333-333333333333" as UUID,
      clientId: "client-c",
    });
    expect(merged.participants.map((p) => p.name)).toEqual([
      "Alice",
      "Bob",
      "Goblin",
      "Carol",
    ]);
    expect(merged.participants.length).toBeGreaterThan(
      incoming.participants.length,
    );
  });

  // Guards against a joiner and the room reaching the same revision
  // independently, where the clientId tiebreak used to discard the room
  // about half the time.
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
      // Without `adopt`, the tiebreak keeps the newcomer's local membership —
      // the party vanishes from their copy.
      const raced = mergeEncounter(local, room, {
        characterUuid: CAROL_CHAR,
        clientId: "client-c",
      });
      expect(raced.participants.map((p) => p.name)).toEqual(["Carol"]);
      expect(raced.round).toBe(1);
    });

    it("takes the room's round, order and DM seat", () => {
      const { local, room } = joining();
      const withDm = { ...room, dmClientId: "aaa-client-a" };
      const merged = mergeEncounter(local, withDm, {
        characterUuid: CAROL_CHAR,
        clientId: "client-c",
        adopt: true,
      });
      expect(merged.round).toBe(1);
      expect(merged.dmClientId).toBe("aaa-client-a");
    });

    it("still contributes its own participant", () => {
      const { local, room } = joining();
      const merged = mergeEncounter(local, room, {
        characterUuid: CAROL_CHAR,
        clientId: "client-c",
        adopt: true,
      });
      expect(merged.participants.map((p) => p.name)).toContain("Carol");
      expect(merged.participants.map((p) => p.name)).toContain("Alice");
    });

    it("is not how ordinary updates are merged", () => {
      const { local, room } = joining();
      const merged = mergeEncounter(local, room, {
        characterUuid: CAROL_CHAR,
        clientId: "client-c",
      });
      expect(merged.participants.map((p) => p.name)).toEqual(["Carol"]);
    });
  });

  it("does not re-add a participant the peer legitimately removed", () => {
    const local = bumpRevision(party(), "client-b");
    const incoming = bumpRevision(withoutClient(local, "client-b"), "client-a");
    const merged = mergeEncounter(local, incoming, {
      characterUuid: ALICE_CHAR,
      clientId: "client-a",
    });
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
    const merged = mergeEncounter(local, incoming, {
      characterUuid: ALICE_CHAR,
    });
    expect(
      merged.participants.find((p) => p.characterUuid === ALICE_CHAR)
        ?.conditions,
    ).toEqual([{ name: "Frightened" }]);
  });
});

describe("roster changes", () => {
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

  it("clears the seat on its own lane, so a stale-but-ahead copy can't reseat the leaver", () => {
    const held = { ...party(), dmClientId: "client-b", seatRev: 3 };
    const cleared = withoutClient(held, "client-b");
    expect(cleared.seatRev).toBe(4);

    // Peer that never heard the LEAVE: same seat/seatRev, but ahead enough on
    // the document lane to become the merge's base.
    let stale: Encounter = held;
    stale = bumpRevision(stale, "client-c");
    stale = bumpRevision(stale, "client-c");
    const merged = mergeEncounter(bumpRevision(cleared, "client-a"), stale, {
      characterUuid: ALICE_CHAR,
      clientId: "client-a",
    });
    expect(merged.dmClientId).toBeUndefined();
  });

  it("reverts a borrowed sheet on the identity lane", () => {
    const withOffer = {
      ...party(),
      dmClientId: "client-a",
    };
    const offered = {
      ...withOffer,
      participants: withOffer.participants.map((p) =>
        p.id === "self:bob" ? { ...p, claimable: true, identityRev: 2 } : p,
      ),
    };
    const after = withoutClient(offered, "client-b");
    const bob = after.participants.find((p) => p.id === "self:bob");
    expect(bob?.ownerClientId).toBe("client-a");
    expect(bob?.identityRev).toBe(3);
  });
});

describe("re-adding into a fight in progress", () => {
  it("seats the re-added participant by initiative", () => {
    let local = EMPTY_ENCOUNTER;
    local = addParticipant(local, {
      id: "self:carol",
      name: "Carol",
      characterUuid: CAROL_CHAR,
      ownerClientId: "client-c",
      initiative: 14,
    });
    // Order: Alice 15, Goblin 12, Bob 9.
    const incoming = bumpRevision(
      bumpRevision(startCombat(party()), "client-a"),
      "client-a",
    );
    const merged = mergeEncounter(local, incoming, {
      characterUuid: CAROL_CHAR,
      clientId: "client-c",
    });
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
    let room = startCombat(party());
    room = advanceTurn(room).encounter;
    expect(room.participants[room.turnIndex].name).toBe("Goblin");
    const incoming = bumpRevision(bumpRevision(room, "client-a"), "client-a");
    const merged = mergeEncounter(local, incoming, {
      characterUuid: CAROL_CHAR,
      clientId: "client-c",
    });
    expect(merged.participants.map((p) => p.name)).toEqual([
      "Alice",
      "Carol",
      "Goblin",
      "Bob",
    ]);
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
    expect(inviteLink("http://localhost:3000/", code)).toBe(
      `http://localhost:3000/join/${code}`,
    );
  });
});

describe("conditionOffersFor", () => {
  const roll = {
    exchangeId: "x1",
    stage: "cast",
    condition: { name: "Bless", rounds: 10 },
    targetIds: ["self", "ally", "orc"],
  };
  const participants = [
    addParticipant(EMPTY_ENCOUNTER, {
      id: "self",
      name: "Ellora",
      characterUuid: ALICE_CHAR,
      initiative: 10,
    }),
  ]
    .flatMap((e) => e.participants)
    .concat([
      {
        id: "ally",
        name: "Brakka",
        characterUuid: BOB_CHAR,
        initiative: 9,
        spent: { action: false, bonusAction: false, reaction: false },
        conditions: [],
      },
      {
        id: "orc",
        name: "Orc 1",
        initiative: 8,
        spent: { action: false, bonusAction: false, reaction: false },
        conditions: [],
      },
    ]);

  it("splits targets by who acts: self locally, characters by wire, monsters not at all", () => {
    const offers = conditionOffersFor(roll, participants, "self", "Ellora");
    expect(offers.map((o) => [o.offer.targetId, o.toSelf])).toEqual([
      ["self", true],
      ["ally", false],
    ]);
  });

  it("stamps a deterministic offer id, so a re-sent report is a repeat", () => {
    const [first] = conditionOffersFor(roll, participants, "self", "Ellora");
    expect(first.offer.offerId).toBe("x1:cast:self");
    expect(
      conditionOffersFor(roll, participants, "self", "Ellora")[0].offer.offerId,
    ).toBe(first.offer.offerId);
  });

  it("yields nothing without a condition or targets", () => {
    expect(
      conditionOffersFor(
        { ...roll, condition: undefined },
        participants,
        "self",
        "Ellora",
      ),
    ).toEqual([]);
    expect(
      conditionOffersFor(
        { ...roll, targetIds: undefined },
        participants,
        "self",
        "Ellora",
      ),
    ).toEqual([]);
  });
});

describe("who a roll call reaches", () => {
  const call = (extra: Partial<RollCall> = {}): RollCall => ({
    callId: "c1",
    check: { kind: "skill", skill: SkillName.Perception },
    ...extra,
  });

  it("reaches the room when nobody is named", () => {
    expect(rollCallReaches(call(), "anyone")).toBe(true);
  });

  it("reaches only the named clients", () => {
    const asked = call({ toClientIds: ["a", "b"] });
    expect(rollCallReaches(asked, "a")).toBe(true);
    expect(rollCallReaches(asked, "b")).toBe(true);
    expect(rollCallReaches(asked, "c")).toBe(false);
  });

  it("still honours a lone toClientId", () => {
    expect(rollCallReaches(call({ toClientId: "a" }), "a")).toBe(true);
    expect(rollCallReaches(call({ toClientId: "a" }), "b")).toBe(false);
    expect(
      rollCallReaches(call({ toClientIds: ["a"], toClientId: "a" }), "a"),
    ).toBe(true);
  });
});

describe("the topic table", () => {
  it("gives every message kind its own topic", () => {
    const topics = Object.values(TOPIC_FOR);
    expect(new Set(topics).size).toBe(topics.length);
  });

  it("namespaces every one of them, so a realm can't collide with a peer app", () => {
    for (const topic of Object.values(TOPIC_FOR)) {
      expect(topic.startsWith("net.dndcharactersheets.")).toBe(true);
    }
  });
});
