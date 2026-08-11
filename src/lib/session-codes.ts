import {
  isValidSessionCode,
  normalizeSessionCode,
  realmForSession,
} from "src/lib/play/session";

// Two kinds of code, both uuids: an *editing* session's code is the
// character's uuid, realm = bare hex; a *gameplay* session's code is a fresh
// uuid, realm = `sess<hex>` (namespaced so the two never collide). Since
// shape can't tell them apart, the app probes both realms. This module is the
// pure half — which realms to try, in what order; the asking lives in
// `realm/occupancy.ts`.

export type SessionKind = "gameplay" | "editing";

// The realm a shared character lives in. Paste-tolerant for the same reason
// session codes are: this is a string someone copied out of a chat window.
export function realmForCharacter(uuid: string): string {
  return normalizeSessionCode(uuid).replace(/-/g, "");
}

export interface CodeCandidate {
  kind: SessionKind;
  realm: string;
}

// The realms a pasted code could refer to, most likely first. Empty when the
// input isn't a uuid — nothing to probe, and no round trip needed to say so.
export function codeCandidates(code: string): CodeCandidate[] {
  if (!isValidSessionCode(code)) return [];
  const normalized = normalizeSessionCode(code);
  return [
    { kind: "gameplay", realm: realmForSession(normalized) },
    { kind: "editing", realm: realmForCharacter(normalized) },
  ];
}
