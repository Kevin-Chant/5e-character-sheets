import classNames from "classnames";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { Character } from "src/lib/types";
import { Cursor } from "src/lib/cursor";
import { getFieldValue, traverse } from "src/lib/fields";
import { FaPencil } from "react-icons/fa6";
import RollButton from "../roll-button";

interface ProficiencyDisplayProps {
  id: string;
  cursor: Cursor<boolean | undefined>;
  proficient: boolean;
  expert: boolean;
  jack: boolean;
  text: string;
  subtext?: string;
  transform?: (value: any, character: Character) => string | number;
  readOnly?: boolean;
  // When set, show a d20 roll button that rolls (this row's value) + d20 — used
  // for skills and saving throws, whose transformed value is the modifier.
  rollLabel?: string;
  // Advance the proficiency state on click. Saving throws cycle none↔proficient;
  // skills cycle none→proficient→expert→none (see the parent). The control shows
  // a ✓ for proficiency and a stylized "e" for expertise.
  onToggle: () => void;
  // Skills only: open the per-skill bonus formula editor. Shown in edit mode;
  // `hasBonus` styles it as active when a bonus is set.
  onEditBonus?: () => void;
  hasBonus?: boolean;
}

export default function ProficiencyDisplay({
  id,
  cursor,
  proficient,
  expert,
  jack,
  text,
  subtext,
  transform,
  readOnly,
  rollLabel,
  onToggle,
  onEditBonus,
  hasBonus,
}: ProficiencyDisplayProps) {
  const { character } = useCharacter();
  const { editMode } = useEditMode();

  if (!character) return <></>;

  const field = cursor.root();
  const subField = cursor.subpath();

  const locked = readOnly || !editMode;
  const state = expert ? "expert" : proficient ? "proficient" : "none";

  let value = getFieldValue(field, character);
  if (subField) value = traverse(subField, value);
  if (transform) value = transform(value, character);
  const TextComponent = expert ? "b" : jack ? "i" : "p";

  return (
    <div className="proficiency-display">
      <div className="row">
        <button
          type="button"
          id={id}
          className={classNames("prof-toggle", `prof-toggle--${state}`, {
            editable: !locked,
          })}
          aria-label={`${text}: ${state}`}
          aria-disabled={locked}
          onClick={locked ? undefined : onToggle}
        >
          {state === "expert" ? "e" : state === "proficient" ? "✓" : ""}
        </button>
        <TextComponent className="display-value margin-small tiny">
          {value}
        </TextComponent>
        <TextComponent className="display-text">
          {text} {subtext}
        </TextComponent>
        {rollLabel && typeof value === "number" && (
          <RollButton label={rollLabel} check={value} />
        )}
        {editMode && onEditBonus && (
          <button
            type="button"
            className={classNames("prof-bonus-edit", { active: hasBonus })}
            aria-label={`Edit ${text} bonus`}
            title={hasBonus ? `${text} bonus set` : `Add a ${text} bonus`}
            onClick={(e) => {
              e.preventDefault();
              onEditBonus();
            }}
          >
            <FaPencil />
          </button>
        )}
      </div>
    </div>
  );
}
