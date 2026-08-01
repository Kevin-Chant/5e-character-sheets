import { useEffect, useState } from "react";
import { ArmorCategory, FIELD } from "src/lib/data/data-definitions";
import { randomUUID } from "src/lib/browser";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { UUID } from "crypto";
import {
  ArmorMechanics,
  Attack,
  CustomFormula,
  EquipmentItem,
  TextComponentWithDetails,
  isTextComponent,
} from "src/lib/types";
import { useSettings } from "src/lib/hooks/use-settings";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { replaceCharacter } from "src/lib/hooks/reducers/actions";
import { useSave } from "./modals/modal-container";
import { fromStack, updateAt } from "src/lib/cursor";
import { weightInUnit, weightToLb } from "src/lib/rules";
import {
  EQUIPMENT_CATALOG,
  EquipmentCatalogEntry,
  armorWithBonus,
  buildCatalogAttack,
  catalogItemName,
  shieldWithBonus,
} from "src/lib/builder/equipment-catalog";
import { ControlledEditTextLine } from "./edit-text-line";
import StepperInput from "./stepper-input";

// Default DEX contribution for a freshly-picked category — decoupled from the
// stored `dex` so a special armor can override it after selection.
const DEFAULT_DEX: Record<ArmorCategory, ArmorMechanics["dex"]> = {
  light: "full",
  medium: "capped",
  heavy: "none",
};

