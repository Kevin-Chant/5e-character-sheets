import classNames from "classnames";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import {
  highlightProps,
  useRemoteFieldHighlight,
} from "src/lib/hooks/use-presence";
import { useDeferredNumber } from "src/lib/hooks/use-deferred-number";
import { Cursor, updateAt } from "src/lib/cursor";

interface TrackerValueProps {
  cursor: Cursor<number>;
  value: number;
  name: string;
  // Becomes the buttons' accessible names (e.g. "Lose 1 hit point").
  decrementLabel: string;
  incrementLabel: string;
  min?: number;
  max?: number;
  prominent?: boolean;
}

// A small bounded integer edited in place during play (current/temp HP,
// exhaustion): step with the buttons, or click the number and type an
// absolute. Commits on blur/Enter via useDeferredNumber.
export default function TrackerValue({
  cursor,
  value,
  name,
  decrementLabel,
  incrementLabel,
  min = 0,
  max,
  prominent,
}: TrackerValueProps) {
  const { dispatch } = useLoadedCharacter();
  const highlight = highlightProps(
    useRemoteFieldHighlight(cursor.root(), cursor.subpath()),
  );
  const { step, atMin, atMax, inputProps } = useDeferredNumber({
    value,
    min,
    max,
    onCommit: (next) => dispatch(updateAt(cursor, next)),
  });

  return (
    <div className={classNames("row tracker-value", { prominent })}>
      <p className="display-label">{name}</p>
      <span className="tracker-controls">
        <button
          type="button"
          className="tracker-step"
          aria-label={decrementLabel}
          disabled={atMin}
          onClick={() => step(-1)}
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          className={classNames("display-value", "tracker-input")}
          aria-label={name}
          onFocus={(e) => e.target.select()}
          {...inputProps}
          {...highlight}
        />
        <button
          type="button"
          className="tracker-step"
          aria-label={incrementLabel}
          disabled={atMax}
          onClick={() => step(1)}
        >
          +
        </button>
      </span>
    </div>
  );
}
