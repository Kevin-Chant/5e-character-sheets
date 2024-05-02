import React from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import ReactDOM from "react-dom/client";
import reportWebVitals from "./reportWebVitals";
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

const router = createBrowserRouter([
  {
    path: "/",
    element: (
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
    ),
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/",
        element: <Home />,
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

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(undefined);
