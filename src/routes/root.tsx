import classNames from "classnames";
import { UUID } from "crypto";
import React, { useCallback, useEffect, useState } from "react";
import {
  FaBars,
  FaCheck,
  FaCircle,
  FaDiceD20,
  FaFileLines,
  FaFloppyDisk,
  FaGear,
  FaHouse,
  FaLock,
  FaLockOpen,
  FaRotateLeft,
  FaRotateRight,
  FaShareNodes,
  FaTowerBroadcast,
  FaTrash,
  FaTriangleExclamation,
  FaUsers,
} from "react-icons/fa6";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  loadPersistedCharacter,
  resetCharacter,
} from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useCharacterBuilder } from "src/lib/hooks/use-character-builder";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import Modal from "src/components/modal";
import Spinner from "src/components/spinner";
import Tooltip from "src/components/tooltip";
import ShareModal from "src/components/share-modal";
import NavOverflowMenu from "src/components/nav-overflow-menu";
import PresenceRoster from "src/components/presence-roster";
import { hydrateCharacter } from "src/lib/migrations/hydrate-character";

function Sidebar({ close }: { close: () => void }) {
  const { datastore } = useDatastoreSelector();
  const { characters, deleteCharacter, characterLoading } = useDatastore();
  const { character, dispatch } = useCharacter();
  const { getRole, teardownSession } = useSharingSessions();
  const { openBuilder } = useCharacterBuilder();

  const deleteCharacterAndRefocus = (uuid: UUID) => {
    // End any live session for this character before removing it, so we don't
    // leave a dangling realm open on the server.
    teardownSession(uuid);
    deleteCharacter(uuid);
    dispatch(resetCharacter());
  };

  const charactersNavText = !datastore
    ? "Not connected to saved characters"
    : datastore.savedSheetsCopy;

  return (
    // The drawer is a temporary overlay, so a click anywhere outside it means
    // "I'm done here" — same dismissal the modals offer.
    <>
      <div id="sidebar-scrim" onClick={close} />
      <div id="sidebar">
        <div id="sidebar-content" className="margin-small">
          <b>{charactersNavText}</b>
          <hr></hr>
          <ul className="character-list">
            {characterLoading && (
              <div>
                Loading <Spinner />
              </div>
            )}
            {characters.map((characterEntry) => {
              const isSameCharacter = characterEntry.uuid === character?.uuid;
              return (
                <li key={characterEntry.uuid} className="row space-between">
                  <Link
                    className="no-underline font-black"
                    to="/sheet"
                    onClick={() => {
                      if (!isSameCharacter) {
                        dispatch(loadPersistedCharacter(characterEntry));
                      }
                      // Picking a sheet is the drawer's whole job — leaving it
                      // open just covers the sheet you asked for.
                      close();
                    }}
                  >
                    <p className={classNames({ bold: isSameCharacter })}>
                      {getRole(characterEntry.uuid) === "host" && (
                        <FaTowerBroadcast
                          className="margin-small"
                          title="Live sharing session in progress"
                        />
                      )}
                      {characterEntry.name}
                    </p>
                  </Link>
                  <button
                    className="icon-btn btn-danger"
                    onClick={() =>
                      deleteCharacterAndRefocus(characterEntry.uuid)
                    }
                  >
                    <FaTrash />
                  </button>
                </li>
              );
            })}
            {datastore?.createCharacter && (
              <button
                className="btn-primary"
                onClick={() => {
                  close();
                  openBuilder();
                }}
              >
                Create new character
              </button>
            )}
          </ul>
        </div>
      </div>
    </>
  );
}

