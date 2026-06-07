import { ReactNode, useEffect } from "react";

interface ModalProps {
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

// Reusable modal shell. Owns the backdrop, the centered content box, and the
// corner close button; callers supply a title and the body content. Closes on
// backdrop click and on Escape.
export default function Modal({ title, onClose, children }: ModalProps) {
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
      <div className="modal-content">
        <div className="row space-between modal-header">
          {title && <h1>{title}</h1>}
          <div className="close">
            <button className="icon-btn" onClick={onClose}>
              x
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
