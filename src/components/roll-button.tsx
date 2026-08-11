import classNames from "classnames";
import { FaDiceD20 } from "react-icons/fa6";
import { StandardDie } from "src/lib/data/data-definitions";
import {
  Attack,
  CustomFormula,
  CustomFormulaWithDamage,
  SaveEffect,
  Spell,
} from "src/lib/types";
import { RollSpec, useRoller } from "src/lib/hooks/use-roller";
import { useEditMode } from "src/lib/hooks/use-edit-mode";

interface RollButtonProps {
  label: string;
  check?: number;
  // Mutually exclusive with `check`; uses save-only riders.
  savingThrow?: number;
  formula?: CustomFormula;
  hitDie?: StandardDie;
  deathSave?: boolean;
  // `spell` gives level-scaled damage; `damage` is a fixed map. `save`
  // replaces `toHit` when the target rolls to avoid.
  toHit?: number;
  save?: SaveEffect;
  damage?: CustomFormulaWithDamage;
  spell?: Spell;
  attack?: Attack;
}

export default function RollButton({
  label,
  check,
  savingThrow,
  formula,
  hitDie,
  deathSave,
  toHit,
  save,
  damage,
  spell,
  attack,
}: RollButtonProps) {
  const { openRoller } = useRoller();
  const { editMode } = useEditMode();
  if (editMode) return <></>;

  const isAttack =
    toHit !== undefined || save !== undefined || damage !== undefined || spell;
  const spec: RollSpec | undefined =
    check !== undefined
      ? { kind: "check", modifier: check }
      : savingThrow !== undefined
        ? { kind: "check", modifier: savingThrow, save: true }
        : formula
          ? { kind: "formula", formula }
          : hitDie
            ? { kind: "hitDie", die: hitDie }
            : deathSave
              ? { kind: "deathSave" }
              : isAttack
                ? { kind: "attack", toHit, save, damage, spell, attack }
                : undefined;
  if (!spec) return <></>;

  return (
    <button
      type="button"
      className={classNames("icon-btn roll-btn", {
        check: spec.kind === "check",
      })}
      aria-label={`Roll ${label}`}
      title={`Roll ${label}`}
      onClick={(e) => {
        e.preventDefault();
        openRoller({ label, spec });
      }}
    >
      <FaDiceD20 />
    </button>
  );
}
