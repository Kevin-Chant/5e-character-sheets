import React, { useEffect } from "react";
import { CastingTime, FIELD } from "src/lib/data/data-definitions";
import { randomUUID } from "src/lib/browser";
import { UUID } from "crypto";
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

const CASTING_TIME_PRESETS = Object.values(CastingTime) as string[];

export default function EditSpell() {
  const { character, dispatch } = useCharacter();
  const { targetedField, subField, pushCursor } = useTargetedField();
  const { saveData } = useSave();

  const isSpellTarget =
    !!character && targetedField === FIELD.spells && !!subField;
  // Cantrips are always available and never prepared. The storage bucket also
  // drives the base spell level (numeric: cantrip = "0", 1st = "1"…).
  const bucketKey = subField?.split(".")[0] ?? "";
  const isCantrip = bucketKey === "0";

  const spell: Spell | undefined = isSpellTarget
    ? traverse(subField!, getFieldValue(FIELD.spells, character!))
    : undefined;

  // The "+" add button opens the editor on the next (not-yet-created) index.
  // Seed a blank spell into the *modal draft* so there's something to edit;
  // because it lives only in the draft, nothing is persisted until the user
  // saves and backing out discards it. The seed replaces the whole bucket with
  // the pre-seed list plus one default, so it stays idempotent under
  // StrictMode's double-invoked effects (running it twice yields the same list).
  useEffect(() => {
    if (!isSpellTarget || spell) return;
    const defaultSpellClass =
      character!.spellcastingClasses[0]?.classId ??
      character!.class[0]?.id ??
      randomUUID();
    const bucket = fromStack<Spell[]>(FIELD.spells, bucketKey);
    const list: Spell[] = getFieldValue(bucket.toString(), character!) ?? [];
    dispatch(
      updateAt(
        bucket,
        list.concat({
          spellcastingClass: defaultSpellClass,
          info: {
            title: isCantrip ? "New cantrip" : "New spell",
            titleFormulas: [],
          },
        }),
      ),
    );
  }, [isSpellTarget, spell, bucketKey, isCantrip]);

  if (!character || targetedField !== FIELD.spells || !subField || !spell)
    return <></>;

  const textComponent = spell.info;
  if (!isTextComponent(textComponent)) return <></>;

  const spellLevel = Number(bucketKey);

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
    updateSpellField("spellcastingClass", e.target.value as UUID);

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

  // Class options as {id, name}: the spell stores the id, the dropdown shows the
  // name. Sourced from the character's classes so a spell can only be tagged to a
  // class it actually has.
  const classOptions = character.class.map((klass) => ({
    id: klass.id,
    name: klass.name,
  }));

  return (
    <form className="edit-spell">
      <div className="spell-meta-grid">
        <label>
          Spellcasting class
          <select value={spell.spellcastingClass} onChange={updateCastingClass}>
            {classOptions.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
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
