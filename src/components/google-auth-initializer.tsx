import React, { useEffect, useState } from "react";
import Spinner from "src/components/spinner";
import { useNavigate } from "react-router-dom";
import GoogleDriveDatastore from "src/datastores/google-drive-datastore";
import {
  API_KEY,
  CLIENT_ID,
  DISCOVERY_DOC,
  hasStoredGrant,
  persistToken,
  restoreToken,
  SCOPES,
} from "src/lib/google-drive";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useGoogleOauth } from "src/lib/hooks/use-google-oauth";
import useScript from "src/lib/hooks/use-script";
import { writeLastDatastore } from "src/lib/last-datastore";

export default function GoogleAuthInitializer() {
  const {
    tokenClient,
    setTokenClient,
    gapiInitialized,
    setGapiInitialized,
    gisInitialized,
    setGisInitialized,
    googleOauthReady,
    setGoogleOauthReady,
  } = useGoogleOauth();
  const { setDatastore } = useDatastoreSelector();
  const navigate = useNavigate();
  // Set when a silent token refresh fails, so we stop showing "Resuming..."
  // and fall back to the Authorize button.
  const [authPromptNeeded, setAuthPromptNeeded] = useState(false);

  useEffect(() => {
    if (googleOauthReady) {
      setDatastore(GoogleDriveDatastore);
      writeLastDatastore("drive");
      navigate("/sheet");
    }
  }, [googleOauthReady]);

  // Once both Google libraries are ready, try to resume a previous session
  // without prompting: restore a still-valid cached token, otherwise (if the
  // user has granted before) attempt a silent, no-UI refresh. Only when both
  // fail do we fall through to the Authorize button below.
  useEffect(() => {
    if (!gapiInitialized || !gisInitialized || googleOauthReady) return;
    if (restoreToken()) {
      setGoogleOauthReady(true);
      return;
    }
    if (tokenClient && hasStoredGrant()) {
      tokenClient.requestAccessToken({ prompt: "" });
    }
  }, [gapiInitialized, gisInitialized, googleOauthReady, tokenClient]);

  const handleAuthClick = () => {
    if (!tokenClient) {
      throw new Error("Token client wasn't initialized properly!");
    }
    if (window.gapi.client.getToken() === null) {
      // Prompt the user to select a Google Account and ask for consent to share their data
      // when establishing a new session.
      tokenClient.requestAccessToken({ prompt: "consent" });
    } else {
      // Skip display of account chooser and consent dialog for an existing session.
      tokenClient.requestAccessToken({ prompt: "" });
    }
  };

  /**
   *  Sign out the user upon button click.
   * TODO: put this in the header somewhere as it's not in use
   */
  // function handleSignoutClick() {
  //   const token = window.gapi.client.getToken();
  //   if (token !== null) {
  //     window.google.accounts.oauth2.revoke(token.access_token, () => {});
  //     window.gapi.client.setToken(null);
  //     setGoogleOauthReady(false);
  //   }
  // }

  useScript("https://apis.google.com/js/api.js", () => {
    window.gapi.load("client", () => {
      window.gapi.client
        .init({
          apiKey: API_KEY,
          discoveryDocs: [DISCOVERY_DOC],
        })
        .then(() => {
          setGapiInitialized(true);
        });
    });
  });
  useScript("https://accounts.google.com/gsi/client", () => {
    setTokenClient(
      window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (resp: google.accounts.oauth2.TokenResponse) => {
          if (resp.error !== undefined) {
            // A silent refresh (prompt: "") can fail when interaction is
            // required; don't crash — surface the Authorize button instead.
            console.warn("Google token request failed", resp);
            setAuthPromptNeeded(true);
            return;
          }
          persistToken(resp);
          setGoogleOauthReady(true);
          setDatastore(GoogleDriveDatastore);
        },
      }),
    );
    setGisInitialized(true);
  });

  if (!gapiInitialized || !gisInitialized)
    return (
      <p>
        <Spinner /> Connecting to the Google Drive API...
      </p>
    );
  // While a previous session is being resumed silently, show progress rather
  // than the button (so it can't be clicked into an unnecessary prompt).
  if (hasStoredGrant() && !authPromptNeeded)
    return (
      <p>
        <Spinner /> Resuming your Google session...
      </p>
    );
  return (
    <button id="authorize_button" onClick={handleAuthClick}>
      Authorize
    </button>
  );
}
