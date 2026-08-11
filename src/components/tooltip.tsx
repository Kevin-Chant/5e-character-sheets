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

// Hover/focus tooltip. Focusable for keyboard reach; label exposed via aria.
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
