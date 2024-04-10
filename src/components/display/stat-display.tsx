import classNames from "classnames";
import { FIELD, StatKey } from "src/lib/data/data-definitions";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { modifier } from "src/lib/utils";

export default function StatDisplay(props: {
  field: FIELD;
  subField: string;
  statKey: StatKey;
  name: string;
  value: number;
  editable?: boolean;
}) {
  const { pushTargetedField } = useTargetedField();
  const onClick = props.editable
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
            editable: props.editable,
            readOnly: !props.editable,
          })}
          onClick={onClick}
        >
          {props.value}
        </p>
        <p className="display-value small readOnly">{modifier(props.value)}</p>
      </div>
    </div>
  );
}
