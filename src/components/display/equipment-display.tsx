import classNames from "classnames";
import { FIELD, StatKey } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { useSettings } from "src/lib/hooks/use-settings";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, updateAt } from "src/lib/cursor";
import {
  carryingCapacityLb,
  encumberedThresholdLb,
  formatWeight,
  heavilyEncumberedThresholdLb,
  isEquippable,
  itemAbilityActive,
  totalEquipmentWeightLb,
} from "src/lib/rules";
import { EquipmentItem, isTextComponentWithDetail } from "src/lib/types";
import ComponentWithPopover from "./component-with-popover";
import TextWithFormulasDisplay from "./text-with-formulas-display";
import StepperInput from "../stepper-input";
import { FaPencil, FaXmark } from "react-icons/fa6";

// The Equipment section. Each row is a structured `EquipmentItem` — a free-text
// name/description (with popover detail) plus its mechanical fields: an equipped
// toggle (worn/wielded state, which drives AC and stays live in play), a
// quantity, and, when the `trackEncumbrance` setting is on, a per-stack weight
// with a carrying-capacity readout. Attunement lives in its own sub-section
// (`AttunementDisplay`); name, description, quantity, weight and the armor
// mechanics are edited in the item modal.
export default function EquipmentDisplay() {
  const { character, dispatch } = useLoadedCharacter();
  const { editMode } = useEditMode();
  const { pushCursor, pushTargetedField } = useTargetedField();
  const {
    settings: { trackEncumbrance, weightUnit },
  } = useSettings();

  const equipment = character.equipment;
  const path = charPath(FIELD.equipment);

  const strScore = character.stats[StatKey.str];
  const totalWeightLb = totalEquipmentWeightLb(equipment);
  const capacityLb = carryingCapacityLb(strScore);
  const overCapacity = totalWeightLb > capacityLb;
  const encumbrance = totalWeightLb
    ? totalWeightLb > heavilyEncumberedThresholdLb(strScore)
      ? "heavily encumbered"
      : totalWeightLb > encumberedThresholdLb(strScore)
        ? "encumbered"
        : undefined
    : undefined;

  // Equipping is what puts an item's mechanics in play: armor starts counting
  // toward AC via the `equippedArmor` leaf, and a weapon's attack row appears in
  // the Attacks section. The item owns the attack — equipping copies it into
  // `attacks`, unequipping parks the live row (with any edits made to it) back
  // on the item and removes it, same id both ways so ammunition links survive.
  const setEquipped = (index: number, equipped: boolean) => {
    const item = equipment[index];
    const weaponAttack = item.weapon?.attack;
    if (weaponAttack) {
      const attacks = character.attacks;
      if (equipped) {
        if (!attacks.some((a) => a.id === weaponAttack.id))
          dispatch(
            updateAt(charPath(FIELD.attacks), attacks.concat(weaponAttack)),
          );
      } else {
        const live = attacks.find((a) => a.id === weaponAttack.id);
        if (live) {
          dispatch(updateAt(path.at(index).k("weapon"), { attack: live }));
          dispatch(
            updateAt(
              charPath(FIELD.attacks),
              attacks.filter((a) => a.id !== live.id),
            ),
          );
        }
      }
    }
    // An item-granted ability follows the same park/copy contract as the
    // attack, gated on the item being fully active (equipped AND attuned where
    // each applies) rather than on `equipped` alone.
    const itemAbility = item.ability;
    if (itemAbility?.id) {
      const abilities = character.limitedUseAbilities;
      const live = abilities.find((a) => a.id === itemAbility.id);
      if (itemAbilityActive({ ...item, equipped })) {
        if (!live)
          dispatch(
            updateAt(
              charPath(FIELD.limitedUseAbilities),
              abilities.concat(itemAbility),
            ),
          );
      } else if (live) {
        dispatch(updateAt(path.at(index).k("ability"), live));
        dispatch(
          updateAt(
            charPath(FIELD.limitedUseAbilities),
            abilities.filter((a) => a.id !== live.id),
          ),
        );
      }
    }
    dispatch(updateAt(path.at(index).k("equipped"), equipped));
  };

  const removeItem = (index: number) => {
    // A removed weapon takes its attack row with it — the item owns the attack.
    const weaponAttack = equipment[index].weapon?.attack;
    if (weaponAttack)
      dispatch(
        updateAt(
          charPath(FIELD.attacks),
          character.attacks.filter((a) => a.id !== weaponAttack.id),
        ),
      );
    // Likewise a removed item takes its granted ability's live row with it.
    const abilityId = equipment[index].ability?.id;
    if (abilityId)
      dispatch(
        updateAt(
          charPath(FIELD.limitedUseAbilities),
          character.limitedUseAbilities.filter((a) => a.id !== abilityId),
        ),
      );
    const next = structuredClone(equipment);
    next.splice(index, 1);
    dispatch(updateAt(path, next));
  };

  const setQuantity = (index: number, value: number) =>
    dispatch(updateAt(path.at(index).k("quantity"), Math.max(0, value || 0)));

  const stackWeight = (item: EquipmentItem) =>
    (item.weight ?? 0) * (item.quantity ?? 1);

  return (
    <div className="column equipment-subsection equipment-section">
      {equipment.map((item, index) => {
        const name = isTextComponentWithDetail(item.text) ? (
          <ComponentWithPopover
            componentClass="detail-hint"
            componentChildren={
              <TextWithFormulasDisplay
                templateString={item.text.title}
                formulas={item.text.titleFormulas}
              />
            }
            popoverChildren={
              <TextWithFormulasDisplay
                templateString={item.text.detail}
                formulas={item.text.detailFormulas}
              />
            }
          />
        ) : (
          <TextWithFormulasDisplay
            templateString={item.text.title}
            formulas={item.text.titleFormulas}
          />
        );

        return (
          <div className="row space-between equipment-row" key={item.id}>
            <span className="flex equipment-name">
              {isEquippable(item) ? (
                <button
                  type="button"
                  className={classNames("equip-toggle", {
                    on: item.equipped,
                  })}
                  aria-pressed={item.equipped}
                  aria-label={
                    item.equipped
                      ? `${item.text.title} — equipped`
                      : `${item.text.title} — not equipped`
                  }
                  title={
                    item.equipped
                      ? "Equipped (worn or wielded)"
                      : "Not equipped — click to equip"
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    setEquipped(index, !item.equipped);
                  }}
                />
              ) : (
                <span className="equip-spacer" aria-hidden="true" />
              )}
              {editMode ? (
                <button
                  className="equipment-name-edit"
                  aria-label={`Edit ${item.text.title}`}
                  onClick={(e) => {
                    e.preventDefault();
                    pushCursor(path.at(index));
                  }}
                >
                  {name}
                  <FaPencil />
                </button>
              ) : (
                <span
                  className={classNames("equipment-name-text", {
                    unequipped: isEquippable(item) && !item.equipped,
                  })}
                >
                  {name}
                </span>
              )}
            </span>
            <span className="flex equipment-controls">
              {editMode ? (
                <StepperInput
                  value={item.quantity}
                  min={0}
                  ariaLabel={`${item.text.title} quantity`}
                  onChange={(value) => setQuantity(index, value)}
                />
              ) : (
                item.quantity !== 1 && (
                  <span className="equipment-quantity-display">
                    ×{item.quantity}
                  </span>
                )
              )}
              {trackEncumbrance && item.weight !== undefined && (
                <span className="equipment-weight">
                  {formatWeight(stackWeight(item), weightUnit)}
                </span>
              )}
              {editMode && (
                <button
                  className="row-remove"
                  aria-label={`Remove ${item.text.title}`}
                  onClick={(e) => {
                    e.preventDefault();
                    removeItem(index);
                  }}
                >
                  <FaXmark />
                </button>
              )}
            </span>
          </div>
        );
      })}

      <div className="row space-between equipment-subheading">
        <span className="section-heading-with-add">
          <b className="section-heading">Equipment</b>
          {editMode && (
            <button
              className="add-btn"
              aria-label="Add equipment"
              onClick={(e) => {
                e.preventDefault();
                pushTargetedField(FIELD.equipment, "new");
              }}
            >
              +
            </button>
          )}
        </span>
        {trackEncumbrance && (
          <span
            className={classNames("equipment-encumbrance", {
              over: overCapacity,
            })}
            title={
              encumbrance
                ? `You are ${encumbrance}`
                : `Carrying capacity ${formatWeight(capacityLb, weightUnit)}`
            }
          >
            {formatWeight(totalWeightLb, weightUnit)} /{" "}
            {formatWeight(capacityLb, weightUnit)}
            {encumbrance && (
              <span className="equipment-encumbrance-tag">!</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
