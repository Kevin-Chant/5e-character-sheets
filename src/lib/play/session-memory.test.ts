// @vitest-environment jsdom
import { UUID } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  dropSession,
  forgetSessionLocally,
  readSessionMemory,
  recordSession,
  rememberSessionLocally,
  REMEMBERED_LOCAL_SESSIONS,
  sessionMemoryFor,
  SessionMemory,
} from "./session-memory";

const CODE = "3f8a91c2-7d14-4a9b-9c02-5e8f1b6a4d33";
const OTHER = "aa11bb22-cc33-dd44-ee55-ff6677889900";
const BRAKKA = "11111111-2222-3333-4444-555555555555" as UUID;

function entry(code: string, at: number): SessionMemory {
  return { code, lastJoined: at };
}

describe("recordSession", () => {
  it("merges into the entry for a code instead of replacing it", () => {
    const first = recordSession([], {
      code: CODE,
      lastJoined: 1,
      playAsUuid: BRAKKA,
      playAsName: "Brakka",
    });
    const merged = recordSession(first, {
      code: CODE,
      lastJoined: 2,
      seat: "player",
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      code: CODE,
      lastJoined: 2,
      seat: "player",
      playAsName: "Brakka",
    });
  });

  it("moves a rejoined session to the top rather than duplicating it", () => {
    const list = recordSession(
      recordSession([], entry(CODE, 1)),
      entry(OTHER, 2),
    );
    expect(list.map((s) => s.code)).toEqual([OTHER, CODE]);
    const rejoined = recordSession(list, entry(CODE, 3));
    expect(rejoined.map((s) => s.code)).toEqual([CODE, OTHER]);
  });

  it("normalizes the code, so a dash-less paste isn't a second table", () => {
    const list = recordSession(recordSession([], entry(CODE, 1)), {
      code: CODE.replace(/-/g, "").toUpperCase(),
      lastJoined: 2,
    });
    expect(list).toHaveLength(1);
    expect(list[0].code).toBe(CODE);
  });

  it("keeps only the most recent few", () => {
    let list: SessionMemory[] = [];
    for (let i = 0; i < REMEMBERED_LOCAL_SESSIONS + 3; i++) {
      list = recordSession(list, entry(`${i}`, i));
    }
    expect(list).toHaveLength(REMEMBERED_LOCAL_SESSIONS);
    expect(list[0].code).toBe(`${REMEMBERED_LOCAL_SESSIONS + 2}`);
  });
});

describe("dropSession", () => {
  it("forgets one table and leaves the rest", () => {
    const list = recordSession(
      recordSession([], entry(CODE, 1)),
      entry(OTHER, 2),
    );
    expect(dropSession(list, CODE).map((s) => s.code)).toEqual([OTHER]);
  });
});

describe("stored memory", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips through localStorage", () => {
    rememberSessionLocally({ code: CODE, lastJoined: 7, seat: "dm" });
    expect(sessionMemoryFor(CODE)).toMatchObject({ seat: "dm" });
    expect(sessionMemoryFor(CODE.toUpperCase())).toMatchObject({ seat: "dm" });
    forgetSessionLocally(CODE);
    expect(sessionMemoryFor(CODE)).toBeUndefined();
  });

  it("drops junk rather than throwing — a bad entry costs one shortcut", () => {
    window.localStorage.setItem(
      "dndcharactersheets_playSessionMemory",
      JSON.stringify([{ nope: true }, { code: CODE, lastJoined: 1 }]),
    );
    expect(readSessionMemory().map((s) => s.code)).toEqual([CODE]);
  });
});
