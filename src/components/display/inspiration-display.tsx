import { FIELD } from "src/lib/data/data-definitions";
import { charPath, updateAt } from "src/lib/cursor";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import {
  highlightProps,
  useRemoteFieldHighlight,
} from "src/lib/hooks/use-presence";

// Inspiration is a boolean tick, not a number.
export default function InspirationDisplay() {
  const { character, dispatch } = useLoadedCharacter();
  const cursor = charPath(FIELD.inspiration);
  const highlight = highlightProps(useRemoteFieldHighlight(FIELD.inspiration));
  const has = character.inspiration;

  return (
    <div className="row rounded-border-box margin-small inspiration-row">
      <button
        type="button"
        className="inspiration-toggle"
        role="switch"
        aria-checked={has}
        aria-label="Inspiration"
        onClick={() => dispatch(updateAt(cursor, !has))}
        {...highlight}
      >
        <span className="inspiration-pip" aria-hidden="true" />
        <span className="display-label">Inspiration</span>
      </button>
    </div>
  );
}
