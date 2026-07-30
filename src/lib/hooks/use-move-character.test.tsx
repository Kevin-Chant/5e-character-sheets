// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import GoogleDriveDatastore from "src/datastores/google-drive-datastore";
import LocalDatastore from "src/datastores/local-datastore";
import { aCharacter } from "src/lib/fixtures/render-with-character";
import { CharacterContext } from "src/lib/hooks/use-character";
import { DatastoreSelectorContext } from "src/lib/hooks/use-datastore-selector";
import { useMoveCharacter } from "src/lib/hooks/use-move-character";
import { readLocalStorage, removeLocalStorage } from "src/lib/local-storage";
import { Character, Datastore } from "src/lib/types";

// The hook decides *whether* the open character can move, *where to*, and runs
// the Drive → browser direction inline. The browser → Drive direction only
// hands an intent to /auth here; its completion is gapi-bound and verified
// in-browser like the rest of the Drive code.

function Probe() {
  const { target, handleMove } = useMoveCharacter();
  return (
    <div>
      <span data-testid="target">{target ?? "none"}</span>
      <button onClick={handleMove}>move</button>
    </div>
  );
}

// Where the move navigated to, with the intent it carried.
function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}:{JSON.stringify(location.state)}
    </span>
  );
}

function renderHook({
  datastore,
  character,
}: {
  datastore?: Datastore;
  character?: Character;
}) {
  const setDatastore = vi.fn();
  const characterContext = {
    character,
    dispatch: vi.fn(),
    reset: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    unsavedChanges: false,
    setUnsavedChanges: vi.fn(),
    saveError: false,
    saveNow: vi.fn(),
    openSharingSession: vi.fn(),
    closeSharingSession: vi.fn(),
  };
  render(
    <MemoryRouter initialEntries={["/sheet"]}>
      <DatastoreSelectorContext.Provider value={{ datastore, setDatastore }}>
        <CharacterContext.Provider value={characterContext}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <Probe />
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </CharacterContext.Provider>
      </DatastoreSelectorContext.Provider>
    </MemoryRouter>,
  );
  return { setDatastore };
}

const storedCharacters = () => readLocalStorage("characters", {});

// `isShared` is optional on `Datastore`, which trips vi.spyOn's typing; pin it
// down to the concrete shape the Drive store actually has.
const spyIsShared = (value: boolean) =>
  vi
    .spyOn(
      GoogleDriveDatastore as {
        isShared: (uuid: Character["uuid"]) => boolean;
      },
      "isShared",
    )
    .mockReturnValue(value);

afterEach(() => {
  removeLocalStorage("characters");
  removeLocalStorage("lastDatastore");
  vi.restoreAllMocks();
});

describe("useMoveCharacter", () => {
  it("offers Drive to a character stored in this browser", () => {
    renderHook({ datastore: LocalDatastore, character: aCharacter() });
    expect(screen.getByTestId("target").textContent).toBe("drive");
  });

  it("offers this browser to a private Drive character", () => {
    spyIsShared(false);
    renderHook({ datastore: GoogleDriveDatastore, character: aCharacter() });
    expect(screen.getByTestId("target").textContent).toBe("local");
  });

  it("does not offer to move a shared Drive document", () => {
    spyIsShared(true);
    renderHook({ datastore: GoogleDriveDatastore, character: aCharacter() });
    expect(screen.getByTestId("target").textContent).toBe("none");
  });

  it("offers nothing without an open character", () => {
    renderHook({ datastore: LocalDatastore });
    expect(screen.getByTestId("target").textContent).toBe("none");
  });

  it("moves Drive → browser: saves locally, deletes from Drive, swaps store", async () => {
    spyIsShared(false);
    const driveDelete = vi
      .spyOn(GoogleDriveDatastore, "deleteFromDatastore")
      .mockImplementation(() => {});
    const character = aCharacter();
    const { setDatastore } = renderHook({
      datastore: GoogleDriveDatastore,
      character,
    });

    await act(async () => {
      screen.getByText("move").click();
    });

    await waitFor(() =>
      expect(storedCharacters()[character.uuid]?.uuid).toBe(character.uuid),
    );
    expect(driveDelete).toHaveBeenCalledWith(character.uuid);
    expect(setDatastore).toHaveBeenCalledWith(LocalDatastore);
    expect(readLocalStorage("lastDatastore")).toBe("local");
    // Reopens by uuid on the far side — the swap closes the sheet.
    expect(screen.getByTestId("location").textContent).toBe(
      `/sheet:{"openCharacter":"${character.uuid}"}`,
    );
  });

  it("moves browser → Drive by flushing locally and sending the intent to /auth", async () => {
    const character = aCharacter();
    const { setDatastore } = renderHook({
      datastore: LocalDatastore,
      character,
    });

    await act(async () => {
      screen.getByText("move").click();
    });

    // Flushed so the completion effect can read it back after the auth trip.
    await waitFor(() =>
      expect(storedCharacters()[character.uuid]?.uuid).toBe(character.uuid),
    );
    expect(setDatastore).not.toHaveBeenCalled();
    expect(screen.getByTestId("location").textContent).toBe(
      `/auth:{"returnTo":"/sheet","moveToDrive":"${character.uuid}"}`,
    );
  });
});
