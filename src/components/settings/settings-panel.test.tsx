// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SettingsPanelProvider } from "src/lib/hooks/use-settings-panel";
import { useSettingsPanel } from "src/lib/hooks/use-settings-panel";
import { SettingsContextProvider } from "src/lib/hooks/use-settings";
import SettingsAlias from "src/routes/settings-alias";

// Settings was the one interruption you couldn't dismiss. These pin the ways
// out — the point of moving it off a route.

function Harness() {
  const { settingsOpen, openSettings, closeSettings } = useSettingsPanel();
  return (
    <button
      onClick={settingsOpen ? closeSettings : openSettings}
      aria-expanded={settingsOpen}
    >
      gear
    </button>
  );
}

function renderPanel() {
  render(
    <MemoryRouter>
      <SettingsContextProvider>
        <SettingsPanelProvider>
          <Harness />
        </SettingsPanelProvider>
      </SettingsContextProvider>
    </MemoryRouter>,
  );
  return screen.getByRole("button", { name: "gear" });
}

describe("the settings panel", () => {
  it("isn't mounted until it's asked for", () => {
    renderPanel();
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
  });

  it("opens from the gear and closes from the same gear", async () => {
    const gear = renderPanel();
    await userEvent.click(gear);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
    expect(gear).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(gear);
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
  });

  it("closes on Escape, like every other overlay here", async () => {
    await userEvent.click(renderPanel());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
  });

  it("closes from its own corner button", async () => {
    await userEvent.click(renderPanel());
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
  });

  it("switches tabs without closing", async () => {
    await userEvent.click(renderPanel());
    await userEvent.click(screen.getByRole("button", { name: "Game" }));
    expect(screen.getByRole("button", { name: "Game" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
  });
});

describe("the /settings alias", () => {
  it("opens the panel and hands the URL back to the front door", async () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsContextProvider>
          <SettingsPanelProvider>
            <Routes>
              <Route path="/settings" element={<SettingsAlias />} />
              <Route path="/" element={<h1>the hub</h1>} />
            </Routes>
          </SettingsPanelProvider>
        </SettingsContextProvider>
      </MemoryRouter>,
    );
    // A stray bookmark still lands somewhere real, with settings on top of it
    // rather than over a route that renders nothing.
    expect(
      await screen.findByRole("heading", { name: "Settings" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "the hub" })).toBeVisible();
  });
});
