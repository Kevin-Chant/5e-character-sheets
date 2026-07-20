import classNames from "classnames";
import { ReactNode } from "react";
import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { TRACKER_FIELDS, useEditMode } from "src/lib/hooks/use-edit-mode";
import {
  highlightProps,
  useRemoteFieldHighlight,
} from "src/lib/hooks/use-presence";
import { Character } from "src/lib/types";
import { Cursor } from "src/lib/cursor";
import { getFieldValue, traverse } from "src/lib/fields";
import { getOptionalInitializer } from "src/lib/rules";
import RollButton from "../roll-button";

interface SingleValueDisplayProps {
  // A typed cursor is the preferred way to point at the value; `field`/`subField`
  // are the legacy string form kept for not-yet-migrated call sites. Exactly one
  // form is supplied, and both serialize to the same targeted-field stack entry.
  cursor?: Cursor<unknown>;
  field?: FIELD;
  subField?: string;
  name: string;
  transform?: (value: any, character: Character) => string | number;
  vertical?: boolean;
  flipped?: boolean;
  removeBorder?: boolean;
  removeMargin?: boolean;
  editable?: boolean;
  compact?: boolean;
  // When set, show a d20 roll button that rolls (this display's numeric value) +
  // d20 — e.g. Initiative. The label names the roll.
  rollCheck?: string;
  // An element pinned to the box's top-right corner (e.g. the level-up button on
  // Class & Level). Rendered outside the editable value so its clicks don't open
  // the field editor.
  cornerAction?: ReactNode;
}

export default function SingleValueDisplay({
  cursor,
  field: fieldProp,
  subField: subFieldProp,
  name,
  transform,
  vertical,
  flipped,
  removeBorder,
  removeMargin,
  editable,
  compact,
  rollCheck,
  cornerAction,
}: SingleValueDisplayProps) {
  const field = cursor ? cursor.root() : fieldProp;
  const subField = cursor ? cursor.subpath() : subFieldProp;
  const { character } = useCharacter();
  const { pushTargetedField } = useTargetedField();
  const { editMode } = useEditMode();
  const highlight = highlightProps(
    useRemoteFieldHighlight(field ?? "", subField),
  );

  const isEditable =
    editable && !!field && (editMode || TRACKER_FIELDS.has(field));
  const onClick =
    isEditable && field
      ? () => pushTargetedField(field, subField)
      : () => {
          return;
        };

  if (!character || !field) return <></>;

  const optionalOverride = getOptionalInitializer(field, subField, character);
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
        editable: isEditable,
        readOnly: !isEditable,
      })}
      onClick={onClick}
      {...highlight}
    >
      {value}
    </p>
  );
  const nameEl = <p className="display-label">{name}</p>;

  return (
    <div
      className={classNames(vertical ? "column" : "row", {
        "rounded-border-box": !removeBorder,
        "margin-small": !removeMargin,
        "has-corner-action": !!cornerAction,
      })}
    >
      {cornerAction && <div className="corner-action">{cornerAction}</div>}
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
      {rollCheck && typeof value === "number" && (
        <RollButton label={rollCheck} check={value} />
      )}
    </div>
  );
}
