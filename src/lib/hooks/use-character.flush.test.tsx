// @vitest-environment jsdom
// Closing a sheet that has unsaved edits.
//
// Autosave is debounced and reads whichever character is current when the timer
// fires, so switching sheets inside that window simply dropped the edits you had
// just made. Quiet data loss on its own; with a sharing session for the sheet
// you left, also a *shared* rollback — the peers got those edits over the realm,
// but the stored copy is what `FULL_SYNC` serves and what arriving edits are
// folded into.
//
// The other half of this file is the cases that must NOT write, which is where
// the danger is: a reset means the sheet is going away, and every reason it does
// is a reason not to save it.
import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import React from "react";
import type { UUID } from "crypto";
import {
  loadPersistedCharacter,
  resetCharacter,
  updateData,
} from "src/lib/hooks/reducers/actions";
import { FIELD } from "src/lib/data/data-definitions";
import { CharacterContextProvider, useCharacter } from "./use-character";
import { DatastoreContext } from "./use-datastore";
import { DatastoreSelectorContext } from "./use-datastore-selector";
import type { Character, Datastore } from "src/lib/types";

const A = "11111111-1111-1111-1111-111111111111" as UUID;
const B = "22222222-2222-2222-2222-222222222222" as UUID;

const aSheet = (uuid: UUID, name: string) => ({ uuid, name }) as Character;

function harness() {
  const save = vi.fn(async () => {});
  const actions: { dispatch: (a: ReturnType<typeof resetCharacter>) => void } =
    { dispatch: () => {} };

  function Probe() {
    const { dispatch } = useCharacter();
    actions.dispatch = dispatch;
    return null;
  }

  render(
    <DatastoreSelectorContext.Provider
      value={{ datastore: {} as Datastore, setDatastore: vi.fn() }}
    >
      <DatastoreContext.Provider
        value={
          {
            saving: false,
            characters: [],
            save,
            load: vi.fn(),
            stageCharacter: vi.fn(),
            unsynced: new Set(),
            debounceWait: 1000,
            characterLoading: false,
            setCharacterLoading: vi.fn(),
            loadError: false,
            refresh: vi.fn(),
          } as unknown as React.ContextType<typeof DatastoreContext>
        }
      >
        <CharacterContextProvider>
          <Probe />
        </CharacterContextProvider>
      </DatastoreContext.Provider>
    </DatastoreSelectorContext.Provider>,
  );

  // Open a sheet and dirty it, which is the only interesting starting state.
  act(() => {
    actions.dispatch(loadPersistedCharacter(aSheet(A, "Alia")));
  });
  act(() => {
    actions.dispatch(updateData(FIELD.name, { value: "Alia the Renamed" }));
  });
  save.mockClear();
  return {
    save,
    dispatch: (...args: Parameters<typeof actions.dispatch>) =>
      actions.dispatch(...args),
  };
}

describe("closing a sheet with unsaved edits", () => {
  it("writes it before another character takes its place", () => {
    const { save, dispatch } = harness();

    act(() => {
      dispatch(loadPersistedCharacter(aSheet(B, "Bram")));
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: A, name: "Alia the Renamed" }),
    );
  });

  // A reset is how a *deleted* character leaves the screen (the drawer deletes
  // then resets), and how a datastore swap closes the sheet before the new
  // backend loads. Writing on either is worse than losing the edit: one
  // resurrects a character the user just deleted, the other writes it into the
  // backend they just walked away from.
  it("does not write when the sheet is closed rather than replaced", () => {
    const { save, dispatch } = harness();

    act(() => {
      dispatch(resetCharacter());
    });

    expect(save).not.toHaveBeenCalled();
  });

  // Re-adopting the same uuid is the Drive bootstrap pulling the host's copy
  // over solo edits — the user has just been asked and has chosen to discard
  // them, so persisting them behind that answer is the wrong move.
  it("does not write when the same character is reloaded", () => {
    const { save, dispatch } = harness();

    act(() => {
      dispatch(loadPersistedCharacter(aSheet(A, "Alia, the host's copy")));
    });

    expect(save).not.toHaveBeenCalled();
  });
});
