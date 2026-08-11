import { useState } from "react";
import { StandardDie } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useRollMode } from "src/lib/hooks/use-roll-mode";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import { randomUUID } from "src/lib/browser";
import { maxHpValue } from "src/lib/mechanics/resolve";
import {
  applyHitDieRoll,
  manualHitDieRoll,
  rollHitDie,
  HitDieRoll,
} from "src/lib/rest";
import { getHitDice, remainingHitDice } from "src/lib/rules";
import { Character } from "src/lib/types";
import { ManualRollInput } from "../roll-modal";

// Hit dice as spendable tokens: each click rolls one die and applies it
// individually, so a bad roll can be undone without unwinding the whole rest.

const DIE_DISPLAY_ORDER: StandardDie[] = [
  StandardDie.d12,
  StandardDie.d10,
  StandardDie.d8,
  StandardDie.d6,
  StandardDie.d4,
  StandardDie.d20,
];

// A die the player spent while this panel was open, so its token can show what
// it rolled instead of its size.
interface SessionRoll {
  die: StandardDie;
  // Rolled die + CON, and HP actually restored (clamped to max). The token
  // shows healed; the roll stays in the tooltip.
  total: number;
  healed: number;
}

const diceSizesOnSheet = (character: Character): StandardDie[] => {
  const totals = character.totalHitDice ?? getHitDice(character);
  return DIE_DISPLAY_ORDER.filter((die) => (totals[die] || 0) > 0);
};

export default function HitDiceTray() {
  const { character, dispatch } = useCharacter();
  // HP when the tray appeared, so the readout can show progress ("24 → 39").
  const [startHp] = useState(() => character?.currHp ?? 0);
  const [rolls, setRolls] = useState<SessionRoll[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const { rollMode } = useRollMode();
  const { sendReport } = useTableTalk();
  // Real dice: the die size clicked, awaiting its typed-in total.
  const [pendingDie, setPendingDie] = useState<StandardDie | null>(null);

  if (!character) return <></>;

  const maxHp = maxHpValue(character);
  const currHp = character.currHp;
  const totals = character.totalHitDice ?? getHitDice(character);
  const healedSoFar = rolls.reduce((sum, r) => sum + r.healed, 0);
  const atFullHp = currHp >= maxHp;

  const land = (roll: HitDieRoll, manual?: true) => {
    applyHitDieRoll(character, roll).forEach((update) => dispatch(update));
    setRolls((prev) => [
      ...prev,
      { die: roll.die, total: roll.total, healed: roll.healed },
    ]);
    setAnnouncement(
      `Rolled ${roll.total} on a ${roll.die}. Healed ${roll.healed}. ` +
        `${currHp + roll.healed} of ${maxHp} hit points.`,
    );
    // Untargeted self-healing report, so the DM sees the "why" beside the HP change.
    sendReport({
      exchangeId: randomUUID(),
      stage: "healing",
      attempt: 1,
      label: `Hit die (${roll.die})`,
      total: roll.healed,
      ...(manual ? { manual } : {}),
    });
  };

  const spend = (die: StandardDie) => {
    // Real dice: the click asks for the total instead of rolling; clicking
    // the same size again cancels the ask.
    if (rollMode === "manual") {
      setPendingDie((current) => (current === die ? null : die));
      return;
    }
    land(rollHitDie(character, die));
  };

  return (
    <section className="rest-tray">
      <h3 className="rest-section-title">Spend hit dice</h3>

      <div className="rest-hp-readout">
        <span className="rest-hp-numbers">
          {healedSoFar > 0 && (
            <>
              <span className="rest-hp-was">{startHp}</span>
              <span className="rest-hp-arrow" aria-hidden="true">
                →
              </span>
            </>
          )}
          <strong>{currHp}</strong>
          <span className="rest-hp-max">of {maxHp}</span>
        </span>
        {healedSoFar > 0 && (
          <span className="rest-hp-healed">+{healedSoFar} healed</span>
        )}
      </div>

      <div
        className="rest-hp-bar"
        role="progressbar"
        aria-label="Hit points"
        aria-valuenow={currHp}
        aria-valuemin={0}
        aria-valuemax={maxHp}
        aria-valuetext={`${currHp} of ${maxHp} hit points`}
      >
        <div
          className="rest-hp-bar-fill"
          style={{ width: `${maxHp > 0 ? (currHp / maxHp) * 100 : 0}%` }}
        />
      </div>

      {diceSizesOnSheet(character).map((die) => {
        const total = totals[die] || 0;
        const ready = remainingHitDice(character, die);
        const rolledHere = rolls.filter((r) => r.die === die);
        // Left to right: spent just now, still available, already gone.
        const spentBefore = total - ready - rolledHere.length;
        return (
          <div className="rest-die-row" key={die}>
            <span className="rest-die-size">{die}</span>
            <div className="rest-die-tokens">
              {rolledHere.map((roll, i) => (
                <span
                  key={`rolled-${i}`}
                  className="rest-die rest-die-rolled"
                  title={`Rolled ${roll.total} — healed ${roll.healed}`}
                >
                  {roll.healed}
                </span>
              ))}
              {Array.from({ length: ready }, (_, i) => (
                <button
                  key={`ready-${i}`}
                  type="button"
                  className="rest-die rest-die-ready"
                  disabled={atFullHp}
                  onClick={() => spend(die)}
                  // Only the first token of a size is exposed to a11y; the
                  // rest stay clickable but read as the visual count.
                  aria-hidden={i > 0}
                  tabIndex={i > 0 ? -1 : undefined}
                  aria-label={
                    i === 0
                      ? `Roll a ${die} hit die — ${ready} left`
                      : undefined
                  }
                  title={
                    atFullHp
                      ? "Already at full hit points"
                      : `Roll a ${die} hit die`
                  }
                >
                  {die}
                </button>
              ))}
              {Array.from({ length: Math.max(0, spentBefore) }, (_, i) => (
                <span
                  key={`spent-${i}`}
                  className="rest-die rest-die-spent"
                  title="Already spent"
                  aria-hidden="true"
                >
                  ··
                </span>
              ))}
            </div>
            {pendingDie === die && ready > 0 && !atFullHp && (
              <ManualRollInput
                prompt="Total rolled, modifiers included"
                // A negative CON can floor a hit die at 0, so 0 must be enterable.
                min={0}
                onCommit={(total) => {
                  setPendingDie(null);
                  land(manualHitDieRoll(character, die, total), true);
                }}
              />
            )}
          </div>
        );
      })}

      <p className="rest-hint text-muted">
        {atFullHp
          ? "You're at full hit points."
          : rollMode === "manual"
            ? "Click a die, roll it for real, and type what it totalled with your Constitution modifier."
            : "Click a die to roll it and heal. Each roll adds your Constitution modifier."}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
