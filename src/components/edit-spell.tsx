import React from "react";
import { CastingTime, FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  isTextComponent,
  MaterialComponent,
  SpellComponents,
} from "src/lib/types";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue, traverse } from "src/lib/utils";
import { useSave } from "./modals/modal-container";
import { updateData } from "src/lib/hooks/reducers/actions";
import { ControlledEditTextLine } from "./edit-text-line";
import { FaTrash } from "react-icons/fa6";

const CASTING_TIME_PRESETS = Object.values(CastingTime) as string[];

export default function EditSpell() {
  const { character, dispatch } = useCharacter();
  const { targetedField, subField, pushTargetedField } = useTargetedField();
  const { saveData } = useSave();

  if (!character || targetedField !== FIELD.spells || !subField) return <></>;

  const spell = traverse(subField, getFieldValue(targetedField, character));
  if (!spell) return <></>;

  const textComponent = spell.info;
  if (!isTextComponent(textComponent)) return <></>;

  // Cantrips are always available and never prepared.
  const isCantrip = subField.split(".")[0] === "cantrips";

  // Leaf fields whose parent (the spell object) already exists can be written
  // directly; `components` is rebuilt wholesale because it may not exist yet and
  // the reducer requires the parent of a written path to be present.
  const updateSpellField = (key: string, value: unknown) =>
    dispatch(updateData(targetedField, { value }, `${subField}.${key}`));

  const updateCastingClass = (e: React.ChangeEvent<HTMLSelectElement>) =>
    updateSpellField("spellcastingClass", e.target.value);

  // --- Casting time (preset select + free-form "other") ---
  const castingTime: string | undefined = spell.castingTime;
  const castingTimeSelect =
    castingTime === undefined
      ? ""
      : CASTING_TIME_PRESETS.includes(castingTime)
        ? castingTime
        : "other";
  const onCastingTimeSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === "") updateSpellField("castingTime", undefined);
    else if (v === "other") {
      // Switch into free-form mode, preserving an existing custom value.
      if (castingTimeSelect !== "other") updateSpellField("castingTime", "");
    } else updateSpellField("castingTime", v);
  };

  // --- Components ---
  const components: SpellComponents = spell.components ?? {};
  const material: MaterialComponent[] | undefined = components.material;
  const updateComponents = (newComponents: SpellComponents) =>
    updateSpellField("components", newComponents);
  const updateMaterial = (newMaterial: MaterialComponent[]) =>
    updateComponents({ ...components, material: newMaterial });
  const toggleMaterial = (checked: boolean) =>
    updateComponents({
      ...components,
      material: checked ? (material ?? []) : undefined,
    });
  const setMaterialGp = (index: number, gp: number) =>
    updateMaterial(
      (material ?? []).map((m, i) =>
        i === index ? { ...m, price: gp > 0 ? { GP: gp } : undefined } : m,
      ),
    );

  // --- info (name/description) handlers, delegated to ControlledEditTextLine ---
  const setTitle = (newValue: string) =>
    updateSpellField("info.title", newValue);
  const addTitleFormula = () =>
    updateSpellField("info.titleFormulas", [
      ...textComponent.titleFormulas,
      "proficiencyBonus",
    ]);
  const editTitleFormula = (index: number) =>
    pushTargetedField(targetedField, `${subField}.info.titleFormulas.${index}`);
  const addDetail = () =>
    updateSpellField("info", {
      ...textComponent,
      detail: "",
      detailFormulas: [],
    });
  const updateDetail = (newValue: string) =>
    updateSpellField("info.detail", newValue);
  const addDetailFormula = () =>
    updateSpellField("info.detailFormulas", [
      ...textComponent.titleFormulas,
      "proficiencyBonus",
    ]);
  const editDetailFormula = (index: number) =>
    pushTargetedField(
      targetedField,
      `${subField}.info.detailFormulas.${index}`,
    );
  const clearDetails = () =>
    updateSpellField("info", {
      ...textComponent,
      detail: undefined,
      detailFormulas: undefined,
    });

  const onSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    saveData();
  };

  const spellcastingClasses = character.spellcastingClasses.map(
    (klass) => klass.class,
  );

  return (
    <form className="edit-spell">
      <div className="spell-meta-grid">
        <label>
          Spellcasting class
          <select value={spell.spellcastingClass} onChange={updateCastingClass}>
            {spellcastingClasses.map((className) => (
              <option value={className} key={className}>
                {className}
              </option>
            ))}
          </select>
        </label>
        <label>
          Casting time
          <select value={castingTimeSelect} onChange={onCastingTimeSelect}>
            <option value="">—</option>
            {CASTING_TIME_PRESETS.map((preset) => (
              <option value={preset} key={preset}>
                {preset}
              </option>
            ))}
            <option value="other">Other…</option>
          </select>
          {castingTimeSelect === "other" && (
            <input
              type="text"
              placeholder="e.g. 1 minute"
              value={castingTime ?? ""}
              onChange={(e) => updateSpellField("castingTime", e.target.value)}
            />
          )}
        </label>
        <label>
          Range
          <input
            type="text"
            value={spell.range ?? ""}
            onChange={(e) => updateSpellField("range", e.target.value)}
          />
        </label>
        <label>
          Duration
          <input
            type="text"
            value={spell.duration ?? ""}
            onChange={(e) => updateSpellField("duration", e.target.value)}
          />
        </label>
      </div>

      <div className="spell-meta-flags row">
        {!isCantrip && (
          <label>
            <input
              type="checkbox"
              checked={!!spell.prepared}
              onChange={(e) => updateSpellField("prepared", e.target.checked)}
            />{" "}
            Prepared
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={!!spell.ritual}
            onChange={(e) => updateSpellField("ritual", e.target.checked)}
          />{" "}
          Ritual
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!spell.concentration}
            onChange={(e) =>
              updateSpellField("concentration", e.target.checked)
            }
          />{" "}
          Concentration
        </label>
      </div>

      <div className="spell-components column">
        <div className="row spell-component-toggles">
          <label>
            <input
              type="checkbox"
              checked={!!components.verbal}
              onChange={(e) =>
                updateComponents({ ...components, verbal: e.target.checked })
              }
            />{" "}
            Verbal
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!components.somatic}
              onChange={(e) =>
                updateComponents({ ...components, somatic: e.target.checked })
              }
            />{" "}
            Somatic
          </label>
          <label>
            <input
              type="checkbox"
              checked={material !== undefined}
              onChange={(e) => toggleMaterial(e.target.checked)}
            />{" "}
            Material
          </label>
        </div>
        {material !== undefined && (
          <div className="column material-list">
            <p className="font-small">
              Give a cost only for components consumed on cast.
            </p>
            {material.map((mat, index) => (
              <div className="material-row row" key={index}>
                <input
                  type="text"
                  placeholder="Component"
                  value={mat.name}
                  onChange={(e) =>
                    updateMaterial(
                      material.map((m, i) =>
                        i === index ? { ...m, name: e.target.value } : m,
                      ),
                    )
                  }
                />
                <label className="coin-input">
                  <input
                    type="number"
                    min={0}
                    value={mat.price?.GP ?? ""}
                    onChange={(e) =>
                      setMaterialGp(index, parseInt(e.target.value) || 0)
                    }
                  />
                  GP
                </label>
                <button
                  type="button"
                  aria-label="Remove material component"
                  onClick={(e) => {
                    e.preventDefault();
                    updateMaterial(material.filter((_, i) => i !== index));
                  }}
                >
                  <FaTrash />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                updateMaterial([...material, { name: "" }]);
              }}
            >
              Add material component
            </button>
          </div>
        )}
      </div>

      <ControlledEditTextLine
        {...{
          textComponent,
          character,
          title: "Name & description",
          updateTitle: setTitle,
          addTitleFormula,
          editTitleFormula,
          addDetail,
          updateDetail,
          addDetailFormula,
          editDetailFormula,
          clearDetails,
        }}
      />
      <button className="margin-small" onClick={onSubmit}>
        Save
      </button>
    </form>
  );
}
