import { FaPencil, FaArrowRotateLeft } from "react-icons/fa6";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { FIELD } from "src/lib/data/data-definitions";
import { isTextComponentWithDetail } from "src/lib/types";
import { charPath, updateAt } from "src/lib/cursor";
import {
  calculateCustomFormula,
  describeSaveEffect,
  formatSaveEffect,
} from "src/lib/formula";
import AbilityActions from "./ability-actions";
import ComponentWithPopover from "./component-with-popover";
import TextWithFormulasDisplay from "./text-with-formulas-display";
import SlotPips from "./slot-pips";

// Above this many uses, individual pips get unwieldy, so the pool is shown as a
// "remaining / total" stepper instead.
const PIP_THRESHOLD = 6;

export default function LimitedUseAbilitiesDisplay() {
  const { character, dispatch } = useCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();
  if (!character) return <></>;

  const list = charPath(FIELD.limitedUseAbilities);
  const abilities = character.limitedUseAbilities;

  const editAbility = (index: number) => pushCursor(list.at(index));

  const removeAbility = (index: number) =>
    dispatch(
      updateAt(
        list,
        abilities.filter((_, i) => i !== index),
      ),
    );

  const setExpended = (index: number, expended: number) =>
    dispatch(updateAt(list.at(index).k("expended"), expended));

  // Open the editor on the next (empty) index; EditLimitedUseAbility seeds a
  // blank ability into the modal draft, so nothing is persisted until save.
  const addAbility = () => pushCursor(list.at(abilities.length));

  return (
    <div className="column rounded-border-box">
      {abilities.map((ability, i) => {
        const { info } = ability;
        const total = calculateCustomFormula(ability.maxUses, character);
        const expended = Math.max(0, Math.min(ability.expended, total));
        // A pool-less "action host": maxUses 0 means it owns no charges and
        // just carries actions (a Cutting Words that spends Bardic Inspiration).
        // Its own counter, recharge label, and reset button are all noise, so
        // outside edit mode it renders as its actions alone.
        const actionsOnly = total === 0 && !editMode;
        const name = (
          <TextWithFormulasDisplay
            templateString={info.title}
            formulas={info.titleFormulas}
          />
        );
        const title = isTextComponentWithDetail(info) ? (
          <ComponentWithPopover
            componentClass="rounded-border-box pos-relative padding-small editable limited-use-ability-name"
            componentChildren={name}
            popoverChildren={
              <TextWithFormulasDisplay
                templateString={info.detail}
                formulas={info.detailFormulas}
              />
            }
          />
        ) : (
          <div className="rounded-border-box padding-small limited-use-ability-name">
            {name}
          </div>
        );
        return (
          <div key={i} className="column limited-use-ability">
            <div className="row limited-use-ability-header">
              {title}
              {ability.save && (
                <b
                  className="font-small nowrap limited-use-save-dc"
                  title={describeSaveEffect(ability.save, character)}
                >
                  {formatSaveEffect(ability.save, character)}
                </b>
              )}
              {!actionsOnly && (
                <i className="font-small nowrap">per {ability.recharge}</i>
              )}
              <div className="flex">
                {!actionsOnly && (
                  <button
                    type="button"
                    aria-label="Reset uses"
                    title="Reset uses"
                    onClick={(e) => {
                      e.preventDefault();
                      setExpended(i, 0);
                    }}
                  >
                    <FaArrowRotateLeft />
                  </button>
                )}
                {editMode && (
                  <>
                    <button
                      type="button"
                      aria-label="Edit ability"
                      onClick={(e) => {
                        e.preventDefault();
                        editAbility(i);
                      }}
                    >
                      <FaPencil />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove ability"
                      onClick={(e) => {
                        e.preventDefault();
                        removeAbility(i);
                      }}
                    >
                      x
                    </button>
                  </>
                )}
              </div>
            </div>
            {total === 0 ? null : total > PIP_THRESHOLD ? (
              <div className="row limited-use-count">
                <button
                  type="button"
                  aria-label="Spend a use"
                  disabled={expended >= total}
                  onClick={(e) => {
                    e.preventDefault();
                    setExpended(i, expended + 1);
                  }}
                >
                  −
                </button>
                <span className="font-large">
                  {total - expended} / {total}
                </span>
                <button
                  type="button"
                  aria-label="Restore a use"
                  disabled={expended <= 0}
                  onClick={(e) => {
                    e.preventDefault();
                    setExpended(i, expended - 1);
                  }}
                >
                  +
                </button>
              </div>
            ) : (
              <SlotPips
                total={total}
                expended={expended}
                onChange={(value) => setExpended(i, value)}
              />
            )}
            {!editMode && <AbilityActions index={i} ability={ability} />}
          </div>
        );
      })}
      <b className="pos-relative margin-large">
        Limited-Use Abilities
        {editMode && (
          <button
            className="section-add"
            onClick={(e) => {
              e.preventDefault();
              addAbility();
            }}
          >
            +
          </button>
        )}
      </b>
    </div>
  );
}
