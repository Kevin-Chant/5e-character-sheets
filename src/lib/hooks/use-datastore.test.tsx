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

// A datastore whose initialize() resolves only when the test says so, which is
// what makes the swap races observable rather than timing-dependent.
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

function Names() {
  const { characters, characterLoading } = useDatastore();
  return (
    <div>
      <span data-testid="names">{characters.map((c) => c.name).join(",")}</span>
      <span data-testid="loading">{characterLoading ? "yes" : "no"}</span>
    </div>
  );
}

const names = () => screen.getByTestId("names").textContent;
const loading = () => screen.getByTestId("loading").textContent;

describe("DatastoreContextProvider", () => {
  it("drops the previous store's characters before the new list arrives", async () => {
    const local = makeDatastore("local", [makeCharacter("1-1-1-1-1", "Local")]);
    const drive = makeDatastore("drive", [makeCharacter("2-2-2-2-2", "Drive")]);

    render(<Harness initial={local.datastore} />);
    await act(async () => local.release());
    expect(names()).toBe("Local");

    // Swapping to a slow backend must not leave the old store's characters on
    // screen: the sidebar caption already says "Drive" at this point, so a
    // listed "Local" is a character you can click into the wrong backend.
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

    // Drive's round-trip lands last but belongs to a store we left.
    await act(async () => drive.release());
    expect(names()).toBe("Local");
  });

  it("clears the list and the spinner when the selection is cleared", async () => {
    const drive = makeDatastore("drive", [makeCharacter("2-2-2-2-2", "Drive")]);
    render(<Harness initial={drive.datastore} />);
    await act(async () => drive.release());
    expect(names()).toBe("Drive");

    // The storage-less remote joiner. An in-flight spinner must come down with
    // the list it belonged to.
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
    // An empty list still offers "create"; a permanent "Loading..." offers
    // nothing.
    expect(loading()).toBe("no");
    console_.mockRestore();
  });
});
