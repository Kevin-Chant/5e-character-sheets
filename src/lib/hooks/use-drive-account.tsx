import { useEffect, useSyncExternalStore } from "react";
import { useDriveAuthStatus } from "src/lib/google-auth";
import { DriveAccount, getDriveAccount } from "src/lib/google-drive";
import {
  clearLastDriveAccount,
  readLastDriveAccount,
  writeLastDriveAccount,
} from "src/lib/last-drive-account";

// Who we're signed in to Drive as, shared across every surface that asks.
//
// A module store rather than a per-component fetch because three places want
// the same answer (the settings tab, the account-switch notice, anything that
// names the account in an error) and it costs a round-trip. It also has to
// survive a component unmounting: the "you're in a different account" notice is
// computed exactly once per sign-in — the moment we write the new email down,
// the evidence of the change is gone — so it can't live in a component that
// closing the settings panel would throw away.

interface DriveAccountState {
  account?: DriveAccount;
  // Set only when this sign-in is a *different* account from the one this
  // browser last used, and only until dismissed. Undefined is the normal case.
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

// `deliberate` marks a switch the user just asked for: the account did change,
// but telling them so would be reporting their own click back at them.
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

// After an account switch the cached answer is about the account we left.
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

// Sign-out clears the token but not the memory of which account it was —
// that's the whole point. Revoking access is the one case where forgetting is
// right: there's no grant left to come back to.
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
