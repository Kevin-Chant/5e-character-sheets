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
import type { RestKind } from "src/lib/rest";
import { PlaySessionRef } from "src/lib/types";
import { PresenceEntry } from "src/lib/realm/presence";

// Party session: one shared encounter across several browsers. Pure, testable
// core (codes, message shapes, merge rule); WAMP transport is in
// `use-play-session.tsx`.
//
// Everyone opens their own character locally — the session syncs only the
// encounter, and only a projection of it (name, HP, AC, conditions,
// concentration, initiative), never spells/inventory/backstory.

const BASE_APPNAME = "net.dndcharactersheets";

export const PlaySessionEvent = {
  // The whole encounter, from whoever changed it last.
  STATE: BASE_APPNAME + ".encounter.state",
  // Join request; carries a request id so the reply is matchable.
  SYNC_REQUEST: BASE_APPNAME + ".encounter.syncrequest",
  // Reply to SYNC_REQUEST, addressed to the requester only.
  SYNC_RESPONSE: BASE_APPNAME + ".encounter.syncresponse",
  // Drops the sender's participants from everyone's roster.
  LEAVE: BASE_APPNAME + ".encounter.leave",
  // Request to play an offered sheet; answered by whoever owns it.
  CLAIM_SHEET: BASE_APPNAME + ".encounter.claimsheet",
  // A whole character, DM to one claimant — the only message kind that sends
  // more than a projection. Only sent for a sheet marked claimable, in reply
  // to a claim.
  SHEET: BASE_APPNAME + ".encounter.sheet",
  // clientId + display name only. Sent on join, in reply to a sync request,
  // and on heartbeat, so a stopped client is forgotten rather than haunting
  // the DM's picker.
  PRESENCE: BASE_APPNAME + ".encounter.presence",
  // Targeted offer of a sheet, DM to one client. Sheet itself doesn't travel
  // with it — accepting runs CLAIM_SHEET → SHEET.
  ASSIGN: BASE_APPNAME + ".encounter.assignsheet",
  // DM's call to roll initiative, broadcast. Carries nothing; rolls stay
  // client-side.
  CALL_INITIATIVE: BASE_APPNAME + ".encounter.callinitiative",
  // A player's roll report, not a write — DM applies/overrides/ignores it.
  // See `play/reports.ts` for why one attack's stages are separate messages.
  REPORT: BASE_APPNAME + ".encounter.report",
  // DM's hit/miss ruling, addressed back to the roller.
  VERDICT: BASE_APPNAME + ".encounter.verdict",
  // DM's ask for a d20, addressed to one client or (toClientId absent) the
  // table. Answer comes back on REPORT.
  ROLL_CALL: BASE_APPNAME + ".encounter.rollcall",
  // DM's rest call, broadcast. Carries only kind + whether it spans dawn;
  // the rest itself runs on each player's own sheet.
  REST_CALL: BASE_APPNAME + ".encounter.restcall",
  // Healing amount, sent by the DM after approving a heal report; recipient
  // applies it to their own sheet.
  HEAL: BASE_APPNAME + ".encounter.heal",
  // Condition offer, sent by the caster directly, seeking consent from the
  // target. Sheet-less rows are applied by the DM from the exchange card
  // instead.
  CONDITION: BASE_APPNAME + ".encounter.condition",
};

// DM's ask for a d20. Both fields absent means the whole table.
export interface RollCall {
  callId: string;
  check: RollCallCheck;
  // `toClientIds` is the real field. `toClientId` is written (not read) only
  // when there's exactly one recipient, so an older build that only knows
  // `toClientId` still addresses single-recipient calls correctly; a
  // multi-recipient call degrades there to reaching everyone.
  toClientIds?: string[];
  toClientId?: string;
}

// Absent audience means the room.
export function rollCallReaches(call: RollCall, clientId: string): boolean {
  if (call.toClientIds?.length) return call.toClientIds.includes(clientId);
  if (call.toClientId) return call.toClientId === clientId;
  return true;
}

// DM's rest call, always to the whole table. Carries only the kind of rest
// and whether it spans daybreak; hit-dice/prepared-spell choices stay on
// each player's own sheet.
export interface RestCall {
  callId: string;
  kind: RestKind;
  spansDawn?: boolean;
}

// Approved healing on its way to the recipient, who applies or ignores it.
export interface HealingOffer {
  offerId: string;
  // Each client checks whether this row is its own open character.
  targetId: string;
  amount: number;
  fromName: string;
  label?: string;
}

