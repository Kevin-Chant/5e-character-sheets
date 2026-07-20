import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";

interface ComponentWithPopoverProps {
  ComponentType?: string;
  componentClass?: string;
  componentChildren: React.ReactNode;
  popoverClass?: string;
  popoverChildren: React.ReactNode;
}

// Gap in px kept between the popover and the viewport edges when clamping.
const VIEWPORT_MARGIN = 8;
// Size (px) of the bottom-right corner reserved for the native resize grip, so a
// drag started there resizes instead of repositioning.
const RESIZE_CORNER = 18;

interface Point {
  x: number;
  y: number;
}

export default function ComponentWithPopover({
  ComponentType = "div",
  componentClass = "rounded-border-box pos-relative full-width margin-medium padding-small editable",
  componentChildren,
  popoverClass = "popover-container padding-medium rounded-border-box",
  popoverChildren,
}: ComponentWithPopoverProps) {
  // Split hover into anchor + popover: with the portal the popover is no longer a
  // DOM child of the anchor, so leaving the anchor for the popover must not hide.
  const [anchorHovered, setAnchorHovered] = useState(false);
  const [popoverHovered, setPopoverHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  // Base position computed from the anchor rect; drag offset applied on top.
  const [pos, setPos] = useState<Point | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const anchorRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ pointer: Point; offset: Point } | null>(null);

  const open = anchorHovered || popoverHovered || pinned;

  const Components = {
    div: "div",
    p: "p",
  };
  const Component = (Components as any)[ComponentType] || "div";

  // Position the portalled popover: centered on the pill, flush above it (flip
  // below near the top edge), horizontally clamped inside the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (!anchor || !popover) return;
      const a = anchor.getBoundingClientRect();
      const { offsetWidth: w, offsetHeight: h } = popover;
      let left = a.left + a.width / 2 - w / 2;
      left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(left, window.innerWidth - w - VIEWPORT_MARGIN),
      );
      // Prefer above (flush); flip below if it would clip the top edge.
      let top = a.top - h;
      if (top < VIEWPORT_MARGIN) top = a.bottom;
      setPos({ x: left, y: top });
    };
    compute();
    window.addEventListener("scroll", compute, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, { capture: true });
      window.removeEventListener("resize", compute);
    };
    // Re-measure whenever it opens or its content changes.
  }, [open, popoverChildren]);

  // Reset transient drag/resize state whenever the popover fully closes.
  useEffect(() => {
    if (!open) {
      setDragOffset({ x: 0, y: 0 });
      const popover = popoverRef.current;
      if (popover) {
        popover.style.width = "";
        popover.style.height = "";
      }
    }
  }, [open]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pinned) return; // Reposition only when pinned.
    const popover = popoverRef.current;
    if (!popover) return;
    const r = popover.getBoundingClientRect();
    // Leave the native resize grip (bottom-right corner) alone.
    if (
      e.clientX > r.right - RESIZE_CORNER &&
      e.clientY > r.bottom - RESIZE_CORNER
    ) {
      return;
    }
    dragStart.current = {
      pointer: { x: e.clientX, y: e.clientY },
      offset: dragOffset,
    };
    setDragging(true);
    popover.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    setDragOffset({
      x: start.offset.x + (e.clientX - start.pointer.x),
      y: start.offset.y + (e.clientY - start.pointer.y),
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    dragStart.current = null;
    setDragging(false);
    popoverRef.current?.releasePointerCapture(e.pointerId);
  };

  // Toggle pin. Freeze the current (hover) dimensions on pinning so the box keeps
  // its size and only grows via the resize grip — pinning must not jump wider.
  const togglePin = () => {
    const popover = popoverRef.current;
    const next = !pinned;
    if (popover) {
      if (next) {
        popover.style.width = `${popover.offsetWidth}px`;
        popover.style.height = `${popover.offsetHeight}px`;
      } else {
        popover.style.width = "";
        popover.style.height = "";
      }
    }
    if (!next) setDragOffset({ x: 0, y: 0 });
    setPinned(next);
  };

  return (
    <Component
      ref={anchorRef}
      className={classNames(componentClass, "popover-anchor", { pinned })}
      onClick={togglePin}
      onMouseEnter={() => setAnchorHovered(true)}
      onMouseLeave={() => setAnchorHovered(false)}
      title={pinned ? "Click to unpin" : "Click to keep open"}
    >
      {componentChildren}
      {open &&
        popoverChildren &&
        createPortal(
          <div
            ref={popoverRef}
            className={classNames(popoverClass, { pinned, dragging })}
            style={
              pos
                ? {
                    top: pos.y + dragOffset.y,
                    left: pos.x + dragOffset.x,
                  }
                : // Hide (in place) until measured to avoid a flash before the
                  // layout effect positions it.
                  { top: 0, left: 0, visibility: "hidden" }
            }
            onMouseEnter={() => setPopoverHovered(true)}
            onMouseLeave={() => setPopoverHovered(false)}
            // Clicks inside the popover shouldn't toggle the anchor's pin.
            onClick={(e) => e.stopPropagation()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {popoverChildren}
            <span
              className="popover-pin-hint"
              title={pinned ? "Unpin" : "Pin open"}
              role="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                togglePin();
              }}
            >
              📌
            </span>
          </div>,
          document.body,
        )}
    </Component>
  );
}
