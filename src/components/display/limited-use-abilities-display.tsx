import { FaPencil, FaArrowRotateLeft } from "react-icons/fa6";
import { updateData } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { FIELD } from "src/lib/data/data-definitions";
import { isTextComponentWithDetail } from "src/lib/types";
import { calculateCustomFormula } from "src/lib/formula";
import { newLimitedUseAbility } from "src/lib/data/default-data";
import ComponentWithPopover from "./component-with-popover";
import TextWithFormulasDisplay from "./text-with-formulas-display";
import SlotPips from "./slot-pips";

// Above this many uses, individual pips get unwieldy, so the pool is shown as a
// "remaining / total" stepper instead.
const PIP_THRESHOLD = 6;

export default function LimitedUseAbilitiesDisplay() {
  const { character, dispatch } = useCharacter();
  const { pushTargetedField } = useTargetedField();
  const { editMode } = useEditMode();
  if (!character) return <></>;

  const abilities = character.limitedUseAbilities;

  const editAbility = (index: number) =>
    pushTargetedField(FIELD.limitedUseAbilities, `${index}`);

  const removeAbility = (index: number) =>
    dispatch(
      updateData(FIELD.limitedUseAbilities, {
        value: abilities.filter((_, i) => i !== index),
      }),
    );

  const setExpended = (index: number, expended: number) =>
    dispatch(
      updateData(
        FIELD.limitedUseAbilities,
        { value: expended },
        `${index}.expended`,
      ),
    );

  // Persist a blank ability up-front (like spells) so the formula editor has a
  // target, then open it for editing.
  const addAbility = () => {
    dispatch(
      updateData(FIELD.limitedUseAbilities, {
        value: abilities.concat(newLimitedUseAbility()),
      }),
    );
    pushTargetedField(FIELD.limitedUseAbilities, `${abilities.length}`);
  };

  return (
    <div className="column rounded-border-box">
      {abilities.map((ability, i) => {
        const { info } = ability;
        const total = calculateCustomFormula(ability.maxUses, character);
        const expended = Math.max(0, Math.min(ability.expended, total));
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
              <i className="font-small nowrap">per {ability.recharge}</i>
              <div className="flex">
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
            {total > PIP_THRESHOLD ? (
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
          </div>
        );
      })}
      <b className="pos-relative margin-large">
        Limited-Use Abilities
        {editMode && (
          <button
            style={{
              position: "absolute",
              top: "-50%",
              right: "0px",
              transform: "translate(150%, 0%)",
            }}
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
