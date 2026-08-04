import { beforeEach, describe, expect, it, vi } from "vitest";

// The datastore proper is gapi-bound and verified in-browser; the counting
// query isn't, and it's the sort of arithmetic that's wrong quietly. The
// double-count in particular only appears for a user who imported a link to
// their *own* document — rare enough to never be noticed by hand, and it
// silently inflates a number people will use to decide whether a sheet is
// missing.
vi.mock("src/lib/google-drive", async () => {
  const actual = await vi.importActual<typeof import("src/lib/google-drive")>(
    "src/lib/google-drive",
  );
  return {
    ...actual,
    listAppDataFiles: vi.fn(),
    listSharedCharacterFiles: vi.fn(),
    getFileContents: vi.fn(),
  };
});

import {
  getFileContents,
  listAppDataFiles,
  listSharedCharacterFiles,
  SHARED_UUID_KEY,
} from "src/lib/google-drive";
import { countDriveCharacters } from "src/datastores/google-drive-datastore";

const INDEX = "imported-shared-characters.json";

beforeEach(() => {
  vi.mocked(getFileContents).mockResolvedValue(undefined);
});

describe("countDriveCharacters", () => {
  it("splits private, shareable and shared-with-you", async () => {
    vi.mocked(listAppDataFiles).mockResolvedValue([
      { id: "1", name: "uuid-a" },
      { id: "2", name: "uuid-b" },
      { id: "idx", name: INDEX },
    ]);
    vi.mocked(listSharedCharacterFiles).mockResolvedValue([
      { id: "3", name: "C.5echar", appProperties: { [SHARED_UUID_KEY]: "c" } },
    ]);
    vi.mocked(getFileContents).mockResolvedValue(
      JSON.stringify({ d: { fileId: "4", name: "D.5echar" } }),
    );

    expect(await countDriveCharacters()).toEqual({
      privateCount: 2,
      sharedCount: 1,
      importedCount: 1,
    });
  });

  it("does not count the bookkeeping index as a character", async () => {
    vi.mocked(listAppDataFiles).mockResolvedValue([{ id: "idx", name: INDEX }]);
    vi.mocked(listSharedCharacterFiles).mockResolvedValue([]);

    expect(await countDriveCharacters()).toEqual({
      privateCount: 0,
      sharedCount: 0,
      importedCount: 0,
    });
  });

  it("counts a document you own but also imported only once", async () => {
    vi.mocked(listAppDataFiles).mockResolvedValue([{ id: "idx", name: INDEX }]);
    vi.mocked(listSharedCharacterFiles).mockResolvedValue([
      { id: "3", name: "C.5echar", appProperties: { [SHARED_UUID_KEY]: "c" } },
    ]);
    vi.mocked(getFileContents).mockResolvedValue(
      JSON.stringify({ c: { fileId: "3", name: "C.5echar" } }),
    );

    const counts = await countDriveCharacters();
    expect(counts.sharedCount).toBe(1);
    expect(counts.importedCount).toBe(0);
  });

  it("survives an index file that isn't valid JSON", async () => {
    vi.mocked(listAppDataFiles).mockResolvedValue([{ id: "idx", name: INDEX }]);
    vi.mocked(listSharedCharacterFiles).mockResolvedValue([]);
    vi.mocked(getFileContents).mockResolvedValue("{ truncated");
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await countDriveCharacters()).importedCount).toBe(0);
  });
});
