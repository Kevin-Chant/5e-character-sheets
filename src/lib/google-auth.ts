// Google Drive auth as a module singleton, not a route: any surface can call
// `ensureDriveToken()`, and `/auth` is only the interactive consent UI.
//
// GIS implicit token flow: no backend, so no refresh tokens. Access tokens
// last ~1h; a cached grant only lets us ask again without UI, and that silent
// ask can still fail (signed out, third-party-context blocking) — so every
// silent path here needs an interactive fallback.

import { useSyncExternalStore } from "react";

// Shipped to the browser by design — not secrets. Configurable per-deployment
// via env vars; defaults point at the project's own Google Cloud app.
export const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ??
  "998156536896-4j4rbhlb39epi0t6vlia682lbjlk9tia.apps.googleusercontent.com";
export const API_KEY =
  import.meta.env.VITE_GOOGLE_API_KEY ??
  "AIzaSyDp__PTlFtW7FNY2SDN84ZfH1Fwx0DjprE";

export const DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";

// drive.appdata: private per-user storage (default backend).
// drive.file: per-file access to documents this app creates or the user opens
// via the Picker — used for promoted/shared documents. Both non-sensitive scopes.
export const SCOPES =
  "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file";

// Cache the granted token (expiry + scopes) so a fresh page load can resume
// silently instead of re-prompting for consent.
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

// True when access was granted before with the required scopes, even if the
// cached token has since expired.
export function hasStoredGrant(): boolean {
  const stored = readStoredToken();
  if (!stored) return false;
  if (!coversRequiredScopes(stored.scope)) {
    clearStoredToken();
    return false;
  }
  return true;
}

// Primes gapi with a still-valid cached token, if any. 60s buffer avoids
// restoring a token that would expire mid-request.
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

// Status, observable from React via useDriveAuthStatus().
//   uninitialized → Google scripts not yet requested
//   initializing  → scripts loading / gapi client init in flight
//   restoring     → silent, no-UI token refresh in progress
//   ready         → gapi holds a token covering our scopes
//   needs-auth    → silent paths exhausted; only a user click can proceed

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

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove(); // let a retry inject a fresh tag
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
    // A silent refresh (prompt: "") fails like this when interaction is required.
    console.warn("Google token request failed", resp);
    setStatus("needs-auth");
    resolve?.(false);
    return;
  }
  persistToken(resp);
  // GIS and gapi are separate clients; every Drive call reads the token from gapi.
  window.gapi.client.setToken({ access_token: resp.access_token });
  scheduleProactiveRefresh();
  setStatus("ready");
  resolve?.(true);
}

function onTokenError(error: unknown) {
  // Popup closed, or failed to open at all (blocker).
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
    librariesPromise = undefined; // don't let a failed load poison later attempts
    throw err;
  }
}

function requestToken(
  prompt: "" | "consent" | "select_account",
): Promise<boolean> {
  if (!tokenClient) return Promise.resolve(false);
  if (inflightTokenRequest) return inflightTokenRequest; // one request at a time
  inflightTokenRequest = new Promise<boolean>((resolve) => {
    pendingTokenRequest = (ok) => {
      inflightTokenRequest = undefined;
      resolve(ok);
    };
    tokenClient!.requestAccessToken({ prompt });
  });
  return inflightTokenRequest;
}

// Everything that can happen without the user: load libraries, restore a
// still-valid cached token, else attempt a silent refresh if previously
// granted. Resolves true when gapi holds a usable token. Safe to call anytime.
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

// Interactive path — call from a user gesture. Tries the quiet prompt first
// for returning users, escalating to full consent otherwise.
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

// Explicitly asks Google which account to use. `requestDriveToken`'s
// silent-first path would hand back the same account, so a two-account user
// needs this separate entry point to reach the other one.
export async function switchDriveAccount(): Promise<boolean> {
  try {
    await loadGoogleLibraries();
  } catch (err) {
    console.error("Failed to load the Google Drive libraries", err);
    return false;
  }
  // Current token left alone until a new one arrives — a cancelled chooser is a no-op.
  return requestToken("select_account");
}

// Refresh a few minutes before expiry instead of letting the first save after
// the hour mark 401. Best-effort: a failed refresh just flips status to
// needs-auth, surfaced on the next write.
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

// Drops the token (in-memory + cached); the OAuth grant persists, so a later
// sign-in can be silent.
export function signOutOfDrive() {
  cancelProactiveRefresh();
  if (window.gapi?.client?.getToken()) {
    window.gapi.client.setToken(null);
  }
  clearStoredToken();
  setStatus("needs-auth");
}

// Fully revokes the OAuth grant; the next sign-in requires re-consent.
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

// Carries HTTP status for fetch-based Drive calls, which don't reject on HTTP
// errors the way gapi does, so isAuthFailure can read it.
export class DriveRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DriveRequestError";
  }
}

// Thrown when a Drive call failed for auth reasons and silent refresh
// couldn't fix it — only a user click can, so the save path shows a re-auth
// affordance instead of a generic error.
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

// Runs a Drive call; on a 401, silently refreshes the token once and retries,
// throwing DriveAuthError if that still fails.
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
