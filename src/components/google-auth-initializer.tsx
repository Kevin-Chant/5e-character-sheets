import React, { useEffect } from "react";
import { FaSpinner } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import GoogleDriveDatastore from "src/datastores/google-drive-datastore";
import {
  API_KEY,
  CLIENT_ID,
  DISCOVERY_DOC,
  SCOPES,
} from "src/lib/google-drive";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useGoogleOauth } from "src/lib/hooks/use-google-oauth";
import useScript from "src/lib/hooks/use-script";

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

  useEffect(() => {
    if (googleOauthReady) {
      setDatastore(GoogleDriveDatastore);
      navigate("/sheet");
    }
  }, [googleOauthReady]);

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
            throw resp;
          }
          setGoogleOauthReady(true);
          setDatastore(GoogleDriveDatastore);
        },
      })
    );
    setGisInitialized(true);
  });

  if (!gapiInitialized || !gisInitialized)
    return (
      <>
        <p>
          <FaSpinner /> Connecting to the Google Drive API...
        </p>
      </>
    );
  return (
    <>
      <button id="authorize_button" onClick={handleAuthClick}>
        Authorize
      </button>
    </>
  );
}
