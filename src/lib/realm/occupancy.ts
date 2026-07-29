import { codeCandidates, SessionKind } from "src/lib/session-codes";

// Asking the sidecar which kind of session a pasted code refers to.
//
// This replaced a socket probe (`play/probe-realm.ts`): there used to be no
// "does this realm exist" endpoint — `openRealm` would *create* one, the
// opposite of a probe — so the question was asked by opening a connection and
// seeing whether it survived. That could only ever report two outcomes, so a
// sidecar that was down looked exactly like a code whose realm had closed, and
// the player was told to "check the code" when the truth was "check your
// network". The `GET /realm/<name>` lookup answers without touching anything,
// and failing to *reach* it is now its own answer.
//
// Network-bound, so it holds no decisions: which realms to try, and in what
// order, is `session-codes.ts`.

export type ProbeResult = SessionKind | "unreachable" | undefined;

async function realmExists(
  host: string,
  realm: string,
): Promise<boolean | "unreachable"> {
  let res: Response;
  try {
    res = await fetch(`${host}/realm/${realm}`);
  } catch {
    return "unreachable";
  }
  if (res.status !== 200) return false;
  try {
    const body = (await res.json()) as { exists?: boolean };
    return !!body.exists;
  } catch {
    return false;
  }
}

// Which kind of session this code opens; `undefined` when no realm is open on
// it (a typo, or an ended session — the sidecar deliberately can't tell those
// apart, since remembering closed realms would mean remembering every code
// ever used); `"unreachable"` when the sidecar didn't answer at all.
export async function detectSessionKind(
  host: string,
  code: string,
): Promise<ProbeResult> {
  for (const candidate of codeCandidates(code)) {
    const answer = await realmExists(host, candidate.realm);
    if (answer === "unreachable") return "unreachable";
    if (answer) return candidate.kind;
  }
  return undefined;
}
