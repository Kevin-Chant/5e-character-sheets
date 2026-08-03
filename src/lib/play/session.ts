import { UUID } from "crypto";
import { randomUUID } from "src/lib/browser";
import {
  Encounter,
  insertParticipant,
  Participant,
  ParticipantVitals,
  reclaimDmSeat,
} from "src/lib/play/encounter";
import { RollCallCheck } from "src/lib/play/checks";
import { RollReport, RollVerdict } from "src/lib/play/reports";
import { PlaySessionRef } from "src/lib/types";
import { PresenceEntry } from "src/lib/realm/presence";

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
  // "I've just arrived — is anyone here, and what do you have?" Carries a
  // request id, because the answer has to be tellable from every other state
  // message that might arrive in the meantime.
  SYNC_REQUEST: BASE_APPNAME + ".encounter.syncrequest",
  // "Here's what I have", addressed to whoever asked. Replaces a broadcast
  // reply: the answer is only interesting to the client that asked for it, and
  // making it addressed is what lets adoption be scoped to one request rather
  // than to "the next state message from anyone".
  SYNC_RESPONSE: BASE_APPNAME + ".encounter.syncresponse",
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
  // name — nothing else, so the projection rule holds. Announced on join, in
  // reply to a sync request, and on a heartbeat, which is what lets a client
  // that stopped answering be forgotten rather than haunt the DM's picker. The
  // assignment flow is built so a ghost is harmless anyway (see ASSIGN).
  PRESENCE: BASE_APPNAME + ".encounter.presence",
  // "Would you play this sheet?" — a *targeted offer*, DM to one client. The
  // sheet does not travel with it: accepting runs the ordinary claim flow
  // (CLAIM_SHEET → SHEET), so consent stays two-sided and assigning to a dead
  // client costs nothing — no reply, the offer still stands.
  ASSIGN: BASE_APPNAME + ".encounter.assignsheet",
  // "Alright everyone — roll initiative!" The DM's call, broadcast so every
  // player gets the prompt at once, same as hearing it across the table.
  // Carries nothing: the roll and the number stay on each player's side.
  CALL_INITIATIVE: BASE_APPNAME + ".encounter.callinitiative",
  // "I rolled 15 to hit Goblin 2." Every roll a player makes at the table, as
  // it lands. A *report*, not a write: the roller names a target and a number,
  // and the DM applies, overrides or ignores it. Keeping the HP write on the
  // DM's side is what makes this safe to offer every player — the table's
  // arithmetic stays with whoever runs the table. See `play/reports.ts` for
  // why the stages of one attack travel as separate messages.
  REPORT: BASE_APPNAME + ".encounter.report",
  // "That hits." The DM's answer to a to-hit roll, addressed back to whoever
  // rolled it — the sentence that used to have to be said out loud.
  VERDICT: BASE_APPNAME + ".encounter.verdict",
  // "Brakka, give me a Perception check." The DM's ask, addressed to one
  // client or (toClientId absent) the whole table — the same routing shape as
  // the initiative call, but for any d20 the game asks for. The answer comes
  // back on REPORT like every other roll.
  ROLL_CALL: BASE_APPNAME + ".encounter.rollcall",
  // "8 healing incoming from Brakka." Sent by the DM *after* approving a
  // healing report; the recipient applies it to their own sheet (or ignores
  // it) — their vitals, their write, same authority rule as everywhere else.
  HEAL: BASE_APPNAME + ".encounter.heal",
};

// The DM asked for a d20. `toClientId` absent means everyone — "alright
// everyone, roll a DEX save".
export interface RollCall {
  callId: string;
  check: RollCallCheck;
  toClientId?: string;
}

// Approved healing on its way to the recipient, who applies or ignores it.
export interface HealingOffer {
  offerId: string;
  // The participant being healed; each client checks whether that row is its
  // own open character.
  targetId: string;
  amount: number;
  fromName: string;
  // What healed them — "Cure Wounds (2nd)". The recipient was being asked to
  // accept an anonymous number otherwise.
  label?: string;
}

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

// Now that invites travel as `…/join/<code>` links, what lands in the code box
// is as often the whole URL as the uuid — and trimming it is only obvious to
// someone who already knows which part is the code. Pull the uuid out of
// whatever was pasted; fall back to the normalized input so the caller's own
// validation still produces the error message it would have.
export function extractSessionCode(input: string): string {
  const normalized = normalizeSessionCode(input);
  if (UUID_PATTERN.test(normalized)) return normalized;
  const found = input
    .toLowerCase()
    .match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  return found ? found[0] : normalized;
}

