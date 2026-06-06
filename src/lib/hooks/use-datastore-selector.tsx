import React, { useContext, useState } from "react";
import { Datastore } from "src/lib/types";

interface DatastoreSelectorContextData {
  datastore?: Datastore;
  // Accepts undefined to clear the selection (e.g. when joining a friend's
  // session, where the character is owned remotely and not stored locally).
  setDatastore: (ds?: Datastore) => void;
}

export const DatastoreSelectorContext =
  React.createContext<DatastoreSelectorContextData>({
    datastore: undefined,
    setDatastore: () => {
      console.log("Calling default setDatastore");
    },
  });

export function DatastoreSelectorContextProvider(
  props: React.PropsWithChildren,
) {
  const [datastore, setDatastore] = useState<Datastore>();
  const providerData = {
    datastore,
    setDatastore,
  };

  return (
    <DatastoreSelectorContext.Provider value={providerData}>
      {props.children}
    </DatastoreSelectorContext.Provider>
  );
}

export function useDatastoreSelector() {
  return useContext(DatastoreSelectorContext);
}
