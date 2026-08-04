// Google Drive auth as a module singleton, not a route.
//
// This used to live inside the `/auth` route component, which meant the gapi
// and GIS scripts — and the token client — only existed while the user was
// physically parked on that page. Every path into Drive therefore detoured
// through `/auth`, even when a perfectly valid token sat in localStorage. As a
// module, any surface can call `ensureDriveToken()` and keep rendering itself
// while the silent resume happens; `/auth` shrinks to the interactive consent
// UI for the one case that genuinely needs a click.
//
// The hard constraint shaping all of this: with no backend, we're on the GIS
// implicit token flow. Access tokens last ~1h and there are no refresh tokens
// client-side — a cached grant only lets us *ask again without UI*, and that
// silent ask can still fail (signed out of Google, third-party-context
// blocking). So every silent path here has an interactive fallback, and the
// fallback can never be deleted.

import { useSyncExternalStore } from "react";

// These are shipped to the browser by design (the app talks to Google Drive
// client-side), so they are not secrets. They are configurable per-deployment
// via env vars; the defaults point at the project's own Google Cloud app.
export const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ??
  "998156536896-4j4rbhlb39epi0t6vlia682lbjlk9tia.apps.googleusercontent.com";
export const API_KEY =
  import.meta.env.VITE_GOOGLE_API_KEY ??
  "AIzaSyDp__PTlFtW7FNY2SDN84ZfH1Fwx0DjprE";

export const DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";

// drive.appdata: private per-user storage (the default backend).
// drive.file: per-file access to documents this app creates or the user opens
// via the Picker — used for promoted/shared first-class character documents.
// Both are non-sensitive scopes, so they avoid restricted-scope verification.
export const SCOPES =
  "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file";

// GIS access tokens are short-lived (~1h) and held only in memory, so a fresh
// page load would otherwise re-prompt for consent. We cache the granted token
// (with its expiry + scopes) so returning users can resume silently until it
// expires, then refresh without UI.
const TOKEN_STORAGE_KEY = "googleDriveToken";

interface StoredToken {
  accessToken: string;
  expiresAt: number; // epoch ms
  scope: string;
}

function readStoredToken(): StoredToken | undefined {
  const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as StoredToken;
  } catch {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return undefined;
  }
}

// Every scope we require must be present in the granted set (order/extras OK).
function coversRequiredScopes(granted: string): boolean {
  const grantedSet = new Set(granted.split(" "));
  return SCOPES.split(" ").every((scope) => grantedSet.has(scope));
}

function persistToken(resp: google.accounts.oauth2.TokenResponse) {
  const stored: StoredToken = {
    accessToken: resp.access_token,
    expiresAt: Date.now() + Number(resp.expires_in) * 1000,
    scope: resp.scope,
  };
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));
}

function clearStoredToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

// True when the user has granted access before with the scopes we need — even
// if the cached token has since expired. Used to decide whether a silent
// (no-UI) token refresh is worth attempting.
export function hasStoredGrant(): boolean {
  const stored = readStoredToken();
  if (!stored) return false;
  if (!coversRequiredScopes(stored.scope)) {
    clearStoredToken();
    return false;
  }
  return true;
}

// If a still-valid cached token covering the required scopes exists, prime gapi
// with it and return true so the consent flow can be skipped. A 60s buffer
// avoids restoring a token that would expire mid-request.
function restoreToken(): boolean {
  const stored = readStoredToken();
  if (!stored) return false;
  if (!coversRequiredScopes(stored.scope)) {
    clearStoredToken();
    return false;
  }
  if (stored.expiresAt - 60_000 <= Date.now()) return false; // expired-ish
  window.gapi.client.setToken({ access_token: stored.accessToken });
  return true;
}

// ---------------------------------------------------------------------------
// Status, observable from React via useDriveAuthStatus().
//
//   uninitialized → the Google scripts haven't been asked for
//   initializing  → scripts loading / gapi client init in flight
//   restoring     → a silent, no-UI token refresh is being attempted
//   ready         → gapi holds a token covering our scopes
//   needs-auth    → silent paths are exhausted; only a user click can proceed
// ---------------------------------------------------------------------------

export type DriveAuthStatus =
  | "uninitialized"
  | "initializing"
  | "restoring"
  | "ready"
  | "needs-auth";

let status: DriveAuthStatus = "uninitialized";
const listeners = new Set<() => void>();

function setStatus(next: DriveAuthStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach((listener) => listener());
}

export function getDriveAuthStatus(): DriveAuthStatus {
  return status;
}

function subscribeToStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDriveAuthStatus(): DriveAuthStatus {
  return useSyncExternalStore(
    subscribeToStatus,
    getDriveAuthStatus,
    getDriveAuthStatus,
  );
}

// ---------------------------------------------------------------------------
// Script loading + token client
// ---------------------------------------------------------------------------

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => {
      // Remove the failed tag so a retry can inject a fresh one.
      script.remove();
      reject(new Error(`Failed to load ${src}`));
    };
    document.body.appendChild(script);
  });
}

let tokenClient: google.accounts.oauth2.TokenClient | undefined;
let librariesPromise: Promise<void> | undefined;

// The token client takes its callback at init time, not per request, so
// requests are serialized through one pending resolver.
let pendingTokenRequest: ((ok: boolean) => void) | undefined;
let inflightTokenRequest: Promise<boolean> | undefined;

function onTokenResponse(resp: google.accounts.oauth2.TokenResponse) {
  const resolve = pendingTokenRequest;
  pendingTokenRequest = undefined;
  if (resp.error !== undefined) {
    // A silent refresh (prompt: "") fails like this when interaction is
    // required; the caller decides whether to escalate to a prompt.
    console.warn("Google token request failed", resp);
    setStatus("needs-auth");
    resolve?.(false);
    return;
  }
  persistToken(resp);
  // GIS and gapi are separate clients: issuing a token doesn't hand it to
  // gapi, and every Drive call reads it from there. This used to be done only
  // by `restoreToken` on a later pass, so a freshly granted token reached gapi
  // by luck of ordering. Switching accounts has no such later pass — the whole
  // point is to use the *new* token immediately.
  window.gapi.client.setToken({ access_token: resp.access_token });
  scheduleProactiveRefresh();
  setStatus("ready");
  resolve?.(true);
}

function onTokenError(error: unknown) {
  // Popup closed, or failed to open at all (blocker). Not a crash — the
  // Authorize affordances stay available.
  console.warn("Google token request could not complete", error);
  const resolve = pendingTokenRequest;
  pendingTokenRequest = undefined;
  setStatus("needs-auth");
  resolve?.(false);
}

async function loadGoogleLibraries(): Promise<void> {
  librariesPromise ??= (async () => {
    await Promise.all([
      loadScript("https://apis.google.com/js/api.js").then(
        () =>
          new Promise<void>((resolve, reject) => {
            window.gapi.load("client", () => {
              window.gapi.client
                .init({ apiKey: API_KEY, discoveryDocs: [DISCOVERY_DOC] })
                .then(resolve, reject);
            });
          }),
      ),
      loadScript("https://accounts.google.com/gsi/client"),
    ]);
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: onTokenResponse,
      error_callback: onTokenError,
    });
  })();
  try {
    await librariesPromise;
  } catch (err) {
    // A failed load (offline) must not poison every later attempt.
    librariesPromise = undefined;
    throw err;
  }
}

function requestToken(
  prompt: "" | "consent" | "select_account",
): Promise<boolean> {
  if (!tokenClient) return Promise.resolve(false);
  // One request at a time; a concurrent caller shares the in-flight answer.
  if (inflightTokenRequest) return inflightTokenRequest;
  inflightTokenRequest = new Promise<boolean>((resolve) => {
    pendingTokenRequest = (ok) => {
      inflightTokenRequest = undefined;
      resolve(ok);
    };
    tokenClient!.requestAccessToken({ prompt });
  });
  return inflightTokenRequest;
}

// ---------------------------------------------------------------------------
// The two entry points
// ---------------------------------------------------------------------------

// Everything that can happen without the user: load the libraries, restore a
// still-valid cached token, else (if they've granted before) attempt a silent
// refresh. Resolves true when gapi holds a usable token. Safe to call from
// anywhere, any number of times.
export async function ensureDriveToken(): Promise<boolean> {
  if (status === "uninitialized") setStatus("initializing");
  try {
    await loadGoogleLibraries();
  } catch (err) {
    console.error("Failed to load the Google Drive libraries", err);
    setStatus("needs-auth");
    return false;
  }
  if (restoreToken()) {
    setStatus("ready");
    scheduleProactiveRefresh();
    return true;
  }
  if (hasStoredGrant()) {
    setStatus("restoring");
    return requestToken("");
  }
  setStatus("needs-auth");
  return false;
}

