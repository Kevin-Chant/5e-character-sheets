// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character } from "src/lib/types";
import SharingToggle from "./sharing-toggle";

// Starting a live session is a network call that can fail. The component owns
// the three states that come out of that (idle / connecting / failed), so those
// are what's tested here — the session machinery itself is mocked.

const character = structuredClone(defaultCharacter) as Character;
let role: string | undefined;
const openSharingSession = vi.fn();
const closeSharingSession = vi.fn();

vi.mock("src/lib/hooks/use-datastore-selector", () => ({
  useDatastoreSelector: () => ({ datastore: {} }),
}));
vi.mock("src/lib/hooks/use-sharing-session", () => ({
  useSharingSessions: () => ({ getRole: () => role }),
}));
vi.mock("src/lib/hooks/use-character", () => ({
  useCharacter: () => ({
    character,
    openSharingSession,
    closeSharingSession,
  }),
}));
vi.mock("src/components/identity-fields", () => ({
  default: () => <div />,
}));

beforeEach(() => {
  role = undefined;
  openSharingSession.mockReset();
  closeSharingSession.mockReset();
});

describe("SharingToggle", () => {
  it("offers to start a session when none is open", () => {
    render(<SharingToggle />);
    expect(
      screen.getByRole("button", { name: /start live session/i }),
    ).toBeEnabled();
  });

  it("shows a connecting state and disables the button while in flight", async () => {
    let release: () => void = () => {};
    openSharingSession.mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    render(<SharingToggle />);
    await userEvent.click(
      screen.getByRole("button", { name: /start live session/i }),
    );
    const button = await screen.findByRole("button", { name: /connecting/i });
    expect(button).toBeDisabled();
    // Settling the promise flips state, so let React flush it.
    await act(async () => {
      release();
    });
    // Resolving leaves no error behind.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("surfaces the failure message instead of swallowing it", async () => {
    openSharingSession.mockRejectedValue(
      new Error("Couldn't reach the sharing server."),
    );
    render(<SharingToggle />);
    await userEvent.click(
      screen.getByRole("button", { name: /start live session/i }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't reach the sharing server.");
    // And it recovers: the button is usable again, not stuck on "Connecting".
    expect(
      screen.getByRole("button", { name: /start live session/i }),
    ).toBeEnabled();
  });

  it("retries from the error state", async () => {
    openSharingSession.mockRejectedValueOnce(new Error("Nope."));
    render(<SharingToggle />);
    await userEvent.click(
      screen.getByRole("button", { name: /start live session/i }),
    );
    await screen.findByRole("alert");
    openSharingSession.mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(openSharingSession).toHaveBeenCalledTimes(2);
  });

  it("switches to ending the session once one is open", async () => {
    role = "host";
    render(<SharingToggle />);
    await userEvent.click(
      screen.getByRole("button", { name: /end live session/i }),
    );
    expect(closeSharingSession).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /start live session/i }),
    ).toBeNull();
  });

  it("renders nothing for a session we joined rather than host", () => {
    role = "remote";
    const { container } = render(<SharingToggle />);
    expect(container).toBeEmptyDOMElement();
  });
});
