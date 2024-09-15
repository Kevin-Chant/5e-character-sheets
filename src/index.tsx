import React from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import ReactDOM from "react-dom/client";
import "./index.css";
import Root from "./routes/root";
import ErrorPage from "./error-page";
import Home from "./routes/home";
import SheetContainer from "./components/sheet-container";
import { ConfirmProvider } from "src/lib/hooks/confirm/confirm.provider";
import { CharacterContextProvider } from "src/lib/hooks/use-character";
import { TargetedFieldContextProvider } from "./lib/hooks/use-targeted-field";
import { DatastoreSelectorContextProvider } from "./lib/hooks/use-datastore-selector";
import { DatastoreContextProvider } from "./lib/hooks/use-datastore";
import GoogleAuthInitializer from "./components/google-auth-initializer";
import { GoogleOauthContextProvider } from "./lib/hooks/use-google-oauth";
import RemoteConnectionInitializer from "./components/remote-connection-initializer";
import SettingsPage from "./routes/settings-page";
import { SettingsContextProvider } from "./lib/hooks/use-settings";

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <SettingsContextProvider>
        <GoogleOauthContextProvider>
          <DatastoreSelectorContextProvider>
            <DatastoreContextProvider>
              <CharacterContextProvider>
                <ConfirmProvider>
                  <TargetedFieldContextProvider>
                    <Root />
                  </TargetedFieldContextProvider>
                </ConfirmProvider>
              </CharacterContextProvider>
            </DatastoreContextProvider>
          </DatastoreSelectorContextProvider>
        </GoogleOauthContextProvider>
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
        path: "/auth",
        element: <GoogleAuthInitializer />,
      },
      { path: "/join", element: <RemoteConnectionInitializer /> },
    ],
  },
]);

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
