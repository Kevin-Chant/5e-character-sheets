import React from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import ReactDOM from "react-dom/client";
import "./index.css";
import Root from "./routes/root";
import ErrorPage from "./error-page";
import Home from "./routes/home";
import SheetContainer from "./components/sheet-container";
import PlaySurface from "./components/play/play-surface";
import { ConfirmProvider } from "src/lib/hooks/confirm/confirm.provider";
import { CharacterContextProvider } from "src/lib/hooks/use-character";
import { EditModeContextProvider } from "./lib/hooks/use-edit-mode";
import { TargetedFieldContextProvider } from "./lib/hooks/use-targeted-field";
import { DatastoreSelectorContextProvider } from "./lib/hooks/use-datastore-selector";
import { DatastoreContextProvider } from "./lib/hooks/use-datastore";
import GoogleAuthInitializer from "./components/google-auth-initializer";
import { GoogleOauthContextProvider } from "./lib/hooks/use-google-oauth";
import RemoteConnectionInitializer from "./components/remote-connection-initializer";
import Sessions from "./routes/sessions";
import SettingsPage from "./routes/settings-page";
import { SettingsContextProvider } from "./lib/hooks/use-settings";
import { SharingSessionsContextProvider } from "./lib/hooks/use-sharing-session";
import { CharacterBuilderProvider } from "./lib/hooks/use-character-builder";
import { LevelUpProvider } from "./lib/hooks/use-level-up";
import { RestProvider } from "./lib/hooks/use-rest";
import { EncounterContextProvider } from "./lib/hooks/use-encounter";

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <SettingsContextProvider>
        <SharingSessionsContextProvider>
          <GoogleOauthContextProvider>
            <DatastoreSelectorContextProvider>
              <DatastoreContextProvider>
                <CharacterContextProvider>
                  {/* Above the routes, not inside the play surface: the roll
                      dialog reads conditions from the sheet too, and the
                      encounter has to survive navigating between them. */}
                  <EncounterContextProvider>
                    <EditModeContextProvider>
                      <ConfirmProvider>
                        <TargetedFieldContextProvider>
                          <CharacterBuilderProvider>
                            <LevelUpProvider>
                              <RestProvider>
                                <Root />
                              </RestProvider>
                            </LevelUpProvider>
                          </CharacterBuilderProvider>
                        </TargetedFieldContextProvider>
                      </ConfirmProvider>
                    </EditModeContextProvider>
                  </EncounterContextProvider>
                </CharacterContextProvider>
              </DatastoreContextProvider>
            </DatastoreSelectorContextProvider>
          </GoogleOauthContextProvider>
        </SharingSessionsContextProvider>
      </SettingsContextProvider>
    ),
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/",
        element: <Home />,
      },
      {
        path: "/settings",
        element: <SettingsPage />,
      },
      {
        path: "/sheet",
        element: <SheetContainer />,
      },
      {
        path: "/play",
        element: <PlaySurface />,
      },
      {
        path: "/auth",
        element: <GoogleAuthInitializer />,
      },
      {
        path: "/sessions",
        element: <Sessions />,
      },
      { path: "/join", element: <RemoteConnectionInitializer /> },
    ],
  },
]);

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
