import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The app's `<Select>` is a combobox, not a native `<select>`, so
// `userEvent.selectOptions` can't reach it. These two clicks can.
export async function chooseOption(
  selectName: string | RegExp,
  optionName: string | RegExp,
  user: ReturnType<typeof userEvent.setup> = userEvent.setup(),
) {
  await user.click(screen.getByRole("button", { name: selectName }));
  // The popup is portalled to <body>, reachable from `screen`.
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
