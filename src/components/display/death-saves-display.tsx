import classNames from "classnames";
import { FIELD } from "src/lib/data/data-definitions";
import { charPath, updateAt } from "src/lib/cursor";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import RollButton from "src/components/roll-button";
import SlotPips from "./slot-pips";

// Death saves: a quiet one-line reminder while the character is up, full
// weight only once dying. Pips stay operable while dormant, since a DM
// tracking HP elsewhere still needs to tick a failure.
export default function DeathSavesDisplay() {
  const { character, dispatch } = useLoadedCharacter();
  const { successes, failures } = character.deathSaves;
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
        {dying && <RollButton label="Death saving throw" deathSave />}
      </b>
    </div>
  );
}
