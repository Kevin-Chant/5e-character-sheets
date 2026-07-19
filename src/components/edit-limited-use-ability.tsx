import { FIELD, RestType } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  CustomFormula,
  LimitedUseAbility,
  TextComponentWithDetails,
  isTextComponent,
} from "src/lib/types";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue, traverse } from "src/lib/fields";
import { calculateCustomFormula } from "src/lib/formula";
import { fromStack, updateAt } from "src/lib/cursor";
import { useSave } from "./modals/modal-container";
import { ControlledEditTextLine } from "./edit-text-line";
import OptionOrCustomValue from "./display/option-or-custom-value";

const RECHARGE_PRESETS = Object.values(RestType) as string[];

export default function EditLimitedUseAbility() {
  const { character, dispatch } = useCharacter();
  const { targetedField, subField, pushCursor } = useTargetedField();
  const { saveData } = useSave();

  if (!character || targetedField !== FIELD.limitedUseAbilities || !subField)
    return <></>;

  const ability = traverse(subField, getFieldValue(targetedField, character));
  if (!ability) return <></>;

  const textComponent = ability.info;
  if (!isTextComponent(textComponent)) return <></>;

  const abilityCursor = fromStack<LimitedUseAbility>(targetedField, subField);
  const info = abilityCursor.k("info");
  // `detailFormulas` only exists on the with-details variant; used solely from
  // the branch where details are present.
  const infoDetail = fromStack<TextComponentWithDetails>(
    targetedField,
    `${subField}.info`,
  );

  // --- info (name/description), delegated to ControlledEditTextLine ---
  const setTitle = (text: string, formulas: CustomFormula[]) =>
    dispatch(
      updateAt(info, {
        ...textComponent,
        title: text,
        titleFormulas: formulas,
      }),
    );
  const editTitleFormula = (index: number) =>
    pushCursor(info.k("titleFormulas").at(index));
  const addDetail = () =>
    dispatch(
      updateAt(info, { ...textComponent, detail: "", detailFormulas: [] }),
    );
  const updateDetail = (text: string, formulas: CustomFormula[]) =>
    dispatch(
      updateAt(info, {
        ...textComponent,
        detail: text,
        detailFormulas: formulas,
      }),
    );
  const editDetailFormula = (index: number) =>
    pushCursor(infoDetail.k("detailFormulas").at(index));
  const clearDetails = () =>
    dispatch(
      updateAt(info, {
        ...textComponent,
        detail: undefined,
        detailFormulas: undefined,
      }),
    );

  const maxUses = calculateCustomFormula(ability.maxUses, character);

  return (
    <form className="edit-limited-use-ability">
      <ControlledEditTextLine
        {...{
          textComponent,
          character,
          title: "Name & description",
          updateTitle: setTitle,
          editTitleFormula,
          addDetail,
          updateDetail,
          editDetailFormula,
          clearDetails,
        }}
      />
      <div className="row space-between limited-use-ability-meta">
        <label className="column">
          Maximum uses
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              pushCursor(abilityCursor.k("maxUses"));
            }}
          >
            {maxUses} (edit formula)
          </button>
        </label>
        <label className="column">
          Recharges per
          <OptionOrCustomValue
            value={ability.recharge}
            setValue={(v: string) =>
              dispatch(updateAt(abilityCursor.k("recharge"), v))
            }
            options={RECHARGE_PRESETS}
            customDefaultValue=""
            customInputType="text"
            customValueHelpText="e.g. Dawn"
          />
        </label>
      </div>
      <button
        className="margin-small"
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
