// Google APIs are loaded at runtime via <script> tags (see
// google-auth-initializer.tsx), so the `gapi` and `google` globals live on
// `window`. The ambient namespaces come from @types/gapi* and
// @types/google.accounts; here we expose them on the Window object.
export {};

declare global {
  interface Window {
    gapi: typeof gapi;
    google: typeof google;
  }
}
