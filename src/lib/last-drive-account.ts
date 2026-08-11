import {
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "./local-storage";

// The Google account this browser last saw characters in — used to detect a
// switch (e.g. work vs. personal account) that would otherwise look like data
// loss. Plain string in localStorage so the comparison survives a sign-out
// that clears the token.

const LAST_DRIVE_ACCOUNT_KEY = "lastDriveAccount";

export function readLastDriveAccount(): string | undefined {
  const value = readLocalStorage(LAST_DRIVE_ACCOUNT_KEY);
  return typeof value === "string" && value ? value : undefined;
}

export function writeLastDriveAccount(email: string) {
  writeLocalStorage(LAST_DRIVE_ACCOUNT_KEY, email);
}

export function clearLastDriveAccount() {
  removeLocalStorage(LAST_DRIVE_ACCOUNT_KEY);
}

// Whether `email` differs from the last account used. A first-ever sign-in
// is not a mismatch.
export function isAccountSwitch(email: string | undefined): boolean {
  if (!email) return false;
  const last = readLastDriveAccount();
  return !!last && last !== email;
}
