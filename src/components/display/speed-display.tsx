import { FIELD } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
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

// Shows walking speed, with the full set of movement modes on hover.
// Clicking in edit mode opens the speeds editor.
export default function SpeedDisplay() {
  const { character } = useLoadedCharacter();
  const { editMode } = useEditMode();
  const { pushTargetedField } = useTargetedField();

  const speeds = character.speeds;
  const isEditable = editMode;
  const openEditor = isEditable
    ? () => pushTargetedField(FIELD.speeds, undefined)
    : undefined;

  const setModes = MODE_LABELS.filter(([mode]) => speeds[mode] !== undefined);

  // Mirrors SingleValueDisplay's `vertical` form's margin-small, to align with neighboring AC/Initiative boxes.
  const box = (
    <div className="column">
      <p
        className={
          isEditable
            ? "display-value large margin-small editable"
            : "display-value large margin-small readOnly"
        }
        onClick={openEditor}
      >
        {speeds.walk}
      </p>
      <p className="display-label">Speed</p>
    </div>
  );

  if (setModes.length <= 1) {
    return <div className="column rounded-border-box margin-small">{box}</div>;
  }

  return (
    <ComponentWithPopover
      componentClass="column rounded-border-box margin-small pos-relative editable"
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
