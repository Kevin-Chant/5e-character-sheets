import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import {
  FaCloudArrowDown,
  FaEllipsisVertical,
  FaFileExport,
  FaFileImport,
  FaGithub,
} from "react-icons/fa6";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useDriveImport } from "src/lib/hooks/use-drive-import";

interface NavOverflowMenuProps {
  onImportFile: () => void;
  onExportFile: () => void;
  hasCharacter: boolean;
}

type MenuItem = {
  key: string;
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  // Items separated from the preceding group by a divider in the dropdown.
  group?: "primary" | "secondary";
} & ({ onClick: () => void } | { href: string });

// Collects the occasional / one-time nav actions (import, export, GitHub) into a
// single dropdown so the bar can keep only frequent actions as direct buttons.
// When only one action is actually available, the dropdown collapses to that
// action rendered directly — a menu wrapping a lone item isn't worth the click.
export default function NavOverflowMenu({
  onImportFile,
  onExportFile,
  hasCharacter,
}: NavOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { datastore } = useDatastoreSelector();
  const {
    supported: driveImportSupported,
    busy: driveImportBusy,
    handleImport: handleDriveImport,
  } = useDriveImport();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const items: MenuItem[] = [
    // Local import needs a datastore to load into; hidden until one is selected.
    datastore && {
      key: "import-file",
      icon: <FaFileImport />,
      label: "Import from file…",
      onClick: onImportFile,
      group: "primary" as const,
    },
    driveImportSupported && {
      key: "import-drive",
      icon: <FaCloudArrowDown />,
      label: "Import from Drive",
      onClick: handleDriveImport,
      disabled: driveImportBusy,
      group: "primary" as const,
    },
    hasCharacter && {
      key: "export",
      icon: <FaFileExport />,
      label: "Export to file",
      onClick: onExportFile,
      group: "primary" as const,
    },
    {
      key: "github",
      icon: <FaGithub />,
      label: "View on GitHub",
      href: "https://github.com/Kevin-Chant/5e-character-sheets",
      group: "secondary" as const,
    },
  ].filter(Boolean) as MenuItem[];

  if (items.length === 0) return <></>;

  // Single available action: render it directly as an icon button/link instead
  // of a dropdown.
  if (items.length === 1) {
    const item = items[0];
    if ("href" in item) {
      return (
        <a href={item.href} target="_blank" rel="noreferrer" title={item.label}>
          <button className="icon-btn">{item.icon}</button>
        </a>
      );
    }
    return (
      <button
        className="icon-btn"
        onClick={item.onClick}
        disabled={item.disabled}
        title={item.label}
      >
        {item.icon}
      </button>
    );
  }

  return (
    <div className="nav-menu" ref={ref}>
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="More actions"
      >
        <FaEllipsisVertical />
      </button>
      {open && (
        <div className="nav-menu-dropdown" role="menu">
          {items.map((item, i) => {
            const showDivider = i > 0 && item.group !== items[i - 1].group;
            const content = (
              <>
                {item.icon} {item.label}
              </>
            );
            return (
              <Fragment key={item.key}>
                {showDivider && <div className="nav-menu-divider" />}
                {"href" in item ? (
                  <a
                    className="nav-menu-item"
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setOpen(false)}
                  >
                    {content}
                  </a>
                ) : (
                  <button
                    className="nav-menu-item"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.onClick();
                    }}
                  >
                    {content}
                  </button>
                )}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
