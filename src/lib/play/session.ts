import { UUID } from "crypto";
import { randomUUID } from "src/lib/browser";
import {
  Encounter,
  insertParticipant,
  Participant,
  ParticipantVitals,
  reclaimDmSeat,
} from "src/lib/play/encounter";
import { PlaySessionRef } from "src/lib/types";

// The party session: one shared encounter across several browsers.
//
// This module is the **pure, testable core** of it — codes, message shapes, and
// the merge rule. The WAMP transport lives in `use-play-session.tsx`, following
// the codebase's standing split: network paths are verified by hand, so the
// decisions inside them are extracted to somewhere that can be tested.
//
// Two things make this simpler than the existing character-sharing layer:
//
// 1. **Everyone opens their own character locally.** The session syncs the
//    encounter, not characters — so there is no host who owns someone else's
//    sheet, and no joiner without a datastore.
// 2. **Only a projection ever leaves the browser.** Names, HP, AC, conditions,
//    concentration and initiative — the things the party can see across a table
//    anyway. No spell list, no inventory, no backstory. That's the privacy
//    default holding *by construction* rather than by a flag: a sheet nobody
//    asked for is never transmitted, so there's nothing to leak.

const BASE_APPNAME = "net.dndcharactersheets";

export const PlaySessionEvent = {
  // The whole encounter, from whoever changed it last.
  STATE: BASE_APPNAME + ".encounter.state",
  // "I just arrived, someone tell me the state."
  HELLO: BASE_APPNAME + ".encounter.hello",
  // "I'm going" — drops the sender's participants from everyone's roster.
  LEAVE: BASE_APPNAME + ".encounter.leave",
  // "I'd like to play that offered sheet" — answered by whoever owns it.
  CLAIM_SHEET: BASE_APPNAME + ".encounter.claimsheet",
  // A whole character, DM to one claimant. **The one deliberate exception to
  // "only a projection crosses the wire"** — and it stays an exception by
  // construction: a sheet travels only after its owner marked it claimable
  // (per sheet, on the DM board) and only in reply to a claim. Player-owned
  // sheets have no path through here at all.
  SHEET: BASE_APPNAME + ".encounter.sheet",
  // "I'm here, and this is what to call me." A clientId and a chosen display
  // name — nothing else, so the projection rule holds. Announced on join and
  // re-announced in reply to a hello; no heartbeats, so a crashed tab can
  // leave a ghost name until the session turns over. The assignment flow is
  // built so a ghost is harmless (see ASSIGN).
  PRESENCE: BASE_APPNAME + ".encounter.presence",
  // "Would you play this sheet?" — a *targeted offer*, DM to one client. The
  // sheet does not travel with it: accepting runs the ordinary claim flow
  // (CLAIM_SHEET → SHEET), so consent stays two-sided and assigning to a dead
  // client costs nothing — no reply, the offer still stands.
  ASSIGN: BASE_APPNAME + ".encounter.assignsheet",
};

// Session codes are **uuids, and the uuid is the authentication** — the same
// trust model the character realms already run on.
//
// The first draft used six characters from a spoken-friendly alphabet, which was
// the wrong call: `openRealm` is an unauthenticated GET with no rate limiting, so
// ~9x10^8 possibilities is a few hours of guessing away from a stranger reading
// your party's HP and conditions. A session code is pasted into a group chat, not
// read out loud, so there is nothing to buy with the shorter form.
//
// The cost of the change is that codes are no longer memorable — which is why
// characters remember the sessions they've joined (`Character.playSessions`).

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function newSessionCode(): string {
  return randomUUID();
}

// Codes are pasted, so the mess that comes with a paste is what has to work:
// surrounding whitespace, wrong case, and the dash-less form some tools produce.
// The canonical form is the dashed lowercase uuid.
export function normalizeSessionCode(input: string): string {
  const raw = input.trim().toLowerCase().replace(/\s/g, "");
  if (UUID_PATTERN.test(raw)) return raw;
  const hex = raw.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/.test(hex)) {
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }
  return raw;
}

export function isValidSessionCode(input: string): boolean {
  return UUID_PATTERN.test(normalizeSessionCode(input));
}

