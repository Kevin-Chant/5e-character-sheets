import { describe, expect, it } from "vitest";
import { SkillName, StatKey } from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character } from "src/lib/types";
import { checkForValue, checkLabel, checkModifier } from "./checks";

// A level-1 character with known numbers: DEX 14 (+2), WIS 16 (+3), PB +2.
function subject(): Character {
  const c = structuredClone(defaultCharacter) as Character;
  c.class = [{ name: "Rogue", level: 1 }] as Character["class"];
  c.stats.dex = 14;
  c.stats.wis = 16;
  return c;
}

describe("check modifiers", () => {
  it("adds PB to a proficient save and leaves the rest alone", () => {
    const c = subject();
    c.proficiencies.savingThrows.dex = true;
    c.proficiencies.savingThrows.wis = false;
    expect(checkModifier(c, { kind: "save", stat: StatKey.dex })).toBe(2 + 2);
    expect(checkModifier(c, { kind: "save", stat: StatKey.wis })).toBe(3);
  });

  it("doubles PB for expertise, mirroring the sheet's skills column", () => {
    const c = subject();
    c.proficiencies.skills.Perception = true;
    c.proficiencies.expertise.Perception = true;
    expect(
      checkModifier(c, { kind: "skill", skill: SkillName.Perception }),
    ).toBe(3 + 4);
  });

  it("a raw ability check is just the stat modifier", () => {
    expect(
      checkModifier(subject(), { kind: "ability", stat: StatKey.wis }),
    ).toBe(3);
  });

  it("round-trips every picker value back to its check", () => {
    expect(checkForValue("save:dex")).toEqual({
      kind: "save",
      stat: StatKey.dex,
    });
    expect(checkForValue("skill:Perception")).toEqual({
      kind: "skill",
      skill: "Perception",
    });
    expect(checkForValue("nonsense")).toBeUndefined();
  });

  it("labels read the way a DM says them", () => {
    expect(checkLabel({ kind: "save", stat: StatKey.wis })).toBe("Wisdom Save");
    expect(checkLabel({ kind: "ability", stat: StatKey.str })).toBe(
      "Strength check",
    );
    expect(checkLabel({ kind: "skill", skill: SkillName.Perception })).toBe(
      "Perception",
    );
  });
});
