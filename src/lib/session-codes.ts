import {
  isValidSessionCode,
  normalizeSessionCode,
  realmForSession,
} from "src/lib/play/session";

// Two different things in this app hand you a code, and both codes are uuids.
//
// - An **editing** session shares one character sheet between two browsers. Its
//   code *is* the character's uuid, and its realm is that uuid's bare hex.
// - A **gameplay** session shares an encounter across a whole table. Its code is
//   a fresh uuid, and its realm is `sess<hex>` — namespaced precisely so the two
//   can never collide on the sidecar.
//
// A player handed a code in a group chat has no reason to know which kind they
// were given, so the app works it out. Shape can't tell them apart (both are
// uuids), so the answer is to ask the sidecar which realm actually exists: the
// namespacing that keeps them from colliding is the same thing that makes them
// distinguishable. This module is the pure half — which realms to try, in what
// order. The asking lives in `play/probe-realm.ts`.

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
// input isn't a uuid at all — there is nothing to probe, and saying so without a
// round trip keeps a typo from looking like an outage.
export function codeCandidates(code: string): CodeCandidate[] {
  if (!isValidSessionCode(code)) return [];
  const normalized = normalizeSessionCode(code);
  return [
    { kind: "gameplay", realm: realmForSession(normalized) },
    { kind: "editing", realm: realmForCharacter(normalized) },
  ];
}
