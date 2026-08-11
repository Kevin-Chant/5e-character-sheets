import { describe, expect, it } from "vitest";
import { UUID } from "crypto";
import { NOTHING_SPENT, Participant } from "src/lib/play/encounter";
import { participantLiveness } from "src/lib/play/liveness";

const row = (over: Partial<Participant> = {}): Participant => ({
  id: "p1",
  name: "Brakka",
  characterUuid: "11111111-1111-1111-1111-111111111111" as UUID,
  ownerClientId: "player",
  initiative: 12,
  spent: NOTHING_SPENT,
  conditions: [],
  ...over,
});

const context = (
  over: Partial<Parameters<typeof participantLiveness>[1]> = {},
) => ({
  clientId: "dm",
  presentIds: ["player"],
  quietIds: [] as string[],
  connected: true,
  ...over,
});

describe("participantLiveness", () => {
  it("says nothing about a hand-typed combatant", () => {
    expect(
      participantLiveness(
        row({ characterUuid: undefined, ownerClientId: undefined }),
        context(),
      ),
    ).toBe("none");
  });

  it("reports a sheet this browser holds as its own", () => {
    expect(participantLiveness(row({ ownerClientId: "dm" }), context())).toBe(
      "self",
    );
  });

  it("reports a present owner as live", () => {
    expect(participantLiveness(row(), context())).toBe("live");
  });

  it("distinguishes a quiet client from a live one", () => {
    expect(participantLiveness(row(), context({ quietIds: ["player"] }))).toBe(
      "quiet",
    );
  });

  it("reports an owner nobody has heard from as away", () => {
    expect(participantLiveness(row(), context({ presentIds: [] }))).toBe(
      "gone",
    );
  });

  it("reports a brought sheet nobody has picked up as away", () => {
    expect(
      participantLiveness(row({ ownerClientId: undefined }), context()),
    ).toBe("gone");
  });

  it("says nothing at all with no session open", () => {
    expect(
      participantLiveness(row(), context({ connected: false, presentIds: [] })),
    ).toBe("none");
    expect(
      participantLiveness(
        row({ ownerClientId: "dm" }),
        context({ connected: false, presentIds: [] }),
      ),
    ).toBe("self");
  });
});