// Consent prompt for a condition landing on its target, e.g. "Ellora cast
// Bless on you — apply it?". Carries the condition name only; mechanics
// resolve from `CONDITION_MECHANICS` on the bearer's own client.
export interface ConditionOffer {
  offerId: string;
  targetId: string;
  condition: { name: string; rounds?: number };
  fromName: string;
  // Written into `ActiveCondition.from` on apply (see `TargetedRider`).
  fromParticipantId?: string;
  label?: string;
}

// Split by who acts: own row applies locally, other characters get the
// consent prompt over the wire, sheet-less rows (monsters) get neither.
// `offerId` is deterministic (exchange + stage + target) so a re-sent report
// doesn't re-prompt.
export function conditionOffersFor(
  roll: {
    exchangeId: string;
    stage: string;
    condition?: { name: string; rounds?: number };
    targetId?: string;
    targetIds?: string[];
  },
  participants: Participant[],
  selfParticipantId: string | undefined,
  fromName: string,
  label?: string,
): { offer: ConditionOffer; toSelf: boolean }[] {
  if (!roll.condition) return [];
  const ids = roll.targetIds ?? (roll.targetId ? [roll.targetId] : []);
  return ids.flatMap((targetId) => {
    const target = participants.find((p) => p.id === targetId);
    if (!target?.characterUuid) return [];
    return [
      {
        offer: {
          offerId: `${roll.exchangeId}:${roll.stage}:${targetId}`,
          targetId,
          condition: roll.condition!,
          fromName,
          ...(selfParticipantId
            ? { fromParticipantId: selfParticipantId }
            : {}),
          ...(label ? { label } : {}),
        },
        toSelf: targetId === selfParticipantId,
      },
    ];
  });
}

// Session codes are uuids — the uuid is the authentication, since
// `openRealm` is an unauthenticated, unthrottled GET. Not memorable, which is
// why characters remember joined sessions (`Character.playSessions`).

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function newSessionCode(): string {
  return randomUUID();
}

// Tolerates surrounding whitespace, case, and a dash-less uuid. Canonical
// form is dashed lowercase.
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

// Pulls the uuid out of a pasted invite link or bare code; falls back to
// normalized input so the caller's own validation error still fires.
export function extractSessionCode(input: string): string {
  const normalized = normalizeSessionCode(input);
  if (UUID_PATTERN.test(normalized)) return normalized;
  const found = input
    .toLowerCase()
    .match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  return found ? found[0] : normalized;
}