// The name field for a *new* item: a type-ahead over the built-in catalog that
// doubles as the plain name input. Picking an entry prefills mechanics; typing
// anything else just names a custom item. Enter on an exact catalog match picks
// it (instead of saving the modal), so "shield⏎" behaves like clicking Shield.
function CatalogNameInput({
  value,
  pickedName,
  onType,
  onPick,
}: {
  value: string;
  pickedName?: string;
  onType: (name: string) => void;
  onPick: (entry: EquipmentCatalogEntry) => void;
}) {
  const [open, setOpen] = useState(false);

  const q = value.trim().toLowerCase();
  const matches = EQUIPMENT_CATALOG.filter((entry) =>
    entry.name.toLowerCase().includes(q),
  );
  // Group in catalog order, preserving each group's first appearance.
  const groups: { label: string; entries: EquipmentCatalogEntry[] }[] = [];
  for (const entry of matches) {
    const group = groups.find((g) => g.label === entry.group);
    if (group) group.entries.push(entry);
    else groups.push({ label: entry.group, entries: [entry] });
  }

  const pick = (entry: EquipmentCatalogEntry) => {
    onPick(entry);
    setOpen(false);
  };

  return (
    <div className="typeahead">
      <input
        type="text"
        placeholder="e.g. Chain Mail, Longsword…"
        value={value}
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const exact = matches.find((m) => m.name.toLowerCase() === q);
          if (exact && exact.name !== pickedName) {
            // Consume the Enter so the modal doesn't save mid-pick.
            e.preventDefault();
            e.stopPropagation();
            pick(exact);
          }
        }}
      />
      {open && groups.length > 0 && (
        <ul className="typeahead-list rounded-border-box">
          {groups.map((group) => (
            <li key={group.label} className="typeahead-group">
              <span className="typeahead-group-label">{group.label}</span>
              <ul>
                {group.entries.map((entry) => (
                  <li key={entry.name}>
                    <button
                      type="button"
                      className="typeahead-option"
                      // Keep the input focused so onClick fires before onBlur.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(entry)}
                    >
                      {entry.name}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Add or edit one equipment item. Opened with subField "new" (append a fresh
// item, seeded into the modal draft) or a numeric index (edit that item). The
// name/description reuse `ControlledEditTextLine` (so embedded {{}} formulas keep
// working); the structured fields — quantity, weight, equipped, and whether the
// item requires attunement — are edited here. Whether the character is currently
// *attuned* is a play-mode toggle on the sheet row, not part of item setup.
//
// For a new item the name input is a catalog type-ahead: picking a built-in
// armor/shield prefills its AC mechanics and weight, and picking a weapon also
// seeds a ready-to-roll Attack into the draft — which is why saving goes through
// `replace_character` when a weapon was picked (the default save path only
// copies the equipment field out of the draft).
export default function EditEquipmentItem() {
  const { character, dispatch } = useLoadedCharacter();
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

  // The catalog entry the type-ahead picked (new items only), the +N magic
  // bonus applied to it, and the id of the Attack that pick seeded into the
  // draft — tracked so re-picking replaces rather than accumulates.
  const [picked, setPicked] = useState<EquipmentCatalogEntry>();
  const [bonus, setBonus] = useState(0);
  const [seededAttackId, setSeededAttackId] = useState<UUID>();

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
          text: { title: "", titleFormulas: [] },
          quantity: 1,
          equipped: false,
        }),
      ),
    );
  }, [isEquipmentTarget, item]);

  if (!isEquipmentTarget || !item) return <></>;

  const textComponent = item.text;
  if (!isTextComponent(textComponent)) return <></>;

  const itemCursor = fromStack<EquipmentItem>(FIELD.equipment, String(index));
  const attacksCursor = fromStack<Attack[]>(FIELD.attacks, undefined);
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

  // Prefill the item from a catalog pick at a given magic bonus. Re-runs when
  // either changes, so it always writes the full picture: name, weight,
  // mechanics, and (for a weapon) the seeded Attack — replacing whatever a
  // previous pick seeded.
  const applyCatalogEntry = (entry: EquipmentCatalogEntry, plus: number) => {
    setText({ title: catalogItemName(entry, plus), titleFormulas: [] });
    dispatch(updateAt(itemCursor.k("weight"), entry.weight));

    if (entry.armor) {
      clearShield();
      dispatch(
        updateAt(itemCursor.k("armor"), armorWithBonus(entry.armor, plus)),
      );
    } else if (entry.shield) {
      clearArmor();
      dispatch(
        updateAt(itemCursor.k("shield"), shieldWithBonus(entry.shield, plus)),
      );
    } else {
      clearArmor();
      clearShield();
    }

    // A weapon is wielded (equippable) and fights through an Attack row.
    dispatch(
      updateAt(itemCursor.k("equippable"), entry.weapon ? true : undefined),
    );
    const attacks = (character.attacks ?? []).filter(
      (a) => a.id !== seededAttackId,
    );
    if (entry.weapon) {
      const attack = buildCatalogAttack(entry.weapon, plus);
      dispatch(updateAt(attacksCursor, attacks.concat(attack)));
      setSeededAttackId(attack.id);
    } else {
      if (seededAttackId) dispatch(updateAt(attacksCursor, attacks));
      setSeededAttackId(undefined);
    }
  };

  const pickEntry = (entry: EquipmentCatalogEntry) => {
    setPicked(entry);
    applyCatalogEntry(entry, bonus);
  };
  const changeBonus = (plus: number) => {
    setBonus(plus);
    if (picked) applyCatalogEntry(picked, plus);
  };

  // Typing in the type-ahead just renames the item; a picked entry's mechanics
  // stay (rename your +1 longsword freely) but the seeded-attack bookkeeping
  // keeps pointing at the same pick.
  const typeName = (name: string) =>
    setText({ title: name, titleFormulas: [] });

  // The default save copies only the equipment field out of the draft; when a
  // weapon pick seeded an Attack the draft differs on two fields, so persist
  // the whole draft as one edit instead.
  const save = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (seededAttackId) saveData(undefined, replaceCharacter(character));
    else saveData();
  };

  const titleSlot = isNew ? (
    <div className="row equipment-fields equipment-name-row">
      <label className="field equipment-name-field">
        <span className="field-label">Name</span>
        <CatalogNameInput
          value={textComponent.title}
          pickedName={picked?.name}
          onType={typeName}
          onPick={pickEntry}
        />
      </label>
      <label
        className="field"
        title="Magic bonus — applies to a built-in armor, shield, or weapon."
      >
        <span className="field-label">Bonus</span>
        <select
          value={bonus}
          onChange={(e) => changeBonus(Number(e.target.value))}
        >
          <option value={0}>—</option>
          <option value={1}>+1</option>
          <option value={2}>+2</option>
          <option value={3}>+3</option>
        </select>
      </label>
    </div>
  ) : undefined;

  return (
    <form
      className="edit-equipment column"
      onSubmit={(e) => e.preventDefault()}
      // The modal container's global Enter-saves shortcut would run the default
      // save and drop a seeded Attack; intercept it here and route through our
      // save. Same exclusions as the container: only plain text inputs submit.
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        if ((e.target as HTMLElement).tagName !== "INPUT") return;
        e.stopPropagation();
        save(e);
      }}
    >
      {isNew && (
        <p className="field-help">
          Pick a built-in item to prefill its stats — or type any name for a
          custom item.
        </p>
      )}

      <ControlledEditTextLine
        {...{
          textComponent,
          character,
          title: "Name & description",
          titleSlot,
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

      <button className="btn-primary edit-save" onClick={save}>
        Save
      </button>
    </form>
  );
}
