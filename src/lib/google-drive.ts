export const CLIENT_ID =
  "998156536896-mcrk9ao2kc7qfbv5umhe8c97p4sutm7a.apps.googleusercontent.com";
export const API_KEY = "AIzaSyDp__PTlFtW7FNY2SDN84ZfH1Fwx0DjprE";

// Discovery doc URL for APIs used by the quickstart
export const DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";

export const SCOPES = "https://www.googleapis.com/auth/drive.appdata";

export async function listFiles() {
  let response;
  try {
    response = await window.gapi.client.drive.files.list({
      spaces: "appDataFolder",
      pageSize: 100,
      fields: "nextPageToken, files(id, name)",
    });
  } catch (err: any) {
    console.error(err);
    return [];
  }
  // TODO: paginate
  return response.result.files || [];
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

export async function createFile(fileName: string) {
  const request = {
    uploadType: "simple",
  };
  const body: gapi.client.drive.File = {
    name: fileName,
    parents: ["appDataFolder"],
  };
  let response;
  try {
    response = await window.gapi.client.drive.files.create(request, body);
    if (!response.result.id) {
      throw new Error("Failed to create file; no id was returned!");
    }
    return response.result.id;
  } catch (err: any) {
    console.error(err);
    throw err;
  }
}

export async function deleteFile(fileId: string) {
  return window.gapi.client.drive.files.delete({ fileId });
}

// @ts-ignore
window.listFiles = listFiles;
// @ts-ignore
window.getFileContents = getFileContents;
// @ts-ignore
window.updateFile = updateFile;
// @ts-ignore
window.createFile = createFile;
// @ts-ignore
window.deleteFile = deleteFile;
