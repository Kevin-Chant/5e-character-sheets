import React from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
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
import HostGame from "./routes/host-game";
import JoinSession from "./routes/join-session";
import SettingsPage from "./routes/settings-page";
import { SettingsContextProvider } from "./lib/hooks/use-settings";
import { SharingSessionsContextProvider } from "./lib/hooks/use-sharing-session";
import { CharacterBuilderProvider } from "./lib/hooks/use-character-builder";
import { LevelUpProvider } from "./lib/hooks/use-level-up";
import { RestProvider } from "./lib/hooks/use-rest";
import { EncounterContextProvider } from "./lib/hooks/use-encounter";
import { RollModeContextProvider } from "./lib/hooks/use-roll-mode";

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
                    {/* Above Root so the nav toggle and every roll surface
                        share the same app-dice/real-dice switch. */}
                    <RollModeContextProvider>
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
                    </RollModeContextProvider>
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
        path: "/host",
        element: <HostGame />,
      },
      // The invite link. Both kinds of code land here and are told apart by a
      // probe — see `join-session.tsx`.
      { path: "/join/:code", element: <JoinSession /> },
      // Manual entry of a character-sharing code, and where `/join/:code`
      // forwards one that turns out to be a shared sheet.
      { path: "/join", element: <RemoteConnectionInitializer /> },
      // Sessions used to be a page of its own, behind a nav icon; the front
      // door does that job now. Kept as a redirect for anyone holding the old
      // link (and for the muscle memory of the people who built it).
      { path: "/sessions", element: <Navigate to="/" replace /> },
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