export default function Root() {
  const [showSidebar, setShowSidebar] = useState(false);
  const { datastore } = useDatastoreSelector();
  const {
    character,
    unsavedChanges,
    setUnsavedChanges,
    saveError,
    saveNow,
    dispatch,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useCharacter();
  const { saving } = useDatastore();
  const { editMode, toggleMode } = useEditMode();
  const { getRole, isBorrowed } = useSharingSessions();
  const location = useLocation();
  const [fileSelected, setFileSelected] = useState<File | undefined>();
  const [importErrorMessage, setImportErrorMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const saveCharacter = useCallback(() => {
    if (!character) return;
    const fileContent = JSON.stringify(character);
    const blob = new Blob([fileContent], { type: "text/plain" });
    const a = document.createElement("a");
    a.download = `${character.name}.5echarsheet`;
    a.href = window.URL.createObjectURL(blob);
    a.click();
    a.remove();
    setUnsavedChanges(false);
  }, [character, setUnsavedChanges]);

  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    setFileSelected(fileList[0]);
  };

  const loadCharacterData = useCallback(() => {
    if (!fileSelected) return;
    const reader = new FileReader();
    reader.readAsText(fileSelected, "UTF-8");
    reader.onload = (readerEvent) => {
      try {
        const content = readerEvent.target?.result;
        if (typeof content === "string") {
          const result = hydrateCharacter(JSON.parse(content));
          if (!result.ok) {
            console.error("Failed to load character data", result.errors);
            setImportErrorMessage(
              "This file isn't a valid character sheet. Check the console for details.",
            );
            return;
          }
          dispatch(loadPersistedCharacter(result.character), false);
          setImportErrorMessage("");
          setModalOpen(false);
        } else {
          setImportErrorMessage("Failed to import, invalid file chosen");
        }
      } catch (e) {
        setImportErrorMessage(
          "Failed to import, unexpected error. Check the console for more details",
        );
        console.error(e);
      }
    };
  }, [fileSelected, dispatch]);

  const saveIndicator = saveError ? (
    <Tooltip
      className="tooltip-align-end"
      label="Couldn't save your latest changes. Check your connection; your edits are kept in this tab for now."
    >
      <FaTriangleExclamation className="save-indicator-error" />
    </Tooltip>
  ) : saving ? (
    <Tooltip className="tooltip-align-end" label="Saving...">
      <Spinner />
    </Tooltip>
  ) : unsavedChanges ? (
    <Tooltip
      className="tooltip-align-end"
      label="Unsaved changes, your edits haven't been saved yet"
    >
      <FaCircle className="save-indicator-unsaved" />
    </Tooltip>
  ) : (
    <Tooltip className="tooltip-align-end" label="Changes saved!">
      <FaCheck />
    </Tooltip>
  );

  // Derive a title that describes the current page, rather than a static label
  // that reads like it belongs to the adjacent Home button.
  const onPlaySurface = location.pathname === "/play";
  const pageTitle =
    location.pathname === "/settings"
      ? "Settings"
      : location.pathname === "/sessions"
        ? "Sessions"
        : location.pathname === "/sheet" || onPlaySurface
          ? (character?.name ?? "Character Select")
          : "Home";

  // Not for a sheet you joined remotely or borrowed from a DM — sharing is the
  // owner's call, and neither of those copies is yours to offer.
  const canShare =
    !!character &&
    !!datastore &&
    getRole(character.uuid) !== "remote" &&
    !isBorrowed(character.uuid);

  // "Share a character" on the sessions page is an intent, not a destination:
  // it lands on /sheet, which shows the picker when no character is open, and
  // the modal opens as soon as there is one to share.
  const shareIntent = (location.state as { share?: boolean } | null)?.share;
  useEffect(() => {
    if (shareIntent && canShare) setShareModalOpen(true);
  }, [shareIntent, canShare]);

  return (
    <>
      <div id="nav">
        {/* TODO: mobile-friendly nav */}
        <nav id="main-nav">
          <button
            className="icon-btn"
            onClick={toggleSidebar}
            title="Characters"
          >
            <FaBars />
          </button>
          {/* Carry picker state so Home shows the storage picker instead of
              auto-redirecting back into the last-used datastore. */}
          <Link to="/" state={{ picker: true }}>
            <button className="icon-btn" title="Home">
              <FaHouse />
            </button>
          </Link>
          <h1>{pageTitle}</h1>
        </nav>
        <div id="right-nav-components">
          <PresenceRoster />
          {/* Sessions are reachable from anywhere, because deciding to play
              together happens after you've picked a character, not before. */}
          <Link to="/sessions">
            <button className="icon-btn" title="Sessions" aria-label="Sessions">
              <FaUsers />
            </button>
          </Link>
          {/* Play is a place you go, not a state the sheet is in — so it's a
              link, and the button says where it takes you. */}
          {character && (
            <Link to={onPlaySurface ? "/sheet" : "/play"}>
              <button
                className="icon-btn"
                title={onPlaySurface ? "Back to the sheet" : "Play"}
                aria-label={onPlaySurface ? "Back to the sheet" : "Play"}
              >
                {onPlaySurface ? <FaFileLines /> : <FaDiceD20 />}
              </button>
            </Link>
          )}
          {character && !onPlaySurface && (
            <button
              className="icon-btn"
              onClick={toggleMode}
              title={editMode ? "Switch to view mode" : "Switch to edit mode"}
              aria-label={
                editMode ? "Switch to view mode" : "Switch to edit mode"
              }
            >
              {editMode ? <FaLockOpen /> : <FaLock />}
            </button>
          )}
          {canShare && (
            <button
              className="icon-btn"
              onClick={() => setShareModalOpen(true)}
              title="Share character"
            >
              <FaShareNodes />
            </button>
          )}
          <NavOverflowMenu
            onImportFile={() => setModalOpen(true)}
            onExportFile={saveCharacter}
            hasCharacter={!!character}
          />
          <Link to="/settings">
            <button className="icon-btn" title="Settings">
              <FaGear />
            </button>
          </Link>
          {character && (
            <div id="save-container">
              <button
                className="icon-btn"
                onClick={undo}
                disabled={!canUndo}
                title="Undo (⌘Z / Ctrl+Z)"
              >
                <FaRotateLeft />
              </button>
              <button
                className="icon-btn"
                onClick={redo}
                disabled={!canRedo}
                title="Redo (⇧⌘Z / Ctrl+Y)"
              >
                <FaRotateRight />
              </button>
              <p>{saveIndicator}</p>
              <button
                className="icon-btn"
                onClick={saveNow}
                title="Save character (⌘S / Ctrl+S)"
              >
                <FaFloppyDisk />
              </button>
            </div>
          )}
        </div>
      </div>
      {modalOpen && (
        <Modal
          title="Choose a file to import"
          onClose={() => setModalOpen(false)}
        >
          <input
            type="file"
            onChange={handleFileChange}
            accept=".5echarsheet"
          />
          <p style={{ color: "red" }}>{importErrorMessage}</p>
          <button
            className="btn-primary"
            disabled={!fileSelected}
            onClick={loadCharacterData}
          >
            Load character
          </button>
        </Modal>
      )}
      {shareModalOpen && (
        <ShareModal onClose={() => setShareModalOpen(false)} />
      )}
      <div className="flex">
        {showSidebar && <Sidebar close={() => setShowSidebar(false)} />}
        <div id="detail">
          <Outlet />
        </div>
      </div>
    </>
  );
}
