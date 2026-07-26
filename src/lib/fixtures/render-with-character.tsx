import { ReactElement, useState } from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { FIELD } from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { Action } from "src/lib/hooks/reducers/actions";
import reducer from "src/lib/hooks/reducers/reducer";
import { CharacterContext } from "src/lib/hooks/use-character";
import { EditModeContext } from "src/lib/hooks/use-edit-mode";
import { SettingsContextProvider } from "src/lib/hooks/use-settings";
import { TargetedFieldContext } from "src/lib/hooks/use-targeted-field";
import { SaveContext } from "src/components/modals/modal-container";
import { Character } from "src/lib/types";

// One harness for the sheet's display components and edit modals.
//
// These all read the open character from `CharacterContext`, and the modals
// additionally need a *targeted field* (which field the modal was opened for)
// and the modal container's save/commit callbacks. Rendering them used to mean
// mocking `use-character` per file, which couples each test to the hook's shape
// and can't express "opened for `spells`, sub-field `3.0`".
//
// So this supplies the real contexts with stub values instead. Nothing is
// mocked: the components run their actual `useLoadedCharacter` /
// `useTargetedField` / `useSave` code paths, and the spies this returns are
// the seams a test asserts on — `dispatch` for edits that go through the
// reducer, `commit`/`saveData` for the modal save flow.
//
// `dispatch` is a spy that *also* runs the real reducer and re-renders, so the
// character in context actually changes. Without that, every field on the sheet
// is a controlled input wired to a value that never moves: typing "12" into a
// field showing 340 produces "34012", and the test ends up asserting on an
// artefact of the harness rather than on the component. It also means a test
// can assert the resulting character, not just the action.

export interface CharacterHarness {
  character?: Character;
  // Which field the modal under test was opened for, and its sub-path. Display
  // components don't need these; every `edit-*` modal returns null without them.
  targetedField?: FIELD;
  subField?: string;
  // Play mode hides the edit affordances (pencils, +) — pass false to assert
  // that a display component stops offering them.
  editMode?: boolean;
}

export function aCharacter(): Character {
  return structuredClone(defaultCharacter) as Character;
}

export function renderWithCharacter(
  ui: ReactElement,
  {
    character: initial = aCharacter(),
    targetedField,
    subField,
    editMode = true,
  }: CharacterHarness = {},
) {
  const dispatch = vi.fn();
  const saveData = vi.fn();
  const commit = vi.fn();
  const setTargetedFieldStack = vi.fn();
  // The live character, so a test can read the end state after interacting.
  const latest = { current: initial };

  function Harness() {
    const [character, setCharacter] = useState(initial);
    latest.current = character;
    const apply = (action: Action) => {
      dispatch(action);
      setCharacter((current) => reducer(current, action) ?? current);
    };
    return (
      <SettingsContextProvider>
        <CharacterContext.Provider
          value={{
            character,
            dispatch: apply,
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
          }}
        >
          <EditModeContext.Provider
            value={{ editMode, setEditMode: vi.fn(), toggleMode: vi.fn() }}
          >
            <TargetedFieldContext.Provider
              value={{
                targetedFieldStack:
                  targetedField === undefined
                    ? []
                    : [[targetedField, subField]],
                setTargetedFieldStack,
              }}
            >
              <SaveContext.Provider value={{ saveData, commit }}>
                {ui}
              </SaveContext.Provider>
            </TargetedFieldContext.Provider>
          </EditModeContext.Provider>
        </CharacterContext.Provider>
      </SettingsContextProvider>
    );
  }

  const result = render(<Harness />);

  return {
    ...result,
    // The character as it stands *now* — read it after interacting.
    get character() {
      return latest.current;
    },
    dispatch,
    saveData,
    commit,
    setTargetedFieldStack,
  };
}

// The value an `update_*` action carries, for asserting on `dispatch`. The
// reducer's rule is that an update carries the field's *whole* new value, so a
// test asserts on that value rather than on a diff.
export const dispatchedValue = (dispatch: { mock: { calls: unknown[][] } }) => {
  const last = dispatch.mock.calls.at(-1)?.[0] as
    | { payload?: { value?: unknown } }
    | undefined;
  return last?.payload?.value;
};
