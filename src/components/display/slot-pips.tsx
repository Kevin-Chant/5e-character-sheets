import { FaCircle, FaRegCircle } from "react-icons/fa6";

interface SlotPipsProps {
  total: number;
  expended: number;
  // Called with the new expended count when a pip is toggled.
  onChange: (newExpended: number) => void;
}

/**
 * A row of clickable slot pips. Available (ready) slots are filled and shown on
 * the left; expended slots are open circles on the right and get spent one by
 * one from the right. Clicking a pip toggles every slot up to and including it,
 * so a single click can expend or restore a run of slots.
 */
export default function SlotPips({ total, expended, onChange }: SlotPipsProps) {
  const safeExpended = Math.max(0, Math.min(expended, total));
  if (total <= 0) return <></>;
  const available = total - safeExpended;
  return (
    <div className="row slot-pips">
      {[...Array(total)].map((_, i) => {
        const ready = i < available;
        return (
          <button
            key={i}
            type="button"
            className="slot-pip"
            aria-label={ready ? "Available slot" : "Expended slot"}
            onClick={(e) => {
              e.preventDefault();
              // Clicking a ready pip expends it and everything to its right;
              // clicking an expended pip restores it and everything to its left.
              onChange(ready ? total - i : total - (i + 1));
            }}
          >
            {ready ? <FaCircle /> : <FaRegCircle />}
          </button>
        );
      })}
    </div>
  );
}
