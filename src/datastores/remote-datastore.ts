import { UUID } from "crypto";
import { Character, Datastore } from "src/lib/types";

const RemoteDatastore: Datastore = {
  name: "Friend's sheet",
  savedSheetsCopy: "Friends' shared characters:",
  debounceWait: 3000,
  initializeDatastore: () => new Promise((resolve) => resolve()),
  saveToDatastore: (character: Character) => {
    // TODO: do remote datastores need a save function
    return new Promise((resolve, _reject) => {
      resolve();
    });
  },
  loadFromDatastore: () => new Promise((resolve) => resolve(undefined)),
  // TODO: list currently active connections by adding local cache and calling getOpenConnections()
  listEntriesInDatastore: (): Character[] => {
    return Object.values({});
  },
  deleteFromDatastore: (uuid: UUID) => {},
};

export default RemoteDatastore;
