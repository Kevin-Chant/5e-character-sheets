import classNames from "classnames";
import { useCharacter } from "src/lib/hooks/use-character";
import { Character } from "src/lib/types";
import { getFieldValue } from "src/lib/utils";

interface ProficiencyDisplayProps {
  id: string;
  field: string;
  proficient: boolean;
  text: string;
  subtext?: string;
  transform?: (value: any, character: Character) => string | number;
  readOnly?: boolean;
  updateProficiency: (data: boolean) => void;
}

export default function ProficiencyDisplay({
  id,
  field,
  proficient,
  text,
  subtext,
  transform,
  readOnly,
  updateProficiency,
}: ProficiencyDisplayProps) {
  const { character } = useCharacter();

  if (!character) return <></>;

  const onClick = readOnly
    ? () => {
        return;
      }
    : () => {
        updateProficiency(!proficient);
      };

  const value =
    transform?.(getFieldValue(field, character), character) ??
    getFieldValue(field, character);

  return (
    <div className="proficiency-display">
      <div className="row">
        <input
          className={classNames({ editable: !readOnly })}
          type="checkbox"
          id={id}
          checked={proficient}
          readOnly={true}
          onClick={onClick}
        />
        <p className="display-value tiny">{value}</p>
        <p className="display-text">
          {text} {subtext}
        </p>
      </div>
    </div>
  );
}
