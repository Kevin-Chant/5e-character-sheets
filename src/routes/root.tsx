import classNames from "classnames";
import { UUID } from "crypto";
import React, { useCallback, useEffect, useState } from "react";
import {
  FaBars,
  FaCheck,
  FaCircle,
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
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import Modal from "src/components/modal";
import Spinner from "src/components/spinner";
import Tooltip from "src/components/tooltip";
import ShareModal from "src/components/share-modal";
import NavOverflowMenu from "src/components/nav-overflow-menu";
import PresenceRoster from "src/components/presence-roster";
import { hydrateCharacter } from "src/lib/migrations/hydrate-character";
import { navControls, navTitle } from "src/lib/nav-controls";

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
  const { rollMode, setRollMode } = useRollMode();
  const { settings } = useSettings();
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

  // Still needed locally: this one control's icon and label depend on which of
  // the two character surfaces you're looking at, not just on whether it shows.
  const onPlaySurface = location.pathname === "/play";
  const pageTitle = navTitle(location.pathname, character?.name);

  // Not for a sheet you joined remotely or borrowed from a DM — sharing is the
  // owner's call, and neither of those copies is yours to offer.
  const canShare =
    !!character &&
    !!datastore &&
    getRole(character.uuid) !== "remote" &&
    !isBorrowed(character.uuid);

  // Which controls this surface gets. The matrix — and the reasoning for it —
  // lives in `lib/nav-controls.ts`, so a new route declares itself in one place
  // instead of in eight scattered conditions.
  const controls = navControls({
    pathname: location.pathname,
    hasCharacter: !!character,
    hasDatastore: !!datastore,
    canShare,
    autosave: settings.autosave,
  });

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
        <nav id="main-nav">
          {/* The drawer lists saved characters, so with no datastore it opens
              on "Not connected to saved characters" and nothing to click. */}
          {controls.characterDrawer && (
            <button
              className="icon-btn"
              onClick={toggleSidebar}
              title="Characters"
            >
              <FaBars />
            </button>
          )}
          {/* Home is the hub — characters, games, and the way back into either
              — so this is a plain link now. It used to have to carry state to
              stop home from redirecting straight back to where you came from. */}
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
          {/* There is no Sessions button here any more. It existed because the
              front door couldn't answer "who am I playing with", and a second
              icon that lands where Home already lands is the duplicate door the
              sessions page was written to argue against. */}
          {/* Play is a place you go, not a state the sheet is in — so it's a
              link, and the button says where it takes you. */}
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
          {/* App dice or real dice, for every roll surface at once. A table
              posture rather than a setting: in-memory on purpose, and the
              roll dialogs read it to decide between rolling for you and
              asking what your dice said. */}
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
          <Link to="/settings">
            <button className="icon-btn" title="Settings">
              <FaGear />
            </button>
          </Link>
          {controls.saveIndicator && (
            <div id="save-container">
              {/* Undo/redo stay in the nav rather than moving somewhere more
                  sheet-local: they have keyboard shortcuts, so this is the only
                  place anyone discovers they exist. They edit the sheet, so
                  they're scoped to it — on the board they'd invite the
                  expectation that they undo the *fight*, which has no undo. */}
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
              {/* Status, not an action — worth seeing on the board too, where a
                  failed save is exactly the thing you'd want to know about. */}
              <p>{saveIndicator}</p>
              {/* With autosave on (the default) this button duplicates what the
                  indicator beside it already says, and ⌘S covers the impatient.
                  It's the only way to save with autosave *off*, so it follows
                  that setting rather than disappearing outright. */}
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
