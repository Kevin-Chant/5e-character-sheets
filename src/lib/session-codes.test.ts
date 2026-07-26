import { describe, expect, it } from "vitest";
import { newSessionCode, realmForSession } from "src/lib/play/session";
import { codeCandidates, realmForCharacter } from "src/lib/session-codes";

describe("realmForCharacter", () => {
  it("is the uuid's bare hex, matching the sharing layer", () => {
    expect(realmForCharacter("d80699d7-1b2c-4a3e-9f10-aabbccddeeff")).toBe(
      "d80699d71b2c4a3e9f10aabbccddeeff",
    );
  });

  it("tolerates the mess a paste brings", () => {
    expect(realmForCharacter("  D80699D7-1B2C-4A3E-9F10-AABBCCDDEEFF ")).toBe(
      "d80699d71b2c4a3e9f10aabbccddeeff",
    );
  });
});

describe("codeCandidates", () => {
  const code = "d80699d7-1b2c-4a3e-9f10-aabbccddeeff";

  it("offers the gameplay realm first, then the character one", () => {
    expect(codeCandidates(code)).toEqual([
      { kind: "gameplay", realm: realmForSession(code) },
      { kind: "editing", realm: realmForCharacter(code) },
    ]);
  });

  it("never proposes the same realm twice", () => {
    // The `sess` prefix is what keeps the two namespaces apart. If it were ever
    // dropped, a probe could not tell the kinds apart at all.
    const realms = codeCandidates(code).map((c) => c.realm);
    expect(new Set(realms).size).toBe(realms.length);
  });

  it("proposes nothing for input that isn't a uuid", () => {
    // A typo shouldn't cost two round trips to discover.
    expect(codeCandidates("ABC123")).toEqual([]);
    expect(codeCandidates("")).toEqual([]);
  });

  it("accepts a freshly minted code", () => {
    expect(codeCandidates(newSessionCode())).toHaveLength(2);
  });
});
