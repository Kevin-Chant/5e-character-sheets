import classNames from "classnames";
import { FIELD } from "src/lib/data/data-definitions";
import { charPath, updateAt } from "src/lib/cursor";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import RollButton from "src/components/roll-button";
import SlotPips from "./slot-pips";

// Death saves, which matter at exactly one hit point total: zero.
//
// The paper sheet prints them at full size always, because it's printed once
// and can't know. That constraint doesn't transfer — so this keeps its position
// beside the hit dice (where a paper player looks for it) but not its weight:
// while the character is up it's a quiet one-line reminder, and it only takes
// the room and the crimson emphasis once it's actually in play.
//
// It stays fully usable when dormant. Collapsing a control into something you
// can't operate would trade one problem for a worse one — a DM who tracks HP
// elsewhere still needs to tick a failure.
export default function DeathSavesDisplay() {
  const { character, dispatch } = useLoadedCharacter();
  const { successes, failures } = character.deathSaves;
  // Down, or part-way through a set of saves that hasn't been cleared yet.
  const dying = character.currHp <= 0 || successes > 0 || failures > 0;

  const pips = (
    label: string,
    expended: number,
    key: "successes" | "failures",
  ) => (
    <div className={classNames("death-save-row", dying ? "column" : "row")}>
      <span className="death-save-label">{label}</span>
      <SlotPips
        total={3}
        expended={expended}
        fillMode
        onChange={(value) =>
          dispatch(updateAt(charPath(FIELD.deathSaves).k(key), value))
        }
      />
    </div>
  );

  return (
    <div
      className={classNames("column rounded-border-box tracker-box", {
        "death-saves-dormant": !dying,
        "death-saves-active": dying,
      })}
    >
      {pips("Successes", successes, "successes")}
      {pips("Failures", failures, "failures")}
      <b className="section-heading">
        Death Saves
        {/* Only while it's live. The pips stay operable when dormant (a DM who
            tracks HP elsewhere still needs to tick a failure), but *rolling* a
            death save you aren't making is nonsense rather than a shortcut. */}
        {dying && <RollButton label="Death saving throw" deathSave />}
      </b>
    </div>
  );
}
