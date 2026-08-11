// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestCallForm, RollCallForm } from "./table-calls";

// Six saves, six ability checks, nineteen skills.
const CHECK_OPTION_COUNT = 31;

const PRESENT = [
  { clientId: "c-brakka", name: "Brakka" },
  { clientId: "c-ellora", name: "Ellora" },
  { clientId: "c-maelina", name: "Maelina" },
];

const renderRollCall = () => {
  const callForRoll = vi.fn();
  render(<RollCallForm present={PRESENT} callForRoll={callForRoll} />);
  return { callForRoll, user: userEvent.setup() };
};

const openBox = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(
    screen.getByRole("button", { name: "Which check or save to ask for" }),
  );
const options = () =>
  within(screen.getByRole("listbox")).queryAllByRole("option");

describe("the roll call's check picker", () => {
  it("filters the closed list down to what was typed", async () => {
    const { user } = renderRollCall();
    await openBox(user);
    expect(options().length).toBe(CHECK_OPTION_COUNT);

    await user.keyboard("perc");
    expect(options().map((o) => o.textContent)).toEqual(["Perception"]);
  });

  it("matches the word a table actually says, so 'save' finds the saves", async () => {
    const { user } = renderRollCall();
    await openBox(user);
    await user.keyboard("save");
    expect(options().length).toBe(6);
  });

  it("sends the picked check", async () => {
    const { user, callForRoll } = renderRollCall();
    await openBox(user);
    await user.keyboard("perc");
    await user.click(screen.getByRole("option", { name: "Perception" }));
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(callForRoll).toHaveBeenCalledWith(
      { kind: "skill", skill: "Perception" },
      undefined,
    );
  });

  it("picks and asks from the keyboard alone", async () => {
    const { user, callForRoll } = renderRollCall();
    await openBox(user);
    await user.keyboard("dex");
    // Two matches (save, check); one step down lands on the check.
    await user.keyboard("{ArrowDown}{Enter}");
    await user.keyboard("{Enter}");

    expect(callForRoll).toHaveBeenCalledWith(
      { kind: "ability", stat: "dex" },
      undefined,
    );
  });

  it("won't ask until something on the list is picked", async () => {
    const { user, callForRoll } = renderRollCall();
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();

    await openBox(user);
    await user.keyboard("Vibes");
    expect(screen.getByText(/No match/)).toBeTruthy();
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    expect(callForRoll).not.toHaveBeenCalled();
  });
});

describe("the roll call's audience", () => {
  const ask = async (user: ReturnType<typeof userEvent.setup>) => {
    await openBox(user);
    await user.keyboard("perc");
    await user.click(screen.getByRole("option", { name: "Perception" }));
    await user.click(screen.getByRole("button", { name: "Ask" }));
  };

  it("asks the whole table by default", async () => {
    const { user, callForRoll } = renderRollCall();
    expect(screen.getByRole("button", { name: "Everyone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await ask(user);
    expect(callForRoll.mock.calls[0][1]).toBeUndefined();
  });

  it("addresses several players at once", async () => {
    const { user, callForRoll } = renderRollCall();
    await user.click(screen.getByRole("button", { name: "Brakka" }));
    await user.click(screen.getByRole("button", { name: "Maelina" }));
    await ask(user);

    expect(callForRoll.mock.calls[0][1]).toEqual(["c-brakka", "c-maelina"]);
    expect(screen.getByRole("button", { name: "Everyone" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("un-picks, and Everyone clears the lot", async () => {
    const { user, callForRoll } = renderRollCall();
    await user.click(screen.getByRole("button", { name: "Brakka" }));
    await user.click(screen.getByRole("button", { name: "Ellora" }));
    await user.click(screen.getByRole("button", { name: "Ellora" }));
    await ask(user);
    expect(callForRoll.mock.calls[0][1]).toEqual(["c-brakka"]);

    await user.click(screen.getByRole("button", { name: "Everyone" }));
    await ask(user);
    expect(callForRoll.mock.calls[1][1]).toBeUndefined();
  });

  it("forgets a player who left the session", async () => {
    const callForRoll = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <RollCallForm present={PRESENT} callForRoll={callForRoll} />,
    );
    await user.click(screen.getByRole("button", { name: "Brakka" }));
    await user.click(screen.getByRole("button", { name: "Ellora" }));

    rerender(
      <RollCallForm present={PRESENT.slice(1)} callForRoll={callForRoll} />,
    );
    await ask(user);
    expect(callForRoll.mock.calls[0][1]).toEqual(["c-ellora"]);
  });
});

describe("the rest call", () => {
  it("calls a short rest that doesn't span dawn", async () => {
    const callForRest = vi.fn();
    const user = userEvent.setup();
    render(<RestCallForm callForRest={callForRest} />);
    await user.click(screen.getByRole("button", { name: "Call" }));
    expect(callForRest).toHaveBeenCalledWith("short", false);
  });

  it("assumes a long rest spans dawn, and lets that be untrue", async () => {
    const callForRest = vi.fn();
    const user = userEvent.setup();
    render(<RestCallForm callForRest={callForRest} />);
    await user.click(
      screen.getByRole("button", { name: "Which rest to call" }),
    );
    await user.click(screen.getByRole("option", { name: "Long rest" }));
    expect(screen.getByLabelText("This rest spans dawn")).toBeChecked();

    await user.click(screen.getByLabelText("This rest spans dawn"));
    await user.click(screen.getByRole("button", { name: "Call" }));
    expect(callForRest).toHaveBeenCalledWith("long", false);
  });
});
