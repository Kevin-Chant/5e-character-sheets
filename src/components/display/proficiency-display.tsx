import classNames from "classnames";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
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
  // Shows a d20 roll button (this row's value + d20) for skills/saving throws.
  rollLabel?: string;
  // Saving throw, not a skill check — routes to the save RollKind so save-only riders (Bless) reach it.
  rollIsSave?: boolean;
  // Cycles proficiency state: saves none<->proficient, skills none->proficient->expert->none.
  onToggle: () => void;
  // Skills only: opens the per-skill bonus formula editor.
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
  rollIsSave,
  onToggle,
  onEditBonus,
  hasBonus,
}: ProficiencyDisplayProps) {
  const { character } = useLoadedCharacter();
  const { editMode } = useEditMode();

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
          <RollButton
            label={rollLabel}
            {...(rollIsSave ? { savingThrow: value } : { check: value })}
          />
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
