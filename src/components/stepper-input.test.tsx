// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import StepperInput from "./stepper-input";

// StepperInput is pure props (no character context), so it renders directly.
// What's worth pinning is the commit timing shared with the HP trackers and the
// coin fields: a typed edit is one write when the edit finishes, not one per
// keystroke. See `useDeferredNumber`.

// A controlled host, so the input sees its value change the way it does in the
// app — without it the field is wired to a value that never moves and the test
// asserts on an artefact of the harness.
function Host({
  initial,
  onChange,
  max,
}: {
  initial: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  const [value, setValue] = useState(initial);
  return (
    <StepperInput
      value={value}
      max={max}
      ariaLabel="Quantity"
      onChange={(n) => {
        onChange(n);
        setValue(n);
      }}
    />
  );
}

describe("StepperInput", () => {
  it("writes once when the edit finishes, not once per digit", async () => {
    const onChange = vi.fn();
    render(<Host initial={1} onChange={onChange} />);
    const field = screen.getByRole("spinbutton", { name: "Quantity" });
    await userEvent.clear(field);
    await userEvent.type(field, "50");
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(50);
  });

  it("commits on Enter too", async () => {
    const onChange = vi.fn();
    render(<Host initial={1} onChange={onChange} />);
    const field = screen.getByRole("spinbutton", { name: "Quantity" });
    await userEvent.clear(field);
    await userEvent.type(field, "7{Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("abandons the edit on Escape", async () => {
    const onChange = vi.fn();
    render(<Host initial={4} onChange={onChange} />);
    const field = screen.getByRole("spinbutton", { name: "Quantity" });
    await userEvent.clear(field);
    await userEvent.type(field, "9{Escape}");
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveValue(4);
  });

  it("never passes through an intermediate value a clamp would stick at", async () => {
    const onChange = vi.fn();
    render(<Host initial={1} onChange={onChange} max={20} />);
    const field = screen.getByRole("spinbutton", { name: "Quantity" });
    await userEvent.clear(field);
    await userEvent.type(field, "25{Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith(20);
  });

  it("steps from what the field shows, not from the stale stored value", async () => {
    // Clicking a chevron blurs the input first, so the step has to apply to
    // what was just typed.
    const onChange = vi.fn();
    const { container } = render(<Host initial={2} onChange={onChange} />);
    const field = screen.getByRole("spinbutton", { name: "Quantity" });
    await userEvent.clear(field);
    await userEvent.type(field, "8");
    // The chevrons are aria-hidden (the field itself is the labelled control).
    const [up] = [...container.querySelectorAll(".stepper-btns button")];
    await userEvent.click(up);
    expect(onChange).toHaveBeenLastCalledWith(9);
  });

  it("reverts a cleared field rather than storing zero", async () => {
    const onChange = vi.fn();
    render(<Host initial={3} onChange={onChange} />);
    const field = screen.getByRole("spinbutton", { name: "Quantity" });
    await userEvent.clear(field);
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveValue(3);
  });
});
