import { useEffect, useState } from "react";
import { ArmorCategory, FIELD } from "src/lib/data/data-definitions";
import { randomUUID } from "src/lib/browser";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  ArmorMechanics,
  CustomFormula,
  EquipmentItem,
  TextComponentWithDetails,
  isTextComponent,
} from "src/lib/types";
import { useSettings } from "src/lib/hooks/use-settings";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useSave } from "./modals/modal-container";
import { fromStack, updateAt } from "src/lib/cursor";
import { weightInUnit, weightToLb } from "src/lib/rules";
import { ARMOR_PRESETS } from "src/lib/builder/equipment";
import { ControlledEditTextLine } from "./edit-text-line";
import StepperInput from "./stepper-input";

// Default DEX contribution for a freshly-picked category — decoupled from the
// stored `dex` so a special armor can override it after selection.
const DEFAULT_DEX: Record<ArmorCategory, ArmorMechanics["dex"]> = {
  light: "full",
  medium: "capped",
  heavy: "none",
};

// Add or edit one equipment item. Opened with subField "new" (append a fresh
// item, seeded into the modal draft) or a numeric index (edit that item). The
// name/description reuse `ControlledEditTextLine` (so embedded {{}} formulas keep
// working); the structured fields — quantity, weight, equipped, and whether the
// item requires attunement — are edited here. Whether the character is currently
// *attuned* is a play-mode toggle on the sheet row, not part of item setup.
export default function EditEquipmentItem() {
  const { character, dispatch } = useCharacter();
  const { targetedField, subField, pushCursor } = useTargetedField();
  const { saveData } = useSave();
  const {
    settings: { trackEncumbrance, weightUnit },
  } = useSettings();

  const isEquipmentTarget =
    !!character && targetedField === FIELD.equipment && subField !== undefined;

  // "new" appends after the current list; a numeric subField edits that index.
  // The append index is captured once at mount — recomputing `equipment.length`
  // each render would chase the list after the seed lands and re-seed forever.
  const equipment: EquipmentItem[] = character?.equipment ?? [];
  const [newIndex] = useState(equipment.length);
  const isNew = subField === "new";
  const index = isNew ? newIndex : Number(subField);
  const item: EquipmentItem | undefined = equipment[index];

  // Seed a blank item into the *modal draft* when there's nothing at the target
  // index yet (the "new" add path). Living only in the draft, it's discarded if
  // the user backs out and persisted on save. The concat-replace keeps the effect
  // idempotent under StrictMode's double-invoked effects.
  useEffect(() => {
    if (!isEquipmentTarget || item) return;
    dispatch(
      updateAt(
        fromStack<EquipmentItem[]>(FIELD.equipment, undefined),
        equipment.concat({
          id: randomUUID(),
          text: { title: "New item", titleFormulas: [] },
          quantity: 1,
          equipped: false,
        }),
      ),
    );
  }, [isEquipmentTarget, item]);

  if (!character || !isEquipmentTarget || !item) return <></>;

  const textComponent = item.text;
  if (!isTextComponent(textComponent)) return <></>;

  const itemCursor = fromStack<EquipmentItem>(FIELD.equipment, String(index));
  // `detailFormulas` lives only on the with-details TextComponent variant; this
  // narrower cursor unlocks that slot from the branch where details exist.
  const textDetail = fromStack<TextComponentWithDetails>(
    FIELD.equipment,
    `${index}.text`,
  );

  const setText = (patch: Partial<TextComponentWithDetails>) =>
    dispatch(updateAt(itemCursor.k("text"), { ...textComponent, ...patch }));

  // --- name/description handlers, delegated to ControlledEditTextLine ---
  const updateTitle = (text: string, formulas: CustomFormula[]) =>
    setText({ title: text, titleFormulas: formulas });
  const editTitleFormula = (i: number) =>
    pushCursor(itemCursor.k("text").k("titleFormulas").at(i));
  const addDetail = () => setText({ detail: "", detailFormulas: [] });
  const updateDetail = (text: string, formulas: CustomFormula[]) =>
    setText({ detail: text, detailFormulas: formulas });
  const editDetailFormula = (i: number) =>
    pushCursor(textDetail.k("detailFormulas").at(i));
  const clearDetails = () =>
    setText({ detail: undefined, detailFormulas: undefined });

  // --- structured fields ---
  const setQuantity = (value: number) =>
    dispatch(updateAt(itemCursor.k("quantity"), Math.max(0, value || 0)));
  // Weights are stored in pounds; convert from the display unit on write.
  const setWeight = (value: string) =>
    dispatch(
      updateAt(
        itemCursor.k("weight"),
        value === ""
          ? undefined
          : Math.max(0, weightToLb(Number(value) || 0, weightUnit)),
      ),
    );
  const setRequiresAttunement = (required: boolean) =>
    dispatch(
      updateAt(
        itemCursor.k("attunement"),
        required ? { attuned: item.attunement?.attuned ?? false } : undefined,
      ),
    );
  const setEquippable = (value: boolean) =>
    dispatch(updateAt(itemCursor.k("equippable"), value || undefined));

  // --- armor / shield mechanics (mutually exclusive) ---
  // Armor/shield items are inherently equippable (they only affect AC while
  // equipped), so the "can be equipped" flag is forced on and locked for them.
  const isGear = !!item.armor || !!item.shield;
  const gearType = item.shield
    ? "shield"
    : item.armor
      ? item.armor.category
      : "none";
  const clearArmor = () => dispatch(updateAt(itemCursor.k("armor"), undefined));
  const clearShield = () =>
    dispatch(updateAt(itemCursor.k("shield"), undefined));
  const setGearType = (value: string) => {
    if (value === "shield") {
      clearArmor();
      dispatch(
        updateAt(itemCursor.k("shield"), { bonus: item.shield?.bonus ?? 2 }),
      );
    } else if (value === "none") {
      clearArmor();
      clearShield();
    } else {
      const category = value as ArmorCategory;
      clearShield();
      const dex = DEFAULT_DEX[category];
      dispatch(
        updateAt(itemCursor.k("armor"), {
          base: item.armor?.base ?? 10,
          category,
          dex,
          ...(dex === "capped" ? { dexCap: item.armor?.dexCap ?? 2 } : {}),
        }),
      );
    }
  };
  const updateArmor = (patch: Partial<ArmorMechanics>) => {
    if (item.armor)
      dispatch(updateAt(itemCursor.k("armor"), { ...item.armor, ...patch }));
  };
  const setShieldBonus = (bonus: number) =>
    dispatch(
      updateAt(itemCursor.k("shield"), { bonus: Math.max(0, bonus || 0) }),
    );
  const applyPreset = (label: string) => {
    const preset = ARMOR_PRESETS.find((p) => p.label === label);
    if (!preset) return;
    clearShield();
    dispatch(updateAt(itemCursor.k("armor"), preset.mechanics));
    // Name a still-unnamed item after the preset for convenience.
    if (!textComponent.title || textComponent.title === "New item")
      setText({ title: preset.label });
  };

  return (
    <form
      className="edit-equipment column"
      onSubmit={(e) => e.preventDefault()}
    >
      <ControlledEditTextLine
        {...{
          textComponent,
          character,
          title: "Name & description",
          updateTitle,
          editTitleFormula,
          addDetail,
          updateDetail,
          editDetailFormula,
          clearDetails,
        }}
      />

      <div className="row equipment-fields">
        <label className="field">
          <span className="field-label">Quantity</span>
          <StepperInput
            value={item.quantity}
            min={0}
            ariaLabel="Quantity"
            onChange={setQuantity}
          />
        </label>
        {trackEncumbrance && (
          <label className="field">
            <span className="field-label">Weight ({weightUnit}, each)</span>
            <input
              type="number"
              className="no-spin weight-input"
              value={
                item.weight === undefined
                  ? ""
                  : weightInUnit(item.weight, weightUnit)
              }
              min={0}
              step="any"
              placeholder="—"
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
        )}
      </div>

      <fieldset className="equipment-armor">
        <legend className="field-label">Armor / Shield (drives AC)</legend>
        <div className="row equipment-fields">
          <label className="field">
            <span className="field-label">Type</span>
            <select
              value={gearType}
              onChange={(e) => setGearType(e.target.value)}
            >
              <option value="none">Not armor</option>
              <option value="light">Light armor</option>
              <option value="medium">Medium armor</option>
              <option value="heavy">Heavy armor</option>
              <option value="shield">Shield</option>
            </select>
          </label>
          {item.armor && (
            <label className="field">
              <span className="field-label">Preset</span>
              <select
                value=""
                onChange={(e) => {
                  applyPreset(e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">Custom…</option>
                {ARMOR_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {item.armor && (
          <div className="row equipment-fields">
            <label className="field">
              <span className="field-label">Base AC</span>
              <StepperInput
                value={item.armor.base}
                min={0}
                ariaLabel="Base AC"
                onChange={(value) => updateArmor({ base: value })}
              />
            </label>
            <label className="field">
              <span className="field-label">DEX to AC</span>
              <select
                value={item.armor.dex}
                onChange={(e) =>
                  updateArmor({
                    dex: e.target.value as ArmorMechanics["dex"],
                    ...(e.target.value === "capped"
                      ? { dexCap: item.armor?.dexCap ?? 2 }
                      : {}),
                  })
                }
              >
                <option value="full">Full DEX</option>
                <option value="capped">Capped</option>
                <option value="none">No DEX</option>
              </select>
            </label>
            {item.armor.dex === "capped" && (
              <label className="field">
                <span className="field-label">Max DEX</span>
                <StepperInput
                  value={item.armor.dexCap ?? 2}
                  min={0}
                  ariaLabel="Max DEX"
                  onChange={(value) => updateArmor({ dexCap: value })}
                />
              </label>
            )}
          </div>
        )}

        {item.shield && (
          <label className="field">
            <span className="field-label">Shield AC bonus</span>
            <StepperInput
              value={item.shield.bonus}
              min={0}
              ariaLabel="Shield AC bonus"
              onChange={setShieldBonus}
            />
          </label>
        )}
      </fieldset>

      {/* Capabilities of the item (not its live state). Whether it's *currently*
          equipped or attuned is a direct toggle on the sheet row; here we set
          only whether those toggles apply. Armor and shields are always
          equippable, so the flag is forced on and locked for them. */}
      <label
        className="settings-checkbox"
        title={
          isGear
            ? "Armor and shields are always equippable."
            : "Show an equip toggle for this item on the sheet."
        }
      >
        <input
          type="checkbox"
          checked={isGear || !!item.equippable}
          disabled={isGear}
          onChange={(e) => setEquippable(e.target.checked)}
        />
        Can be equipped (worn or wielded)
      </label>
      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={item.attunement !== undefined}
          onChange={(e) => setRequiresAttunement(e.target.checked)}
        />
        Requires attunement
      </label>

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