// The interactive path — call from a user gesture (the Authorize button, the
// save indicator's re-auth click). Tries the quiet prompt first for returning
// users, escalating to the full consent dialog only when that fails or when
// there's no prior grant to lean on.
export async function requestDriveToken(): Promise<boolean> {
  try {
    await loadGoogleLibraries();
  } catch (err) {
    console.error("Failed to load the Google Drive libraries", err);
    return false;
  }
  const hasSession = !!window.gapi.client.getToken() || hasStoredGrant();
  if (hasSession && (await requestToken(""))) return true;
  return requestToken("consent");
}

// Deliberately ask Google which account to use. Signing out and back in isn't
// the same thing: the silent-first path in `requestDriveToken` exists precisely
// to avoid a chooser, so a user with two Google accounts would be handed the
// same one back and conclude their characters were gone. This is the only way
// to reach the other account, so it has to be its own entry point.
export async function switchDriveAccount(): Promise<boolean> {
  try {
    await loadGoogleLibraries();
  } catch (err) {
    console.error("Failed to load the Google Drive libraries", err);
    return false;
  }
  // The current token is left alone until a new one arrives: a cancelled
  // chooser should be a no-op, not a sign-out.
  return requestToken("select_account");
}

// ---------------------------------------------------------------------------
// Keeping the token fresh while the app is open
// ---------------------------------------------------------------------------

// Refresh a few minutes before expiry instead of letting the first save after
// the hour mark 401. Best-effort: a failed background refresh just flips
// status to needs-auth, and the next failed write surfaces the click.
const REFRESH_LEAD_MS = 5 * 60_000;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

function cancelProactiveRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = undefined;
}

function scheduleProactiveRefresh() {
  cancelProactiveRefresh();
  const stored = readStoredToken();
  if (!stored) return;
  const delay = Math.max(
    stored.expiresAt - Date.now() - REFRESH_LEAD_MS,
    30_000,
  );
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined;
    void requestToken("");
  }, delay);
}

// ---------------------------------------------------------------------------
// Sign-out / revoke
// ---------------------------------------------------------------------------

// Signs this browser out of Drive by dropping the token (in-memory + cached).
// The OAuth grant itself persists, so a later sign-in can be silent.
export function signOutOfDrive() {
  cancelProactiveRefresh();
  if (window.gapi?.client?.getToken()) {
    window.gapi.client.setToken(null);
  }
  clearStoredToken();
  setStatus("needs-auth");
}

// Fully revokes the app's OAuth grant; the next sign-in requires re-consent.
export function revokeDriveAccess(): Promise<void> {
  cancelProactiveRefresh();
  return new Promise((resolve) => {
    const token = window.gapi?.client?.getToken();
    if (token) {
      window.google.accounts.oauth2.revoke(token.access_token, () => resolve());
      window.gapi.client.setToken(null);
    } else {
      resolve();
    }
    clearStoredToken();
    setStatus("needs-auth");
  });
}

// ---------------------------------------------------------------------------
// The 401-retry wrapper for Drive calls
// ---------------------------------------------------------------------------

// For the fetch-based Drive calls, which don't reject on HTTP errors the way
// gapi does — this carries the status somewhere isAuthFailure can read it.
export class DriveRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DriveRequestError";
  }
}

// Thrown when a Drive call failed for auth reasons and the silent refresh
// couldn't fix it — only a user click can. The save path uses this to show a
// re-auth affordance instead of a generic "check your connection".
export class DriveAuthError extends Error {
  constructor() {
    super("Google Drive sign-in has expired and needs a click to renew.");
    this.name = "DriveAuthError";
  }
}

export function isDriveAuthError(err: unknown): err is DriveAuthError {
  return err instanceof DriveAuthError;
}

// gapi rejects with a response-shaped object rather than an Error.
function isAuthFailure(err: unknown): boolean {
  if (err instanceof DriveRequestError) return err.status === 401;
  const gapiStatus = (err as { status?: number } | undefined)?.status;
  const bodyCode = (err as { result?: { error?: { code?: number } } })?.result
    ?.error?.code;
  return gapiStatus === 401 || bodyCode === 401;
}

// Runs a Drive call; on a 401, silently refreshes the token once and retries.
// If the refresh (or the retry) still fails on auth, throws DriveAuthError so
// callers can tell "needs a sign-in click" apart from "network is down".
export async function withDriveAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isAuthFailure(err)) throw err;
    const refreshed = hasStoredGrant() && (await requestToken(""));
    if (!refreshed) {
      setStatus("needs-auth");
      throw new DriveAuthError();
    }
    try {
      return await fn();
    } catch (retryErr) {
      if (isAuthFailure(retryErr)) {
        setStatus("needs-auth");
        throw new DriveAuthError();
      }
      throw retryErr;
    }
  }
}
