import classNames from "classnames";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { Character } from "src/lib/types";
import { Cursor } from "src/lib/cursor";
import { getFieldValue, traverse } from "src/lib/fields";
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
  updateProficiency: (data: boolean) => void;
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
  updateProficiency,
}: ProficiencyDisplayProps) {
  const { character } = useCharacter();
  const { editMode } = useEditMode();

  if (!character) return <></>;

  const field = cursor.root();
  const subField = cursor.subpath();

  const locked = readOnly || !editMode;
  const onClick = locked
    ? () => {
        return;
      }
    : () => {
        updateProficiency(!proficient);
      };

  let value = getFieldValue(field, character);
  if (subField) value = traverse(subField, value);
  if (transform) value = transform(value, character);
  const TextComponent = expert ? "b" : jack ? "i" : "p";

  return (
    <div className="proficiency-display">
      <div className="row">
        <input
          className={classNames({ editable: !locked })}
          type="checkbox"
          id={id}
          checked={proficient}
          readOnly={true}
          onClick={onClick}
        />
        <TextComponent className="display-value margin-small tiny">
          {value}
        </TextComponent>
        <TextComponent className="display-text">
          {text} {subtext}
        </TextComponent>
        {rollLabel && typeof value === "number" && (
          <RollButton label={rollLabel} check={value} />
        )}
      </div>
    </div>
  );
}
