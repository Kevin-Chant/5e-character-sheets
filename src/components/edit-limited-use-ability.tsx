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

// The two rests, plus the magic-item triggers: "Dawn" fires from the play
// surface's Dawn button or a rest that spans dawn, and "Every 7 days" counts
// dawns until it comes due (any number works — the preset is just the common
// one; type "Every 3 days" for a different interval).
const RECHARGE_PRESETS = [
  ...(Object.values(RestType) as string[]),
  "Dawn",
  "Every 7 days",
];

// The pool's mechanical knobs — max uses, recharge trigger, and how much a
// firing recharge hands back. Shared between this editor and the equipment item
// editor (a magic item's charges are the same pool, stored on the item), so
// `cursor` points at the ability wherever it lives.
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
        <label className="field">
          <span className="field-label">Recharge regains</span>
          {/* "Regains 1d3 expended charges at dawn" — the magic-item pattern.
              Switching to a rolled amount seeds 1d3; the formula button opens
              the full editor for the 1d6+4 staves. */}
          <select
            value={ability.restore === undefined ? "all" : "roll"}
            onChange={(e) =>
              dispatch(
                updateAt(
                  cursor.k("restore"),
                  e.target.value === "roll"
                    ? [1, { numFaces: 3 }, DieOperation.roll]
                    : undefined,
                ),
              )
            }
          >
            <option value="all">All uses</option>
            <option value="roll">A rolled amount</option>
          </select>
        </label>
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

  // The "+" add button opens the editor on the next (not-yet-created) index.
  // Seed a blank ability into the *modal draft* so there's something to edit;
  // it lives only in the draft, so nothing is persisted until the user saves
  // and backing out discards it. The seed replaces the whole list with the
  // pre-seed list plus one default, so it's idempotent under StrictMode's
  // double-invoked effects (running it twice yields the same list).
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
            <label className="field">
              <span className="field-label">Target rolls</span>
              <select
                value={ability.save.stat ?? ""}
                onChange={(e) =>
                  dispatch(
                    updateAt(abilityCursor.k("save"), {
                      ...ability.save!,
                      stat: (e.target.value || undefined) as
                        | StatKey
                        | undefined,
                    }),
                  )
                }
              >
                {/* The default for a pool: one Ki DC backs several features
                    that call for different saves. */}
                <option value="">(varies)</option>
                {Object.values(StatKey).map((stat) => (
                  <option key={stat} value={stat}>
                    {STAT_NAMES[stat]}
                  </option>
                ))}
              </select>
            </label>
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
