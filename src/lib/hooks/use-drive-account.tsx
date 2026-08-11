import { useEffect, useSyncExternalStore } from "react";
import { useDriveAuthStatus } from "src/lib/google-auth";
import { DriveAccount, getDriveAccount } from "src/lib/google-drive";
import {
  clearLastDriveAccount,
  readLastDriveAccount,
  writeLastDriveAccount,
} from "src/lib/last-drive-account";

// Who we're signed in to Drive as, shared across every surface that asks. A
// module store (not per-component) since several places need the same
// answer, and the "different account" notice is computed once per sign-in —
// writing the new email down erases the evidence of the change, so it can't
// live in a component that might unmount first.

interface DriveAccountState {
  account?: DriveAccount;
  // Set only when this sign-in differs from the browser's last-used account, until dismissed.
  switchedFrom?: string;
  loading: boolean;
  failed: boolean;
}

let state: DriveAccountState = { loading: false, failed: false };
let inflight: Promise<void> | undefined;
const listeners = new Set<() => void>();

function setState(next: Partial<DriveAccountState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// `deliberate` suppresses the switch notice for a switch the user just asked for.
function fetchAccount(deliberate: boolean): Promise<void> {
  inflight ??= getDriveAccount()
    .then((account) => {
      if (!account) {
        setState({ loading: false, failed: true });
        return;
      }
      const email = account.emailAddress;
      const previous = readLastDriveAccount();
      if (email) writeLastDriveAccount(email);
      setState({
        account,
        switchedFrom:
          !deliberate && email && previous && previous !== email
            ? previous
            : undefined,
        loading: false,
        failed: false,
      });
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

export function loadDriveAccount(): Promise<void> {
  if (state.account) return Promise.resolve();
  setState({ loading: true, failed: false });
  return fetchAccount(false);
}

export function reloadDriveAccount(): Promise<void> {
  inflight = undefined;
  setState({ account: undefined, switchedFrom: undefined, loading: true });
  return fetchAccount(true);
}

export function forgetDriveAccount() {
  inflight = undefined;
  state = { loading: false, failed: false };
  listeners.forEach((listener) => listener());
}

// Unlike a plain sign-out, revoking access also clears the remembered account.
export function forgetDriveAccountEntirely() {
  clearLastDriveAccount();
  forgetDriveAccount();
}

export function dismissAccountSwitchNotice() {
  setState({ switchedFrom: undefined });
}

export function useDriveAccount(): DriveAccountState {
  const status = useDriveAuthStatus();

  useEffect(() => {
    if (status === "ready") void loadDriveAccount();
  }, [status]);

  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
