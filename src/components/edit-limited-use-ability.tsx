import { useEffect } from "react";
import {
  DieOperation,
  FIELD,
  RestType,
  StatKey,
} from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { STAT_NAMES, saveDcFormula } from "src/lib/rules";
import {
  CustomFormula,
  LimitedUseAbility,
  SaveEffect,
  TextComponentWithDetails,
  isTextComponent,
} from "src/lib/types";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue, traverse } from "src/lib/fields";
import { calculateCustomFormula, formatCustomFormula } from "src/lib/formula";
import { charPath, Cursor, fromStack, updateAt } from "src/lib/cursor";
import { newLimitedUseAbility } from "src/lib/data/default-data";
import { useSave } from "./modals/modal-container";
import { ControlledEditTextLine } from "./edit-text-line";
import EditAbilityMechanics from "./edit-ability-mechanics";
import OptionOrCustomValue from "./display/option-or-custom-value";
import Select from "src/components/select";

const RECHARGE_PRESETS = [
  ...(Object.values(RestType) as string[]),
  "Dawn",
  "Every 7 days",
];

// Shared between this editor and the equipment item editor (a magic item's
// charges are the same pool), so `cursor` points at the ability wherever it lives.
export function PoolMetaFields({
  ability,
  cursor,
}: {
  ability: LimitedUseAbility;
  cursor: Cursor<LimitedUseAbility | undefined>;
}) {
  const { character, dispatch } = useLoadedCharacter();
  const { pushCursor } = useTargetedField();
  const maxUses = calculateCustomFormula(ability.maxUses, character);
  return (
    <>
      <div className="row limited-use-ability-meta">
        <label className="field">
          <span className="field-label">Maximum uses</span>
          <button
            type="button"
            className="uses-formula-btn"
            onClick={(e) => {
              e.preventDefault();
              pushCursor(cursor.k("maxUses"));
            }}
          >
            {maxUses} <span className="uses-formula-hint">(edit formula)</span>
          </button>
        </label>
        <label className="field">
          <span className="field-label">Recharges per</span>
          <OptionOrCustomValue
            value={ability.recharge}
            setValue={(v: string) =>
              dispatch(updateAt(cursor.k("recharge"), v))
            }
            options={RECHARGE_PRESETS}
            customDefaultValue=""
            customInputType="text"
            customValueHelpText="e.g. Dawn, Every 7 days"
          />
        </label>
      </div>
      <div className="row limited-use-ability-meta">
        <div className="field">
          <span className="field-label">Recharge regains</span>
          {/* Switching to a rolled amount seeds 1d3. */}
          <Select
            label="What a recharge regains"
            value={ability.restore === undefined ? "all" : "roll"}
            options={[
              { value: "all", label: "All uses" },
              { value: "roll", label: "A rolled amount" },
            ]}
            onChange={(value) =>
              dispatch(
                updateAt(
                  cursor.k("restore"),
                  value === "roll"
                    ? [1, { numFaces: 3 }, DieOperation.roll]
                    : undefined,
                ),
              )
            }
          />
        </div>
        {ability.restore !== undefined && (
          <label className="field">
            <span className="field-label">Amount regained</span>
            <button
              type="button"
              className="uses-formula-btn"
              onClick={(e) => {
                e.preventDefault();
                pushCursor(cursor.k("restore"));
              }}
            >
              {formatCustomFormula(ability.restore, character)}{" "}
              <span className="uses-formula-hint">(edit formula)</span>
            </button>
          </label>
        )}
      </div>
    </>
  );
}

export default function EditLimitedUseAbility() {
  const { character, dispatch } = useLoadedCharacter();
  const { targetedField, subField, pushCursor } = useTargetedField();
  const { saveData } = useSave();

  const isAbilityTarget =
    !!character && targetedField === FIELD.limitedUseAbilities && !!subField;

  const ability = isAbilityTarget
    ? traverse(subField!, getFieldValue(FIELD.limitedUseAbilities, character!))
    : undefined;

  // Seeds a blank ability into the modal draft when opened on a
  // not-yet-created index; idempotent under StrictMode's double-invoked effects.
  useEffect(() => {
    if (!isAbilityTarget || ability) return;
    const list = charPath(FIELD.limitedUseAbilities);
    const abilities = character!.limitedUseAbilities ?? [];
    dispatch(updateAt(list, abilities.concat(newLimitedUseAbility())));
  }, [isAbilityTarget, ability]);

  if (targetedField !== FIELD.limitedUseAbilities || !subField) return <></>;
  if (!ability) return <></>;

  const textComponent = ability.info;
  if (!isTextComponent(textComponent)) return <></>;

  const abilityCursor = fromStack<LimitedUseAbility>(targetedField, subField);
  const info = abilityCursor.k("info");
  const infoDetail = fromStack<TextComponentWithDetails>(
    targetedField,
    `${subField}.info`,
  );

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
      <PoolMetaFields ability={ability} cursor={abilityCursor} />
      <fieldset className="limited-use-save">
        <legend className="field-label">Save DC (optional)</legend>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={!!ability.save}
            onChange={(e) =>
              dispatch(
                updateAt(
                  abilityCursor.k("save"),
                  e.target.checked
                    ? ({ dc: saveDcFormula(StatKey.wis) } satisfies SaveEffect)
                    : undefined,
                ),
              )
            }
          />
          This feature imposes a saving throw
        </label>
        {ability.save && (
          <div className="row limited-use-ability-meta">
            <div className="field">
              <span className="field-label">DC</span>
              <button
                type="button"
                className="uses-formula-btn"
                onClick={(e) => {
                  e.preventDefault();
                  pushCursor(abilityCursor.k("save").k("dc"));
                }}
              >
                {calculateCustomFormula(ability.save.dc, character)}{" "}
                <span className="uses-formula-hint">(edit formula)</span>
              </button>
            </div>
            <div className="field">
              <span className="field-label">Target rolls</span>
              <Select
                label="Which save the target rolls"
                placeholder="(varies)"
                clearable
                clearLabel="(varies)"
                value={ability.save.stat ?? ""}
                options={Object.values(StatKey).map((stat) => ({
                  value: stat,
                  label: STAT_NAMES[stat],
                }))}
                onChange={(value) =>
                  dispatch(
                    updateAt(abilityCursor.k("save"), {
                      ...ability.save!,
                      stat: (value || undefined) as StatKey | undefined,
                    }),
                  )
                }
              />
            </div>
          </div>
        )}
      </fieldset>
      <EditAbilityMechanics ability={ability} cursor={abilityCursor} />
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
