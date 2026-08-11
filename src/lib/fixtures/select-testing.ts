import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Choosing from a `<Select>` in a test.
//
// The app's pickers are comboboxes rather than native `<select>`s, so
// `userEvent.selectOptions` doesn't reach them — it wants an `HTMLSelectElement`.
// Two clicks do, and every test that picks something wants the same two, so
// they live here rather than being spelled out (differently) in each file.
export async function chooseOption(
  selectName: string | RegExp,
  optionName: string | RegExp,
  user: ReturnType<typeof userEvent.setup> = userEvent.setup(),
) {
  await user.click(screen.getByRole("button", { name: selectName }));
  // The popup is portalled to <body>, so it's reachable from `screen` even when
  // the caller rendered into a container.
  await user.click(
    within(await screen.findByRole("listbox")).getByRole("option", {
      name: optionName,
    }),
  );
}

/** Opens a `<Select>` and hands back its listbox, for tests that assert on
    what is offered rather than picking something. */
export async function openSelect(
  selectName: string | RegExp,
  user: ReturnType<typeof userEvent.setup> = userEvent.setup(),
) {
  await user.click(screen.getByRole("button", { name: selectName }));
  return within(await screen.findByRole("listbox"));
}

/** The labels a `<Select>` is currently offering, in order. */
export async function optionLabels(
  selectName: string | RegExp,
  user: ReturnType<typeof userEvent.setup> = userEvent.setup(),
): Promise<string[]> {
  await user.click(screen.getByRole("button", { name: selectName }));
  const list = await screen.findByRole("listbox");
  return within(list)
    .getAllByRole("option")
    .map((o) => o.textContent ?? "");
}
