import { useEffect, useState } from "react";
import StatAndSkillPanel from "src/components/stat-and-skill-panel";
import { FIELD, FieldTypeNode } from "src/lib/data/data-definitions";
import { resolveModalType } from "src/lib/modal-routing";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { formatClass } from "src/lib/utils";
import { OPTIONAL_FIELD_INITIALIZERS } from "src/lib/rules";
import BuildCustomFormula from "./build-custom-formula";
import CharacterInfoPanel from "./character-info-panel";
import DefenceAndEquipmentPanel from "./defence-and-equipment-panel";
import SingleValueDisplay from "./display/single-value-display";
import ModalContainer from "./modals/modal-container";
import UpdateField from "./update-field";
import EditTextLine from "./edit-text-line";
import EditArmorProficiencies from "./edit-armor-proficiencies";
import EditHitDice from "./edit-hit-dice";
import EditAttack from "./edit-attack";
import AddAttack from "./add-attack";
import AddSpellFromSrd from "./add-spell-from-srd";
import RollModal from "./roll-modal";
import { RollerProvider } from "src/lib/hooks/use-roller";
import BuildCustomFormulaWithDamage from "./build-custom-formula-with-damage";
import EditClassLevels from "./edit-class-levels";
import Spellcasting from "./spellcasting";
import EditSpell from "./edit-spell";
import EditLimitedUseAbility from "./edit-limited-use-ability";
import EditChosenOptions from "./edit-chosen-options";
import EditSkills from "./edit-skills";
import EditRace from "./edit-race";
import EditSpeeds from "./edit-speeds";
import EditSenses from "./edit-senses";
import EditAmmunition from "./edit-ammunition";
import EditEquipmentItem from "./edit-equipment-item";
import PresenceBroadcaster from "./presence-broadcaster";
import DriveLiveSessionBootstrap from "./drive-live-session-bootstrap";
import SharePresenceWarning from "./share-presence-warning";
import { FaAnglesUp } from "react-icons/fa6";
import { useLevelUp } from "src/lib/hooks/use-level-up";

export default function CharSheet() {
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const {
    targetedField,
    subField,
    popTargetedField,
    clearTargetedField,
    targetedFieldStackLength,
  } = useTargetedField();
  const { openLevelUp } = useLevelUp();
  const [modalType, setModalType] = useState<FieldTypeNode>();

  useEffect(() => {
    if (!targetedField) {
      setModalIsOpen(false);
      return;
    }
    setModalIsOpen(true);
    // Which editor a field + sub-path opens is a pure decision, and lives in
    // `modal-routing.ts` with a test per rule. This effect only has to open the
    // modal; the switch below maps the answer to a component.
    setModalType(resolveModalType(targetedField, subField));
  }, [targetedField, subField]);

  const { character } = useCharacter();
  if (!character) return <></>;

  let modalContents = <></>;
  let modalTitle: string | undefined;
  switch (modalType) {
    case undefined:
      break;
    // The effect always remaps "otherProficiencies" to a concrete modal type.
    case "otherProficiencies":
      break;
    case "formula":
      modalContents = <BuildCustomFormula />;
      modalTitle = "Formula Builder";
      break;
    case "formulaWithDamage":
      modalContents = <BuildCustomFormulaWithDamage />;
      modalTitle = "Formula Builder with Damage Types";
      break;
    case "multiClass":
      modalContents = <EditClassLevels />;
      modalTitle = "Class and Levels";
      break;
    case "textLine":
      modalContents = <EditTextLine />;
      modalTitle = "Update Text Section";
      break;
    case "armorProficiencies":
      modalContents = <EditArmorProficiencies />;
      modalTitle = "Armor Proficiencies";
      break;
    case "hitDice":
      modalContents = <EditHitDice />;
      modalTitle = "Override Hit Dice";
      break;
    case "attack":
      modalContents = <EditAttack />;
      modalTitle = "Edit Attack";
      break;
    case "selectWeapon":
      modalContents = <AddAttack />;
      modalTitle = "Add Weapon Attack";
      break;
    case "spell":
      modalContents = <EditSpell />;
      modalTitle = "Edit Spell";
      break;
    case "selectSpell":
      modalContents = <AddSpellFromSrd />;
      modalTitle = "Add Spell from SRD";
      break;
    case "limitedUseAbility":
      modalContents = <EditLimitedUseAbility />;
      modalTitle = "Edit Ability";
      break;
    case "chosenOptions":
      modalContents = <EditChosenOptions />;
      modalTitle = "Class Options";
      break;
    case "editSkills":
      modalContents = <EditSkills />;
      modalTitle = "Edit Skills";
      break;
    case "race":
      modalContents = <EditRace />;
      modalTitle = "Edit Race";
      break;
    case "speeds":
      modalContents = <EditSpeeds />;
      modalTitle = "Edit Speeds";
      break;
    case "senses":
      modalContents = <EditSenses />;
      modalTitle = subField === "new" ? "Add Sense" : "Edit Sense";
      break;
    case "ammunition":
      modalContents = <EditAmmunition />;
      modalTitle = subField === "new" ? "Add Ammunition" : "Edit Ammunition";
      break;
    case "equipment":
      modalContents = <EditEquipmentItem />;
      modalTitle = subField === "new" ? "Add Item" : "Edit Item";
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
    <RollerProvider>
      <div className="character-sheet-container">
        <PresenceBroadcaster />
        <DriveLiveSessionBootstrap />
        <RollModal />
        {modalIsOpen && (
          <ModalContainer
            back={targetedFieldStackLength > 1 ? popTargetedField : undefined}
            close={clearTargetedField}
            title={modalTitle}
          >
            {modalContents}
          </ModalContainer>
        )}
        <div className="page-container">
          <SharePresenceWarning />
          <div className="character-info-header">
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
                    compact={formatClass(character.class).length > 25}
                    cornerAction={
                      <button
                        type="button"
                        className="icon-btn level-up-btn"
                        onClick={openLevelUp}
                        title="Level up this character"
                        aria-label="Level up this character"
                      >
                        <FaAnglesUp />
                      </button>
                    }
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
                    transform={(race) =>
                      race.subrace
                        ? `${race.name} (${race.subrace})`
                        : race.name
                    }
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
    </RollerProvider>
  );
}
