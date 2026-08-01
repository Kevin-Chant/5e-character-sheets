// @vitest-environment jsdom
import { UUID } from "crypto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "src/routes/home";
import { CharacterContext } from "src/lib/hooks/use-character";
import { DatastoreSelectorContext } from "src/lib/hooks/use-datastore-selector";
import { writeLastCharacter } from "src/lib/last-character";
import { writeLastDatastore } from "src/lib/last-datastore";
import { rememberSessionLocally } from "src/lib/play/session-memory";

// The front door is the one screen every persona meets, and the only screen
// whose job is to *not* be the same for all of them. These tests pin the four
// arrivals it has to tell apart: someone brand new, someone holding a code,
// a player coming back to their table, and the DM coming back to run it.

const CODE = "3f8a91c2-7d14-4a9b-9c02-5e8f1b6a4d33";
const BRAKKA = "11111111-2222-3333-4444-555555555555" as UUID;

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <DatastoreSelectorContext.Provider
        value={{ datastore: undefined, setDatastore: vi.fn() }}
      >
        <CharacterContext.Provider value={{ reset: vi.fn() } as never}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/join/:code" element={<JoinProbe />} />
            <Route path="/sheet" element={<h1>Your characters</h1>} />
            <Route path="/sheet/:uuid" element={<SheetProbe />} />
            <Route path="/host" element={<h1>Start a game</h1>} />
            <Route path="/auth" element={<h1>authorizing</h1>} />
          </Routes>
        </CharacterContext.Provider>
      </DatastoreSelectorContext.Provider>
    </MemoryRouter>,
  );
}

function JoinProbe() {
  return <h1>joining</h1>;
}

function SheetProbe() {
  const { uuid } = useParams();
  return <h1>sheet {uuid}</h1>;
}

describe("the front door", () => {
  beforeEach(() => window.localStorage.clear());

  it("offers both storage doors to someone who has never been here", () => {
    renderHome();
    expect(screen.getByText("Sync to Google Drive")).toBeInTheDocument();
    expect(screen.getByText("Keep sheets in this browser")).toBeInTheDocument();
    // Nothing to pick up: the strip isn't rendered empty.
    expect(screen.queryByText("Pick up where you left off")).toBeNull();
  });

  it("leads with running a game, so a DM with no sheets has a door", () => {
    renderHome();
    expect(screen.getByText("Run a game")).toBeInTheDocument();
  });

  it("collapses storage to one door once the question is answered", () => {
    writeLastDatastore("local");
    renderHome();
    expect(screen.getByText("My characters")).toBeInTheDocument();
    expect(screen.queryByText("Sync to Google Drive")).toBeNull();
  });

  it("keeps a way out of the collapsed storage door, both directions", async () => {
    writeLastDatastore("local");
    renderHome();
    expect(
      screen.getByText(/Your sheets are in this browser/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Use Google Drive instead" }),
    );
    // Drive can't be selected without its OAuth round-trip.
    expect(
      screen.getByRole("heading", { name: "authorizing" }),
    ).toBeInTheDocument();
  });

  it("offers the same way out to someone on Drive", async () => {
    writeLastDatastore("drive");
    renderHome();
    expect(
      screen.getByText(/Your sheets are in Google Drive/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Use this browser instead" }),
    );
    expect(
      screen.getByRole("heading", { name: "Your characters" }),
    ).toBeInTheDocument();
  });

  it("offers a player their table, named by the character they played", () => {
    rememberSessionLocally({
      code: CODE,
      lastJoined: 1,
      seat: "player",
      playAsUuid: BRAKKA,
      playAsName: "Brakka",
    });
    renderHome();
    expect(screen.getByText("Your game — as Brakka")).toBeInTheDocument();
    expect(screen.getByText("Rejoin").closest("a")).toHaveAttribute(
      "href",
      `/join/${CODE}`,
    );
  });

  it("offers a DM their table without inventing a character for them", () => {
    rememberSessionLocally({ code: CODE, lastJoined: 1, seat: "dm" });
    renderHome();
    expect(screen.getByText("The game you're running")).toBeInTheDocument();
  });

  it("offers the last sheet back, which is what the redirect used to do", () => {
    writeLastCharacter({ uuid: BRAKKA, name: "Brakka", mode: "local" });
    renderHome();
    expect(screen.getByText("Brakka")).toBeInTheDocument();
    expect(screen.getByText("Saved in this browser")).toBeInTheDocument();
  });

  it("opens the last sheet by URL, so a refresh can find it again", async () => {
    writeLastDatastore("local");
    writeLastCharacter({ uuid: BRAKKA, name: "Brakka", mode: "local" });
    renderHome();
    await userEvent.click(screen.getByText("Brakka"));
    expect(
      screen.getByRole("heading", { name: `sheet ${BRAKKA}` }),
    ).toBeInTheDocument();
  });

  it("skips /auth for a returning Drive user — the sheet resumes silently", async () => {
    // lastDatastore is only ever "drive" after a successful sign-in, which is
    // exactly the case where the silent resume is worth attempting inline.
    writeLastDatastore("drive");
    renderHome();
    await userEvent.click(screen.getByText("My characters"));
    expect(
      screen.getByRole("heading", { name: "Your characters" }),
    ).toBeInTheDocument();
  });

  it("still sends a first-time Drive pick through /auth for consent", async () => {
    renderHome();
    await userEvent.click(screen.getByText("Sync to Google Drive"));
    expect(
      screen.getByRole("heading", { name: "authorizing" }),
    ).toBeInTheDocument();
  });

  it("forgets a table on request and stops offering it", async () => {
    rememberSessionLocally({ code: CODE, lastJoined: 1, seat: "player" });
    renderHome();
    await userEvent.click(
      screen.getByLabelText(`Forget the game ${CODE.slice(0, 8)}`),
    );
    expect(screen.queryByText("Your game")).toBeNull();
  });

  it("takes a pasted invite link, not just the bare code", async () => {
    renderHome();
    await userEvent.type(
      screen.getByLabelText("Session code or invite link"),
      `https://dndcharactersheets.net/join/${CODE}`,
    );
    await userEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(
      screen.getByRole("heading", { name: "joining" }),
    ).toBeInTheDocument();
  });

  it("says so rather than navigating when the code is nonsense", async () => {
    renderHome();
    await userEvent.type(
      screen.getByLabelText("Session code or invite link"),
      "come to my game",
    );
    await userEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(screen.getByText(/doesn't look like a code/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "joining" })).toBeNull();
  });
});
