import { useState } from "react";
import classNames from "classnames";

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
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);

  const Components = {
    div: "div",
    p: "p",
  };
  const Component = (Components as any)[ComponentType] || "div";

  // TODO fix nesting by splitting container logic and component logic
  return (
    <Component
      className={classNames(componentClass, "popover-anchor", { pinned })}
      onClick={() => setPinned((p) => !p)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      title={pinned ? "Click to unpin" : "Click to keep open"}
    >
      {componentChildren}
      {(hovering || pinned) && popoverChildren && (
        <div className={classNames(popoverClass, { pinned })}>
          {popoverChildren}
          <span className="popover-pin-hint" aria-hidden="true">
            📌
          </span>
        </div>
      )}
    </Component>
  );
}
