import {
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "./local-storage";

// The Google account this browser last saw characters in.
//
// This exists for one failure that looks like data loss and isn't: someone with
// a work and a personal Google account signs in as the other one and finds an
// empty (or unfamiliar) character list. Nothing is wrong, nothing is recoverable
// by retrying, and the app has no way to say so — the account is the one piece
// of context that explains it, and until now it was never shown or remembered.
//
// Deliberately a plain string in localStorage rather than anything derived: the
// comparison has to survive the sign-out that clears the token, since the whole
// point is to notice a *change* across sessions.

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

// Whether `email` is a different account from the one this browser was last
// using. A first-ever sign-in is not a mismatch — there's nothing to contradict.
export function isAccountSwitch(email: string | undefined): boolean {
  if (!email) return false;
  const last = readLastDriveAccount();
  return !!last && last !== email;
}
