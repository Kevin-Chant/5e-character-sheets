import { beforeEach, describe, expect, it, vi } from "vitest";

// The datastore proper is gapi-bound and verified in-browser; the counting
// query isn't. (Covers a double-count edge case: importing a link to one's
// own document.)
vi.mock("src/lib/google-drive", async () => {
  const actual = await vi.importActual<typeof import("src/lib/google-drive")>(
    "src/lib/google-drive",
  );
  return {
    ...actual,
    listAppDataFiles: vi.fn(),
    listSharedCharacterFiles: vi.fn(),
    getFileContents: vi.fn(),
    getHeadRevision: vi.fn(),
    updateFile: vi.fn(),
  };
});

import { UUID } from "crypto";
import {
  getFileContents,
  getHeadRevision,
  listAppDataFiles,
  listSharedCharacterFiles,
  SHARED_UUID_KEY,
  updateFile,
} from "src/lib/google-drive";
import GoogleDriveDatastore, {
  countDriveCharacters,
} from "src/datastores/google-drive-datastore";
import { defaultCharacter } from "src/lib/data/default-data";
import { isSaveConflictError } from "src/lib/save-conflict";

const INDEX = "imported-shared-characters.json";

beforeEach(() => {
  vi.resetAllMocks();
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

describe("conflict guard on shared documents", () => {
  const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UUID;
  const characterNamed = (name: string) => ({
    ...structuredClone(defaultCharacter),
    uuid: UUID_A,
    name,
  });

  // A signed-in account holding one shared document at revision rev1.
  const setup = async () => {
    vi.mocked(listAppDataFiles).mockResolvedValue([]);
    vi.mocked(listSharedCharacterFiles).mockResolvedValue([
      {
        id: "f1",
        name: "Mine.5echar",
        appProperties: { [SHARED_UUID_KEY]: UUID_A },
        headRevisionId: "rev1",
      },
    ]);
    const mine = characterNamed("Mine");
    vi.mocked(getFileContents).mockResolvedValue(JSON.stringify(mine));
    vi.mocked(updateFile).mockResolvedValue(undefined);
    await GoogleDriveDatastore.initializeDatastore();
    vi.mocked(updateFile).mockClear();
    return mine;
  };

  it("writes when the stored revision is the one we read", async () => {
    const mine = await setup();
    vi.mocked(getHeadRevision).mockResolvedValue("rev1");
    vi.mocked(updateFile).mockResolvedValue("rev2");
    await GoogleDriveDatastore.saveToDatastore(mine);
    expect(updateFile).toHaveBeenCalledWith("f1", JSON.stringify(mine));
  });

  it("refuses to erase a save it hasn't seen, carrying their copy", async () => {
    const mine = await setup();
    const theirs = characterNamed("Theirs");
    vi.mocked(getHeadRevision).mockResolvedValue("rev9");
    vi.mocked(getFileContents).mockResolvedValue(JSON.stringify(theirs));

    const refusal = await GoogleDriveDatastore.saveToDatastore(mine).then(
      () => undefined,
      (error) => error,
    );
    expect(isSaveConflictError(refusal)).toBe(true);
    expect(refusal.remoteRevision).toBe("rev9");
    expect(refusal.theirs.name).toBe("Theirs");
    expect(updateFile).not.toHaveBeenCalled();
  });

  it("accepting the refusing revision lets the next write through", async () => {
    const mine = await setup();
    vi.mocked(getHeadRevision).mockResolvedValue("rev9");
    vi.mocked(getFileContents).mockResolvedValue(
      JSON.stringify(characterNamed("Theirs")),
    );
    await expect(GoogleDriveDatastore.saveToDatastore(mine)).rejects.toThrow();

    GoogleDriveDatastore.acceptRemoteRevision!(UUID_A, "rev9");
    vi.mocked(updateFile).mockResolvedValue("rev10");
    await GoogleDriveDatastore.saveToDatastore(mine);
    expect(updateFile).toHaveBeenCalledWith("f1", JSON.stringify(mine));
  });

  it("a third save landing after acceptance refuses again", async () => {
    const mine = await setup();
    GoogleDriveDatastore.acceptRemoteRevision!(UUID_A, "rev9");
    vi.mocked(getHeadRevision).mockResolvedValue("rev11");
    vi.mocked(getFileContents).mockResolvedValue(
      JSON.stringify(characterNamed("Third")),
    );
    await expect(GoogleDriveDatastore.saveToDatastore(mine)).rejects.toThrow();
    expect(updateFile).not.toHaveBeenCalled();
  });

  it("a metadata hiccup doesn't block saving", async () => {
    const mine = await setup();
    vi.mocked(getHeadRevision).mockResolvedValue(undefined);
    vi.mocked(updateFile).mockResolvedValue(undefined);
    await GoogleDriveDatastore.saveToDatastore(mine);
    expect(updateFile).toHaveBeenCalled();
  });

  it("overwrites rather than refusing blind when their copy is unreadable", async () => {
    const mine = await setup();
    vi.mocked(getHeadRevision).mockResolvedValue("rev9");
    vi.mocked(getFileContents).mockResolvedValue("{ truncated");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(updateFile).mockResolvedValue("rev10");
    await GoogleDriveDatastore.saveToDatastore(mine);
    expect(updateFile).toHaveBeenCalled();
  });
});
