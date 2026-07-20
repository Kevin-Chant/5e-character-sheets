import { useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { Character } from "src/lib/types";
import { buildCharacter } from "src/lib/builder/build-character";
import { BuilderState, defaultBuilderState } from "src/lib/builder/types";
import { castsAtLevelOne, getSrdClass } from "src/lib/builder/srd-classes";
import { StepProps } from "src/components/builder/builder-common";
import {
  AbilityScoresStep,
  BackgroundStep,
  ClassStep,
  DetailsStep,
  EquipmentStep,
  RaceStep,
  ReviewStep,
  SpellsStep,
  StartStep,
} from "src/components/builder/builder-steps";

interface StepDef {
  key: string;
  title: string;
  Component: (props: StepProps) => JSX.Element;
  visible?: (state: BuilderState) => boolean;
}

const isCaster = (state: BuilderState): boolean =>
  castsAtLevelOne(getSrdClass(state.classIndex));

// Steps are intentionally non-blocking: the wizard is a scaffold, not a gate.
// Every field is editable on the sheet afterward, so a player can breeze past
// any step (or the whole thing) and fill in the rest later. Per-step hints
// still nudge toward complete choices.
const STEPS: StepDef[] = [
  { key: "start", title: "Get started", Component: StartStep },
  { key: "race", title: "Choose a race", Component: RaceStep },
  { key: "class", title: "Choose a class", Component: ClassStep },
  { key: "ability", title: "Ability scores", Component: AbilityScoresStep },
  {
    key: "background",
    title: "Background & skills",
    Component: BackgroundStep,
  },
  {
    key: "spells",
    title: "Choose spells",
    Component: SpellsStep,
    visible: isCaster,
  },
  { key: "equipment", title: "Starting equipment", Component: EquipmentStep },
  { key: "details", title: "Finishing details", Component: DetailsStep },
  { key: "review", title: "Review", Component: ReviewStep },
];

interface Props {
  onCancel: () => void;
  onFinish: (character: Character) => void;
}

// The guided character-creation wizard. Owns the working `BuilderState`, routes
// between steps, and assembles the final `Character` on finish. Blank/Sample
// modes (picked on the first step) short-circuit straight to creation.
export default function CharacterBuilder({ onCancel, onFinish }: Props) {
  const [state, setState] = useState<BuilderState>(defaultBuilderState);
  const [index, setIndex] = useState(0);

  const patch = (partial: Partial<BuilderState>) =>
    setState((prev) => ({ ...prev, ...partial }));

  const steps = useMemo(
    () => STEPS.filter((s) => !s.visible || s.visible(state)),
    [state],
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

  // Once a guided build is underway, a stray backdrop click would throw away all
  // progress — so only the X button (and Escape-free intent) can dismiss it then.
  const guardExit = state.mode === "guided" && clampedIndex > 0;

  // On the first step, a Blank/Sample choice creates immediately.
  const finishesNow =
    (isFirst && state.mode !== "guided") || (isLast && state.mode === "guided");

  const finish = () => onFinish(buildCharacter(state));
  const next = () => (finishesNow ? finish() : setIndex(clampedIndex + 1));
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
          <StepComponent state={state} patch={patch} />
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
            {finishesNow ? "Create character" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
