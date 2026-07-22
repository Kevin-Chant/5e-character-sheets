import { useEffect, useState } from "react";
import StatAndSkillPanel from "src/components/stat-and-skill-panel";
import {
  FIELD,
  STANDARD_EDITABLE_FIELD_TYPES,
  FieldTypeNode,
  StatKey,
} from "src/lib/data/data-definitions";
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
    if (targetedField) {
      setModalIsOpen(true);
      const standardFieldType = STANDARD_EDITABLE_FIELD_TYPES[targetedField];
      if (!standardFieldType) throw new Error("Unsupported field type!");
      if (standardFieldType === "attack" && subField === "new") {
        setModalType("selectWeapon");
      } else if (
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
              "Unexpected subfield for spellcasting class" + subField,
            );
        }
      } else if (
        targetedField === FIELD.proficiencies &&
        (subField || "").startsWith("skillBonuses")
      ) {
        // Per-skill bonus is a formula living under the (otherwise boolean)
        // proficiencies field — route it to the formula builder.
        setModalType("formula");
      } else if (
        targetedField === FIELD.proficiencies &&
        subField === "skills"
      ) {
        // The "Skills" heading opens the consolidated skills editor.
        setModalType("editSkills");
      } else if (standardFieldType === "otherProficiencies") {
        // languages/weapons are plain strings; armor is a checkbox set;
        // toolsAndOther are textLines (with formula sub-paths handled like
        // other textLine fields).
        const section = subField?.split(".")[0];
        if (section === "armor") {
          setModalType("armorProficiencies");
        } else if (section === "toolsAndOther") {
          setModalType(
            (subField || "").includes("Formulas") ? "formula" : "textLine",
          );
        } else {
          setModalType("string");
        }
      } else if (standardFieldType === "equipment") {
        // Formula sub-paths (name/description {{}} formulas) open the formula
        // builder; otherwise the item editor.
        setModalType(
          (subField || "").includes("Formulas") ? "formula" : "equipment",
        );
      } else if (standardFieldType === "limitedUseAbility") {
        // Formula sub-paths (info title/detail formulas, and the maxUses
        // formula itself) open the formula builder; otherwise the ability editor.
        const sf = subField || "";
        if (sf.includes("Formulas") || sf.endsWith("maxUses")) {
          setModalType("formula");
        } else {
          setModalType("limitedUseAbility");
        }
      } else if (
        standardFieldType === "spell" &&
        (subField || "").endsWith(".new")
      ) {
        // e.g. "cantrips.new" / "First.new": open the SRD spell browser rather
        // than an empty editor (mirrors the "attacks/new" → selectWeapon path).
        setModalType("selectSpell");
      } else if (
        (standardFieldType === "textLine" || standardFieldType === "spell") &&
        (subField || "").includes("Formulas")
      ) {
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
