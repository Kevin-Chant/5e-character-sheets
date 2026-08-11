import { ReactElement, useState } from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { FIELD } from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { Action } from "src/lib/hooks/reducers/actions";
import reducer from "src/lib/hooks/reducers/reducer";
import { CharacterContext } from "src/lib/hooks/use-character";
import { EditModeContext } from "src/lib/hooks/use-edit-mode";
import {
  DEFAULT_SETTINGS,
  Settings,
  SettingsContext,
  SettingsContextProvider,
} from "src/lib/hooks/use-settings";
import { TargetedFieldContext } from "src/lib/hooks/use-targeted-field";
import { SaveContext } from "src/components/modals/modal-container";
import {
  ENCOUNTER_STORAGE_KEY,
  EncounterContextProvider,
} from "src/lib/hooks/use-encounter";
import { removeLocalStorage } from "src/lib/local-storage";
import { Character } from "src/lib/types";

// Harness for the sheet's display components and edit modals: supplies the
// real character/targeted-field/save contexts with stub values, so components
// run their actual `useLoadedCharacter`/`useTargetedField`/`useSave` code
// paths. Spies (`dispatch`, `commit`/`saveData`) are the seams a test asserts
// on.
//
// `dispatch` also runs the real reducer and re-renders, so the character in
// context actually changes — otherwise every field is a controlled input
// wired to a value that never moves.

export interface CharacterHarness {
  character?: Character;
  // Field the modal under test was opened for, and its sub-path; every
  // `edit-*` modal returns null without them.
  targetedField?: FIELD;
  subField?: string;
  // Play mode hides edit affordances — pass false to assert they're hidden.
  editMode?: boolean;
  // Overrides merged over the defaults. Supplying any override swaps the
  // stateful provider for a fixed value, so `updateSetting` becomes a no-op.
  settings?: Partial<Settings>;
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
    settings,
  }: CharacterHarness = {},
) {
  const dispatch = vi.fn();
  const saveData = vi.fn();
  const commit = vi.fn();
  const setTargetedFieldStack = vi.fn();
  // The encounter provider outlives a test unless cleared here.
  removeLocalStorage(ENCOUNTER_STORAGE_KEY);
  const latest = { current: initial };

  function Harness() {
    const [character, setCharacter] = useState(initial);
    latest.current = character;
    const apply = (action: Action) => {
      dispatch(action);
      setCharacter((current) => reducer(current, action) ?? current);
    };
    const withSettings = (inner: ReactElement) =>
      settings ? (
        <SettingsContext.Provider
          value={{
            settings: { ...DEFAULT_SETTINGS, ...settings } as Settings,
            updateSetting: vi.fn(),
            resetSettings: vi.fn(),
          }}
        >
          {inner}
        </SettingsContext.Provider>
      ) : (
        <SettingsContextProvider>{inner}</SettingsContextProvider>
      );

    return withSettings(
      <>
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
            persistCharacter: vi.fn(async () => true),
            openSharingSession: vi.fn(),
            closeSharingSession: vi.fn(),
          }}
        >
          <EncounterContextProvider>
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
          </EncounterContextProvider>
        </CharacterContext.Provider>
      </>,
    );
  }

  const result = render(<Harness />);

  return {
    ...result,
    get character() {
      return latest.current;
    },
    dispatch,
    saveData,
    commit,
    setTargetedFieldStack,
  };
}

// The value an `update_*` action carries — the whole new field value, not a
// diff — for asserting on `dispatch`.
export const dispatchedValue = (dispatch: { mock: { calls: unknown[][] } }) => {
  const last = dispatch.mock.calls.at(-1)?.[0] as
    | { payload?: { value?: unknown } }
    | undefined;
  return last?.payload?.value;
};
