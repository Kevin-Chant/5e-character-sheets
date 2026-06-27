import { test, expect, Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Seed a known character into the local datastore and open its sheet, mirroring
// how scripts/screenshot.mjs primes localStorage.
const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(here, "../src/lib/fixtures/full-caster-wizard.json"),
    "utf8",
  ),
);
const UUID: string = fixture.uuid;
const ORIGINAL_NAME: string = fixture.name;
const NEW_NAME = "Renamed Hero";

// The persisted name as the app would reload it — our source of truth.
async function persistedName(page: Page): Promise<string | undefined> {
  const raw = await page.evaluate(() =>
    localStorage.getItem("dndcharactersheets_characters"),
  );
  return raw ? JSON.parse(raw)[UUID]?.name : undefined;
}

// Force an immediate save (the app debounces autosave by ~1s otherwise).
const save = (page: Page) => page.keyboard.press("Control+s");

test("undo and redo persist the reverted/reapplied edit to localStorage", async ({
  page,
}) => {
  await page.addInitScript(
    (chars) => {
      localStorage.setItem("dndcharactersheets_characters", chars);
      localStorage.setItem("dndcharactersheets_lastDatastore", '"local"');
    },
    JSON.stringify({ [UUID]: fixture }),
  );

  // Open the seeded character's sheet (same path screenshot.mjs uses).
  await page.goto("/");
  await page.getByText(ORIGINAL_NAME, { exact: false }).first().click();
  await page.waitForLoadState("networkidle");

  // Edit the name through the real modal flow (open → type → Save).
  await page
    .locator(".character-info-header")
    .getByText(ORIGINAL_NAME, { exact: true })
    .click();
  await page.locator(".modal-content input").fill(NEW_NAME);
  await page
    .locator(".modal-content")
    .getByRole("button", { name: "Save", exact: true })
    .click();

  await save(page);
  await expect.poll(() => persistedName(page)).toBe(NEW_NAME);

  // Undo (focus is on the body now that the modal closed) reverts the edit.
  await page.keyboard.press("Control+z");
  await save(page);
  await expect.poll(() => persistedName(page)).toBe(ORIGINAL_NAME);

  // Redo reapplies it.
  await page.keyboard.press("Control+Shift+z");
  await save(page);
  await expect.poll(() => persistedName(page)).toBe(NEW_NAME);
});
