import { FaPencil } from "react-icons/fa6";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { ArmorType, FIELD } from "src/lib/data/data-definitions";
import { isTextComponentWithDetail } from "src/lib/types";
import { charPath, updateAt } from "src/lib/cursor";
import ComponentWithPopover from "./component-with-popover";
import TextWithFormulasDisplay from "./text-with-formulas-display";

const OTHER_PROFS = charPath(FIELD.otherProficiencies);

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="prof-add"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      +
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="prof-chip-remove"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      ×
    </button>
  );
}

// Languages and weapons are plain string lists rendered as an inline, comma-
// separated row of editable chips with an add button, mirroring the printed
// sheet while keeping per-entry editing.
function StringListCell({ subField }: { subField: "languages" | "weapons" }) {
  const { character, dispatch } = useCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();
  if (!character) return <></>;

  const list = OTHER_PROFS.k(subField);
  const items = character.otherProficiencies[subField];

  // Open the editor at the next (empty) index rather than pre-inserting a
  // placeholder, so the typeahead starts blank and shows every suggestion.
  const add = () => pushCursor(list.at(items.length));
  const remove = (index: number) => {
    const next = items.slice();
    next.splice(index, 1);
    dispatch(updateAt(list, next));
  };

  return (
    <div className="prof-values">
      {items.map((item, i) => (
        <span key={i} className="prof-chip">
          <button
            className="prof-chip-label"
            onClick={(e) => {
              e.preventDefault();
              pushCursor(list.at(i));
            }}
          >
            {item}
            {i < items.length - 1 ? "," : ""}
          </button>
          {editMode && <RemoveButton onClick={() => remove(i)} />}
        </span>
      ))}
      {editMode && <AddButton onClick={add} />}
    </div>
  );
}

// Tools & Other keep the rich TextComponent shape: detail is shown in a hover
// popover, editing opens the full text-line modal.
function ToolsCell() {
  const { character, dispatch } = useCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();
  if (!character) return <></>;

  const list = OTHER_PROFS.k("toolsAndOther");
  const items = character.otherProficiencies.toolsAndOther;
  // Open the editor at the next (empty) index; the entry is only persisted when
  // the user saves, so no placeholder is written up-front.
  const add = () => pushCursor(list.at(items.length));
  const remove = (index: number) => {
    const next = structuredClone(items);
    next.splice(index, 1);
    dispatch(updateAt(list, next));
  };

  return (
    <div className="prof-values">
      {items.map((item, i) => {
        const title = (
          <button
            className="prof-chip-label"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              pushCursor(list.at(i));
            }}
          >
            <TextWithFormulasDisplay
              templateString={item.title}
              formulas={item.titleFormulas}
            />
            {i < items.length - 1 ? "," : ""}
          </button>
        );
        return (
          <span key={i} className="prof-chip">
            {isTextComponentWithDetail(item) ? (
              <ComponentWithPopover
                componentClass="prof-chip-popover"
                componentChildren={title}
                popoverChildren={
                  <TextWithFormulasDisplay
                    templateString={item.detail}
                    formulas={item.detailFormulas}
                  />
                }
              />
            ) : (
              title
            )}
            {editMode && <RemoveButton onClick={() => remove(i)} />}
          </span>
        );
      })}
      {editMode && <AddButton onClick={add} />}
    </div>
  );
}

// Armor rarely changes, so show a read-only summary (checked types, else
// "None") and edit the full checkbox set in a modal.
function ArmorCell() {
  const { character } = useCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();
  if (!character) return <></>;

  const armorCursor = OTHER_PROFS.k("armor");
  const armor = character.otherProficiencies.armor;
  const proficient = Object.values(ArmorType).filter((type) => armor[type]);
  return (
    <div className="prof-values">
      <button
        className="prof-chip-label"
        onClick={(e) => {
          e.preventDefault();
          pushCursor(armorCursor);
        }}
      >
        {proficient.length ? proficient.join(", ") : "None"}
      </button>
      {editMode && (
        <button
          className="prof-add"
          onClick={(e) => {
            e.preventDefault();
            pushCursor(armorCursor);
          }}
        >
          <FaPencil />
        </button>
      )}
    </div>
  );
}

function ProfRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="prof-row">
      <div className="prof-label">{label}</div>
      {children}
    </div>
  );
}

export default function OtherProficienciesDisplay() {
  return (
    <div className="column rounded-border-box other-proficiencies">
      <ProfRow label="Languages">
        <StringListCell subField="languages" />
      </ProfRow>
      <ProfRow label="Armor">
        <ArmorCell />
      </ProfRow>
      <ProfRow label="Weapons">
        <StringListCell subField="weapons" />
      </ProfRow>
      <ProfRow label="Tools & Other">
        <ToolsCell />
      </ProfRow>
      <div className="prof-title">Other Proficiencies &amp; Languages</div>
    </div>
  );
}
