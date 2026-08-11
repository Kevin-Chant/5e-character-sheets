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

// The Equipment section: each row is an EquipmentItem with an equipped toggle
// (drives AC), quantity, and (if trackEncumbrance is on) weight. Attunement is
// its own sub-section (AttunementDisplay); item fields are edited in the modal.
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

  // Equipping copies a weapon's attack into `attacks`; unequipping parks the
  // live row (with its edits) back on the item and removes it. Same id both
  // ways so ammunition links survive.
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
    // Same park/copy contract for a granted ability, gated on itemAbilityActive
    // (equipped AND attuned where each applies), not on `equipped` alone.
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
    // A removed weapon takes its attack row with it.
    const weaponAttack = equipment[index].weapon?.attack;
    if (weaponAttack)
      dispatch(
        updateAt(
          charPath(FIELD.attacks),
          character.attacks.filter((a) => a.id !== weaponAttack.id),
        ),
      );
    // A removed item takes its granted ability's live row with it too.
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
