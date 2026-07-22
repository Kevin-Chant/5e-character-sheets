import classNames from "classnames";
import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, updateAt } from "src/lib/cursor";
import { calculateCustomFormula } from "src/lib/formula";
import { DEFAULT_ATTUNEMENT_SLOTS, countAttunedItems } from "src/lib/rules";
import TextWithFormulasDisplay from "./text-with-formulas-display";

// The Attunement sub-section of the equipment box: one row per item flagged as
// requiring attunement (set in the item editor), each with an attuned toggle —
// attuning happens during a rest, so the toggle stays live in play mode. The
// slot counter in the heading tracks the cap (3 by default, editable in edit
// mode for e.g. the Artificer). Rendered only when at least one item requires
// attunement; there's no add button because items opt in via the item editor.
export default function AttunementDisplay() {
  const { character, dispatch } = useCharacter();
  const { editMode } = useEditMode();
  const { pushTargetedField } = useTargetedField();
  if (!character) return <></>;

  const equipment = character.equipment;
  const path = charPath(FIELD.equipment);
  const attuneable = equipment
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.attunement !== undefined);
  if (attuneable.length === 0) return <></>;

  const attunementCap = character.attunementSlots
    ? calculateCustomFormula(character.attunementSlots, character)
    : DEFAULT_ATTUNEMENT_SLOTS;
  const attunedCount = countAttunedItems(equipment);
  const atAttunementCap = attunedCount >= attunementCap;

  // Replace the whole `attunement` object (not the `attuned` leaf) so the
  // optional-field cursor type-checks.
  const setAttuned = (index: number, attuned: boolean) =>
    dispatch(updateAt(path.at(index).k("attunement"), { attuned }));

  return (
    <div className="column equipment-subsection attunement-section">
      {attuneable.map(({ item, index }) => {
        const attuned = !!item.attunement?.attuned;
        return (
          <label className="row space-between attunement-row" key={item.id}>
            <span className="attunement-name">
              <TextWithFormulasDisplay
                templateString={item.text.title}
                formulas={item.text.titleFormulas}
              />
            </span>
            <input
              type="checkbox"
              checked={attuned}
              disabled={atAttunementCap && !attuned}
              title={
                atAttunementCap && !attuned
                  ? "No attunement slots left"
                  : attuned
                    ? "Attuned"
                    : "Attune to this item"
              }
              onChange={(e) => setAttuned(index, e.target.checked)}
            />
          </label>
        );
      })}

      <div className="row space-between equipment-subheading">
        <b className="section-heading">Attunement</b>
        <span
          className={classNames("attunement-slots", { full: atAttunementCap })}
          role={editMode ? "button" : undefined}
          onClick={
            editMode
              ? (e) => {
                  e.preventDefault();
                  pushTargetedField(FIELD.attunementSlots);
                }
              : undefined
          }
          title={editMode ? "Edit attunement slots" : "Attunement slots used"}
        >
          {attunedCount} / {attunementCap} slots
        </span>
      </div>
    </div>
  );
}
