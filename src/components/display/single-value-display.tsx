import classNames from "classnames";
import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { Character } from "src/lib/types";
import {
  getFieldValue,
  traverse,
  OPTIONAL_FIELD_INITIALIZERS,
} from "src/lib/utils";

interface SingleValueDisplayProps {
  field: FIELD;
  subField?: string;
  name: string;
  transform?: (value: any, character: Character) => string | number;
  vertical?: boolean;
  flipped?: boolean;
  removeBorder?: boolean;
  removeMargin?: boolean;
  editable?: boolean;
}

export default function SingleValueDisplay({
  field,
  subField,
  name,
  transform,
  vertical,
  flipped,
  removeBorder,
  removeMargin,
  editable,
}: SingleValueDisplayProps) {
  const { character } = useCharacter();
  const { pushTargetedField } = useTargetedField();

  const onClick = editable
    ? () => pushTargetedField(field, subField)
    : () => {
        return;
      };

  if (!character) return <></>;

  const optionalOverride = OPTIONAL_FIELD_INITIALIZERS[field]?.call(
    undefined,
    character,
    subField
  );
  let value = getFieldValue(field, character);
  if (subField) value = traverse(subField, value);
  if (typeof value === "undefined" && typeof optionalOverride !== "undefined")
    value = optionalOverride;
  if (value && transform) value = transform(value, character);
  if (vertical) {
    return (
      <div
        className={classNames("column", {
          "rounded-border-box": !removeBorder,
          "margin-small": !removeMargin,
        })}
      >
        {!flipped && (
          <p
            className={classNames("display-value large", {
              "margin-small": !removeMargin,
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
              "margin-small": !removeMargin,
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
        className={classNames("row", {
          "rounded-border-box": !removeBorder,
          "margin-small": !removeMargin,
        })}
      >
        {!flipped && (
          <p
            className={classNames("display-value small", {
              "margin-small": !removeMargin,
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
              "margin-small": !removeMargin,
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