// The realm a code maps to. Namespaced away from the character realms
// (`generateRealm` uses a bare hex uuid) so a session and a shared character can
// never collide on the sidecar — which matters more now that both are uuids.
export function realmForSession(code: string): string {
  return `sess${normalizeSessionCode(code).replace(/-/g, "")}`;
}

// How many joined sessions a character remembers. A player has a game night or
// two, not a backlog; beyond that the list stops being a shortcut and becomes
// something to read.
export const REMEMBERED_SESSIONS = 5;

// Record a session on the character, most recent first. Re-joining an existing
// one moves it to the top rather than adding a duplicate, so the list orders
// itself by use without the player curating it.
export function rememberSession(
  sessions: PlaySessionRef[] | undefined,
  code: string,
  now: number,
): PlaySessionRef[] {
  const normalized = normalizeSessionCode(code) as UUID;
  const rest = (sessions ?? []).filter((s) => s.code !== normalized);
  return [{ code: normalized, lastJoined: now }, ...rest].slice(
    0,
    REMEMBERED_SESSIONS,
  );
}

export function forgetSession(
  sessions: PlaySessionRef[] | undefined,
  code: string,
): PlaySessionRef[] {
  const normalized = normalizeSessionCode(code);
  return (sessions ?? []).filter((s) => s.code !== normalized);
}

export type SessionMessage =
  | { kind: "state"; clientId: string; encounter: Encounter }
  | { kind: "hello"; clientId: string }
  | { kind: "leave"; clientId: string }
  | { kind: "presence"; clientId: string; name: string }
  | {
      kind: "assignSheet";
      clientId: string;
      toClientId: string;
      participantId: string;
    }
  | { kind: "claimSheet"; clientId: string; participantId: string }
  | {
      kind: "sheet";
      clientId: string;
      // Addressed, not broadcast in spirit: everyone receives it (WAMP topics
      // have no private lanes on this broker) but only the claimant loads it.
      toClientId: string;
      participantId: string;
      character: unknown;
    };

// --- Merging -----------------------------------------------------------------

// Anyone may write to the encounter — the DM seat is a UI gate, not a lock, so
// that a sleeping laptop can't freeze someone else's fight. Convergence is
// therefore last-write-wins on a monotonic `revision`, with the client id
// breaking ties so two simultaneous writers can't sit swapping states forever.
export function bumpRevision(
  encounter: Encounter,
  clientId: string,
): Encounter {
  return {
    ...encounter,
    revision: (encounter.revision ?? 0) + 1,
    revisedBy: clientId,
  };
}

function wins(incoming: Encounter, local: Encounter): boolean {
  const a = incoming.revision ?? 0;
  const b = local.revision ?? 0;
  if (a !== b) return a > b;
  // Same revision from two different writers: pick deterministically so every
  // browser lands on the same answer, rather than on whichever arrived last.
  return (incoming.revisedBy ?? "") > (local.revisedBy ?? "");
}

