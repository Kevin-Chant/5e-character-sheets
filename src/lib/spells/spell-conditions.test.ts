import { describe, expect, it } from "vitest";
import {
  SPELL_CONDITIONS,
  spellConditionFor,
} from "src/lib/spells/spell-conditions";
import { CONDITION_MECHANICS } from "src/lib/play/condition-mechanics";
import { CONDITION_NAMES } from "src/lib/play/conditions";
import { ALL_SPELLS } from "src/lib/spells/spell-catalog";

// The invariants the 2026-08-03 fan-out merge established, pinned so a future
// entry can't quietly break the pact between the two catalogs.

const STANDARD = new Set<string>(CONDITION_NAMES);
const KINDS = new Set(["check", "save", "attack", "damage"]);
// What the dialog consumes per rider type: d20-side riders on the d20 kinds,
// damage-side only the two shapes the damage path reads.
const D20_KINDS = new Set(["check", "save", "attack"]);

describe("the spell-condition catalogs", () => {
  it("keys every grant to a real catalog spell", () => {
    const titles = new Set(ALL_SPELLS.map((s) => s.name.trim().toLowerCase()));
    const strays = Object.keys(SPELL_CONDITIONS).filter((k) => !titles.has(k));
    expect(strays).toEqual([]);
  });

  it("names either a standard condition or one the mechanics catalog knows", () => {
    for (const [key, grant] of Object.entries(SPELL_CONDITIONS)) {
      const entry = CONDITION_MECHANICS[grant.name];
      if (STANDARD.has(grant.name)) {
        // Standard conditions are the advisory table's; a mechanics entry
        // would shadow it.
        expect(entry, `${key} -> ${grant.name}`).toBeUndefined();
      } else {
        expect(
          entry?.summary,
          `${key} -> ${grant.name} needs a CONDITION_MECHANICS summary`,
        ).toBeTruthy();
      }
    }
  });

  it("authors riders only in shapes the dialog consumes", () => {
    for (const [name, entry] of Object.entries(CONDITION_MECHANICS)) {
      // Bearer-side and attacker-side riders take the same shapes; only who
      // they apply to differs.
      for (const r of [...(entry.riders ?? []), ...(entry.against ?? [])]) {
        expect(r.appliesTo.length, name).toBeGreaterThan(0);
        for (const k of r.appliesTo)
          expect(KINDS.has(k), `${name}: ${k}`).toBe(true);
        const kind = r.rider.rider;
        if (kind === "extraDamage") {
          expect(r.appliesTo, `${name}: extraDamage is damage-only`).toEqual([
            "damage",
          ]);
        } else if (kind === "bonus") {
          // Flat bonuses fold on d20s and damage totals alike.
          expect(typeof r.rider.value, name).toBe("number");
        } else {
          for (const k of r.appliesTo)
            expect(D20_KINDS.has(k), `${name}: ${kind} on ${k}`).toBe(true);
        }
        if (kind === "advantage")
          expect(
            r.rider.note,
            `${name}: advantage needs its note`,
          ).toBeTruthy();
        if (kind === "bonusDice")
          expect(r.rider.count, name).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("resolves a title however the sheet spells it", () => {
    expect(
      spellConditionFor({
        info: { title: "  Divine Favor " },
      } as never)?.name,
    ).toBe("Divine Favor");
  });
});
