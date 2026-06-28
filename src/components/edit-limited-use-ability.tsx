import { FIELD, RestType } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { CustomFormula, isTextComponent } from "src/lib/types";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue, traverse } from "src/lib/fields";
import { calculateCustomFormula } from "src/lib/formula";
import { updateData } from "src/lib/hooks/reducers/actions";
import { useSave } from "./modals/modal-container";
import { ControlledEditTextLine } from "./edit-text-line";
import OptionOrCustomValue from "./display/option-or-custom-value";

const RECHARGE_PRESETS = Object.values(RestType) as string[];

export default function EditLimitedUseAbility() {
  const { character, dispatch } = useCharacter();
  const { targetedField, subField, pushTargetedField } = useTargetedField();
  const { saveData } = useSave();

  if (!character || targetedField !== FIELD.limitedUseAbilities || !subField)
    return <></>;

  const ability = traverse(subField, getFieldValue(targetedField, character));
  if (!ability) return <></>;

  const textComponent = ability.info;
  if (!isTextComponent(textComponent)) return <></>;

  const updateField = (key: string, value: unknown) =>
    dispatch(updateData(targetedField, { value }, `${subField}.${key}`));

  // --- info (name/description), delegated to ControlledEditTextLine ---
  const setTitle = (text: string, formulas: CustomFormula[]) =>
    updateField("info", {
      ...textComponent,
      title: text,
      titleFormulas: formulas,
    });
  const editTitleFormula = (index: number) =>
    pushTargetedField(targetedField, `${subField}.info.titleFormulas.${index}`);
  const addDetail = () =>
    updateField("info", { ...textComponent, detail: "", detailFormulas: [] });
  const updateDetail = (text: string, formulas: CustomFormula[]) =>
    updateField("info", {
      ...textComponent,
      detail: text,
      detailFormulas: formulas,
    });
  const editDetailFormula = (index: number) =>
    pushTargetedField(
      targetedField,
      `${subField}.info.detailFormulas.${index}`,
    );
  const clearDetails = () =>
    updateField("info", {
      ...textComponent,
      detail: undefined,
      detailFormulas: undefined,
    });

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
              pushTargetedField(targetedField, `${subField}.maxUses`);
            }}
          >
            {maxUses} (edit formula)
          </button>
        </label>
        <label className="column">
          Recharges per
          <OptionOrCustomValue
            value={ability.recharge}
            setValue={(v: string) => updateField("recharge", v)}
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
