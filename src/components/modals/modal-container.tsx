import React, { useCallback, useEffect } from "react";

interface ModalProps {
  back: (() => void) | undefined;
  close: () => void;
}

export default function ModalContainer({
  back,
  close,
  children,
}: ModalProps & React.PropsWithChildren) {
  const keypressListener = useCallback(
    (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        close();
      }
    },
    [close]
  );

  useEffect(() => {
    window.addEventListener("keydown", keypressListener);
    return () => window.removeEventListener("keydown", keypressListener);
  }, [keypressListener]);

  return (
    <div className="modal-container">
      <div className="modal-background" onClick={close} />
      <div className="modal-content">
        <div className="row space-between flex-direction-row-reverse">
          <div className="close">
            <button onClick={close}>x</button>
          </div>
          {back && (
            <div className="back">
              <button onClick={back}>{"<"}</button>
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