// Takes origin as a param rather than reading `window`, to stay testable.
export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/join/${normalizeSessionCode(code)}`;
}

// Namespaced away from character realms (`generateRealm` uses a bare hex
// uuid) so the two can't collide on the sidecar.
export function realmForSession(code: string): string {
  return `sess${normalizeSessionCode(code).replace(/-/g, "")}`;
}

export const REMEMBERED_SESSIONS = 5;

// Most recent first; re-joining an existing session moves it to the top
// rather than duplicating it.
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
  | { kind: "restCall"; clientId: string; call: RestCall }
  | { kind: "healingOffer"; clientId: string; offer: HealingOffer }
  | { kind: "conditionOffer"; clientId: string; offer: ConditionOffer }
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
      // Everyone receives it (no private WAMP lanes on this broker); only the
      // claimant loads it.
      toClientId: string;
      participantId: string;
      character: unknown;
    };

// Exhaustively checked: adding a `SessionMessage` kind without a topic is a
// type error.
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
  restCall: PlaySessionEvent.REST_CALL,
  healingOffer: PlaySessionEvent.HEAL,
  conditionOffer: PlaySessionEvent.CONDITION,
  assignSheet: PlaySessionEvent.ASSIGN,
  claimSheet: PlaySessionEvent.CLAIM_SHEET,
  sheet: PlaySessionEvent.SHEET,
};

// Guards against a peer on an older/newer build sending something that isn't
// an encounter — merging against it would throw inside a subscription
// callback. Checks only the fields every merge path dereferences
// unconditionally; everything else is already read with `?? 0`.
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
// Anyone may write to the encounter (DM seat is a UI gate, not a lock).
// Convergence is last-write-wins per lane, not per document: the document is
// a table of lanes, each a group of fields versioned by one counter and
// resolved independently, so two lanes' writes crossing on the wire both
// survive. A field not in any lane belongs to the document lane (`revision`),
// which also decides roster membership (see `mergeEncounter`).

// `fields` must include everything `rev` orders — take the lane whole or a
// half-taken lane re-loses the same race later.
interface Lane<T> {
  rev: keyof T & string;
  fields: (keyof T & string)[];
  // A side structurally unable to hold the lane's value may not win it
  // regardless of counter (e.g. a row copy with no vitals).
  canWin?: (side: T) => boolean;
}

export const ENCOUNTER_LANES: Lane<Encounter>[] = [
  // Atomic pair — see `Encounter.turnSeq` for why round/turnIndex can't
  // resolve separately.
  { rev: "turnSeq", fields: ["round", "turnIndex"] },
  { rev: "policyRev", fields: ["sharing", "hideDeathSaves"] },
  // A peer that's never heard of the DM carries seatRev: 0 and can't win
  // this lane; erasing the seat takes `dmToken` with it, making the loss
  // unrecoverable.
  { rev: "seatRev", fields: ["dmClientId", "dmToken"] },
];

export const PARTICIPANT_LANES: Lane<Participant>[] = [
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
  // An untracked copy (no vitals) must never blank a tracked one.
  { rev: "vitalsRev", fields: ["vitals"], canWin: (p) => !!p.vitals },
  { rev: "statusRev", fields: ["conditions", "concentration"] },
  { rev: "initiativeRev", fields: ["initiative"] },
  { rev: "economyRev", fields: ["spent"] },
];

// A lane goes to `other` iff its counter is strictly higher (fields + counter
// together); ties go to `base`. Preserves identity when nothing moves, so an
// unchanged merge doesn't re-broadcast.
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

// Whether the merged document holds anything the peer's copy hasn't seen.
// Compares counters, not values — two writes can coincide on a value but the
// peer still needs the counter that orders the next one.
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

// Bumps the document lane; every local write does this on top of its own
// lane's counter. Orders the roster and breaks ties for laneless fields.
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
  // Same revision, different writers: break the tie deterministically so
  // every browser agrees.
  return (incoming.revisedBy ?? "") > (local.revisedBy ?? "");
}

// The combat lane and roster resolve independently (see `Encounter.turnSeq`),
// so a turn index valid on the lane winner's roster can land past the end of
// the merged one.
function clampTurn(encounter: Encounter): Encounter {
  const last = encounter.participants.length - 1;
  if (encounter.turnIndex <= Math.max(0, last)) return encounter;
  return { ...encounter, turnIndex: Math.max(0, last) };
}

// Apply an encounter that arrived from a peer.
//
// Exception to plain LWW: you're authoritative for your own vitals unless
// someone deliberately overwrote them. `vitalsRev` distinguishes a stale echo
// (rev you've already passed) from a real edit (rev you haven't); everything
// else, including conditions on you, is plain LWW.
//
// A joiner (`adopt`) keeps its own vitals regardless of revs and jumps its
// rev past the incoming one — a room may hold a copy of you from a session
// you didn't cleanly leave, with a rev ahead of your fresh local count.
export function mergeEncounter(
  local: Encounter,
  incoming: Encounter,
  selfCharacterUuid: UUID | undefined,
  selfClientId?: string,
  adopt = false,
): Encounter {
  // `adopt` (first state a joiner receives) skips the revision race: a
  // joiner's local encounter has its own unrelated revision count, which
  // routinely collides with the room's, and the clientId tiebreak would then
  // discard the room about half the time. A newcomer defers to the room and
  // contributes only its own participants (re-added below).
  const incomingWins = adopt || wins(incoming, local);
  // The loser's membership (which rows exist, in what order) is decided by
  // the document race; every lane is then resolved on its own counter.
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
  // A joiner takes the room's seat regardless of counters — its own unrelated
  // seatRev could otherwise out-vote a young room's.
  const lanes = adopt
    ? ENCOUNTER_LANES.filter((lane) => lane.rev !== "seatRev")
    : ENCOUNTER_LANES;
  const withLanes = takeLanes(base, other, lanes);
  // Nothing of the loser survived and the loser was us: must stay identity
  // so an unchanged encounter isn't persisted and re-broadcast.
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

  // Anyone this client contributed that isn't in the incoming state yet —
  // matters on join, when the room's reply can predate this client's own
  // participant.
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
      // Past the refused copy's counter, not merely at it — `carriesNews`
      // reads counters, so a refusal at the same rev must still move it.
      vitalsRev: mineRev > rowRev ? mineRev : rowRev + 1,
    };
  });

  // Re-seated by initiative, not appended — a joiner should land where their
  // roll says on every peer's copy. Clamped last since the combat lane and
  // roster resolve independently.
  return clampTurn(
    missing.reduce(insertParticipant, { ...winner, participants }),
  );
}

export interface SessionSelf {
  clientId: string;
  characterUuid?: UUID;
  // Durable per-browser DM key (see `Encounter.dmToken`). Withheld once the
  // seat has been reclaimed on this connection: token is per-browser but
  // clientId is per-tab, so without this guard two tabs of the same browser
  // would keep re-taking the seat from each other on every bump.
  dmToken?: string;
  // True for the first state after joining. See `mergeEncounter`.
  adopt?: boolean;
}

export interface StateReceipt {
  encounter: Encounter;
  // Seat came back on this state; caller stops offering its token.
  reclaimedSeat?: boolean;
  // Whether this has to go back out — only true when the merge produced
  // something the peer doesn't know, since echoing every apply is a loop.
  publish: boolean;
  // Set when the merge accepted someone else's write to our own vitals (a DM
  // setting our HP). Caller applies it to the character itself, since the
  // participant is just a projection and would otherwise republish stale HP.
  ownVitals?: ParticipantVitals;
}

// `session-sim.ts` drives this against a fake broker to cover the revision
// race and seat reclaim without a browser.
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
  // Rejoining a session you DM'd: matching token reclaims the seat silently.
  const seated = reclaimDmSeat(merged, self.clientId, self.dmToken);
  const reclaimedSeat = seated !== merged;

  const findMe = (encounter: Encounter) =>
    self.characterUuid
      ? encounter.participants.find(
          (p) => p.characterUuid === self.characterUuid,
        )
      : undefined;
  const mineBefore = findMe(local);
  const mineAfter = findMe(seated);

  // Own vitals moved without us touching them: merge accepted a deliberate
  // write from someone else (rev-checked in `mergeEncounter`).
  const ownVitals =
    mineBefore?.vitals &&
    mineAfter?.vitals &&
    !sameVitals(mineBefore.vitals, mineAfter.vitals)
      ? mineAfter.vitals
      : undefined;

  const publish = carriesNews(seated, incoming);
  return { encounter: seated, publish, ownVitals, reclaimedSeat };
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

// Drop everyone a departing client owned. Own character goes; hand-typed
// rows (monsters, absent allies) stay for whoever's tracking them now.
export function withoutClient(
  encounter: Encounter,
  clientId: string,
): Encounter {
  // A borrowed sheet reverts to the DM's client as a still-offered claimable
  // row rather than leaving. Bumps `identityRev` with it (take-the-lane-whole
  // rule) — otherwise a peer that missed the LEAVE could tie this lane on
  // reconnect and hand the sheet back to the departed client.
  const dm = encounter.dmClientId;
  let changed = false;
  const participants = encounter.participants.flatMap((p) => {
    if (p.ownerClientId !== clientId || !p.characterUuid) return [p];
    changed = true;
    if (p.claimable && dm && dm !== clientId) {
      return [
        {
          ...p,
          ownerClientId: dm,
          identityRev: (p.identityRev ?? 0) + 1,
        },
      ];
    }
    return [];
  });
  // `dmClientId` clears but `dmToken` stays, so the same browser reclaims on
  // return (giving it up for good is `releaseDmSeat` instead). `seatRev`
  // bumps with the clear, same reason as `identityRev` above.
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
    ...(heldSeat
      ? { dmClientId: undefined, seatRev: (encounter.seatRev ?? 0) + 1 }
      : {}),
  };
}

// --- Presence ----------------------------------------------------------------
// Announces a name so the DM can address a sheetless player. Upsert/heartbeat
// mechanics live in `realm/presence.ts`, shared with the character layer.

export interface PresenceName {
  name: string;
}

// Longer than the shared 30s default: a backgrounded phone tab's timers get
// throttled to roughly once a minute, so 30s would flap every player who
// looks away. Not much longer, since past a minute or two a mobile tab is
// usually frozen rather than throttled and the DM should be told. See
// `play/liveness.ts` for the softer 25s "quiet" threshold.
export const TABLE_PRESENCE_TTL_MS = 90_000;

export type PresentClient = PresenceEntry<PresenceName>;

export const samePresenceName = (a: PresenceName, b: PresenceName) =>
  a.name === b.name;
