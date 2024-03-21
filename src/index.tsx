import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import ReactDOM from 'react-dom/client';
import reportWebVitals from './reportWebVitals';
import './index.css';
import Root from './routes/root';
import ErrorPage from './error-page';
import Home from './routes/home';
import LocalSheet from './routes/localsheet';
import { ConfirmProvider } from 'src/lib/hooks/confirm/confirm.provider';
import { CharacterContextProvider } from 'src/lib/hooks/use-character';
import { TargetedFieldContextProvider } from './lib/hooks/use-targeted-field';

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <ConfirmProvider>
        <TargetedFieldContextProvider>
          <Root/>
        </TargetedFieldContextProvider>
      </ConfirmProvider>
    ),
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/",
        element: <Home />,
      },
      {
        path: "/local",
        element: (
          <CharacterContextProvider>
            <LocalSheet/>
          </CharacterContextProvider>
        ),
      }
    ]
  },
]);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <RouterProvider router={router}/>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(undefined);
