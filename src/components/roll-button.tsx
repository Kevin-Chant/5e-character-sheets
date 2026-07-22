import { FaDiceD20 } from "react-icons/fa6";
import { StandardDie } from "src/lib/data/data-definitions";
import { CustomFormula, CustomFormulaWithDamage, Spell } from "src/lib/types";
import { RollSpec, useRoller } from "src/lib/hooks/use-roller";
import { useEditMode } from "src/lib/hooks/use-edit-mode";

interface RollButtonProps {
  // Shown as the roll dialog's heading, e.g. the attack or spell name.
  label: string;
  // A d20 + flat modifier check (skills, saves, ability checks, initiative).
  check?: number;
  // A single dice formula rolled on its own.
  formula?: CustomFormula;
  // Spend a hit die of this size: roll it, apply healing, expend the die.
  hitDie?: StandardDie;
  // An attack: a to-hit modifier and/or damage, resolved together. `spell`
  // supplies level-scaled damage; `damage` is a fixed map.
  toHit?: number;
  damage?: CustomFormulaWithDamage;
  spell?: Spell;
}

// A reusable die-icon button that opens the roll dialog. Works in play mode — it
// doesn't touch the edit-gated targeted-field stack.
export default function RollButton({
  label,
  check,
  formula,
  hitDie,
  toHit,
  damage,
  spell,
}: RollButtonProps) {
  const { openRoller } = useRoller();
  const { editMode } = useEditMode();
  // Rolling is a play-mode action; in edit mode the row shows edit/delete
  // instead, so the die button takes their place rather than adding clutter.
  if (editMode) return <></>;

  const isAttack = toHit !== undefined || damage !== undefined || spell;
  const spec: RollSpec | undefined =
    check !== undefined
      ? { kind: "check", modifier: check }
      : formula
        ? { kind: "formula", formula }
        : hitDie
          ? { kind: "hitDie", die: hitDie }
          : isAttack
            ? { kind: "attack", toHit, damage, spell }
            : undefined;
  if (!spec) return <></>;

  return (
    <button
      type="button"
      className="icon-btn roll-btn"
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
