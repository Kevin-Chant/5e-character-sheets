import { FaSpinner } from "react-icons/fa6";
import type { IconBaseProps } from "react-icons";

// Spinning loading indicator; forwards icon props and merges className.
export default function Spinner({ className, ...props }: IconBaseProps) {
  return (
    <FaSpinner
      className={["spinner", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
