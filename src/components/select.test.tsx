// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import Select, { SelectOptions } from "./select";

// The shared picker's contract, pinned here so the ~60 call sites don't each
// have to re-prove that filtering, grouping and the keyboard work.

const SKILLS = [
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Perception",
  "Performance",
];

function Harness({
  options = SKILLS,
  initial = "",
  ...rest
}: { options?: SelectOptions; initial?: string } & Partial<{
  placeholder: string;
  label: string;
  clearable: boolean;
}>) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Select
        label="Skill"
        placeholder="Pick a skill…"
        options={options}
        value={value}
        onChange={setValue}
        {...rest}
      />
      <output>{value || "(none)"}</output>
    </>
  );
}

const open = async (user: ReturnType<typeof userEvent.setup>, name = "Skill") =>
  user.click(screen.getByRole("button", { name }));

describe("Select", () => {
  it("shows the placeholder until something is chosen, then the label", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Skill" })).toHaveTextContent(
      "Pick a skill…",
    );
    await open(user);
    await user.click(screen.getByRole("option", { name: "Arcana" }));
    expect(screen.getByRole("button", { name: "Skill" })).toHaveTextContent(
      "Arcana",
    );
  });

  it("filters a long list down as you type", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);
    await user.keyboard("per");
    const shown = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(shown).toEqual(["Perception", "Performance"]);
  });

  it("matches query words in any order, and against the group heading", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        options={[
          {
            value: "dex",
            label: "Dexterity",
            group: "Saving throws",
            keywords: "save",
          },
          { value: "acr", label: "Acrobatics", group: "Skills" },
          ...SKILLS.map((s) => ({ value: s, label: s, group: "Skills" })),
        ]}
      />,
    );
    await open(user);
    await user.keyboard("save dex");
    expect(
      within(screen.getByRole("listbox")).getAllByRole("option"),
    ).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Dexterity/ })).toBeTruthy();
  });

  it("omits the filter box for a short list but still jumps on a keystroke", async () => {
    const user = userEvent.setup();
    render(<Harness options={["Short rest", "Long rest"]} />);
    await open(user);
    expect(screen.queryByRole("combobox")).toBeNull();
    await user.keyboard("l");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Skill" })).toHaveTextContent(
      "Long rest",
    );
  });

  it("commits the arrow-key cursor on Enter", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    // Opened with nothing chosen: the cursor starts at the top, so two steps
    // down is the third option.
    expect(screen.getByRole("button", { name: "Skill" })).toHaveTextContent(
      "Arcana",
    );
  });

  it("closes on Escape without choosing", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Skill" })).toHaveTextContent(
      "Pick a skill…",
    );
  });

  it("offers a way back to nothing when clearable", async () => {
    const user = userEvent.setup();
    render(<Harness initial="Arcana" clearable />);
    await open(user);
    await user.click(screen.getByRole("option", { name: "None" }));
    expect(screen.getByRole("button", { name: "Skill" })).toHaveTextContent(
      "Pick a skill…",
    );
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);
    await user.keyboard("zzz");
    expect(screen.getByText(/No match/)).toBeTruthy();
    expect(
      within(screen.getByRole("listbox")).queryAllByRole("option"),
    ).toHaveLength(0);
  });

  it("marks the chosen option as selected for a screen reader", async () => {
    const user = userEvent.setup();
    render(<Harness initial="Insight" />);
    await open(user);
    expect(screen.getByRole("option", { name: "Insight" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // The hint is why you'd choose the option, so it has to reach a screen
  // reader — but as the description, not glued onto the name.
  it("names an option by its label and describes it with the hint", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        options={[
          {
            value: "Stunned",
            label: "Stunned",
            hint: "Incapacitated, and attacks against you have advantage",
            meta: "+2",
          },
        ]}
      />,
    );
    await open(user);
    const option = screen.getByRole("option", { name: "Stunned" });
    expect(option).toHaveAccessibleDescription(
      "+2 Incapacitated, and attacks against you have advantage",
    );
  });

  it("skips a disabled option rather than stalling on it", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        options={[
          { value: "a", label: "Able" },
          { value: "b", label: "Barred", disabled: true },
          { value: "c", label: "Certain" },
        ]}
      />,
    );
    await open(user);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("button", { name: "Skill" })).toHaveTextContent(
      "Certain",
    );
  });
});
