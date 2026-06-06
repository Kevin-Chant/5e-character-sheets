// These are shipped to the browser by design (the app talks to Google Drive
// client-side), so they are not secrets. They are configurable per-deployment
// via env vars; the defaults point at the project's own Google Cloud app.
export const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ??
  "998156536896-mcrk9ao2kc7qfbv5umhe8c97p4sutm7a.apps.googleusercontent.com";
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
