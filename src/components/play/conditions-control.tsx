import classNames from "classnames";
import { FaXmark } from "react-icons/fa6";
import { useEncounter } from "src/lib/hooks/use-encounter";
import {
  conditionHint,
  WIRED_CONDITION_NAMES,
} from "src/lib/play/condition-mechanics";
import { CONDITION_NAMES } from "src/lib/play/conditions";
import { ActiveCondition, Participant } from "src/lib/play/encounter";
import Select from "src/components/select";
import RevealNumber from "./reveal-number";

// Conditions on one participant — the same control whether you're looking at
// your own rail or at a row of the DM's roster.
//
// It used to be two, which looked identical and behaved oppositely: the player's
// select staged a draft and needed an Add click, the DM's applied on choose. And
// both carried a "rds" box that had to be filled *before* the dropdown, sitting
// visually *after* it — reading order said pick-then-duration and the mechanics
// demanded the reverse.
//
// So the duration left the adder and moved onto the chip. Adding a condition is
// now one act with one commit ("you're stunned"), and how long it lasts is a
// separate thought answered on the thing it describes ("until the end of your
// next turn") — which is also the order a table says them in. The side effect is
// the feature that was missing: a duration already running can be corrected or
// extended, where before the only way to change it was to remove the condition
// and add it back.
export default function ConditionsControl({
  participant,
}: {
  participant: Participant;
}) {
  const { giveCondition, self } = useEncounter();
  const held = new Set(participant.conditions.map((c) => c.name));
  const available = CONDITION_NAMES.filter((name) => !held.has(name));
  // The wired spell/effect buffs and marks, offered by hand because the
  // consent pipeline that normally delivers them needs a table with a
  // separate DM — solo, "I cast Zephyr Strike" had no way onto your own row,
  // and its rider no way into your rolls.
  const standard: readonly string[] = CONDITION_NAMES;
  const effects = WIRED_CONDITION_NAMES.filter(
    (name) => !held.has(name) && !standard.includes(name),
  );

  return (
    <>
      {participant.conditions.map((condition) => (
        <ConditionChip
          key={condition.name}
          participant={participant}
          condition={condition}
        />
      ))}
      {available.length + effects.length > 0 && (
        <Select
          className="condition-adder"
          label={`Give ${participant.name} a condition`}
          triggerLabel="+ condition"
          value=""
          // The list is short enough to read and long enough to search, and
          // what each entry *does* is the thing you're choosing on — so the
          // summary rides beside the name rather than hiding in a `title`
          // nobody hovers on a phone. It also feeds the filter: typing
          // "advantage" finds every condition that grants one.
          options={[
            ...available.map((name) => ({
              value: name,
              label: name,
              group: "Conditions",
              hint: conditionHint(name),
            })),
            ...effects.map((name) => ({
              value: name,
              label: name,
              group: "Spells & effects",
              hint: conditionHint(name),
            })),
          ]}
          onChange={(name) => {
            if (!name) return;
            // Indefinite, which is what most of them are — a duration is the
            // exception, so it's opt-in on the chip rather than a field you
            // have to clear. A hand-placed spell effect on someone *else's*
            // row carries who placed it, because caster-only marks (Hex,
            // Hunter's Mark) pay out on provenance.
            const stampFrom =
              effects.includes(name) && self && self.id !== participant.id;
            giveCondition(participant.id, {
              name,
              ...(stampFrom ? { from: self.id } : {}),
            });
          }}
        />
      )}
    </>
  );
}

function ConditionChip({
  participant,
  condition,
}: {
  participant: Participant;
  condition: ActiveCondition;
}) {
  const { giveCondition, takeCondition } = useEncounter();

  return (
    <span className="condition-chip">
      <span className="condition-name">{condition.name}</span>
      {/* `giveCondition` upserts by name, so re-giving the condition with a new
          duration *is* the edit — no new encounter action needed. Zero means
          indefinite, and the box is blank while it is, so ∞ and 0 never both
          claim to be the value. */}
      <RevealNumber
        value={condition.rounds ?? 0}
        min={0}
        blankZero
        onCommit={(rounds) =>
          giveCondition(participant.id, {
            ...condition,
            rounds: rounds > 0 ? rounds : undefined,
          })
        }
        className={classNames("condition-rounds", {
          // Indefinite is what most conditions are, so it reads as "nothing to
          // say here" rather than as a live number — still clickable, just not
          // competing with the durations that are actually counting down.
          indefinite: condition.rounds === undefined,
        })}
        inputClassName="condition-rounds-input"
        buttonLabel={`Set how long ${condition.name} lasts on ${participant.name}`}
        inputLabel={`Rounds of ${condition.name} left on ${participant.name}`}
        title="Rounds left — click to set, 0 for indefinite"
      >
        {condition.rounds ?? "∞"}
      </RevealNumber>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Remove ${condition.name} from ${participant.name}`}
        onClick={() => takeCondition(participant.id, condition.name)}
      >
        <FaXmark />
      </button>
    </span>
  );
}
