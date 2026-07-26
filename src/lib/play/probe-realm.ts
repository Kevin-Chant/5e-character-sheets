// @ts-expect-error - autobahn-browser ships no type declarations
import autobahn from "autobahn-browser";
import { codeCandidates, SessionKind } from "src/lib/session-codes";

// Asking the sidecar which kind of session a pasted code refers to.
//
// There is no "does this realm exist" endpoint — `openRealm` would *create* one,
// which is the opposite of a probe — so the question is asked the only way the
// sidecar answers it: open a connection and see whether it survives. A realm
// that isn't there closes the connection before it ever opens, which is the same
// signal `use-play-session` already reads to tell a typo from an outage.
//
// Network-bound, so it holds no decisions: which realms to try, and in what
// order, is `session-codes.ts`.

type Connection = any;

function realmExists(host: string, realm: string): Promise<boolean> {
  return new Promise((resolve) => {
    let connection: Connection;
    try {
      connection = new autobahn.Connection({ url: host, realm });
    } catch {
      resolve(false);
      return;
    }
    let opened = false;
    connection.onopen = () => {
      opened = true;
      resolve(true);
      try {
        // We only wanted the answer. The real connection is opened afterwards by
        // whichever flow the code turned out to belong to.
        connection.close();
      } catch {
        // Closing a connection that is already going away isn't interesting.
      }
    };
    connection.onclose = () => {
      if (!opened) resolve(false);
      return true; // suppress autobahn's auto-reconnect
    };
    connection.open();
  });
}

// Which kind of session this code opens, or `undefined` when no realm answers —
// which means a typo, an ended session, or a sidecar that isn't reachable. The
// caller can't tell those apart and shouldn't pretend to.
export async function detectSessionKind(
  host: string,
  code: string,
): Promise<SessionKind | undefined> {
  for (const candidate of codeCandidates(code)) {
    if (await realmExists(host, candidate.realm)) return candidate.kind;
  }
  return undefined;
}
