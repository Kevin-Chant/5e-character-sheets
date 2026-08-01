import { useEffect, useState } from "react";
import { ArmorCategory, FIELD } from "src/lib/data/data-definitions";
import { randomUUID } from "src/lib/browser";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import {
  ArmorMechanics,
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
// armor/shield prefills its AC mechanics and weight, and picking a weapon
// stores a ready-to-roll Attack *on the item* (`item.weapon`). The item is the
// source of truth for what fights: its attack sits in the Attacks section only
// while the item is equipped (see `EquipmentDisplay.setEquipped`), the same way
// armor only counts toward AC while worn. A weapon pick starts equipped, so the
// attack row appears the moment the item saves.
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

  // The catalog entry the type-ahead picked (new items only) and the +N magic
  // bonus applied to it — kept so a bonus change re-applies the same pick.
  const [picked, setPicked] = useState<EquipmentCatalogEntry>();
  const [bonus, setBonus] = useState(0);

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
  // Armor, shield and weapon items are inherently equippable (their mechanics
  // only apply while equipped), so the "can be equipped" flag is forced on and
  // locked for them.
  const isGear = !!item.armor || !!item.shield || !!item.weapon;
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
  // either changes, so it always writes the full picture — name, weight, and
  // exactly one of the armor/shield/weapon mechanics — replacing whatever a
  // previous pick wrote.
  const applyCatalogEntry = (entry: EquipmentCatalogEntry, plus: number) => {
    setText({ title: catalogItemName(entry, plus), titleFormulas: [] });
    dispatch(updateAt(itemCursor.k("weight"), entry.weight));

    dispatch(
      updateAt(
        itemCursor.k("armor"),
        entry.armor ? armorWithBonus(entry.armor, plus) : undefined,
      ),
    );
    dispatch(
      updateAt(
        itemCursor.k("shield"),
        entry.shield ? shieldWithBonus(entry.shield, plus) : undefined,
      ),
    );
    // The weapon's attack lives on the item, and a fresh weapon starts
    // equipped — you picked it to fight with it — so its attack row appears as
    // soon as the item saves (see `save` below). Armor keeps the unequipped
    // default: worn gear changes AC, so donning it is the deliberate act.
    dispatch(
      updateAt(
        itemCursor.k("weapon"),
        entry.weapon
          ? { attack: buildCatalogAttack(entry.weapon, plus) }
          : undefined,
      ),
    );
    dispatch(updateAt(itemCursor.k("equipped"), !!entry.weapon));
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
  // stay (rename your +1 longsword freely).
  const typeName = (name: string) =>
    setText({ title: name, titleFormulas: [] });

  // Saving an *equipped* weapon must also put its attack row in `attacks` —
  // that pairing is the invariant the sheet's equip toggle maintains, and the
  // default save copies only the equipment field. Build the final state here
  // and persist it as one edit.
  const save = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    const weaponAttack = item.weapon?.attack;
    if (
      weaponAttack &&
      item.equipped &&
      !character.attacks.some((a) => a.id === weaponAttack.id)
    ) {
      saveData(
        undefined,
        replaceCharacter({
          ...character,
          attacks: character.attacks.concat(weaponAttack),
        }),
      );
    } else {
      saveData();
    }
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
      // The modal container's global Enter-saves shortcut runs the default save,
      // which would persist an equipped weapon without its attack row; intercept
      // and route through our save. Same exclusion set as the container: only
      // plain text inputs submit on Enter.
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
          only whether those toggles apply. Armor, shields and weapons are
          always equippable, so the flag is forced on and locked for them. */}
      <label
        className="settings-checkbox"
        title={
          isGear
            ? "Armor, shields and weapons are always equippable."
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
