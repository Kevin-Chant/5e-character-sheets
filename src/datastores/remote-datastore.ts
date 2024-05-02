import { UUID } from "crypto";
import { syncRemoteCharacter } from "src/lib/sharing";
import { Character, Datastore } from "src/lib/types";

const RemoteDatastore: Datastore = {
  name: "Friend's sheet",
  debounceWait: 3000,
  initializeDatastore: () => {},
  saveToDatastore: (character: Character) => {
    // TODO: do remote datastores need a save function
    return new Promise((resolve, _reject) => {
      resolve();
    });
  },
  loadFromDatastore: syncRemoteCharacter,
  listEntriesInDatastore: (): Character[] => {
    return Object.values({});
  },
  deleteFromDatastore: (uuid: UUID) => {},
};

export default RemoteDatastore;
