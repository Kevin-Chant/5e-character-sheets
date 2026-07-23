import { useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { Character } from "src/lib/types";
import {
  LevelUpState,
  applyLevelUp,
  defaultLevelUpState,
  isCasterClass,
  targetClassLevel,
} from "src/lib/builder/level-up";
import { grantsAt, hasFeatureChoices } from "src/lib/builder/level-grants";

import {
  LevelUpAdvancementStep,
  LevelUpClassStep,
  LevelUpFeatureChoicesStep,
  LevelUpReviewStep,
  LevelUpSpellsStep,
  LevelUpStepProps,
  LevelUpSubclassStep,
} from "src/components/builder/level-up-steps";

interface StepDef {
  key: string;
  title: string;
  Component: (props: LevelUpStepProps) => JSX.Element;
  visible?: (character: Character, state: LevelUpState) => boolean;
}

// The grants for the level this wizard run is reaching. The subclass may be
// chosen in this very run (Battle Master at 3rd owes maneuvers immediately), so
// the pending choice wins over what's on the sheet.
export const grantsForLevelUp = (character: Character, state: LevelUpState) =>
  grantsAt(
    state.className,
    targetClassLevel(character, state),
    state.subclass ??
      character.class.find((k) => k.name === state.className)?.subclass,
  );

// Whether the target class still needs a subclass at the level being reached.
const subclassStepVisible = (character: Character, state: LevelUpState) => {
  if (!grantsForLevelUp(character, state).subclassDue) return false;
  const existing = character.class.find((c) => c.name === state.className);
  return !existing?.subclass;
};

const STEPS: StepDef[] = [
  { key: "class", title: "Level up", Component: LevelUpClassStep },
  {
    key: "subclass",
    title: "Choose a subclass",
    Component: LevelUpSubclassStep,
    visible: subclassStepVisible,
  },
  {
    key: "featureChoices",
    title: "Class features",
    Component: LevelUpFeatureChoicesStep,
    // Asks `grantsAt` the same question the step itself does, so a new kind of
    // choice shows up in both without a second edit.
    visible: (character, state) =>
      hasFeatureChoices(grantsForLevelUp(character, state)),
  },
  {
    key: "advancement",
    title: "Ability score improvement",
    Component: LevelUpAdvancementStep,
    visible: (character, state) => grantsForLevelUp(character, state).asiDue,
  },
  {
    key: "spells",
    title: "New spells",
    Component: LevelUpSpellsStep,
    visible: (_character, state) => isCasterClass(state.className),
  },
  { key: "review", title: "Review", Component: LevelUpReviewStep },
];

interface Props {
  character: Character;
  onCancel: () => void;
  onFinish: (updated: Character) => void;
}

// The guided level-up wizard. Owns a working `LevelUpState`, routes between the
// applicable steps (subclass / ASI / spells appear only when the chosen class &
// level call for them), and hands back the updated character on finish.
export default function LevelUpWizard({
  character,
  onCancel,
  onFinish,
}: Props) {
  const [state, setState] = useState<LevelUpState>(() =>
    defaultLevelUpState(character),
  );
  const [index, setIndex] = useState(0);

  const patch = (partial: Partial<LevelUpState>) =>
    setState((prev) => ({ ...prev, ...partial }));

  const steps = useMemo(
    () => STEPS.filter((s) => !s.visible || s.visible(character, state)),
    [character, state],
  );
  const clampedIndex = Math.min(index, steps.length - 1);
  const step = steps[clampedIndex];
  const isFirst = clampedIndex === 0;
  const isLast = clampedIndex === steps.length - 1;

  // Each step opens scrolled to its top, not wherever the previous one left off.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [clampedIndex]);

  // Once a level-up is underway, a stray backdrop click would throw away the
  // choices made so far — so only the X button can dismiss it then.
  const guardExit = clampedIndex > 0;

  const finish = () => onFinish(applyLevelUp(character, state));
  const next = () => (isLast ? finish() : setIndex(clampedIndex + 1));
  const back = () => setIndex(Math.max(0, clampedIndex - 1));

  const StepComponent = step.Component;

  return (
    <div className="modal-container">
      <div
        className="modal-background"
        onClick={guardExit ? undefined : onCancel}
      />
      <div className="modal-content builder-modal">
        <div className="builder-header">
          <div className="builder-progress">
            {steps.map((s, i) => (
              <button
                key={s.key}
                type="button"
                className={classNames("builder-progress-dot", {
                  active: i === clampedIndex,
                  done: i < clampedIndex,
                })}
                title={s.title}
                aria-label={`Go to step ${i + 1}: ${s.title}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Cancel">
            x
          </button>
        </div>

        <h1 className="builder-title">{step.title}</h1>

        <div className="builder-body" ref={bodyRef}>
          <StepComponent character={character} state={state} patch={patch} />
        </div>

        <div className="builder-footer">
          <button
            className="btn-secondary"
            onClick={back}
            disabled={isFirst}
            type="button"
          >
            Back
          </button>
          <span className="text-muted builder-step-count">
            Step {clampedIndex + 1} of {steps.length}
          </span>
          <button className="btn-primary" onClick={next} type="button">
            {isLast ? "Confirm level up" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
