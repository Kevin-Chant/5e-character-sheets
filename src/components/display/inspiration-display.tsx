import { FIELD } from "src/lib/data/data-definitions";
import { charPath, updateAt } from "src/lib/cursor";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import {
  highlightProps,
  useRemoteFieldHighlight,
} from "src/lib/hooks/use-presence";

// Inspiration: a tick, not a number.
//
// The paper sheet gives this a single blank box you tick, because you either
// have inspiration or you don't. Modelling it as a count meant the sheet showed
// a permanent "0" for a thing that has no quantity, and toggling the field a
// table touches more than any other cost a modal round-trip. It keeps its
// position at the top of the skills column; only the affordance changed.
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
