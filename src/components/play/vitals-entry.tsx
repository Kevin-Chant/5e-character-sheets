import { useState } from "react";
import { FaCheck } from "react-icons/fa6";
import classNames from "classnames";
import {
  ParticipantVitals,
  applyDamage,
  applyHealing,
} from "src/lib/play/encounter";
import RevealNumber from "./reveal-number";

// HP entry as a delta ("the goblin takes 9") rather than a recomputed total.
// Direction (damage/heal) is a visible glyph toggle; a leading +/- sign also
// switches it. Not a stepper — StepperInput nearby is for initiative.
export function VitalsEntry({
  vitals,
  name,
  apply,
}: {
  vitals: ParticipantVitals;
  name: string;
  // damageDealt is passed separately since it sets the concentration DC.
  apply: (vitals: ParticipantVitals, damageDealt?: number) => void;
}) {
  const [healing, setHealing] = useState(false);
  const [raw, setRaw] = useState("");

  const amount = Number(raw.trim());
  const valid = amount > 0;

  const commit = () => {
    if (!valid) return;
    if (healing) apply(applyHealing(vitals, amount), 0);
    else apply(applyDamage(vitals, amount), Math.floor(amount));
    setRaw("");
    // Reset to damage after every apply so a stale healing mode can't linger.
    setHealing(false);
  };

  return (
    <form
      className={classNames("vitals-entry", healing ? "healing" : "damage")}
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <button
        type="button"
        className="vitals-mode"
        aria-label={
          healing
            ? `Healing ${name} — switch to damage`
            : `Damaging ${name} — switch to healing`
        }
        aria-pressed={healing}
        title={
          healing
            ? "Healing — click for damage"
            : "Damage — click for healing (temporary hit points soak first)"
        }
        onClick={() => setHealing(!healing)}
      >
        {healing ? "+" : "−"}
      </button>
      <input
        type="text"
        inputMode="numeric"
        className="vitals-amount"
        aria-label={healing ? `Healing for ${name}` : `Damage to ${name}`}
        placeholder={healing ? "heal" : "dmg"}
        value={raw}
        onChange={(e) => {
          const next = e.target.value;
          // A leading sign switches mode rather than being entered as content.
          if (next.startsWith("+")) {
            setHealing(true);
            setRaw(next.slice(1));
          } else if (next.startsWith("-") || next.startsWith("−")) {
            setHealing(false);
            setRaw(next.slice(1));
          } else {
            setRaw(next);
          }
        }}
      />
      <button
        type="submit"
        className="vitals-apply icon-btn"
        disabled={!valid}
        aria-label={
          healing ? `Heal ${name} by ${raw}` : `Damage ${name} by ${raw}`
        }
        title="Apply (or press Enter)"
      >
        <FaCheck />
      </button>
    </form>
  );
}

// Running HP total; click to set directly (for corrections a delta can't express).
export function HpTotal({
  vitals,
  name,
  max,
  apply,
}: {
  vitals: ParticipantVitals;
  name: string;
  // Undefined renders as absent, not "/ 0".
  max?: number;
  apply: (vitals: ParticipantVitals, damageDealt?: number) => void;
}) {
  return (
    <RevealNumber
      value={vitals.currHp}
      min={0}
      onCommit={(currHp) => apply({ ...vitals, currHp })}
      className="hp-total"
      inputClassName="hp-total-input"
      buttonLabel={`Set ${name} hit points directly`}
      inputLabel={`${name} hit points`}
      title="Set hit points directly"
    >
      {vitals.currHp}
      {max !== undefined && <span className="hp-total-max">/ {max}</span>}
    </RevealNumber>
  );
}
