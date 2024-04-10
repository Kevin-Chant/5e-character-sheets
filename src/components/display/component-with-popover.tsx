import { useState } from "react";

interface ComponentWithPopoverProps {
  ComponentType?: string;
  componentClass?: string;
  componentChildren: React.ReactNode;
  popoverClass?: string;
  popoverChildren: React.ReactNode;
}

export default function ComponentWithPopover({
  ComponentType = "div",
  componentClass = "rounded-border-box pos-relative full-width margin-medium padding-small editable",
  componentChildren,
  popoverClass = "popover-container padding-medium rounded-border-box",
  popoverChildren,
}: ComponentWithPopoverProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [hovering, setHovering] = useState(false);
  const togglePopoverDisplay = () => {
    setShowPopover(!showPopover);
  };

  const Components = {
    div: "div",
    p: "p",
  };
  const Component = (Components as any)[ComponentType] || "div";

  // TODO fix nesting by splitting container logic and component logic
  return (
    <Component
      className={componentClass}
      onClick={togglePopoverDisplay}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {componentChildren}
      {(showPopover || hovering) && popoverChildren && (
        <div className={popoverClass}>{popoverChildren}</div>
      )}
    </Component>
  );
}