// The invite. A code is what the sidecar needs; a link is what a person needs,
// because it carries the answer to "and where do I put this?" with it. Takes
// the origin rather than reading `window`, so it stays as testable as the rest
// of this module.
export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/join/${normalizeSessionCode(code)}`;
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
  | { kind: "syncRequest"; clientId: string; requestId: string }
  | {
      kind: "syncResponse";
      clientId: string;
      toClientId: string;
      requestId: string;
      encounter: Encounter;
    }
  | { kind: "leave"; clientId: string }
  | { kind: "presence"; clientId: string; name: string }
  | { kind: "callInitiative"; clientId: string }
  | { kind: "rollReport"; clientId: string; report: RollReport }
  | { kind: "rollVerdict"; clientId: string; verdict: RollVerdict }
  | { kind: "rollCall"; clientId: string; call: RollCall }
  | { kind: "healingOffer"; clientId: string; offer: HealingOffer }
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

// Which topic each message goes out on. A table rather than a chain of
// conditionals in the transport: it is exhaustively checked, so adding a member
// to `SessionMessage` without giving it a topic is a type error rather than a
// message that quietly publishes to LEAVE.
export const TOPIC_FOR: Record<SessionMessage["kind"], string> = {
  state: PlaySessionEvent.STATE,
  syncRequest: PlaySessionEvent.SYNC_REQUEST,
  syncResponse: PlaySessionEvent.SYNC_RESPONSE,
  leave: PlaySessionEvent.LEAVE,
  presence: PlaySessionEvent.PRESENCE,
  callInitiative: PlaySessionEvent.CALL_INITIATIVE,
  rollReport: PlaySessionEvent.REPORT,
  rollVerdict: PlaySessionEvent.VERDICT,
  rollCall: PlaySessionEvent.ROLL_CALL,
  healingOffer: PlaySessionEvent.HEAL,
  assignSheet: PlaySessionEvent.ASSIGN,
  claimSheet: PlaySessionEvent.CLAIM_SHEET,
  sheet: PlaySessionEvent.SHEET,
};

// Is this actually an encounter?
//
// A `state` message carries the whole shared document, and until now it was
// applied on the word of whoever sent it. The realm is only as trustworthy as
// its code, which is the trust model we've chosen — but the code is not the
// threat here. A peer running an older or newer build is, and a merge against
// something that isn't an encounter throws inside a subscription callback,
// which in this app means the table's tab goes white mid-fight.
//
// Structural, not exhaustive: the two fields every merge path dereferences
// unconditionally. Everything past them is already read with `?? 0`.
export function isEncounter(raw: unknown): raw is Encounter {
  if (!raw || typeof raw !== "object") return false;
  const candidate = raw as Partial<Encounter>;
  return (
    typeof candidate.round === "number" &&
    typeof candidate.turnIndex === "number" &&
    Array.isArray(candidate.participants)
  );
}

// --- Merging -----------------------------------------------------------------
//
// Anyone may write to the encounter — the DM seat is a UI gate, not a lock, so
// that a sleeping laptop can't freeze someone else's fight. Convergence is
// last-write-wins, but not on one counter: the document is a **table of
// lanes**, each a group of fields that move together under one counter,
// resolved independently. One counter per thing-someone-writes, because the
// races here are not exotic — the DM typing your damage while you tick the
// spell you're holding is the ordinary shape of a fight, and any two lanes'
// writes crossing on the wire must both survive.
//
// The lane tables below are the whole rule. A field not in any lane belongs to
// the document lane (`revision`), which the coarse race still decides — that
// is deliberately where *membership* lives, because the roster's merge is
// bespoke and asymmetric (see `mergeEncounter`) and must not be genericised.

// One lane: the counter that versions it and the fields that move with it.
// `fields` includes everything the counter orders — take the lane, take it
// whole, counter included, or a half-taken lane re-loses the same race later.
interface Lane<T> {
  rev: keyof T & string;
  fields: (keyof T & string)[];
  // A side that structurally cannot hold the lane's value may not win it,
  // whatever its counter says — e.g. a row copy with no vitals at all.
  canWin?: (side: T) => boolean;
}

export const ENCOUNTER_LANES: Lane<Encounter>[] = [
  // The fight's position, one atomic pair — see `Encounter.turnSeq` for why
  // round and turnIndex may never be resolved separately.
  { rev: "turnSeq", fields: ["round", "turnIndex"] },
  // Table style, DM-set.
  { rev: "policyRev", fields: ["sharing", "hideDeathSaves"] },
  // The DM seat. A peer who has simply never heard of the DM carries
  // `seatRev: 0` and so can never win this lane — which is the guard that
  // used to be hand-written: erasing the seat takes `dmToken` with it, making
  // the loss unrecoverable rather than merely unheld.
  { rev: "seatRev", fields: ["dmClientId", "dmToken"] },
];

export const PARTICIPANT_LANES: Lane<Participant>[] = [
  // Who the row is and how it's shown — name, ownership, offer, hidden, side.
  {
    rev: "identityRev",
    fields: [
      "name",
      "characterUuid",
      "ownerClientId",
      "claimable",
      "hidden",
      "side",
    ],
  },
  // A copy with no vitals is an untracked copy, and an untracked copy must
  // never blank a tracked one, whatever its counter says.
  { rev: "vitalsRev", fields: ["vitals"], canWin: (p) => !!p.vitals },
  { rev: "statusRev", fields: ["conditions", "concentration"] },
  { rev: "initiativeRev", fields: ["initiative"] },
  { rev: "economyRev", fields: ["spent"] },
];

// Resolve every lane between the document-race winner (`base`) and the loser
// (`other`): a lane goes to `other` iff its counter is strictly higher, whole —
// fields and counter together. Ties go to `base`, which keeps the coarse
// race's answer wherever the lanes are silent, and identity is preserved when
// nothing moves so an unchanged merge can't re-broadcast.
function takeLanes<T extends object>(base: T, other: T, lanes: Lane<T>[]): T {
  let taken: Record<string, unknown> | undefined;
  for (const lane of lanes) {
    if (lane.canWin && !lane.canWin(other)) continue;
    const ours = (base[lane.rev] as number | undefined) ?? 0;
    const theirs = (other[lane.rev] as number | undefined) ?? 0;
    if (theirs <= ours) continue;
    taken ??= {};
    for (const field of [...lane.fields, lane.rev]) {
      taken[field] = other[field];
    }
  }
  return taken ? { ...base, ...taken } : base;
}

// Does the merged document hold anything the peer's copy hasn't seen? One
// loop over the lane counters — **counters, not values**, because two writes
// can coincide on a value and the peer still needs to hear the counter that
// orders the next one. This replaces the hand-grown list of publish reasons
// (lost the race, kept the seat, corrected own vitals, contributed a row):
// each of those is now visible as a counter the peer's copy is behind on, or
// a row it lacks.
function carriesNews(merged: Encounter, incoming: Encounter): boolean {
  if ((merged.revision ?? 0) > (incoming.revision ?? 0)) return true;
  for (const lane of ENCOUNTER_LANES) {
    const ours = (merged[lane.rev] as number | undefined) ?? 0;
    const theirs = (incoming[lane.rev] as number | undefined) ?? 0;
    if (ours > theirs) return true;
  }
  const theirRows = new Map(incoming.participants.map((p) => [p.id, p]));
  for (const row of merged.participants) {
    const theirs = theirRows.get(row.id);
    if (!theirs) return true;
    for (const lane of PARTICIPANT_LANES) {
      const ours = (row[lane.rev] as number | undefined) ?? 0;
      if (ours > ((theirs[lane.rev] as number | undefined) ?? 0)) return true;
    }
  }
  return false;
}

// Bump the document lane. Every local write does this on top of its own
// lane's counter: the lanes order writes to their fields, this orders the
// roster and breaks the base/other tie for everything laneless.
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

// Keep the merged turn index a valid position in the merged roster. The combat
// lane and the roster resolve independently — deliberately, see
// `Encounter.turnSeq` — so a turn index that was in range on the lane winner's
// roster can land past the end of the merged one.
function clampTurn(encounter: Encounter): Encounter {
  const last = encounter.participants.length - 1;
  if (encounter.turnIndex <= Math.max(0, last)) return encounter;
  return { ...encounter, turnIndex: Math.max(0, last) };
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
  const incomingWins = adopt || wins(incoming, local);
  // The losing document is not discarded whole. Its *membership* loses — which
  // rows exist, in what order, is the coarse race's answer — but every lane in
  // the tables above is then resolved on its own counter, because "who wrote
  // most recently" is too coarse a question to ask of a document several
  // people are editing at once.
  const base = incomingWins ? incoming : local;
  const other = incomingWins ? local : incoming;
  const theirRows = new Map(other.participants.map((p) => [p.id, p]));
  let rowsChanged = false;
  const rows = base.participants.map((p) => {
    const theirs = theirRows.get(p.id);
    if (!theirs) return p;
    const combined = takeLanes(p, theirs, PARTICIPANT_LANES);
    if (combined !== p) rowsChanged = true;
    return combined;
  });
  // A joiner (`adopt`) takes the room's seat regardless of counters: it has
  // nothing to be authoritative about, and the seatRev its own unrelated
  // history counted up could otherwise out-vote a young room's.
  const lanes = adopt
    ? ENCOUNTER_LANES.filter((lane) => lane.rev !== "seatRev")
    : ENCOUNTER_LANES;
  const withLanes = takeLanes(base, other, lanes);
  // Nothing of the loser's survived, and the loser was us: this is the old
  // "discard it" path, and it must stay identity so an unchanged encounter
  // isn't persisted and re-broadcast.
  if (!incomingWins && !rowsChanged && withLanes === base) return local;
  const winner: Encounter = rowsChanged
    ? { ...withLanes, participants: rows }
    : withLanes;

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
  const incomingIds = new Set(winner.participants.map((p) => p.id));
  const missing = ours.filter((p) => !incomingIds.has(p.id));

  const participants = winner.participants.map((p) => {
    if (!keepOwnVitals || p.characterUuid !== selfCharacterUuid) return p;
    if (sameVitals(p.vitals, mine!.vitals)) return p;
    const mineRev = mine!.vitalsRev ?? 0;
    const rowRev = p.vitalsRev ?? 0;
    return {
      ...p,
      vitals: mine!.vitals,
      // Past the refused copy's counter, not merely at it: this is what makes
      // the correction *visible to the publish loop* — `carriesNews` reads
      // counters, not values, so refusing a stale copy of ourselves at the
      // same rev has to move the counter or the room keeps last week's HP.
      vitalsRev: mineRev > rowRev ? mineRev : rowRev + 1,
    };
  });

  // Re-seated by initiative rather than appended: with a fight in progress the
  // array is the turn order, and a joiner should land where their roll says —
  // on every peer's copy, not just their own. Clamped last, because the combat
  // lane and the roster resolve independently.
  return clampTurn(
    missing.reduce(insertParticipant, { ...winner, participants }),
  );
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

  // Our own vitals moved without us touching them: the merge accepted a
  // deliberate write from someone else (rev-checked in `mergeEncounter`), and
  // the character has to follow.
  const ownVitals =
    mineBefore?.vitals &&
    mineAfter?.vitals &&
    !sameVitals(mineBefore.vitals, mineAfter.vitals)
      ? mineAfter.vitals
      : undefined;

  // Publish when we hold something the peer hasn't heard of, read off the lane
  // counters in one loop — a lane theirs is behind on, a row they lack, a
  // document revision past theirs. Every reason the old hand-grown list
  // enumerated (lost the race, kept the seat, corrected own vitals,
  // contributed a row) is one of those three now. This doesn't ping-pong: our
  // reply carries the counters the peer is behind on, their merge accepts
  // those lanes, and their next receive finds nothing to answer.
  const publish = carriesNews(seated, incoming);
  return { encounter: seated, publish, ownVitals };
}

function sameVitals(
  a: ParticipantVitals | undefined,
  b: ParticipantVitals | undefined,
): boolean {
  if (!a || !b) return a === b;
  return (
    a.currHp === b.currHp &&
    a.maxHp === b.maxHp &&
    a.ac === b.ac &&
    (a.tempHp ?? 0) === (b.tempHp ?? 0) &&
    (a.deathSaves?.successes ?? 0) === (b.deathSaves?.successes ?? 0) &&
    (a.deathSaves?.failures ?? 0) === (b.deathSaves?.failures ?? 0)
  );
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
// What this layer announces about itself: a name to point at. The DM needs one
// when handing a sheet out, because a sheetless player has no participant and
// is otherwise invisible.
//
// The *mechanics* — upsert, heartbeat, forgetting a peer who stopped answering
// — are `realm/presence.ts`, shared with the character layer, which had all
// three first. This layer had the roster and no heartbeat at all, so a crashed
// tab sat in the DM's picker until the session turned over.

export interface PresenceName {
  name: string;
}

export type PresentClient = PresenceEntry<PresenceName>;

export const samePresenceName = (a: PresenceName, b: PresenceName) =>
  a.name === b.name;
