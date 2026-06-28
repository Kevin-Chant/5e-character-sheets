import { FaCircle, FaRegCircle } from "react-icons/fa6";

interface SlotPipsProps {
  total: number;
  expended: number;
  // Called with the new expended count when a pip is toggled.
  onChange: (newExpended: number) => void;
  // When true, pips fill up from the left as `expended` grows (e.g. death
  // saves) instead of emptying from the right. The numeric value then counts
  // filled/marked pips rather than spent slots.
  fillMode?: boolean;
}

/**
 * A row of clickable slot pips. In the default (emptying) mode, available slots
 * are filled on the left and spent slots empty out from the right. In fill mode,
 * pips start empty and fill from the left as the count grows. Clicking a pip
 * toggles every slot up to and including it, so a single click can mark or clear
 * a run of slots.
 */
export default function SlotPips({
  total,
  expended,
  onChange,
  fillMode = false,
}: SlotPipsProps) {
  const safeExpended = Math.max(0, Math.min(expended, total));
  if (total <= 0) return <></>;
  const filled = fillMode ? safeExpended : total - safeExpended;
  return (
    <div className="row slot-pips">
      {[...Array(total)].map((_, i) => {
        const solid = i < filled;
        return (
          <button
            key={i}
            type="button"
            className="slot-pip"
            aria-label={
              fillMode
                ? solid
                  ? "Marked slot"
                  : "Unmarked slot"
                : solid
                  ? "Available slot"
                  : "Expended slot"
            }
            onClick={(e) => {
              e.preventDefault();
              if (fillMode) {
                // Clicking an empty pip marks it and everything to its left;
                // clicking a marked pip clears it and everything to its right.
                onChange(solid ? i : i + 1);
              } else {
                // Clicking a ready pip expends it and everything to its right;
                // clicking an expended pip restores it and everything to its left.
                onChange(solid ? total - i : total - (i + 1));
              }
            }}
          >
            {solid ? <FaCircle /> : <FaRegCircle />}
          </button>
        );
      })}
    </div>
  );
}
