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
import RemoteConnectionInitializer from "./components/remote-connection-initializer";
import HostGame from "./routes/host-game";
import JoinSession from "./routes/join-session";
import ImportCharacter from "./routes/import-character";
import SettingsAlias from "./routes/settings-alias";
import { SettingsContextProvider } from "./lib/hooks/use-settings";
import { SettingsPanelProvider } from "./lib/hooks/use-settings-panel";
import { SharingSessionsContextProvider } from "./lib/hooks/use-sharing-session";
import { CharacterBuilderProvider } from "./lib/hooks/use-character-builder";
import { LevelUpProvider } from "./lib/hooks/use-level-up";
import { RestProvider } from "./lib/hooks/use-rest";
import { EncounterContextProvider } from "./lib/hooks/use-encounter";
import { RollModeContextProvider } from "./lib/hooks/use-roll-mode";

// Provider order matters: SharingSessions sits above Datastore/Character so
// broadcast/role state is reachable; EncounterContext sits above the routes
// (not just the play surface) so it survives navigation and the roll dialog
// can read conditions from the sheet; SettingsPanelProvider is innermost so
// it overlays every surface and survives the /auth round-trip.
const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <SettingsContextProvider>
        <SharingSessionsContextProvider>
          <DatastoreSelectorContextProvider>
            <DatastoreContextProvider>
              <CharacterContextProvider>
                <EncounterContextProvider>
                  <RollModeContextProvider>
                    <EditModeContextProvider>
                      <ConfirmProvider>
                        <TargetedFieldContextProvider>
                          <CharacterBuilderProvider>
                            <LevelUpProvider>
                              <RestProvider>
                                <SettingsPanelProvider>
                                  <Root />
                                </SettingsPanelProvider>
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
        element: <SettingsAlias />,
      },
      {
        path: "/sheet",
        element: <SheetContainer />,
      },
      {
        path: "/sheet/:uuid",
        element: <SheetContainer />,
      },
      {
        path: "/play",
        element: <PlaySurface />,
      },
      {
        path: "/play/:code",
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
      // Both kinds of code land here, told apart by a probe (join-session.tsx).
      { path: "/join/:code", element: <JoinSession /> },
      // Manual code entry, and where `/join/:code` forwards a shared sheet.
      { path: "/join", element: <RemoteConnectionInitializer /> },
      // Where the Drive share email lands — the invite link for a document.
      { path: "/import/:fileId", element: <ImportCharacter /> },
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
