// The auth machinery (config constants, token cache, silent refresh, the
// 401-retry wrapper) lives in `src/lib/google-auth.ts`; this file holds the
// raw Drive REST/gapi primitives. Every network call below goes through
// `withDriveAuthRetry`, so a token that expires mid-session is refreshed
// silently and retried once before the failure reaches a caller.
import {
  API_KEY,
  CLIENT_ID,
  DriveRequestError,
  withDriveAuthRetry,
} from "src/lib/google-auth";

// appProperties markers stamped on promoted (first-class, shareable) character
// documents so the app can recognize and re-list them.
export const SHARED_MARKER_KEY = "fiveECharacter";
export const SHARED_UUID_KEY = "fiveECharacterUuid";

type FilesListParams = Parameters<
  typeof window.gapi.client.drive.files.list
>[0];

async function listAllPages(
  params: FilesListParams,
): Promise<gapi.client.drive.File[]> {
  const files: gapi.client.drive.File[] = [];
  let pageToken: string | undefined;
  do {
    const response = await withDriveAuthRetry(() =>
      window.gapi.client.drive.files.list({
        ...params,
        pageToken,
      }),
    );
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
      // appDataFolder has no user-visible trash, so nothing here is ever
      // trashed on purpose — but a trashed file keeps listing without this,
      // which would resurrect anything that got there by another route.
      q: "trashed=false",
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

export interface DriveAccount {
  displayName?: string;
  emailAddress?: string;
  photoLink?: string;
  // Bytes. `limit` is absent on unlimited (pooled) accounts.
  usage?: number;
  limit?: number;
}

// Who we're signed in as, plus their Drive quota. `about.get` is reachable
// under `drive.appdata`/`drive.file` — it needs *a* Drive scope, not a broad
// one — so this costs no extra consent, which is why the email is read from
// here rather than from the `userinfo` scopes.
export async function getDriveAccount(): Promise<DriveAccount | undefined> {
  try {
    const res = await withDriveAuthRetry(() =>
      window.gapi.client.drive.about.get({
        fields: "user(displayName,emailAddress,photoLink),storageQuota",
      }),
    );
    const { user, storageQuota } = res.result;
    return {
      displayName: user?.displayName,
      emailAddress: user?.emailAddress,
      photoLink: user?.photoLink,
      usage: storageQuota?.usage ? Number(storageQuota.usage) : undefined,
      limit: storageQuota?.limit ? Number(storageQuota.limit) : undefined,
    };
  } catch (err) {
    console.error("Could not read the Google Drive account", err);
    return undefined;
  }
}

export async function getFileContents(fileId: string) {
  let response;
  try {
    response = await withDriveAuthRetry(() =>
      window.gapi.client.drive.files.get({
        fileId: fileId,
        alt: "media",
      }),
    );
  } catch (err: any) {
    console.error(err);
    return;
  }
  return response.body;
}

export async function updateFile(fileId: string, fileContents: string) {
  return withDriveAuthRetry(async () => {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}`,
      {
        method: "PATCH",
        headers: new Headers({
          Authorization: `Bearer ${window.gapi.client.getToken().access_token}`,
          "Content-Type": "application/json",
        }),
        body: fileContents,
      },
    );
    // fetch only rejects on network failure; an expired token (401) or missing
    // write access (403) resolves "successfully" and would otherwise be
    // reported as a completed save. The typed error carries the status so the
    // retry wrapper can recognize a 401 as an auth failure.
    if (!res.ok) {
      throw new DriveRequestError(
        `Failed to write Drive file ${fileId} (${res.status})`,
        res.status,
      );
    }
    return res;
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
    const response = await withDriveAuthRetry(() =>
      window.gapi.client.drive.files.create({ uploadType: "simple" }, body),
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
  return withDriveAuthRetry(() =>
    window.gapi.client.drive.files.update({ fileId, resource: { name } }),
  );
}

// Reads a file's app-private metadata (visible to every user who accesses the
// file through this same app). Used for the lightweight editor-presence
// heartbeat on shared documents.
export async function getFileAppProperties(
  fileId: string,
): Promise<Record<string, string>> {
  try {
    const res = await withDriveAuthRetry(() =>
      window.gapi.client.drive.files.get({
        fileId,
        fields: "appProperties",
      }),
    );
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
  return withDriveAuthRetry(() =>
    window.gapi.client.drive.files.update({
      fileId,
      // Drive treats a null appProperties value as "delete this key", but the
      // gapi types only model string values — cast at this boundary.
      resource: { appProperties } as gapi.client.drive.File,
    }),
  );
}

// The permissions.create URL for a share-by-email, with the notification
// options in the query string where Drive expects them. Exported for its test
// — this is a pure string, and the only thing that goes wrong here is silent.
export function buildShareUrl(fileId: string, emailMessage?: string): string {
  const params = new URLSearchParams({ sendNotificationEmail: "true" });
  if (emailMessage) params.set("emailMessage", emailMessage);
  return `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?${params}`;
}

// Grants a user write access to a file and emails them a notification.
//
// `emailMessage` is the one part of that email we control: Drive renders it as
// a personal note inside its own template. The template's button points at the
// raw file in Drive, which is a JSON blob to a human — so the note is where the
// link back into this app goes. Google linkifies a bare URL in it.
//
// Both `emailMessage` and `sendNotificationEmail` are **query parameters**, not
// fields of the Permission resource in the body. Drive ignores an unknown body
// field rather than rejecting it, so getting this wrong costs no error and no
// failed share — just an email with nothing in it. Hence `buildShareUrl` and
// its test: the placement is the part that breaks silently.
export async function shareFileByEmail(
  fileId: string,
  email: string,
  emailMessage?: string,
) {
  await withDriveAuthRetry(async () => {
    const res = await fetch(buildShareUrl(fileId, emailMessage), {
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
    });
    if (!res.ok) {
      throw new DriveRequestError(
        `Failed to share file (${res.status})`,
        res.status,
      );
    }
  });
}

export async function deleteFile(fileId: string) {
  return withDriveAuthRetry(() =>
    window.gapi.client.drive.files.delete({ fileId }),
  );
}

// Moves a file to the Drive trash instead of destroying it. For a promoted
// (My Drive) character this is what "delete" means everywhere else in Drive —
// recoverable for 30 days from a UI the user already knows. `files.delete` is
// permanent and bypasses the trash entirely, which is the wrong default for
// the only copy of a character somebody has been playing for a year.
//
// Not used for appDataFolder files: that folder's trash isn't reachable from
// the Drive UI, so trashing one would be exactly as unrecoverable while also
// still consuming quota.
export async function trashFile(fileId: string) {
  return withDriveAuthRetry(() =>
    window.gapi.client.drive.files.update({
      fileId,
      resource: { trashed: true },
    }),
  );
}

// The Drive UI page for a file. A plain string, not a request — `webViewLink`
// would be a round-trip for a URL whose shape is fixed.
export function fileViewLink(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export interface FilePermission {
  id: string;
  role: string;
  type: string;
  emailAddress?: string;
  displayName?: string;
}

// Who currently has access to a shared document. Sharing was one-way before
// this — you could grant access and never see, or take back, what you'd
// granted.
export async function listFilePermissions(
  fileId: string,
): Promise<FilePermission[]> {
  const res = await withDriveAuthRetry(() =>
    window.gapi.client.drive.permissions.list({
      fileId,
      fields: "permissions(id,role,type,emailAddress,displayName)",
    }),
  );
  return (res.result.permissions ?? []).map((permission) => ({
    id: permission.id ?? "",
    role: permission.role ?? "",
    type: permission.type ?? "",
    emailAddress: permission.emailAddress,
    displayName: permission.displayName,
  }));
}

export async function removeFilePermission(
  fileId: string,
  permissionId: string,
) {
  return withDriveAuthRetry(() =>
    window.gapi.client.drive.permissions.delete({ fileId, permissionId }),
  );
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
//
// `query` prefills the Picker's search box. That is the whole mechanism behind
// import links: the Picker has no "preselect this file id" API, so the closest
// we can get to opening on one file is narrowing the list to its name. The user
// still has to click it, and that click is what grants the access — which is
// the point, not a limitation to route around.
export async function pickSharedCharacters(
  query?: string,
): Promise<PickedFile[]> {
  await loadPicker();
  const token = window.gapi.client.getToken();
  if (!token) throw new Error("Not signed in to Google Drive.");

  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setOwnedByMe(false)
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false);
    if (query) view.setQuery(query);

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
