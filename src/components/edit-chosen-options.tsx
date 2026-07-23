import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, updateAt } from "src/lib/cursor";
import {
  availableOptionGroups,
  chosenIn,
} from "src/lib/builder/chosen-options";
import { ChosenOption } from "src/lib/types";
import { useSave } from "./modals/modal-container";

// Picker for the closed option lists a class offers (Metamagic, maneuvers, Pact
// Boon). A checkbox per option, with the group's remaining picks enforced by
// disabling the unpicked ones once you're at the limit — the count is the whole
// point of the model, so the editor shouldn't let you quietly exceed it.
export default function EditChosenOptions() {
  const { character, dispatch } = useCharacter();
  const { targetedField } = useTargetedField();
  const { saveData } = useSave();
  if (!character || targetedField !== FIELD.chosenOptions) return <></>;

  const all = character.chosenOptions ?? [];
  // Whole-list updates, per the reducer's "an update carries the field's whole
  // value" rule — which is what makes undo/redo and live-sync replay work.
  const setAll = (next: ChosenOption[]) =>
    dispatch(updateAt(charPath(FIELD.chosenOptions), next));

  const toggle = (
    category: string,
    name: string,
    detail: string,
    checked: boolean,
  ) =>
    setAll(
      checked
        ? all.concat({ category, name, detail })
        : all.filter((o) => !(o.category === category && o.name === name)),
    );

  return (
    <form className="edit-chosen-options">
      {availableOptionGroups(character).map(({ group, known }) => {
        const picked = chosenIn(character, group.category);
        const atLimit = picked.length >= known;
        return (
          <fieldset key={group.category} className="chosen-option-fieldset">
            <legend className="field-label">
              {group.label} — {picked.length} / {known} known
            </legend>
            {group.options.map((option) => {
              const checked = picked.some((o) => o.name === option.name);
              return (
                <label key={option.name} className="chosen-option-choice">
                  <input
                    type="checkbox"
                    checked={checked}
                    // Only unpicked options lock at the limit, so you can always
                    // un-pick one to swap.
                    disabled={!checked && atLimit}
                    onChange={(e) =>
                      toggle(
                        group.category,
                        option.name,
                        option.summary,
                        e.target.checked,
                      )
                    }
                  />
                  <span>
                    <b>{option.name}</b>
                    <span className="muted font-small">
                      {" "}
                      — {option.summary}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        );
      })}
      <button
        className="btn-primary"
        onClick={(e) => {
          e.preventDefault();
          saveData();
        }}
      >
        Save
      </button>
    </form>
  );
}
