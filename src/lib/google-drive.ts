// These are shipped to the browser by design (the app talks to Google Drive
// client-side), so they are not secrets. They are configurable per-deployment
// via env vars; the defaults point at the project's own Google Cloud app.
export const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ??
  "998156536896-4j4rbhlb39epi0t6vlia682lbjlk9tia.apps.googleusercontent.com";
export const API_KEY =
  import.meta.env.VITE_GOOGLE_API_KEY ??
  "AIzaSyDp__PTlFtW7FNY2SDN84ZfH1Fwx0DjprE";

// Discovery doc URL for APIs used by the quickstart
export const DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";

// drive.appdata: private per-user storage (the default backend).
// drive.file: per-file access to documents this app creates or the user opens
// via the Picker — used for promoted/shared first-class character documents.
// Both are non-sensitive scopes, so they avoid restricted-scope verification.
export const SCOPES =
  "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file";

// appProperties markers stamped on promoted (first-class, shareable) character
// documents so the app can recognize and re-list them.
export const SHARED_MARKER_KEY = "fiveECharacter";
export const SHARED_UUID_KEY = "fiveECharacterUuid";

// GIS access tokens are short-lived (~1h) and held only in memory, so a fresh
// page load would otherwise re-prompt for consent. We cache the granted token
// (with its expiry + scopes) so returning users can resume silently until it
// expires, then refresh without UI. Access tokens are not refresh tokens and
// can't be used to mint new ones — they only let us skip the consent dialog.
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

