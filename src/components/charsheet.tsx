import { useEffect, useState } from "react";
import StatAndSkillPanel from "src/components/stat-and-skill-panel";
import { STANDARD_EDITABLE_FIELD_TYPES } from "src/lib/data/data-definitions";
import { FIELD, updateData } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { formatClass, traverse } from "src/lib/utils";
import BuildCustomFormula from "./build-custom-formula";
import CharacterInfoPanel from "./character-info-panel";
import DefenceAndEquipmentPanel from "./defence-and-equipment-panel";
import SingleValueDisplay from "./display/single-value-display";
import EditClassLevels from "./edit-class-levels";
import ModalContainer from "./modals/modal-container";
import UpdateField from "./update-field";

export default function CharSheet() {
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const {
    targetedField,
    popTargetedField,
    clearTargetedField,
    targetedFieldStackLength,
  } = useTargetedField();
  const [targetedFieldType, setTargetedFieldType] = useState("formula");
  const { dispatch } = useCharacter();

  useEffect(() => {
    if (targetedField) {
      setModalIsOpen(true);
      try {
        setTargetedFieldType(
          traverse(targetedField, STANDARD_EDITABLE_FIELD_TYPES)
        );
      } catch (e) {
        console.log(
          "Failed to traverse, TODO: short circuit on finding a formula"
        );
        setTargetedFieldType("formula");
      }
    } else {
      setModalIsOpen(false);
    }
  }, [targetedField]);

  const saveAndCloseModal = (data: any) => {
    if (targetedField) {
      dispatch(updateData(targetedField, data));
    }
    clearTargetedField();
  };

  const { character } = useCharacter();
  if (!character) return <></>;

  return (
    <div className="character-sheet-container">
      {modalIsOpen && (
        <ModalContainer
          back={targetedFieldStackLength > 1 ? popTargetedField : undefined}
          close={clearTargetedField}
        >
          {targetedFieldType === "formula" ? (
            <BuildCustomFormula onSubmit={saveAndCloseModal} />
          ) : targetedFieldType === "class" ? (
            <EditClassLevels onSubmit={saveAndCloseModal} />
          ) : (
            <UpdateField onSubmit={saveAndCloseModal} />
          )}
        </ModalContainer>
      )}
      <div className="header">
        {/* Name, level, background, race, alignment, exp */}
        <div className="row">
          <div className="rounded-border-box">
            <SingleValueDisplay
              field={FIELD.name}
              name={"Character Name"}
              vertical
              removeBorder
              editable
            />
          </div>
          <div className="column">
            <div className="row">
              <SingleValueDisplay
                field={FIELD.class}
                transform={formatClass}
                name={"Class & Level"}
                vertical
                editable
              />
              <SingleValueDisplay
                field={FIELD.background}
                name={"Background"}
                vertical
                editable
              />
              <SingleValueDisplay
                field={FIELD.playerName}
                name={"Player Name"}
                vertical
                editable
              />
            </div>
            <div className="row">
              <SingleValueDisplay
                field={FIELD.race}
                name={"Race"}
                vertical
                editable
              />
              <SingleValueDisplay
                field={FIELD.alignment}
                name={"Alignment"}
                vertical
                editable
              />
              <SingleValueDisplay
                field={FIELD.exp}
                transform={(exp) => exp || "N/A"}
                name={"Experience Points"}
                vertical
                editable
              />
            </div>
          </div>
        </div>
      </div>
      <div className="row">
        <StatAndSkillPanel />
        <DefenceAndEquipmentPanel />
        <CharacterInfoPanel />
      </div>
    </div>
  );
}
