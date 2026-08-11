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

// Conditions on one participant, shared by the player rail and the DM roster.
// Adding a condition commits immediately; duration is set separately on the
// resulting chip, which also lets a running duration be corrected or extended.
export default function ConditionsControl({
  participant,
}: {
  participant: Participant;
}) {
  const { giveCondition, self } = useEncounter();
  const held = new Set(participant.conditions.map((c) => c.name));
  const available = CONDITION_NAMES.filter((name) => !held.has(name));
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
            // Stamp who placed a spell effect on someone else's row (caster-only marks like Hex pay out on provenance).
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
      {/* giveCondition upserts by name; 0 rounds means indefinite (shown blank). */}
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
