import { useEffect, useState } from "react";
import { ArmorCategory, FIELD } from "src/lib/data/data-definitions";
import { randomUUID } from "src/lib/browser";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import {
  ArmorMechanics,
  CustomFormula,
  EquipmentItem,
  LimitedUseAbility,
  TextComponentWithDetails,
  isTextComponent,
} from "src/lib/types";
import { UUID } from "crypto";
import { useSettings } from "src/lib/hooks/use-settings";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { replaceCharacter } from "src/lib/hooks/reducers/actions";
import { useSave } from "./modals/modal-container";
import { fromStack, updateAt } from "src/lib/cursor";
import {
  isEquippable,
  itemAbilityActive,
  weightInUnit,
  weightToLb,
} from "src/lib/rules";
import { newLimitedUseAbility } from "src/lib/data/default-data";
import { PoolMetaFields } from "./edit-limited-use-ability";
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
import Select from "src/components/select";

// Default DEX contribution for a freshly-picked category; overridable after selection.
const DEFAULT_DEX: Record<ArmorCategory, ArmorMechanics["dex"]> = {
  light: "full",
  medium: "capped",
  heavy: "none",
};

// Type-ahead over the built-in catalog that doubles as the plain name input.
// Enter on an exact catalog match picks it instead of saving the modal.
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
// item) or a numeric index (edit that item). A weapon pick stores a
// ready-to-roll Attack on the item (`item.weapon`); its row sits in the
// Attacks section only while the item is equipped (see
// `EquipmentDisplay.setEquipped`), the same way armor only counts toward AC
// while worn.
export default function EditEquipmentItem() {
  const { character, dispatch } = useLoadedCharacter();
  const { targetedField, subField, pushCursor } = useTargetedField();
  const { saveData } = useSave();
  const {
    settings: { trackEncumbrance, weightUnit },
  } = useSettings();

  const isEquipmentTarget =
    !!character && targetedField === FIELD.equipment && subField !== undefined;

  // Append index captured once at mount; recomputing `equipment.length` each
  // render would chase the list after the seed lands and re-seed forever.
  const equipment: EquipmentItem[] = character?.equipment ?? [];
  const [newIndex] = useState(equipment.length);
  const isNew = subField === "new";
  const index = isNew ? newIndex : Number(subField);
  const item: EquipmentItem | undefined = equipment[index];

  // Catalog entry the type-ahead picked (new items only) and the +N magic
  // bonus applied to it, so a bonus change re-applies the same pick.
  const [picked, setPicked] = useState<EquipmentCatalogEntry>();
  const [bonus, setBonus] = useState(0);

  // Ability ids removed this session (the "grants an ability" box was
  // unchecked); their live Limited-Use rows are dropped on save.
  const [droppedAbilityIds, setDroppedAbilityIds] = useState<UUID[]>([]);

  // Seed a blank item into the modal draft when there's nothing at the target
  // index yet. Concat-replace keeps the effect idempotent under StrictMode's
  // double-invoked effects.
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
  // `detailFormulas` lives only on the with-details TextComponent variant.
  const textDetail = fromStack<TextComponentWithDetails>(
    FIELD.equipment,
    `${index}.text`,
  );

  const setText = (patch: Partial<TextComponentWithDetails>) =>
    dispatch(updateAt(itemCursor.k("text"), { ...textComponent, ...patch }));

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

  // Unchecking deletes: remember the id so `save` can drop any live row the
  // ability had in the Limited-Use list.
  const setGrantsAbility = (granted: boolean) => {
    if (granted) {
      dispatch(
        updateAt(itemCursor.k("ability"), {
          ...newLimitedUseAbility(),
          id: randomUUID() as UUID,
          info: {
            title: item.text.title || "New ability",
            titleFormulas: [],
          },
          recharge: "Dawn",
        } satisfies LimitedUseAbility),
      );
    } else {
      if (item.ability?.id)
        setDroppedAbilityIds((ids) => ids.concat(item.ability!.id!));
      dispatch(updateAt(itemCursor.k("ability"), undefined));
    }
  };
  const setAbilityTitle = (title: string) => {
    if (item.ability)
      dispatch(
        updateAt(itemCursor.k("ability").k("info"), {
          ...item.ability.info,
          title,
        }),
      );
  };

  // Armor, shield and weapon items are inherently equippable, so the "can be
  // equipped" flag is forced on and locked for them.
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

  // Writes the full picture — name, weight, and exactly one of the
  // armor/shield/weapon mechanics — replacing whatever a previous pick wrote.
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
    // A fresh weapon starts equipped, so its attack row appears as soon as
    // the item saves (see `save` below); armor keeps the unequipped default.
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

  // Typing just renames the item; a picked entry's mechanics stay.
  const typeName = (name: string) =>
    setText({ title: name, titleFormulas: [] });

  // Saving an equipped weapon must also put its attack row in `attacks`, and
  // an active item ability must put (or refresh) its row in the Limited-Use
  // list; the default save copies only the equipment field.
  const save = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    let attacks = character.attacks;
    const weaponAttack = item.weapon?.attack;
    if (
      weaponAttack &&
      item.equipped &&
      !attacks.some((a) => a.id === weaponAttack.id)
    ) {
      attacks = attacks.concat(weaponAttack);
    }

    let abilities = character.limitedUseAbilities;
    const ability = item.ability;
    if (ability?.id && itemAbilityActive(item)) {
      const live = abilities.find((a) => a.id === ability.id);
      // Refresh a live row with the modal's edits but keep its play state —
      // a rename shouldn't refill the pool.
      abilities = live
        ? abilities.map((a) =>
            a.id === ability.id
              ? {
                  ...ability,
                  expended: live.expended,
                  daysUntilRecharge: live.daysUntilRecharge,
                }
              : a,
          )
        : abilities.concat(ability);
    } else if (ability?.id) {
      // Ability exists but isn't active (e.g. attunement just made required).
      abilities = abilities.filter((a) => a.id !== ability.id);
    }
    if (droppedAbilityIds.length > 0)
      abilities = abilities.filter(
        (a) => !a.id || !droppedAbilityIds.includes(a.id),
      );

    if (
      attacks !== character.attacks ||
      abilities !== character.limitedUseAbilities
    ) {
      saveData(
        undefined,
        replaceCharacter({
          ...character,
          attacks,
          limitedUseAbilities: abilities,
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
      <div
        className="field"
        title="Magic bonus — applies to a built-in armor, shield, or weapon."
      >
        <span className="field-label">Bonus</span>
        <Select
          label="Magic bonus"
          value={String(bonus)}
          options={[
            { value: "0", label: "—" },
            { value: "1", label: "+1" },
            { value: "2", label: "+2" },
            { value: "3", label: "+3" },
          ]}
          onChange={(value) => changeBonus(Number(value))}
        />
      </div>
    </div>
  ) : undefined;

  return (
    <form
      className="edit-equipment column"
      onSubmit={(e) => e.preventDefault()}
      // Intercept the modal container's Enter-saves shortcut and route through
      // our save, which also writes the attack row. Same exclusion set as the
      // container: only plain text inputs submit on Enter.
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
          <div className="field">
            <span className="field-label">Type</span>
            <Select
              label="Armor type"
              value={gearType}
              options={[
                { value: "none", label: "Not armor" },
                { value: "light", label: "Light armor" },
                { value: "medium", label: "Medium armor" },
                { value: "heavy", label: "Heavy armor" },
                { value: "shield", label: "Shield" },
              ]}
              onChange={setGearType}
            />
          </div>
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
            <div className="field">
              <span className="field-label">DEX to AC</span>
              <Select
                label="How DEX applies to AC"
                value={item.armor.dex}
                options={[
                  { value: "full", label: "Full DEX" },
                  { value: "capped", label: "Capped" },
                  { value: "none", label: "No DEX" },
                ]}
                onChange={(value) =>
                  updateArmor({
                    dex: value as ArmorMechanics["dex"],
                    ...(value === "capped"
                      ? { dexCap: item.armor?.dexCap ?? 2 }
                      : {}),
                  })
                }
              />
            </div>
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

      {/* Shows in Limited-Use Abilities while the item is active (equipped
          and/or attuned) and leaves with it. Fine-grained editing happens on
          the live row's own editor once it's on the sheet. */}
      <fieldset className="equipment-ability">
        <legend className="field-label">
          Limited-use ability (magic items)
        </legend>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={!!item.ability}
            onChange={(e) => setGrantsAbility(e.target.checked)}
          />
          This item grants a limited-use ability
        </label>
        {item.ability && (
          <>
            <label className="field">
              <span className="field-label">Ability name</span>
              <input
                type="text"
                value={item.ability.info.title}
                onChange={(e) => setAbilityTitle(e.target.value)}
              />
            </label>
            <PoolMetaFields
              ability={item.ability}
              cursor={itemCursor.k("ability")}
            />
            <p className="field-help">
              Shown under Limited-Use Abilities while this item is{" "}
              {item.attunement !== undefined && isEquippable(item)
                ? "equipped and attuned"
                : item.attunement !== undefined
                  ? "attuned"
                  : isEquippable(item)
                    ? "equipped"
                    : "carried"}
              .
            </p>
          </>
        )}
      </fieldset>

      {/* Whether it's currently equipped/attuned is a toggle on the sheet
          row; here we set only whether those toggles apply. */}
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
