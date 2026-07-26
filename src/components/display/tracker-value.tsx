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
  // What one step means, in the player's words — these become the buttons'
  // accessible names ("Lose 1 hit point"), which is the only label a screen
  // reader gets for a glyph button.
  decrementLabel: string;
  incrementLabel: string;
  min?: number;
  max?: number;
  // The one number in the box that moves every round (current hit points), sized
  // to say so. Everything else in the HP box is reference by comparison.
  prominent?: boolean;
}

// A number you change *during play* — current/temporary hit points, exhaustion.
//
// These used to route through the same modal as every other field, which meant
// four steps (click, focus, type, save) and a dimmed sheet for the single most
// frequent interaction in a fight. They're small bounded integers, so they get
// edited in place instead: step with the buttons, or click the number and type
// an absolute. The row keeps its position and shape in the HP box — this is an
// affordance change, not a layout one.
//
// Typing is committed on blur/Enter rather than per keystroke; see
// `useDeferredNumber` for why that matters more than it looks.
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
