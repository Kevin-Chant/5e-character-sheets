import classNames from "classnames";
import { FIELD, StatKey } from "src/lib/data/data-definitions";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import {
  highlightProps,
  useRemoteFieldHighlight,
} from "src/lib/hooks/use-presence";
import { modifier } from "src/lib/rules";

export default function StatDisplay(props: {
  field: FIELD;
  subField: string;
  statKey: StatKey;
  name: string;
  value: number;
  editable?: boolean;
}) {
  const { pushTargetedField } = useTargetedField();
  const { editMode } = useEditMode();
  const editor = useRemoteFieldHighlight(props.field, props.subField);
  const isEditable = props.editable && editMode;
  const onClick = isEditable
    ? () => pushTargetedField(props.field, props.subField)
    : () => {
        return;
      };

  return (
    <div className="stat-display rounded-border-box margin-large">
      <div className="column">
        <p className="display-title">{props.name}</p>
        <p
          className={classNames("display-value margin-small large", {
            editable: isEditable,
            readOnly: !isEditable,
          })}
          onClick={onClick}
          {...highlightProps(editor)}
        >
          {props.value}
        </p>
        <p className="display-value small readOnly">{modifier(props.value)}</p>
      </div>
    </div>
  );
}
