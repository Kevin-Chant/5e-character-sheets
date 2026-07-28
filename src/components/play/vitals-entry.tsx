import { useState } from "react";
import { FaCheck } from "react-icons/fa6";
import classNames from "classnames";
import {
  ParticipantVitals,
  applyDamage,
  applyHealing,
} from "src/lib/play/encounter";
import RevealNumber from "./reveal-number";

// Hit points, written the way a table says them: "the goblin takes 9", "you
// regain 10" — a delta, not a recomputed total. One widget, mounted both in the
// DM's roster row and in the player's own rail, because it is the same sentence
// either way and it used to be two different controls: the DM typed a delta and
// the player clicked a ±1 stepper nine times.
//
// Which way the number goes is a *visible* mode, not a character you have to
// remember to type. The old box read `9` as damage and `+10` as healing, a
// switch hidden inside free text and documented only in a tooltip — a DM in a
// hurry typed `10` meaning heal and dropped someone to zero. Now a coloured
// glyph in front of the field says which it is before you commit, and the sign
// keys still work: typing a leading + or − moves the glyph instead of sitting
// in the field where nothing reads it.
//
// Deliberately not a stepper. `StepperInput` sits one cell away holding
// initiative, and chevrons here would read as "step by 1" — the same twinning
// the `dm-field-label` caption exists to prevent.
export function VitalsEntry({
  vitals,
  name,
  apply,
}: {
  vitals: ParticipantVitals;
  name: string;
  // `damageDealt` is what actually landed, absorbed or not — a concentration
  // DC is set by damage taken, so the caller needs it separately from the
  // resulting hit points.
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
          // A leading sign is a mode key, not content. Keeps the muscle memory
          // the old `+10` box built, and now you can see what it did.
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
      {/* Enter still applies, but it can't be the *only* way: this was a bare
          input in a bare form, so an invalid entry and a lost keypress looked
          identical. The button is the affordance and the disabled state is the
          answer to "why did nothing happen". */}
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

// The running total, doubling as the escape hatch for what a delta can't say
// cleanly — a stat-block correction, an undo by hand. Click the number.
export function HpTotal({
  vitals,
  name,
  max,
  apply,
}: {
  vitals: ParticipantVitals;
  name: string;
  // Shown only when there is one to show: an unset maximum should read as
  // absent rather than as "/ 0".
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