// Apply an encounter that arrived from a peer.
//
// One exception to last-write-wins: **you are authoritative for your own
// vitals, unless someone deliberately overwrote them**. A peer's copy of your
// HP is usually only as fresh as the last state they received, so accepting it
// wholesale makes your own HP bar jump backwards every time somebody else moves
// the turn along. But a DM setting your HP is also "a peer's copy of you", and
// the two cases arrive looking identical — which is what `vitalsRev` is for: a
// stale echo carries a rev you've already passed, a real edit carries one you
// haven't. Everything else — including conditions on you, which the DM may well
// be setting — is plain LWW.
//
// A joiner (`adopt`) keeps its own vitals *regardless* of revs, and jumps its
// rev past the incoming one. A room can hold a copy of you from last week if
// you closed the tab without leaving, with a rev far beyond your fresh local
// count — and last week's HP must not overwrite the sheet you just walked in
// with.
export function mergeEncounter(
  local: Encounter,
  incoming: Encounter,
  selfCharacterUuid: UUID | undefined,
  selfClientId?: string,
  adopt = false,
): Encounter {
  // `adopt` is the first state a joiner receives, and it skips the revision
  // race outright.
  //
  // Revisions only order writes within one shared history. A client that has
  // just joined has its own unrelated history — its local encounter has been
  // counting up on its own — and the two routinely collide on the same number,
  // at which point the clientId tiebreak decides who exists by comparing two
  // random uuids. Roughly half the time the joiner "wins" and silently discards
  // the room: the fight in progress, the DM seat, everyone else's initiative.
  //
  // A newcomer has nothing to be authoritative about, so it defers to the room
  // and contributes only its own participants (re-added below).
  if (!adopt && !wins(incoming, local)) return local;

  const mine = selfCharacterUuid
    ? local.participants.find((p) => p.characterUuid === selfCharacterUuid)
    : undefined;
  const theirCopyOfMe = selfCharacterUuid
    ? incoming.participants.find((p) => p.characterUuid === selfCharacterUuid)
    : undefined;
  const keepOwnVitals =
    !!mine?.vitals &&
    (adopt || (mine.vitalsRev ?? 0) >= (theirCopyOfMe?.vitalsRev ?? 0));

  // Anyone this client contributed who isn't in the incoming state yet. The
  // case that matters is joining: you announce yourself, whoever's already
  // there replies with a state that predates you, and accepting it wholesale
  // would delete you from your own roster — with nothing to put you back,
  // because the participant-sync effect only runs when the character changes.
  const ours = selfClientId
    ? local.participants.filter((p) => p.ownerClientId === selfClientId)
    : [];
  const incomingIds = new Set(incoming.participants.map((p) => p.id));
  const missing = ours.filter((p) => !incomingIds.has(p.id));

  const participants = incoming.participants.map((p) =>
    keepOwnVitals && p.characterUuid === selfCharacterUuid
      ? {
          ...p,
          vitals: mine!.vitals,
          // At least the incoming rev — ties keep our own — so the copy we
          // just refused can't win a later round against us.
          vitalsRev: Math.max(mine!.vitalsRev ?? 0, p.vitalsRev ?? 0),
        }
      : p,
  );

  // Re-seated by initiative rather than appended: with a fight in progress the
  // array is the turn order, and a joiner should land where their roll says —
  // on every peer's copy, not just their own.
  return missing.reduce(insertParticipant, { ...incoming, participants });
}

// Who this client is, for the decisions below.
export interface SessionSelf {
  clientId: string;
  // The open character, if any — a DM often has none.
  characterUuid?: UUID;
  // This browser's durable DM key. See `Encounter.dmToken`.
  dmToken?: string;
  // True for the first state after joining. See `mergeEncounter`.
  adopt?: boolean;
}

export interface StateReceipt {
  encounter: Encounter;
  // Whether this has to go back out. Applying a peer's state silently is the
  // default — echoing it back is an endless exchange — so this is only true when
  // the merge produced something the peer doesn't know.
  publish: boolean;
  // Set when the merge accepted someone else's write to *our own* vitals — a DM
  // deliberately setting our HP. The caller applies it to the character itself,
  // because the participant is only a projection of the sheet: leave the sheet
  // untouched and its next change would publish the old HP right back.
  ownVitals?: ParticipantVitals;
}

// Everything that happens when a peer's state arrives, as one pure function.
//
// It lives here rather than in the provider because it is the part worth
// testing: `session-sim.ts` drives several of these against a fake broker, which
// is how the revision race and the seat reclaim are covered without a browser.
// The provider's job is reduced to storage, React state and the network.
export function receiveState(
  local: Encounter,
  incoming: Encounter,
  self: SessionSelf,
): StateReceipt {
  const merged = mergeEncounter(
    local,
    incoming,
    self.characterUuid,
    self.clientId,
    self.adopt,
  );
  // Walking back into a session you were the DM of: the token matches, so the
  // seat comes back without anyone pressing anything.
  const seated = reclaimDmSeat(merged, self.clientId, self.dmToken);

  const findMe = (encounter: Encounter) =>
    self.characterUuid
      ? encounter.participants.find(
          (p) => p.characterUuid === self.characterUuid,
        )
      : undefined;
  const mineBefore = findMe(local);
  const mineAfter = findMe(seated);
  const theirCopyOfMe = findMe(incoming);

  // Our own vitals moved without us touching them: the merge accepted a
  // deliberate write from someone else (rev-checked in `mergeEncounter`), and
  // the character has to follow.
  const ownVitals =
    mineBefore?.vitals &&
    mineAfter?.vitals &&
    !sameVitals(mineBefore.vitals, mineAfter.vitals)
      ? mineAfter.vitals
      : undefined;

  // Publish when we hold something the peer hasn't heard of: someone in the
  // order, the seat now pointing at this tab, or our own vitals corrected over
  // their stale copy of us (the rejoin case — without this the room keeps
  // showing last week's HP until the sheet next changes).
  const theirs = new Set(incoming.participants.map((p) => p.id));
  const correctedOwnVitals =
    !!mineAfter?.vitals &&
    !!theirCopyOfMe &&
    !sameVitals(mineAfter.vitals, theirCopyOfMe.vitals);
  const publish =
    seated !== merged ||
    correctedOwnVitals ||
    seated.participants.some((p) => !theirs.has(p.id));
  return { encounter: seated, publish, ownVitals };
}

