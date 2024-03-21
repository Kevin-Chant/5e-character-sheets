import classNames from "classnames";
import { StatKey } from "src/lib/data/data-definitions";
import { FIELD } from "src/lib/hooks/reducers/actions";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { modifier } from "src/lib/utils";

export default function StatDisplay(props: {
  field: FIELD;
  statKey: StatKey;
  name: string;
  value: number;
  editable?: boolean;
}) {
  const { pushTargetedField } = useTargetedField();
  const onClick = props.editable
    ? () => pushTargetedField(props.field)
    : () => {
        return;
      };

  return (
    <div className="stat-display rounded-border-box margin-large">
      <div className="column">
        <p className="display-title">{props.name}</p>
        <p
          className={classNames("display-value large", {
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
