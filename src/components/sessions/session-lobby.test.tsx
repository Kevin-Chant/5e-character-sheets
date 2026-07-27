import { UUID } from "crypto";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionLobby from "src/components/sessions/session-lobby";
import LocalDatastore from "src/datastores/local-datastore";
import { DatastoreContext } from "src/lib/hooks/use-datastore";
import { DatastoreSelectorContext } from "src/lib/hooks/use-datastore-selector";
import { aCharacter } from "src/lib/fixtures/render-with-character";
import { rememberSessionLocally } from "src/lib/play/session-memory";
import { Character } from "src/lib/types";

// The lobby is where the personas actually diverge — same route, three
// different questions depending on who arrived.

const CODE = "3f8a91c2-7d14-4a9b-9c02-5e8f1b6a4d33";
const OTHER = "aa11bb22-cc33-4d44-8e55-ff6677889900";

function named(name: string, uuid: string): Character {
  return { ...aCharacter(), name, uuid: uuid as UUID };
}

const BRAKKA = named("Brakka", "11111111-2222-3333-4444-555555555555");
const NADIA = named("Nadia", "66666666-7777-8888-9999-000000000000");

function renderLobby({
  mode = "join" as "host" | "join",
  code = CODE as string | undefined,
  characters = [BRAKKA, NADIA],
  withDatastore = true,
  onConfirm = vi.fn(),
} = {}) {
  render(
    <MemoryRouter>
      <DatastoreSelectorContext.Provider
        value={{
          datastore: withDatastore ? LocalDatastore : undefined,
          setDatastore: vi.fn(),
        }}
      >
        <DatastoreContext.Provider
          value={{ characters, characterLoading: false } as never}
        >
          <SessionLobby
            mode={mode}
            code={code}
            onCancel={vi.fn()}
            onConfirm={onConfirm}
          />
        </DatastoreContext.Provider>
      </DatastoreSelectorContext.Provider>
    </MemoryRouter>,
  );
  return { onConfirm };
}

describe("the lobby", () => {
  beforeEach(() => window.localStorage.clear());

  it("leads a sheetless joiner with the game, not with storage", () => {
    renderLobby({ withDatastore: false });
    expect(
      screen.getByText(/You don't need a character sheet to join/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Join the game" }),
    ).toBeInTheDocument();
    // Storage is offered, but folded away behind a question.
    expect(
      screen.getByText(/Already have a character saved/),
    ).toBeInTheDocument();
  });

  it("leads a DM with no sheets straight to starting the table", () => {
    renderLobby({ mode: "host", code: undefined, withDatastore: false });
    expect(
      screen.getByRole("button", { name: "Start the game" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Want to bring sheets/)).toBeInTheDocument();
  });

  it("preselects the sheet this browser played at this table", () => {
    rememberSessionLocally({
      code: CODE,
      lastJoined: 1,
      seat: "player",
      playAsUuid: BRAKKA.uuid,
      playAsName: "Brakka",
    });
    renderLobby();
    expect(
      screen.getByRole("button", { name: "Join as Brakka" }),
    ).toBeInTheDocument();
  });

  it("falls back to the last sheet played anywhere, since codes churn weekly", () => {
    // A different table entirely — the DM sent a brand-new code tonight.
    rememberSessionLocally({
      code: OTHER,
      lastJoined: 1,
      seat: "player",
      playAsUuid: NADIA.uuid,
      playAsName: "Nadia",
    });
    renderLobby({ code: CODE });
    expect(
      screen.getByRole("button", { name: "Join as Nadia" }),
    ).toBeInTheDocument();
  });

  it("doesn't ask a returning DM about sheets the room already holds", () => {
    rememberSessionLocally({
      code: CODE,
      lastJoined: 1,
      seat: "dm",
      broughtUuids: [BRAKKA.uuid],
    });
    renderLobby();
    expect(screen.getByText("Back to your table")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rejoin the table" }),
    ).toBeInTheDocument();
    // No character list at all: re-bringing would re-snapshot vitals from
    // full-health sheets onto monsters mid-fight.
    expect(screen.queryByText("Brakka")).toBeNull();
  });

  it("reports the seat so the next rejoin knows which lobby to show", () => {
    const { onConfirm } = renderLobby({ mode: "host", code: undefined });
    screen.getByRole("button", { name: "Start the session" }).click();
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ runningTable: true }),
    );
  });
});