function sameVitals(
  a: ParticipantVitals | undefined,
  b: ParticipantVitals | undefined,
): boolean {
  if (!a || !b) return a === b;
  return a.currHp === b.currHp && a.maxHp === b.maxHp && a.ac === b.ac;
}

// Merge a newcomer's participants into the state we already have, without
// letting their empty encounter clobber a fight in progress. Used when a client
// joins: they announce themselves, we reply with the state, and their own
// participant has to survive the reply that overwrites them.
export function withParticipants(
  encounter: Encounter,
  incoming: Participant[],
): Encounter {
  const known = new Set(encounter.participants.map((p) => p.id));
  const additions = incoming.filter((p) => !known.has(p.id));
  if (additions.length === 0) return encounter;
  return {
    ...encounter,
    participants: [...encounter.participants, ...additions],
  };
}

// Drop everyone a departing client owned. Their own character's participant
// goes; anything they typed in by hand (monsters, absent allies) stays, because
// the fight still contains it and someone else is now tracking it.
export function withoutClient(
  encounter: Encounter,
  clientId: string,
): Encounter {
  // A borrowed sheet goes back on the table, not out the door. The player
  // leaving owned it only for the evening — the DM brought it, so it reverts
  // to the DM's client as a static, still-offered projection, ready for the
  // next pickup. Everything the leaver actually owned goes with them.
  const dm = encounter.dmClientId;
  let changed = false;
  const participants = encounter.participants.flatMap((p) => {
    if (p.ownerClientId !== clientId || !p.characterUuid) return [p];
    changed = true;
    if (p.claimable && dm && dm !== clientId) {
      return [{ ...p, ownerClientId: dm }];
    }
    return [];
  });
  // A departing DM puts the seat down but keeps the key: `dmClientId` clears so
  // the controls aren't locked to a client that has left the realm, while
  // `dmToken` stays so the same browser reclaims on the way back in. Giving it
  // up for good is `releaseDmSeat`, which is a decision, not a disconnection.
  const heldSeat = encounter.dmClientId === clientId;
  if (!changed && !heldSeat) {
    return encounter;
  }
  const turnIndex =
    participants.length === 0
      ? 0
      : Math.min(encounter.turnIndex, participants.length - 1);
  return {
    ...encounter,
    participants,
    turnIndex,
    dmClientId: heldSeat ? undefined : encounter.dmClientId,
  };
}

// --- Presence ----------------------------------------------------------------
//
// Who is connected right now, by chosen display name. This is **transient
// per-connection state, not part of the encounter**: it isn't persisted, isn't
// merged, and clears when the connection drops — putting it on the shared
// document would mean merging liveness by revision, which is a category error.
// It exists so the DM has someone to point at when handing a sheet out; a
// sheetless player has no participant, so without this they're invisible.

export interface PresentClient {
  clientId: string;
  name: string;
}

// Upsert, order-stable: re-announcing (every hello triggers one) must not
// reshuffle a dropdown the DM is looking at.
export function withPresence(
  roster: PresentClient[],
  clientId: string,
  name: string,
): PresentClient[] {
  const existing = roster.find((c) => c.clientId === clientId);
  if (existing?.name === name) return roster;
  if (!existing) return [...roster, { clientId, name }];
  return roster.map((c) => (c.clientId === clientId ? { ...c, name } : c));
}

export function withoutPresence(
  roster: PresentClient[],
  clientId: string,
): PresentClient[] {
  if (!roster.some((c) => c.clientId === clientId)) return roster;
  return roster.filter((c) => c.clientId !== clientId);
}
