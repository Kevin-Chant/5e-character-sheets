import classNames from "classnames";
import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import {
  highlightProps,
  useRemoteFieldHighlight,
} from "src/lib/hooks/use-presence";
import { Character } from "src/lib/types";
import { getFieldValue, traverse } from "src/lib/fields";
import { OPTIONAL_FIELD_INITIALIZERS } from "src/lib/rules";

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
  compact?: boolean;
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
  compact,
}: SingleValueDisplayProps) {
  const { character } = useCharacter();
  const { pushTargetedField } = useTargetedField();
  const highlight = highlightProps(useRemoteFieldHighlight(field, subField));

  const onClick = editable
    ? () => pushTargetedField(field, subField)
    : () => {
        return;
      };

  if (!character) return <></>;

  const optionalOverride = OPTIONAL_FIELD_INITIALIZERS[field]?.call(
    undefined,
    character,
    subField,
  );
  let value = getFieldValue(field, character);
  if (subField) value = traverse(subField, value);
  if (typeof value === "undefined" && typeof optionalOverride !== "undefined")
    value = optionalOverride;
  if (value && transform) value = transform(value, character);

  const valueEl = (
    <p
      className={classNames("display-value", vertical ? "large" : "small", {
        "margin-small": !removeMargin,
        compact: vertical && compact,
        editable: editable,
        readOnly: !editable,
      })}
      onClick={onClick}
      {...highlight}
    >
      {value}
    </p>
  );
  const nameEl = <p className="display-text">{name}</p>;

  return (
    <div
      className={classNames(vertical ? "column" : "row", {
        "rounded-border-box": !removeBorder,
        "margin-small": !removeMargin,
      })}
    >
      {flipped ? (
        <>
          {nameEl}
          {valueEl}
        </>
      ) : (
        <>
          {valueEl}
          {nameEl}
        </>
      )}
    </div>
  );
}
