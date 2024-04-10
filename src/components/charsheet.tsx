import { useEffect, useState } from "react";
import StatAndSkillPanel from "src/components/stat-and-skill-panel";
import {
  FIELD,
  STANDARD_EDITABLE_FIELD_TYPES,
  FieldTypeInfo,
  FieldTypeNode,
  OfficialClass,
  StatKey,
} from "src/lib/data/data-definitions";
import { updateData } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import {
  calculateCustomFormula,
  formatClass,
  traverse,
  OPTIONAL_FIELD_INITIALIZERS,
} from "src/lib/utils";
import BuildCustomFormula from "./build-custom-formula";
import CharacterInfoPanel from "./character-info-panel";
import DefenceAndEquipmentPanel from "./defence-and-equipment-panel";
import SingleValueDisplay from "./display/single-value-display";
import ModalContainer from "./modals/modal-container";
import UpdateField from "./update-field";
import EditTextLine from "./edit-text-line";
import EditHitDice from "./edit-hit-dice";
import EditAttack from "./edit-attack";
import BuildCustomFormulaWithDamage from "./build-custom-formula-with-damage";
import EditClassLevels from "./edit-class-levels";
import { SpellCastingClass } from "src/lib/types";
import { upperFirst } from "lodash";
import Spellcasting from "./spellcasting";
import EditSpell from "./edit-spell";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { FaCheck, FaSpinner, FaTriangleExclamation } from "react-icons/fa6";

export default function CharSheet() {
  const { saving, save } = useDatastore();
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const {
    targetedField,
    subField,
    popTargetedField,
    clearTargetedField,
    targetedFieldStackLength,
  } = useTargetedField();
  const [modalType, setModalType] = useState<FieldTypeNode>();
  const { unsavedChanges } = useCharacter();

  const saveIndicator = saving ? (
    <p>
      <FaSpinner /> Saving changes
    </p>
  ) : unsavedChanges ? (
    <p>
      <FaTriangleExclamation /> Unsaved changes
    </p>
  ) : (
    <p>
      <FaCheck /> Changes saved
    </p>
  );

  useEffect(() => {
    if (targetedField) {
      setModalIsOpen(true);
      const standardFieldType = STANDARD_EDITABLE_FIELD_TYPES[targetedField];
      if (!standardFieldType) throw new Error("Unsupported field type!");
      if (
        standardFieldType === "attack" &&
        (subField?.split(".")?.length || 0) > 1
      ) {
        if (
          subField?.split(".")[1] === "formula" &&
          subField?.split(".").length == 2
        ) {
          setModalType("formulaWithDamage");
        } else {
          setModalType("formula");
        }
      } else if (standardFieldType === "spellcastingClass") {
        switch (subField?.split(".")[1]) {
          case "class":
            setModalType("singleClass");
            return;
          case "abilityOverride":
            setModalType(StatKey);
            return;
          case "saveDcOverride":
          case "attackBonusOverride":
            setModalType("formula");
            return;
          default:
            throw new Error(
              "Unexpected subfield for spellcasting class" + subField
            );
        }
      } else if (
        (standardFieldType === "textLine" || standardFieldType === "spell") &&
        (subField || "").includes("Formulas")
      ) {
        console.log(
          "Working with textLine, subField info is",
          subField,
          "includes formulas?",
          (subField || "").includes("Formulas")
        );
        setModalType("formula");
      } else {
        setModalType(standardFieldType);
      }
    } else {
      setModalIsOpen(false);
    }
  }, [targetedField, subField]);

  const { character } = useCharacter();
  if (!character) return <></>;

  const saveCurrentCharacter = () => save(character);

  let modalContents = <></>;
  switch (modalType) {
    case undefined:
      break;
    case "formula":
      modalContents = <BuildCustomFormula />;
      break;
    case "formulaWithDamage":
      modalContents = <BuildCustomFormulaWithDamage />;
      break;
    case "multiClass":
      modalContents = <EditClassLevels />;
      break;
    case "textLine":
      modalContents = <EditTextLine />;
      break;
    case "hitDice":
      modalContents = <EditHitDice />;
      break;
    case "attack":
      modalContents = <EditAttack />;
      break;
    case "spell":
      modalContents = <EditSpell />;
      break;
    default:
      modalContents = (
        <UpdateField
          allowUndefined={
            targetedField && !!OPTIONAL_FIELD_INITIALIZERS[targetedField]
          }
          modalType={modalType}
        />
      );
  }
  return (
    <div className="character-sheet-container">
      {modalIsOpen && (
        <ModalContainer
          back={targetedFieldStackLength > 1 ? popTargetedField : undefined}
          close={clearTargetedField}
        >
          {modalContents}
        </ModalContainer>
      )}
      <div className="page-container">
        <div id="save-container">
          {saveIndicator}
          <button onClick={saveCurrentCharacter}>Force save</button>
        </div>
        <div className="header">
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
      <div className="page-container">
        <Spellcasting />
      </div>
    </div>
  );
}
