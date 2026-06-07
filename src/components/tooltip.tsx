import { ReactNode } from "react";

interface TooltipProps {
  /** The text shown in the floating bubble on hover/focus. */
  label: ReactNode;
  /** The element the tooltip is attached to. */
  children: ReactNode;
  /** Where the bubble appears relative to the trigger. Defaults to "bottom". */
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
}

// Reusable hover/focus tooltip. Wraps an arbitrary trigger and reveals a
// one-line label via CSS (`.tooltip` styles in index.css). Focusable so it is
// reachable by keyboard, and exposes the label to assistive tech via aria.
export default function Tooltip({
  label,
  children,
  position = "bottom",
  className,
}: TooltipProps) {
  return (
    <span
      className={["tooltip", `tooltip-${position}`, className]
        .filter(Boolean)
        .join(" ")}
      tabIndex={0}
    >
      {children}
      <span className="tooltip-bubble" role="tooltip">
        {label}
      </span>
    </span>
  );
}
