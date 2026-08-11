import classNames from "classnames";
import { UUID } from "crypto";
import React, { useCallback, useEffect, useState } from "react";
import {
  FaBars,
  FaCheck,
  FaCircle,
  FaCloudArrowUp,
  FaDice,
  FaDiceD20,
  FaHand,
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
import { useRollMode } from "src/lib/hooks/use-roll-mode";
import { useSettings } from "src/lib/hooks/use-settings";
import { useSettingsPanel } from "src/lib/hooks/use-settings-panel";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import Modal from "src/components/modal";
import Spinner from "src/components/spinner";
import Tooltip from "src/components/tooltip";
import ShareModal from "src/components/share-modal";
import NavOverflowMenu from "src/components/nav-overflow-menu";
import PresenceRoster from "src/components/presence-roster";
import ShareRoleBadge from "src/components/share-role-badge";
import BackgroundSaveWarning from "src/components/background-save-warning";
import { requestDriveToken } from "src/lib/google-auth";
import { parseCharacterFile } from "src/lib/character-bundle";
import { navControls, navTitle } from "src/lib/nav-controls";

function Sidebar({ close }: { close: () => void }) {
  const { datastore } = useDatastoreSelector();
  const { characters, deleteCharacter, characterLoading, unsynced } =
    useDatastore();
  const { character, dispatch } = useCharacter();
  const { getRole, teardownSession } = useSharingSessions();
  const { openBuilder } = useCharacterBuilder();

  const deleteCharacterAndRefocus = (uuid: UUID) => {
    teardownSession(uuid);
    deleteCharacter(uuid);
    // Only deleting the open sheet closes it.
    if (uuid === character?.uuid) dispatch(resetCharacter());
  };

  const charactersNavText = !datastore
    ? "Not connected to saved characters"
    : datastore.savedSheetsCopy;

  return (
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
                    to={`/sheet/${characterEntry.uuid}`}
                    onClick={(e) => {
                      // A modified click is "open in a new tab": leave
                      // navigation to the browser, don't switch sheets here.
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
                        return;
                      if (!isSameCharacter) {
                        dispatch(loadPersistedCharacter(characterEntry));
                      }
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
                      {unsynced.has(characterEntry.uuid) && (
                        <FaCloudArrowUp
                          className="margin-small unsynced-badge"
                          title="Still saving to storage — the sheet is safe to open"
                        />
                      )}
                      <ShareRoleBadge
                        uuid={characterEntry.uuid}
                        className="margin-small"
                      />
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
  const { saving, save, stageCharacter } = useDatastore();
  const { editMode, toggleMode } = useEditMode();
  const { rollMode, setRollMode } = useRollMode();
  const { settings } = useSettings();
  const { settingsOpen, openSettings, closeSettings } = useSettingsPanel();
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
        if (typeof content !== "string") {
          setImportErrorMessage("Failed to import, invalid file chosen");
          return;
        }
        // One file or a whole backup — the same dialog reads both.
        const { characters, errors } = parseCharacterFile(JSON.parse(content));
        if (characters.length === 0) {
          console.error("Failed to load character data", errors);
          setImportErrorMessage(
            "This file isn't a valid character sheet. Check the console for details.",
          );
          return;
        }
        // A multi-character file is a restore: write every sheet to storage,
        // not just the one that opens. Staging puts them in the list
        // immediately, badged unsynced until each write lands.
        if (characters.length > 1) {
          characters.forEach((imported) => {
            stageCharacter(imported);
            void save(imported);
          });
        }
        dispatch(loadPersistedCharacter(characters[0]), false);
        setImportErrorMessage(
          errors.length > 0
            ? `Imported ${characters.length}; skipped ${errors.length} that couldn't be read.`
            : "",
        );
        if (errors.length > 0) console.error("Skipped entries", errors);
        setModalOpen(false);
      } catch (e) {
        setImportErrorMessage(
          "Failed to import, unexpected error. Check the console for more details",
        );
        console.error(e);
      }
    };
  }, [fileSelected, dispatch, save, stageCharacter]);

  // requestDriveToken must be called from the click itself (popup blockers);
  // the retried save then clears the indicator through the normal path.
  const reauthorizeAndSave = () => {
    void requestDriveToken().then((ok) => {
      if (ok) saveNow();
    });
  };

  const saveIndicator =
    saveError === "auth" ? (
      <Tooltip
        className="tooltip-align-end"
        label="Google Drive needs you to sign in again to save. Click to sign in — your edits are kept in this tab until then."
      >
        <button
          className="icon-btn save-indicator-error"
          onClick={reauthorizeAndSave}
          aria-label="Sign in to Google Drive again and save"
        >
          <FaTriangleExclamation />
        </button>
      </Tooltip>
    ) : saveError ? (
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

  const onPlaySurface =
    location.pathname === "/play" || location.pathname.startsWith("/play/");
  const pageTitle = navTitle(location.pathname, character?.name);

  // Not for a sheet joined remotely or borrowed from a DM — sharing is the owner's call.
  const canShare =
    !!character &&
    !!datastore &&
    getRole(character.uuid) !== "remote" &&
    !isBorrowed(character.uuid);

  // The matrix lives in `lib/nav-controls.ts`.
  const controls = navControls({
    pathname: location.pathname,
    hasCharacter: !!character,
    hasDatastore: !!datastore,
    canShare,
    autosave: settings.autosave,
  });

  const shareIntent = (location.state as { share?: boolean } | null)?.share;
  useEffect(() => {
    if (shareIntent && canShare) setShareModalOpen(true);
  }, [shareIntent, canShare]);

  return (
    <>
      <div id="nav">
        <nav id="main-nav">
          {controls.characterDrawer && (
            <button
              className="icon-btn"
              onClick={toggleSidebar}
              title="Characters"
            >
              <FaBars />
            </button>
          )}
          <Link to="/">
            <button
              className="icon-btn"
              title="Home — your characters and games"
            >
              <FaHouse />
            </button>
          </Link>
          <h1>{pageTitle}</h1>
        </nav>
        <div id="right-nav-components">
          <PresenceRoster />
          {controls.playToggle && (
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
          {/* In-memory table posture, not a persisted setting. */}
          {controls.rollMode && (
            <button
              className="icon-btn"
              onClick={() => setRollMode(rollMode === "app" ? "manual" : "app")}
              title={
                rollMode === "app"
                  ? "The app rolls your dice — switch to rolling real dice"
                  : "You're rolling real dice — switch to app rolls"
              }
              aria-label={
                rollMode === "app"
                  ? "Switch to rolling real dice"
                  : "Switch to app rolls"
              }
              aria-pressed={rollMode === "manual"}
            >
              {rollMode === "app" ? <FaDice /> : <FaHand />}
            </button>
          )}
          {controls.editMode && (
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
          {controls.share && (
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
          <button
            className="icon-btn"
            onClick={settingsOpen ? closeSettings : openSettings}
            title={settingsOpen ? "Close settings" : "Settings"}
            aria-label={settingsOpen ? "Close settings" : "Settings"}
            aria-expanded={settingsOpen}
          >
            <FaGear />
          </button>
          {controls.saveIndicator && (
            <div id="save-container">
              {controls.undoRedo && (
                <>
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
                </>
              )}
              <p>{saveIndicator}</p>
              {controls.saveButton && (
                <button
                  className="icon-btn"
                  onClick={saveNow}
                  title="Save character (⌘S / Ctrl+S)"
                >
                  <FaFloppyDisk />
                </button>
              )}
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
            accept=".5echarsheet,.5echarbundle"
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
      <BackgroundSaveWarning />
      <div className="flex">
        {showSidebar && <Sidebar close={() => setShowSidebar(false)} />}
        <div id="detail">
          <Outlet />
        </div>
      </div>
    </>
  );
}