export function persistToken(resp: google.accounts.oauth2.TokenResponse) {
  const stored: StoredToken = {
    accessToken: resp.access_token,
    expiresAt: Date.now() + Number(resp.expires_in) * 1000,
    scope: resp.scope,
  };
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

// Signs this browser out of Drive by dropping the token (in-memory + cached).
// The OAuth grant itself persists, so a later sign-in can be silent.
export function signOutOfDrive() {
  if (window.gapi?.client?.getToken()) {
    window.gapi.client.setToken(null);
  }
  clearStoredToken();
}

// Fully revokes the app's OAuth grant; the next sign-in requires re-consent.
export function revokeDriveAccess(): Promise<void> {
  return new Promise((resolve) => {
    const token = window.gapi?.client?.getToken();
    if (token) {
      window.google.accounts.oauth2.revoke(token.access_token, () => resolve());
      window.gapi.client.setToken(null);
    } else {
      resolve();
    }
    clearStoredToken();
  });
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
export function restoreToken(): boolean {
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

type FilesListParams = Parameters<
  typeof window.gapi.client.drive.files.list
>[0];

async function listAllPages(
  params: FilesListParams,
): Promise<gapi.client.drive.File[]> {
  const files: gapi.client.drive.File[] = [];
  let pageToken: string | undefined;
  do {
    const response = await window.gapi.client.drive.files.list({
      ...params,
      pageToken,
    });
    files.push(...(response.result.files || []));
    pageToken = response.result.nextPageToken;
  } while (pageToken);
  return files;
}

// Private characters stored in the hidden appDataFolder (filename = uuid).
export async function listAppDataFiles() {
  try {
    return await listAllPages({
      spaces: "appDataFolder",
      pageSize: 100,
      fields: "nextPageToken, files(id, name)",
    });
  } catch (err: any) {
    console.error(err);
    return [];
  }
}

// First-class, shareable character documents this app created in My Drive.
export async function listSharedCharacterFiles() {
  try {
    return await listAllPages({
      q: `appProperties has { key='${SHARED_MARKER_KEY}' and value='true' } and trashed=false`,
      pageSize: 100,
      fields: `nextPageToken, files(id, name, appProperties)`,
    });
  } catch (err: any) {
    console.error(err);
    return [];
  }
}

export async function getFileContents(fileId: string) {
  let response;
  try {
    response = await window.gapi.client.drive.files.get({
      fileId: fileId,
      alt: "media",
    });
  } catch (err: any) {
    console.error(err);
    return;
  }
  return response.body;
}

export async function updateFile(fileId: string, fileContents: string) {
  return fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}`, {
    method: "PATCH",
    headers: new Headers({
      Authorization: `Bearer ${window.gapi.client.getToken().access_token}`,
      "Content-Type": "application/json",
    }),
    body: fileContents,
  });
}

interface CreateFileOptions {
  // Where to create the file. Defaults to the hidden appDataFolder. Omit (pass
  // an empty value) to create a first-class document in the user's My Drive.
  parents?: string[];
  appProperties?: Record<string, string>;
}

export async function createFile(
  fileName: string,
  options: CreateFileOptions = { parents: ["appDataFolder"] },
) {
  const body: gapi.client.drive.File = { name: fileName };
  if (options.parents) body.parents = options.parents;
  if (options.appProperties) body.appProperties = options.appProperties;
  try {
    const response = await window.gapi.client.drive.files.create(
      { uploadType: "simple" },
      body,
    );
    if (!response.result.id) {
      throw new Error("Failed to create file; no id was returned!");
    }
    return response.result.id;
  } catch (err: any) {
    console.error(err);
    throw err;
  }
}

// Renames a Drive file (metadata-only update, no content change).
export async function renameFile(fileId: string, name: string) {
  return window.gapi.client.drive.files.update({ fileId, resource: { name } });
}

// Reads a file's app-private metadata (visible to every user who accesses the
// file through this same app). Used for the lightweight editor-presence
// heartbeat on shared documents.
export async function getFileAppProperties(
  fileId: string,
): Promise<Record<string, string>> {
  try {
    const res = await window.gapi.client.drive.files.get({
      fileId,
      fields: "appProperties",
    });
    return res.result.appProperties ?? {};
  } catch (err: any) {
    console.error(err);
    return {};
  }
}

// Merges a partial appProperties patch into a file (metadata-only). Keys mapped
// to null are removed; keys not mentioned are left untouched — so this never
// disturbs the SHARED_* markers or other editors' heartbeats.
export async function patchFileAppProperties(
  fileId: string,
  appProperties: Record<string, string | null>,
) {
  return window.gapi.client.drive.files.update({
    fileId,
    // Drive treats a null appProperties value as "delete this key", but the gapi
    // types only model string values — cast at this boundary.
    resource: { appProperties } as gapi.client.drive.File,
  });
}

// Grants a user write access to a file and emails them a notification.
export async function shareFileByEmail(fileId: string, email: string) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=true`,
    {
      method: "POST",
      headers: new Headers({
        Authorization: `Bearer ${window.gapi.client.getToken().access_token}`,
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        role: "writer",
        type: "user",
        emailAddress: email,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to share file (${res.status})`);
  }
}

export async function deleteFile(fileId: string) {
  return window.gapi.client.drive.files.delete({ fileId });
}

export interface PickedFile {
  id: string;
  name: string;
}

// The Picker library ships with the gapi script but must be loaded separately.
let pickerLoaded = false;
function loadPicker(): Promise<void> {
  return new Promise((resolve) => {
    if (pickerLoaded) return resolve();
    window.gapi.load("picker", () => {
      pickerLoaded = true;
      resolve();
    });
  });
}

// Opens the Google Picker showing documents shared with the signed-in user.
// Picking a file is what grants this app drive.file (per-file) access to it —
// shared-with-me files are otherwise invisible to our scopes. Resolves with the
// selected files, or an empty array if the user cancels.
export async function pickSharedCharacters(): Promise<PickedFile[]> {
  await loadPicker();
  const token = window.gapi.client.getToken();
  if (!token) throw new Error("Not signed in to Google Drive.");

  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setOwnedByMe(false)
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false);

    const picker = new google.picker.PickerBuilder()
      .setOAuthToken(token.access_token)
      .setDeveloperKey(API_KEY)
      // The Cloud project number (leading segment of the OAuth client id) is
      // required for the Picker to grant drive.file access to picked files.
      .setAppId(CLIENT_ID.split("-")[0])
      .addView(view)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setCallback((data: google.picker.ResponseObject) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.PICKED) {
          const docs = data[google.picker.Response.DOCUMENTS] ?? [];
          resolve(
            docs.map((doc) => ({
              id: doc[google.picker.Document.ID],
              name: doc[google.picker.Document.NAME] ?? "Imported character",
            })),
          );
        } else if (action === google.picker.Action.CANCEL) {
          resolve([]);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
