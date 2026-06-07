import { FaSpinner } from "react-icons/fa6";
import type { IconBaseProps } from "react-icons";

// Animated loading spinner: the static FaSpinner icon with a continuous spin.
// Reuse anywhere a loading indicator is needed; forwards icon props (size,
// title, etc.) and merges any extra className.
export default function Spinner({ className, ...props }: IconBaseProps) {
  return (
    <FaSpinner
      className={["spinner", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
