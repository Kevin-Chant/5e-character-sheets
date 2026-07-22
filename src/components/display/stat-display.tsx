import classNames from "classnames";
import { StatKey } from "src/lib/data/data-definitions";
import { Cursor } from "src/lib/cursor";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import {
  highlightProps,
  useRemoteFieldHighlight,
} from "src/lib/hooks/use-presence";
import { modifier } from "src/lib/rules";
import RollButton from "../roll-button";

export default function StatDisplay(props: {
  cursor: Cursor<number>;
  statKey: StatKey;
  name: string;
  value: number;
  editable?: boolean;
}) {
  const field = props.cursor.root();
  const subField = props.cursor.subpath();
  const { pushTargetedField } = useTargetedField();
  const { editMode } = useEditMode();
  const editor = useRemoteFieldHighlight(field, subField);
  const isEditable = props.editable && editMode;
  const onClick = isEditable
    ? () => pushTargetedField(field, subField)
    : () => {
        return;
      };

  return (
    <div className="stat-display rounded-border-box margin-large">
      <div className="column">
        <p className="display-title">{props.name}</p>
        {/* Modifier is the hero — it's the number you actually add to a d20 roll.
            The raw score is kept as a small reference chip you edit in place. */}
        <p className="stat-modifier readOnly">{modifier(props.value)}</p>
        <p
          className={classNames("stat-score", {
            editable: isEditable,
            readOnly: !isEditable,
          })}
          onClick={onClick}
          {...highlightProps(editor)}
        >
          {props.value}
        </p>
        <RollButton
          label={`${props.name} Check`}
          check={modifier(props.value)}
        />
      </div>
    </div>
  );
}
