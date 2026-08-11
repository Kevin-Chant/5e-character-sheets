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
import { newRaceOptionPicksAt } from "src/lib/builder/chosen-options";

import {
  LevelUpAdvancementStep,
  LevelUpClassStep,
  LevelUpFeatureChoicesStep,
  LevelUpReviewStep,
  LevelUpSpellsStep,
  LevelUpStepProps,
  LevelUpSubclassStep,
} from "src/components/builder/level-up-steps";
import { takenOptionalFeatures } from "src/lib/builder/optional-class-features";
import { FaXmark } from "react-icons/fa6";
import Spinner from "src/components/spinner";

interface StepDef {
  key: string;
  title: string;
  Component: (props: LevelUpStepProps) => JSX.Element;
  visible?: (character: Character, state: LevelUpState) => boolean;
}

// The grants for the level this wizard run is reaching. A subclass or
// fighting style chosen in this same run wins over what's already on the
// sheet, since it may unlock an immediate grant (e.g. Battle Master maneuvers).
export const grantsForLevelUp = (
  character: Character,
  state: LevelUpState,
) => ({
  ...grantsAt(
    state.className,
    targetClassLevel(character, state),
    {
      subclass:
        state.subclass ??
        character.class.find((k) => k.name === state.className)?.subclass,
      fightingStyle: state.fightingStyle,
      // Tasha's swaps taken earlier (read off the sheet) plus any taken now.
      optionalFeatures: [
        ...takenOptionalFeatures(character).map((f) => f.name),
        ...(state.optionalFeatures ?? []),
      ],
    },
    // Multiclass = reaching level 1 in a class the sheet already has another
    // class in, derived from the same facts `applyClassLevel` uses.
    targetClassLevel(character, state) === 1 && character.class.length > 0,
  ),
  raceOptionPicks: newRaceOptionPicksAt(
    character.race?.name,
    character.class.reduce((sum, k) => sum + k.level, 0) + 1,
  ),
});

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
    title: "Level choices",
    Component: LevelUpFeatureChoicesStep,
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
  onFinish: (updated: Character) => void | Promise<void>;
}

// Owns a working `LevelUpState`, routes between applicable steps (subclass /
// ASI / spells appear only when the class & level call for them), hands back
// the updated character on finish.
export default function LevelUpWizard({
  character,
  onCancel,
  onFinish,
}: Props) {
  const [state, setState] = useState<LevelUpState>(() =>
    defaultLevelUpState(character),
  );
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

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

  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [clampedIndex]);

  // Once a level-up is underway, only the X button dismisses it.
  const guardExit = clampedIndex > 0;

  const finish = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onFinish(applyLevelUp(character, state));
    } finally {
      setSubmitting(false);
    }
  };
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
            <FaXmark />
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
          <button
            className="btn-primary"
            onClick={next}
            type="button"
            disabled={submitting}
          >
            {submitting ? (
              <>
                Applying <Spinner />
              </>
            ) : isLast ? (
              "Confirm level up"
            ) : (
              "Next"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
