import classNames from "classnames";
import { ReactNode, useEffect } from "react";
import { FaXmark } from "react-icons/fa6";

interface ModalProps {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string; // For dialogs needing more room than the default size.
}

// Modal shell: backdrop, centered content box, corner close button. Closes
// on backdrop click and on Escape.
export default function Modal({
  title,
  onClose,
  children,
  className,
}: ModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-container">
      <div className="modal-background" onClick={onClose} />
      <div className={classNames("modal-content", className)}>
        <div className="row space-between modal-header">
          {title && <h1>{title}</h1>}
          <div className="close">
            <button
              className="icon-btn"
              onClick={onClose}
              aria-label="Close"
              title="Close"
            >
              <FaXmark />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
