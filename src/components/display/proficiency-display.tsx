import classNames from "classnames";
import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { Character } from "src/lib/types";
import { getFieldValue, traverse } from "src/lib/utils";

interface ProficiencyDisplayProps {
  id: string;
  field: FIELD;
  subField: string;
  proficient: boolean;
  expert: boolean;
  jack: boolean;
  text: string;
  subtext?: string;
  transform?: (value: any, character: Character) => string | number;
  readOnly?: boolean;
  updateProficiency: (data: boolean) => void;
}

export default function ProficiencyDisplay({
  id,
  field,
  subField,
  proficient,
  expert,
  jack,
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

  let value = getFieldValue(field, character);
  if (subField) value = traverse(subField, value);
  if (transform) value = transform(value, character);
  const TextComponent = expert ? "b" : jack ? "i" : "p";

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
        <TextComponent className="display-value margin-small tiny">
          {value}
        </TextComponent>
        <TextComponent className="display-text">
          {text} {subtext}
        </TextComponent>
      </div>
    </div>
  );
}
