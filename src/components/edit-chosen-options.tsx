import { FaTrash } from "react-icons/fa6";
import { FIELD } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, updateAt } from "src/lib/cursor";
import {
  availableOptionGroups,
  chosenIn,
  OptionGroup,
} from "src/lib/builder/chosen-options";
import { Character, ChosenOption } from "src/lib/types";
import Select from "./select";
import { useSave } from "./modals/modal-container";

// Picker for the closed option lists a class offers (Metamagic, maneuvers, Pact
// Boon). A checkbox per option; unpicked ones disable once the group's pick
// limit is reached. A group with an active limit (artificer infusions) is a
// list of rows instead — the same option can be taken for several items, and
// each row is separately switched on.
export default function EditChosenOptions() {
  const { character, dispatch } = useLoadedCharacter();
  const { targetedField } = useTargetedField();
  const { saveData } = useSave();
  if (targetedField !== FIELD.chosenOptions) return <></>;

  const all = character.chosenOptions ?? [];
  // Update carries the field's whole value, per reducer convention.
  const setAll = (next: ChosenOption[]) =>
    dispatch(updateAt(charPath(FIELD.chosenOptions), next));

  const toggle = (
    category: string,
    name: string,
    detail: string | undefined,
    checked: boolean,
  ) =>
    setAll(
      checked
        ? all.concat({ category, name, ...(detail ? { detail } : {}) })
        : all.filter((o) => !(o.category === category && o.name === name)),
    );

  return (
    <form className="edit-chosen-options">
      {availableOptionGroups(character).map(({ group, known, active }) =>
        active === undefined ? (
          <fieldset key={group.category} className="chosen-option-fieldset">
            <legend className="field-label">
              {group.label} — {chosenIn(character, group.category).length} /{" "}
              {known} known
            </legend>
            {group.summary && <p className="field-help">{group.summary}</p>}
            {group.options.map((option) => {
              const picked = chosenIn(character, group.category);
              const checked = picked.some((o) => o.name === option.name);
              return (
                <label key={option.name} className="chosen-option-choice">
                  <input
                    type="checkbox"
                    checked={checked}
                    // Only unpicked options lock, so you can always un-pick to swap.
                    disabled={!checked && picked.length >= known}
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
                    {option.summary && (
                      <span className="field-help"> — {option.summary}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ) : (
          <ActiveGroupRows
            key={group.category}
            group={group}
            known={known}
            active={active}
            character={character}
            all={all}
            setAll={setAll}
          />
        ),
      )}
      <button
        className="btn-primary edit-save"
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

interface ActiveGroupProps {
  group: OptionGroup;
  known: number;
  active: number;
  character: Character;
  all: ChosenOption[];
  setAll: (next: ChosenOption[]) => void;
}

function ActiveGroupRows({
  group,
  known,
  active,
  character,
  all,
  setAll,
}: ActiveGroupProps) {
  const picked = chosenIn(character, group.category);
  const activeCount = picked.filter((o) => o.active).length;

  // Rows are addressed by their position among this category's picks, since
  // the same option may appear more than once.
  const replaceNth = (nth: number, next: ChosenOption | undefined) => {
    let seen = -1;
    setAll(
      all.flatMap((o) => {
        if (o.category !== group.category) return [o];
        seen += 1;
        if (seen !== nth) return [o];
        return next ? [next] : [];
      }),
    );
  };

  const itemOptions = character.equipment.map((item) => ({
    value: item.id,
    label: item.text.title || "(unnamed item)",
  }));

  return (
    <fieldset className="chosen-option-fieldset">
      <legend className="field-label">
        {group.label} — {picked.length} / {known} known, {activeCount} /{" "}
        {active} infused
      </legend>
      {group.summary && <p className="field-help">{group.summary}</p>}
      {picked.map((pick, nth) => {
        const def = group.options.find((o) => o.name === pick.name);
        return (
          <div key={nth} className="chosen-option-row">
            <div className="row">
              <Select
                label={`${group.label} ${nth + 1}`}
                value={pick.name}
                options={group.options.map((o) => ({
                  value: o.name,
                  label: o.name,
                  hint: o.summary,
                }))}
                onChange={(name) =>
                  replaceNth(nth, {
                    ...pick,
                    name,
                    detail: group.options.find((o) => o.name === name)?.summary,
                  })
                }
              />
              {group.perItem && (
                <Select
                  label={`Item for ${pick.name}`}
                  value={pick.itemId ?? ""}
                  options={itemOptions}
                  placeholder="Not applied"
                  clearable
                  clearLabel="Not applied"
                  onChange={(itemId) =>
                    replaceNth(nth, {
                      ...pick,
                      itemId: character.equipment.find((i) => i.id === itemId)
                        ?.id,
                    })
                  }
                />
              )}
              <label className="chosen-option-active">
                <input
                  type="checkbox"
                  checked={!!pick.active}
                  disabled={!pick.active && activeCount >= active}
                  onChange={(e) =>
                    replaceNth(nth, {
                      ...pick,
                      active: e.target.checked || undefined,
                    })
                  }
                />
                <span>Infused</span>
              </label>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${pick.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  replaceNth(nth, undefined);
                }}
              >
                <FaTrash />
              </button>
            </div>
            {def?.summary && <p className="field-help">{def.summary}</p>}
          </div>
        );
      })}
      <button
        type="button"
        className="btn-secondary"
        disabled={picked.length >= known}
        onClick={(e) => {
          e.preventDefault();
          const first = group.options[0];
          setAll(
            all.concat({
              category: group.category,
              name: first.name,
              ...(first.summary ? { detail: first.summary } : {}),
            }),
          );
        }}
      >
        Learn an infusion
      </button>
    </fieldset>
  );
}
