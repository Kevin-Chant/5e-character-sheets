// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import type { UUID } from "crypto";
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character, Datastore } from "src/lib/types";
import { DatastoreSelectorContext } from "./use-datastore-selector";
import { DatastoreContextProvider, useDatastore } from "./use-datastore";

function makeCharacter(uuid: string, name: string): Character {
  return { ...structuredClone(defaultCharacter), uuid: uuid as UUID, name };
}

// initialize() resolves only when the test releases it, to make swap races observable.
function makeDatastore(name: string, characters: Character[]) {
  let release!: () => void;
  const initialized = new Promise<void>((resolve) => {
    release = resolve;
  });
  const datastore: Datastore = {
    name,
    savedSheetsCopy: name,
    debounceWait: 0,
    initializeDatastore: () => initialized,
    saveToDatastore: vi.fn(async () => {}),
    loadFromDatastore: vi.fn(async () => undefined),
    listEntriesInDatastore: () => characters,
    deleteFromDatastore: vi.fn(),
  };
  return { datastore, release };
}

// Renders the current list as text, plus a control to swap the selected store.
function Harness({ initial }: { initial?: Datastore }) {
  const [datastore, setDatastore] = useState<Datastore | undefined>(initial);
  return (
    <DatastoreSelectorContext.Provider value={{ datastore, setDatastore }}>
      <DatastoreContextProvider>
        <Names />
      </DatastoreContextProvider>
      <button onClick={() => setDatastore(undefined)}>clear</button>
      <SwapSlot setDatastore={setDatastore} />
    </DatastoreSelectorContext.Provider>
  );
}

let swapTo: (ds?: Datastore) => void;
function SwapSlot({
  setDatastore,
}: {
  setDatastore: (ds?: Datastore) => void;
}) {
  swapTo = setDatastore;
  return null;
}

// The live context, captured for tests that drive save/stage/delete directly.
let context: ReturnType<typeof useDatastore>;
function Names() {
  const data = useDatastore();
  context = data;
  const { characters, characterLoading, unsynced } = data;
  return (
    <div>
      <span data-testid="names">{characters.map((c) => c.name).join(",")}</span>
      <span data-testid="loading">{characterLoading ? "yes" : "no"}</span>
      <span data-testid="unsynced">
        {characters
          .filter((c) => unsynced.has(c.uuid))
          .map((c) => c.name)
          .join(",")}
      </span>
    </div>
  );
}

const names = () => screen.getByTestId("names").textContent;
const loading = () => screen.getByTestId("loading").textContent;
const unsyncedNames = () => screen.getByTestId("unsynced").textContent;

describe("DatastoreContextProvider", () => {
  it("drops the previous store's characters before the new list arrives", async () => {
    const local = makeDatastore("local", [makeCharacter("1-1-1-1-1", "Local")]);
    const drive = makeDatastore("drive", [makeCharacter("2-2-2-2-2", "Drive")]);

    render(<Harness initial={local.datastore} />);
    await act(async () => local.release());
    expect(names()).toBe("Local");

    await act(async () => {
      swapTo(drive.datastore);
    });
    expect(names()).toBe("");
    expect(loading()).toBe("yes");

    await act(async () => drive.release());
    expect(names()).toBe("Drive");
  });

  it("ignores a slow init that resolves after the user swapped away", async () => {
    const drive = makeDatastore("drive", [makeCharacter("2-2-2-2-2", "Drive")]);
    const local = makeDatastore("local", [makeCharacter("1-1-1-1-1", "Local")]);

    render(<Harness initial={drive.datastore} />);
    await act(async () => {
      swapTo(local.datastore);
    });
    await act(async () => local.release());
    expect(names()).toBe("Local");

    await act(async () => drive.release());
    expect(names()).toBe("Local");
  });

  it("clears the list and the spinner when the selection is cleared", async () => {
    const drive = makeDatastore("drive", [makeCharacter("2-2-2-2-2", "Drive")]);
    render(<Harness initial={drive.datastore} />);
    await act(async () => drive.release());
    expect(names()).toBe("Drive");

    await act(async () => {
      swapTo(undefined);
    });
    expect(names()).toBe("");
    expect(loading()).toBe("no");
  });

  it("does not strand the spinner when init fails", async () => {
    const console_ = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: Datastore = {
      name: "broken",
      savedSheetsCopy: "broken",
      debounceWait: 0,
      initializeDatastore: () => Promise.reject(new Error("expired token")),
      saveToDatastore: vi.fn(async () => {}),
      loadFromDatastore: vi.fn(async () => undefined),
      listEntriesInDatastore: () => [],
      deleteFromDatastore: vi.fn(),
    };

    render(<Harness initial={broken} />);
    await act(async () => {});
    expect(loading()).toBe("no");
    console_.mockRestore();
  });

  it("lists a staged character immediately and clears its unsynced badge once saved", async () => {
    const local = makeDatastore("local", []);
    render(<Harness initial={local.datastore} />);
    await act(async () => local.release());

    const fresh = makeCharacter("3-3-3-3-3", "Fresh");
    act(() => context.stageCharacter(fresh));
    expect(names()).toBe("Fresh");
    expect(unsyncedNames()).toBe("Fresh");

    await act(async () => context.save(fresh));
    expect(names()).toBe("Fresh");
    expect(unsyncedNames()).toBe("");
  });

  it("keeps the unsynced badge up when the save fails", async () => {
    const local = makeDatastore("local", []);
    local.datastore.saveToDatastore = vi.fn(async () => {
      throw new Error("offline");
    });
    render(<Harness initial={local.datastore} />);
    await act(async () => local.release());

    const fresh = makeCharacter("3-3-3-3-3", "Fresh");
    act(() => context.stageCharacter(fresh));
    await act(async () => {
      await context.save(fresh).catch(() => {});
    });
    expect(names()).toBe("Fresh");
    expect(unsyncedNames()).toBe("Fresh");
  });

  it("restores the entry and surfaces the failure when a delete rejects", async () => {
    const console_ = vi.spyOn(console, "error").mockImplementation(() => {});
    const alert_ = vi.spyOn(window, "alert").mockImplementation(() => {});
    const doomed = makeCharacter("4-4-4-4-4", "Doomed");
    const local = makeDatastore("local", [doomed]);
    local.datastore.deleteFromDatastore = vi.fn(async () => {
      throw new Error("offline");
    });
    render(<Harness initial={local.datastore} />);
    await act(async () => local.release());
    expect(names()).toBe("Doomed");

    await act(async () => {
      context.deleteCharacter(doomed.uuid);
    });
    expect(names()).toBe("Doomed");
    expect(alert_).toHaveBeenCalled();
    console_.mockRestore();
    alert_.mockRestore();
  });
});
