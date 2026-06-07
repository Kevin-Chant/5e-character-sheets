import { FaCircle, FaRegCircle } from "react-icons/fa6";

interface SlotPipsProps {
  total: number;
  expended: number;
  // Called with the new expended count when a pip is toggled.
  onChange: (newExpended: number) => void;
}

/**
 * A row of clickable slot pips. Expended (used) slots are filled and shown on
 * the left; available slots are open circles. Clicking a pip toggles every slot
 * up to and including it, so a single click can expend or restore a run of slots
 * — the same behaviour as checking boxes off on a paper sheet.
 */
export default function SlotPips({ total, expended, onChange }: SlotPipsProps) {
  const safeExpended = Math.max(0, Math.min(expended, total));
  if (total <= 0) return <></>;
  return (
    <div className="row slot-pips">
      {[...Array(total)].map((_, i) => {
        const used = i < safeExpended;
        return (
          <button
            key={i}
            type="button"
            className="slot-pip"
            aria-label={used ? "Expended slot" : "Available slot"}
            onClick={(e) => {
              e.preventDefault();
              // Clicking an available pip expends down to it; clicking an
              // expended pip restores everything from it rightward.
              onChange(i < safeExpended ? i : i + 1);
            }}
          >
            {used ? <FaCircle /> : <FaRegCircle />}
          </button>
        );
      })}
    </div>
  );
}
