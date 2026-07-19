import React from "react";
import { CastingTime, FIELD, SpellLevel } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  CustomFormula,
  isTextComponent,
  MaterialComponent,
  Spell,
  SpellComponents,
  TextComponentWithDetails,
} from "src/lib/types";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue, traverse } from "src/lib/fields";
import { useSave } from "./modals/modal-container";
import { fromStack, updateAt } from "src/lib/cursor";
import { ControlledEditTextLine } from "./edit-text-line";
import { FaTrash } from "react-icons/fa6";
import OptionOrCustomValue from "./display/option-or-custom-value";
import { DEFAULT_SPELL_DURATIONS, DEFAULT_SPELL_RANGES } from "src/lib/rules";
import EditSpellMechanics from "./edit-spell-mechanics";

// SpellLevel buckets in numeric order, so a spell's storage bucket → base level.
const SPELL_LEVEL_BUCKETS = Object.values(SpellLevel) as string[];

const CASTING_TIME_PRESETS = Object.values(CastingTime) as string[];

export default function EditSpell() {
  const { character, dispatch } = useCharacter();
  const { targetedField, subField, pushCursor } = useTargetedField();
  const { saveData } = useSave();

  if (!character || targetedField !== FIELD.spells || !subField) return <></>;

  const spell = traverse(subField, getFieldValue(targetedField, character));
  if (!spell) return <></>;

  const textComponent = spell.info;
  if (!isTextComponent(textComponent)) return <></>;

  // Cantrips are always available and never prepared.
  const bucket = subField.split(".")[0];
  const isCantrip = bucket === "cantrips";
  // Base spell level, driven by the storage bucket (cantrip = 0, "First" = 1…).
  const spellLevel = isCantrip ? 0 : SPELL_LEVEL_BUCKETS.indexOf(bucket) + 1;

  const spellCursor = fromStack<Spell>(targetedField, subField);
  // `detailFormulas` lives only on the with-details TextComponent variant;
  // used solely from the branch where details already exist.
  const infoDetail = fromStack<TextComponentWithDetails>(
    targetedField,
    `${subField}.info`,
  );

  // Leaf fields whose parent (the spell object) already exists can be written
  // directly; `components` is rebuilt wholesale because it may not exist yet and
  // the reducer requires the parent of a written path to be present.
  const updateSpellField = <K extends keyof Spell>(key: K, value: Spell[K]) =>
    dispatch(updateAt(spellCursor.k(key), value));

  const updateCastingClass = (e: React.ChangeEvent<HTMLSelectElement>) =>
    updateSpellField("spellcastingClass", e.target.value);

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
  const setTitle = (text: string, formulas: CustomFormula[]) =>
    updateSpellField("info", {
      ...textComponent,
      title: text,
      titleFormulas: formulas,
    });
  const editTitleFormula = (index: number) =>
    pushCursor(spellCursor.k("info").k("titleFormulas").at(index));
  const addDetail = () =>
    updateSpellField("info", {
      ...textComponent,
      detail: "",
      detailFormulas: [],
    });
  const updateDetail = (text: string, formulas: CustomFormula[]) =>
    updateSpellField("info", {
      ...textComponent,
      detail: text,
      detailFormulas: formulas,
    });
  const editDetailFormula = (index: number) =>
    pushCursor(infoDetail.k("detailFormulas").at(index));
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
          <OptionOrCustomValue
            value={spell.castingTime ?? ""}
            setValue={(v: string) =>
              updateSpellField("castingTime", v || undefined)
            }
            options={CASTING_TIME_PRESETS}
            customDefaultValue=""
            customInputType="text"
            customValueHelpText="e.g. 1 minute"
          />
        </label>
        <label>
          Range
          <OptionOrCustomValue
            value={spell.range ?? ""}
            setValue={(v: string) => updateSpellField("range", v || undefined)}
            options={DEFAULT_SPELL_RANGES}
            customDefaultValue=""
            customInputType="text"
            customValueHelpText="e.g. 30 feet"
          />
        </label>
        <label>
          Duration
          <OptionOrCustomValue
            value={spell.duration ?? ""}
            setValue={(v: string) =>
              updateSpellField("duration", v || undefined)
            }
            options={DEFAULT_SPELL_DURATIONS}
            customDefaultValue=""
            customInputType="text"
            customValueHelpText="e.g. 1 hour"
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
          editTitleFormula,
          addDetail,
          updateDetail,
          editDetailFormula,
          clearDetails,
        }}
      />

      <EditSpellMechanics
        key={subField}
        mechanics={spell.mechanics}
        level={spellLevel}
        spellcastingClass={spell.spellcastingClass}
        onChange={(mechanics) => updateSpellField("mechanics", mechanics)}
      />

      <button className="margin-small" onClick={onSubmit}>
        Save
      </button>
    </form>
  );
}
