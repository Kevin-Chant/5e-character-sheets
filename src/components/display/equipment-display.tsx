import { FIELD, StatKey } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { useSettings } from "src/lib/hooks/use-settings";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, updateAt } from "src/lib/cursor";
import { calculateCustomFormula } from "src/lib/formula";
import {
  DEFAULT_ATTUNEMENT_SLOTS,
  carryingCapacityLb,
  countAttunedItems,
  encumberedThresholdLb,
  formatWeight,
  heavilyEncumberedThresholdLb,
  totalEquipmentWeightLb,
} from "src/lib/rules";
import { EquipmentItem, isTextComponentWithDetail } from "src/lib/types";
import ComponentWithPopover from "./component-with-popover";
import TextWithFormulasDisplay from "./text-with-formulas-display";
import { FaPencil } from "react-icons/fa6";

// The Equipment section. Each row is a structured `EquipmentItem` — a free-text
// name/description (with popover detail) plus the mechanical fields the sheet
// acts on: an attunement checkbox (counted against the slot cap, editable in
// play since you attune during a rest) and, when the `trackEncumbrance` setting
// is on, a per-stack weight and a carrying-capacity readout. Names/descriptions,
// quantity, weight, equipped and the requires-attunement flag are all edited in
// the modal (edit mode); attunement is the one toggle live in play mode.
export default function EquipmentDisplay() {
  const { character, dispatch } = useCharacter();
  const { editMode } = useEditMode();
  const { pushCursor, pushTargetedField } = useTargetedField();
  const {
    settings: { trackEncumbrance, weightUnit },
  } = useSettings();
  if (!character) return <></>;

  const equipment = character.equipment;
  const path = charPath(FIELD.equipment);

  // Standard 3 slots unless the character overrides it (Artificer). Evaluated
  // here rather than in rules.ts to avoid a rules→formula import cycle.
  const attunementCap = character.attunementSlots
    ? calculateCustomFormula(character.attunementSlots, character)
    : DEFAULT_ATTUNEMENT_SLOTS;
  const attunedCount = countAttunedItems(equipment);
  const atAttunementCap = attunedCount >= attunementCap;

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

  // Replace the whole `attunement` object (rather than its `attuned` leaf) so the
  // optional-field cursor type-checks; only rendered when attunement is present.
  const setAttuned = (index: number, attuned: boolean) =>
    dispatch(updateAt(path.at(index).k("attunement"), { attuned }));

  const removeItem = (index: number) => {
    const next = structuredClone(equipment);
    next.splice(index, 1);
    dispatch(updateAt(path, next));
  };

  const setQuantity = (index: number, value: number) =>
    dispatch(updateAt(path.at(index).k("quantity"), Math.max(0, value || 0)));

  const stackWeight = (item: EquipmentItem) =>
    (item.weight ?? 0) * (item.quantity ?? 1);

  return (
    <div className="column equipment-section">
      {equipment.map((item, index) => {
        const requiresAttunement = item.attunement !== undefined;
        const attuned = !!item.attunement?.attuned;
        const name = isTextComponentWithDetail(item.text) ? (
          <ComponentWithPopover
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
                name
              )}
              {item.equipped && (
                <span className="equipment-tag" title="Equipped">
                  equipped
                </span>
              )}
            </span>
            <span className="flex equipment-controls">
              {requiresAttunement && (
                <label
                  className="equipment-attune"
                  title={
                    atAttunementCap && !attuned
                      ? "No attunement slots left"
                      : "Attuned"
                  }
                >
                  <input
                    type="checkbox"
                    checked={attuned}
                    disabled={atAttunementCap && !attuned}
                    onChange={(e) => setAttuned(index, e.target.checked)}
                  />
                  <span className="equipment-attune-icon">A</span>
                </label>
              )}
              {editMode ? (
                <input
                  type="number"
                  className="equipment-quantity"
                  value={item.quantity}
                  min={0}
                  aria-label="Quantity"
                  onChange={(e) => setQuantity(index, Number(e.target.value))}
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
                  aria-label={`Remove ${item.text.title}`}
                  onClick={(e) => {
                    e.preventDefault();
                    removeItem(index);
                  }}
                >
                  x
                </button>
              )}
            </span>
          </div>
        );
      })}

      <div className="row space-between equipment-summary">
        <span
          className={
            atAttunementCap
              ? "equipment-attunement full"
              : "equipment-attunement"
          }
          role={editMode ? "button" : undefined}
          onClick={
            editMode
              ? (e) => {
                  e.preventDefault();
                  pushTargetedField(FIELD.attunementSlots);
                }
              : undefined
          }
          title={
            editMode ? "Edit attunement slots" : "Items requiring attunement"
          }
        >
          Attuned {attunedCount} / {attunementCap}
        </span>
        {trackEncumbrance && (
          <span
            className={
              overCapacity
                ? "equipment-encumbrance over"
                : "equipment-encumbrance"
            }
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

      <b className="pos-relative margin-large">
        Equipment
        {editMode && (
          <button
            className="equipment-add"
            aria-label="Add equipment"
            style={{
              position: "absolute",
              top: "-50%",
              right: "0px",
              transform: "translate(150%, 0%)",
            }}
            onClick={(e) => {
              e.preventDefault();
              pushTargetedField(FIELD.equipment, "new");
            }}
          >
            +
          </button>
        )}
      </b>
    </div>
  );
}
