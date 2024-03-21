import classNames from "classnames";
import { FIELD } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { Character } from "src/lib/types";
import { getFieldValue } from "src/lib/utils";

interface SingleValueDisplayProps {
  field: FIELD;
  name: string;
  transform?: (value: any, character: Character) => string | number;
  vertical?: boolean;
  flipped?: boolean;
  removeBorder?: boolean;
  editable?: boolean;
}

export default function SingleValueDisplay({
  field,
  name,
  transform,
  vertical,
  flipped,
  removeBorder,
  editable,
}: SingleValueDisplayProps) {
  const { character } = useCharacter();
  const { pushTargetedField } = useTargetedField();

  const onClick = editable
    ? () => pushTargetedField(field)
    : () => {
        return;
      };

  if (!character) return <></>;

  const value = transform
    ? transform(getFieldValue(field, character), character)
    : getFieldValue(field, character);
  if (vertical) {
    return (
      <div
        className={classNames("column", "margin-small", {
          "rounded-border-box": !removeBorder,
        })}
      >
        {!flipped && (
          <p
            className={classNames("display-value large", {
              editable: editable,
              readOnly: !editable,
            })}
            onClick={onClick}
          >
            {value}
          </p>
        )}
        <p className="display-text">{name}</p>
        {flipped && (
          <p
            className={classNames("display-value large", {
              editable: editable,
              readOnly: !editable,
            })}
            onClick={onClick}
          >
            {value}
          </p>
        )}
      </div>
    );
  } else {
    return (
      <div
        className={classNames("row", "margin-small", {
          "rounded-border-box": !removeBorder,
        })}
      >
        {!flipped && (
          <p
            className={classNames("display-value small", {
              editable: editable,
              readOnly: !editable,
            })}
            onClick={onClick}
          >
            {value}
          </p>
        )}
        <p className="display-text">{name}</p>
        {flipped && (
          <p
            className={classNames("display-value small", {
              editable: editable,
              readOnly: !editable,
            })}
            onClick={onClick}
          >
            {value}
          </p>
        )}
      </div>
    );
  }
}
