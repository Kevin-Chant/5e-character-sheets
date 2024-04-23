import React, { useContext, useEffect, useState } from "react";
import { Character, Datastore } from "src/lib/types";
import { UUID } from "crypto";
import LocalDatastore from "src/datastores/local-datastore";
import useScript from "./use-script";

interface DatastoreSelectorContextData {
  datastore?: Datastore;
  setDatastore: (ds: Datastore) => void;
}

export const DatastoreSelectorContext =
  React.createContext<DatastoreSelectorContextData>({
    datastore: undefined,
    setDatastore: (datastore: Datastore) => {
      console.log("Calling default setDatastore");
    },
  });

export function DatastoreSelectorContextProvider(
  props: React.PropsWithChildren
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
