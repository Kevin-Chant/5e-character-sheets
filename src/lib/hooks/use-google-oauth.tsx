import React, { useContext, useMemo, useState } from "react";
import { missingProvider } from "src/lib/missing-provider";

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
  setTokenClient: missingProvider("setTokenClient"),
  gapiInitialized: false,
  setGapiInitialized: missingProvider("setGapiInitialized"),
  gisInitialized: false,
  setGisInitialized: missingProvider("setGisInitialized"),
  googleOauthReady: false,
  setGoogleOauthReady: missingProvider("setGoogleOauthReady"),
});

export function GoogleOauthContextProvider(props: React.PropsWithChildren) {
  const [tokenClient, setTokenClient] = useState<
    google.accounts.oauth2.TokenClient | undefined
  >(undefined);
  const [gapiInitialized, setGapiInitialized] = useState(false);
  const [gisInitialized, setGisInitialized] = useState(false);
  const [googleOauthReady, setGoogleOauthReady] = useState(false);

  const providerData = useMemo(
    () => ({
      tokenClient,
      setTokenClient,
      gapiInitialized,
      setGapiInitialized,
      gisInitialized,
      setGisInitialized,
      googleOauthReady,
      setGoogleOauthReady,
    }),
    [tokenClient, gapiInitialized, gisInitialized, googleOauthReady],
  );

  return (
    <GoogleOauthContext.Provider value={providerData}>
      {props.children}
    </GoogleOauthContext.Provider>
  );
}

export function useGoogleOauth() {
  return useContext(GoogleOauthContext);
}
