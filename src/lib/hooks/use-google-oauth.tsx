import React, { useContext, useEffect, useReducer, useState } from "react";

interface GoogleOauthContextData {
  tokenClient?: google.accounts.oauth2.TokenClient;
  setTokenClient: (client: google.accounts.oauth2.TokenClient) => void;
  gapiInitialized: boolean;
  setGapiInitialized: (newVal: boolean) => void;
  gisInitialized: boolean;
  setGisInitialized: (newVal: boolean) => void;
  googleOauthReady: boolean;
  setGoogleOauthReady: (newVal: boolean) => void;
}

export const GoogleOauthContext = React.createContext<GoogleOauthContextData>({
  tokenClient: undefined,
  setTokenClient: (client: google.accounts.oauth2.TokenClient) => {
    console.log("Calling default setTokenClient");
  },
  gapiInitialized: false,
  setGapiInitialized: (newVal: boolean) => {
    console.log("Calling default setGapiInitialized");
  },
  gisInitialized: false,
  setGisInitialized: (newVal: boolean) => {
    console.log("Calling default setGisInitialized");
  },
  googleOauthReady: false,
  setGoogleOauthReady: (newVal: boolean) => {
    console.log("Calling default setGoogleOauthReady");
  },
});

export function GoogleOauthContextProvider(props: React.PropsWithChildren) {
  const [tokenClient, setTokenClient] = useState<
    google.accounts.oauth2.TokenClient | undefined
  >(undefined);
  const [gapiInitialized, setGapiInitialized] = useState(false);
  const [gisInitialized, setGisInitialized] = useState(false);
  const [googleOauthReady, setGoogleOauthReady] = useState(false);

  const providerData = {
    tokenClient,
    setTokenClient,
    gapiInitialized,
    setGapiInitialized,
    gisInitialized,
    setGisInitialized,
    googleOauthReady,
    setGoogleOauthReady,
  };

  return (
    <GoogleOauthContext.Provider value={providerData}>
      {props.children}
    </GoogleOauthContext.Provider>
  );
}

export function useGoogleOauth() {
  return useContext(GoogleOauthContext);
}
