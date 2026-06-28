import { FaPencil } from "react-icons/fa6";
import { updateData } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { ArmorType, FIELD } from "src/lib/data/data-definitions";
import { isTextComponentWithDetail } from "src/lib/types";
import ComponentWithPopover from "./component-with-popover";
import TextWithFormulasDisplay from "./text-with-formulas-display";

const FIELD_NAME = FIELD.otherProficiencies;

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
  const { pushTargetedField } = useTargetedField();
  if (!character) return <></>;

  const items = character.otherProficiencies[subField];

  // Open the editor at the next (empty) index rather than pre-inserting a
  // placeholder, so the typeahead starts blank and shows every suggestion.
  const add = () =>
    pushTargetedField(FIELD_NAME, `${subField}.${items.length}`);
  const remove = (index: number) => {
    const next = items.slice();
    next.splice(index, 1);
    dispatch(updateData(FIELD_NAME, { value: next }, subField));
  };

  return (
    <div className="prof-values">
      {items.map((item, i) => (
        <span key={i} className="prof-chip">
          <button
            className="prof-chip-label"
            onClick={(e) => {
              e.preventDefault();
              pushTargetedField(FIELD_NAME, `${subField}.${i}`);
            }}
          >
            {item}
            {i < items.length - 1 ? "," : ""}
          </button>
          <RemoveButton onClick={() => remove(i)} />
        </span>
      ))}
      <AddButton onClick={add} />
    </div>
  );
}

// Tools & Other keep the rich TextComponent shape: detail is shown in a hover
// popover, editing opens the full text-line modal.
function ToolsCell() {
  const { character, dispatch } = useCharacter();
  const { pushTargetedField } = useTargetedField();
  if (!character) return <></>;

  const items = character.otherProficiencies.toolsAndOther;
  const add = () => {
    dispatch(
      updateData(
        FIELD_NAME,
        { value: items.concat({ title: "new entry", titleFormulas: [] }) },
        "toolsAndOther",
      ),
    );
    pushTargetedField(FIELD_NAME, `toolsAndOther.${items.length}`);
  };
  const remove = (index: number) => {
    const next = structuredClone(items);
    next.splice(index, 1);
    dispatch(updateData(FIELD_NAME, { value: next }, "toolsAndOther"));
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
              pushTargetedField(FIELD_NAME, `toolsAndOther.${i}`);
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
            <RemoveButton onClick={() => remove(i)} />
          </span>
        );
      })}
      <AddButton onClick={add} />
    </div>
  );
}

// Armor rarely changes, so show a read-only summary (checked types, else
// "None") and edit the full checkbox set in a modal.
function ArmorCell() {
  const { character } = useCharacter();
  const { pushTargetedField } = useTargetedField();
  if (!character) return <></>;

  const armor = character.otherProficiencies.armor;
  const proficient = Object.values(ArmorType).filter((type) => armor[type]);
  return (
    <div className="prof-values">
      <button
        className="prof-chip-label"
        onClick={(e) => {
          e.preventDefault();
          pushTargetedField(FIELD_NAME, "armor");
        }}
      >
        {proficient.length ? proficient.join(", ") : "None"}
      </button>
      <button
        className="prof-add"
        onClick={(e) => {
          e.preventDefault();
          pushTargetedField(FIELD_NAME, "armor");
        }}
      >
        <FaPencil />
      </button>
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
