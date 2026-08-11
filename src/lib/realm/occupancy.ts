import { codeCandidates, SessionKind } from "src/lib/session-codes";

// Asks the sidecar which kind of session a pasted code refers to, via
// `GET /realm/<name>` (doesn't create the realm, unlike opening a socket).
// Which realms to try and in what order is `session-codes.ts`.

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
// it (typo or ended session — indistinguishable); `"unreachable"` when the
// sidecar didn't answer at all.
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
