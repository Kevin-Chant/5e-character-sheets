import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { Speeds } from "src/lib/types";
import ComponentWithPopover from "./component-with-popover";

const MODE_LABELS: Array<[keyof Speeds, string]> = [
  ["walk", "Walk"],
  ["fly", "Fly"],
  ["swim", "Swim"],
  ["climb", "Climb"],
  ["burrow", "Burrow"],
];

// The Speed box: shows walking speed on the sheet, with the full set of movement
// modes revealed on hover. Clicking (in edit mode) opens the speeds editor. Walk
// is the quick-access view of `character.speeds`; all editing goes through the
// one editor, keeping `speeds` the single source of truth.
export default function SpeedDisplay() {
  const { character } = useCharacter();
  const { editMode } = useEditMode();
  const { pushTargetedField } = useTargetedField();
  if (!character) return <></>;

  const speeds = character.speeds;
  const isEditable = editMode;
  const openEditor = isEditable
    ? () => pushTargetedField(FIELD.speeds, undefined)
    : undefined;

  const setModes = MODE_LABELS.filter(([mode]) => speeds[mode] !== undefined);

  const box = (
    <div className="column">
      <p
        className={
          isEditable
            ? "display-value large editable"
            : "display-value large readOnly"
        }
        onClick={openEditor}
      >
        {speeds.walk}
      </p>
      <p className="display-label">Speed</p>
    </div>
  );

  // Only bother with the hover popover when there's more than the walk speed.
  if (setModes.length <= 1) {
    return <div className="rounded-border-box margin-small">{box}</div>;
  }

  return (
    <ComponentWithPopover
      componentClass="rounded-border-box margin-small pos-relative editable"
      componentChildren={box}
      popoverChildren={
        <div className="column">
          {setModes.map(([mode, label]) => (
            <p key={mode}>
              {label}: {speeds[mode]} ft
            </p>
          ))}
        </div>
      }
    />
  );
}
