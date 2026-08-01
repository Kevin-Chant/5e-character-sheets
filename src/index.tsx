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

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <SettingsContextProvider>
        <SharingSessionsContextProvider>
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
                                {/* Innermost, so the panel overlays every
                                      surface and survives navigating between
                                      them (the Drive tab leaves for /auth). */}
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
      // Settings is an overlay, not a page — this keeps the old path working
      // for a stray bookmark, and gives the Drive round-trip somewhere honest
      // to return to.
      {
        path: "/settings",
        element: <SettingsAlias />,
      },
      {
        path: "/sheet",
        element: <SheetContainer />,
      },
      // The same surface with a character named in the URL, which is what
      // lets a refresh land back on the sheet it left instead of the menu.
      {
        path: "/sheet/:uuid",
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
      // Where the Drive share email lands. The invite link for a *document*,
      // as `/join/:code` is for a table.
      { path: "/import/:fileId", element: <ImportCharacter /> },
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
