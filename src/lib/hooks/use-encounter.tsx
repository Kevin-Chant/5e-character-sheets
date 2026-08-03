import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { UUID } from "crypto";
import {
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "src/lib/local-storage";
import { randomUUID } from "src/lib/browser";
import { ConditionName } from "src/lib/play/conditions";
import { FIELD } from "src/lib/data/data-definitions";
import { calculateCustomFormula } from "src/lib/formula";
import { getOptionalInitializer } from "src/lib/rules";
import {
  ActiveCondition,
  addCondition,
  canRunCombat,
  claimableSheets,
  offerSheet,
  EconomySlot,
  claimDmSeat,
  reclaimDmSeat,
  releaseDmSeat,
  addParticipant,
  advanceTurn,
  claimParticipant,
  clearFallen,
  concentrationDc,
  DEFAULT_SHARING,
  fallenParticipants,
  Concentration,
  currentParticipant,
  ParticipantVitals,
  EMPTY_ENCOUNTER,
  Encounter,
  endCombat,
  isInCombat,
  Participant,
  participantFor,
  removeCondition,
  removeParticipant,
  renameParticipant,
  reseatParticipant,
  setConcentration,
  setHidden,
  setSide,
  setHideDeathSaves,
  setInitiative,
  setSharing,
  SharingLevel,
  setSpent,
  setVitals,
  startCombat,
  TurnAdvance,
} from "src/lib/play/encounter";
import {
  bumpRevision,
  forgetSession,
  PresenceName,
  PresentClient,
  receiveState,
  rememberSession,
  samePresenceName,
  withoutClient,
} from "src/lib/play/session";
import { usePresence } from "src/lib/realm/use-presence";
import {
  adoptsResponse,
  ConnectionEvent,
  ConnectionState,
  connectionReducer,
  encounterForTable,
  OFFLINE,
  SessionIntent,
  SYNC_WINDOW_MS,
} from "src/lib/play/connection";

import {
  rememberSessionLocally,
  sessionMemoryFor,
} from "src/lib/play/session-memory";
import {
  TableTalk,
  TableTalkContext,
  useTableTalkState,
} from "src/lib/hooks/use-table-talk";
import { initiativeModifierFor } from "src/lib/play/initiative";
import { rollD20Check } from "src/lib/roll";
import { charPath, updateAt } from "src/lib/cursor";
import { Character, PlaySessionRef } from "src/lib/types";
import {
  JoinResult,
  SessionStatus,
  usePlaySession,
} from "src/lib/hooks/use-play-session";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { hydrateCharacter } from "src/lib/migrations/hydrate-character";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";

// The encounter, persisted and shared across the app.
//
// **Local-first by construction.** It's an ordinary object in `localStorage`
// with a pure module behind it, so it works with no network, no sidecar and no
// other players — which is also exactly the shape the session layer needs to put
// a sync overlay on later, the same way characters are a local object with an
// independent broadcast overlay.
//
// It sits *above* the sheet rather than inside the play surface, so the roll
// dialog can read conditions from either route and the encounter survives
// navigating between them.

// Exported so the test harness can reset it between renders — the encounter
// outlives a component by design, which is exactly what makes it leak across
// tests otherwise.
export const ENCOUNTER_STORAGE_KEY = "encounter";

// The DM's durable key, in their own browser. `clientId` is regenerated per tab,
// so a seat keyed on it alone is lost on every refresh; this outlives the tab
// and is what `reclaimDmSeat` recognises. It never leaves this browser except as
// the `dmToken` on the encounter, which is a random uuid tied to nothing.
export const DM_TOKEN_STORAGE_KEY = "dm-token";

// The session this browser was last in. Distinct from `Character.playSessions`,
// which is per-character and only records sessions you *joined*: a DM often has
// no character open at all, so hosting wrote the code nowhere and a refresh left
// them locked out of their own game with a seat waiting for them and no way to
// reach it. Device-level, because that's the level a DM exists at.
export const LAST_SESSION_STORAGE_KEY = "last-session";

// Which table the persisted encounter came from, if any.
//
// The encounter is stored per *browser* and a code names a *table*, so the two
// need pairing: without it, starting a brand-new game opened straight onto last
// week's order, round and monsters — which reads, correctly, as the app having
// reopened the old session instead of starting a new one. Only a session-owned
// encounter is stale that way; one a DM built offline is prep, and prep must
// survive being hosted, so any local change made while disconnected clears this
// and re-adopts the encounter as this browser's own.
export const ENCOUNTER_SESSION_STORAGE_KEY = "encounter-session";

// The default context's answer to "did I get in": no, and here is why. A
// constant rather than an inline literal so the two defaults can't drift.
const NO_SESSION = {
  ok: false,
  reason: "unreachable",
  message: "There is no session provider here.",
} as const;

function dmToken(): string {
  const existing: string | undefined = readLocalStorage(DM_TOKEN_STORAGE_KEY);
  if (existing) return existing;
  const created = randomUUID();
  writeLocalStorage(DM_TOKEN_STORAGE_KEY, created);
  return created;
}

export interface EncounterContextData {
  encounter: Encounter;
  // The participant standing in for the open character, created on demand.
  self?: Participant;
  inCombat: boolean;
  current?: Participant;
  // Conditions on the open character, for the roll dialog's advisory notes.
  selfConditions: ConditionName[];

  start: () => void;
  end: () => void;
  // Returns what the turn boundary produced, so the caller can fire triggers.
  next: () => TurnAdvance | undefined;

  // Add hand-typed combatants. `count` makes a numbered pack ("Goblin 1..4")
  // sharing one initiative — 5e runs identical monsters on one roll — and
  // `maxHp` starts them tracked instead of needing a per-row "Track" step.
  addCombatant: (
    name: string,
    initiative: number,
    opts?: { count?: number; maxHp?: number; ac?: number },
  ) => void;
  removeCombatant: (id: string) => void;
  // Sweep hand-typed combatants at 0 HP off the table in one move.
  clearFallen: () => void;
  fallen: Participant[];
  // Stage or reveal a combatant. Hidden rows don't render on player clients.
  setCombatantHidden: (id: string, hidden: boolean) => void;
  // Which side a row fights for — the grouping the target pickers and the
  // players' target strip read. Overrides the no-sheet-means-foe heuristic.
  setCombatantSide: (id: string, side: "party" | "foe") => void;
  setCombatantInitiative: (id: string, initiative: number) => void;

  setSlotSpent: (id: string, slot: EconomySlot, spent: boolean) => void;
  // The DM's oversight write: sets a participant's projection directly. For a
  // player-owned row the rev-checked merge carries it through to their sheet;
  // for a DM-owned or hand-typed row this *is* the record.
  setCombatantVitals: (id: string, vitals: ParticipantVitals) => void;
  giveCondition: (id: string, condition: ActiveCondition) => void;
  takeCondition: (id: string, name: ConditionName) => void;
  concentrateOn: (id: string, concentration: Concentration | undefined) => void;

  // --- Party session ---
  clientId: string;
  sessionCode?: string;
  // Sessions this character has joined before, most recent first — session codes
  // are uuids, so rejoining last week's game can't rely on memory.
  rememberedSessions: PlaySessionRef[];
  forgetRememberedSession: (code: string) => void;
  sessionStatus: SessionStatus;
  sessionError?: string;
  // The session this browser was last connected to, for getting back in after a
  // reload or a dropped connection. Cleared by leaving on purpose.
  lastSession?: string;
  // Starting a gameplay session *is* being its DM — the seat is taken at
  // creation rather than raced for afterwards.
  // Opens a new table, or reopens one whose realm has closed — a code that a
  // group has already pinned somewhere is worth more than a fresh one.
  //
  // Both of these **resolve once the realm is actually joined**, and say
  // whether it was. The lobby used to have to ask a status field from an effect
  // instead, because the old transport returned as soon as the attempt had been
  // started.
  hostSession: (reopenCode?: string) => Promise<JoinResult>;
  // `displayName` is for the sheetless joiner, who has no character name to
  // announce — the lobby asks what the table should call them.
  joinSession: (code: string, displayName?: string) => Promise<JoinResult>;
  leaveSession: () => void;
  // Put characters into the order without opening them. A DM uses this to bring
  // party sheets and companion stat blocks; their vitals are a snapshot until
  // whoever owns the sheet opens it and takes the participant over.
  bringCharacters: (characters: Character[]) => void;
  // Offer a brought sheet for pickup (or withdraw it). DM board only.
  setSheetOffered: (id: string, claimable: boolean) => void;
  // Offered sheets someone at this table could play right now.
  claimables: Participant[];
  // Who is connected right now, by chosen display name — transient, cleared
  // when the connection drops. This is what gives the DM someone to point at:
  // a sheetless player has no participant, so without it they're invisible.
  present: PresentClient[];
  // Point a sheet at one present client — a *targeted offer*. Marks the sheet
  // claimable too (assignment is a superset of offering); the sheet itself
  // only travels when the target accepts, through the ordinary claim flow.
  assignSheetTo: (participantId: string, toClientId: string) => void;
  // An assignment addressed to this client, waiting on the player's answer.
  pendingAssignment?: Participant;
  acceptAssignment: () => void;
  declineAssignment: () => void;

  // --- Concentration ---
  // Set when the open character took damage while concentrating: the 5e save
  // is DC 10 or half the damage. Advisory — the player answers it.
  concentrationCheck?: { spell: string; damage: number; dc: number };
  clearConcentrationCheck: () => void;

  // --- Table policy ---
  // How much health the players see of each other and the monsters. On the
  // encounter (it's table policy, so it must reach every client), DM-set.
  sharing: SharingLevel;
  setSharingLevel: (level: SharingLevel) => void;
  // Whether the party sees each other's death-save pips (the DM always does).
  hideDeathSaves: boolean;
  setDeathSavesHidden: (hide: boolean) => void;

  // --- The initiative call ---
  // "Alright everyone, roll initiative": rolls for every sheet this client
  // brought (their modifiers are in its stored copies) and prompts the table.
  callForInitiative: () => void;
  // The DM asked this client to roll. Cleared by rolling, dismissing,
  // combat starting, or the connection dropping.
  initiativeCalled: boolean;
  dismissInitiativeCall: () => void;
  // Ask for an offered sheet. The whole character arrives over the session and
  // opens as a borrowed sheet: played, never persisted here.
  claimSheet: (participantId: string) => void;
  // Whether this client should be offered the controls that run the fight.
  // An unclaimed DM seat means everybody is.
  canRun: boolean;
  hasDm: boolean;
  isDm: boolean;
  claimDm: () => void;
  releaseDm: () => void;
}

const NOOP = () => {};

// The default is a real, empty encounter rather than `undefined`: `RollModal`
// renders on the sheet too, where no provider decision has been made, and a
// hook that can return undefined would push that check into every caller.
// Exported so a test can override two fields of it without restating fifty.
export const NO_ENCOUNTER: EncounterContextData = {
  encounter: EMPTY_ENCOUNTER,
  inCombat: false,
  selfConditions: [],
  start: NOOP,
  end: NOOP,
  next: () => undefined,
  addCombatant: NOOP,
  removeCombatant: NOOP,
  clearFallen: NOOP,
  fallen: [],
  setCombatantHidden: NOOP,
  setCombatantSide: NOOP,
  setCombatantInitiative: NOOP,
  setSlotSpent: NOOP,
  setCombatantVitals: NOOP,
  giveCondition: NOOP,
  takeCondition: NOOP,
  concentrateOn: NOOP,
  clientId: "",
  rememberedSessions: [],
  forgetRememberedSession: NOOP,
  sessionStatus: "offline",
  // Outside a provider there is no transport to fail, so the honest answer is
  // the one every caller already handles.
  hostSession: async () => NO_SESSION,
  joinSession: async () => NO_SESSION,
  leaveSession: NOOP,
  bringCharacters: NOOP,
  setSheetOffered: NOOP,
  claimables: [],
  present: [],
  assignSheetTo: NOOP,
  acceptAssignment: NOOP,
  declineAssignment: NOOP,
  clearConcentrationCheck: NOOP,
  sharing: DEFAULT_SHARING,
  setSharingLevel: NOOP,
  hideDeathSaves: false,
  setDeathSavesHidden: NOOP,
  callForInitiative: NOOP,
  initiativeCalled: false,
  dismissInitiativeCall: NOOP,
  claimSheet: NOOP,
  canRun: true,
  hasDm: false,
  isDm: false,
  claimDm: NOOP,
  releaseDm: NOOP,
};

export const EncounterContext =
  React.createContext<EncounterContextData>(NO_ENCOUNTER);

// A participant id derived from the character, so the same sheet is the same row
// no matter who put it in the order — the player who opened it or the DM who
// brought it.
function selfId(uuid: UUID): string {
  return `self:${uuid}`;
}

// The projection the rest of the party sees. Computed from a whole character
// rather than read off one, because a DM bringing a sheet into the session never
// opens it — there is no live `currHp` to watch, just a stored one to publish.
function characterVitals(character: Character): ParticipantVitals {
  const maxHp =
    character.maxHp ??
    getOptionalInitializer(FIELD.maxHp, undefined, character);
  // Death saves ride along only while they mean something — down, or pips
  // already marked. The table watches these together; hiding them from the
  // *party* is the `hideDeathSaves` toggle's job at render time, not this
  // projection's.
  const dying =
    character.currHp <= 0 ||
    character.deathSaves.successes > 0 ||
    character.deathSaves.failures > 0;
  return {
    currHp: character.currHp,
    maxHp: maxHp ? calculateCustomFormula(maxHp, character) : 0,
    ac: calculateCustomFormula(character.acFormula, character),
    tempHp: character.tempHp,
    ...(dying
      ? {
          deathSaves: {
            successes: character.deathSaves.successes,
            failures: character.deathSaves.failures,
          },
        }
      : {}),
  };
}

export function EncounterContextProvider(props: React.PropsWithChildren) {
  const { character, dispatch } = useCharacter();
  // For answering sheet claims: the DM's stored characters, which survive a
  // reload the way the in-memory list a lobby handed us would not.
  const { characters: storedCharacters } = useDatastore();
  const storedCharactersRef = useRef(storedCharacters);
  storedCharactersRef.current = storedCharacters;
  const { markBorrowed } = useSharingSessions();
  // The character as it stands now, for the effects that write to it without
  // wanting the write itself to re-trigger them.
  const characterRef = useRef(character);
  characterRef.current = character;
  const { clientId } = useSharingSessions();
  // Sent by whoever owns an offered sheet, in reply to a claim.
  const sendSheetRef = useRef<
    (toClientId: string, participantId: string, character: unknown) => void
  >(() => {});
  const talkRef = useRef<TableTalk | undefined>();
  // Through a ref for the same reason `talkRef` is: the transport's handlers
  // are registered at creation, and the roster is built on top of the transport.
  const presenceRef = useRef<
    | {
        saw: (clientId: string, payload: PresenceName) => void;
        left: (clientId: string) => void;
      }
    | undefined
  >();
  const [encounter, setEncounter] = useState<Encounter>(() =>
    readLocalStorage(ENCOUNTER_STORAGE_KEY, EMPTY_ENCOUNTER),
  );
  // Read synchronously by the session callbacks, which are registered once and
  // would otherwise close over the encounter as it was at connect time.
  const encounterRef = useRef(encounter);
  encounterRef.current = encounter;
  // Set once the transport exists; calling it is what makes a change leave this
  // browser. Held in a ref because `update` is created before the session hook.
  const broadcastRef = useRef<((encounter: Encounter) => void) | undefined>();
  // Where this browser is in the business of being in a session — see
  // `play/connection.ts`, which is where the flags this used to be went. Kept
  // in a ref as well as state because the message handlers are registered once
  // and have to read it as it is *now*.
  const [connection, setConnection] = useState<ConnectionState>(OFFLINE);
  const connectionRef = useRef(connection);
  // Set once the transport exists; answering a peer needs a sender that is
  // created after these handlers are.
  const syncResponseRef = useRef<
    (toClientId: string, requestId: string, encounter: Encounter) => void
  >(() => {});
  // Read lazily so a browser that never runs a game never writes the key.
  const dmTokenRef = useRef<string>("");
  if (!dmTokenRef.current) dmTokenRef.current = dmToken();
  // Whether this browser is in a session right now. Read synchronously by
  // `update`, which is how an edit made offline can disown the stored session.
  const connectedRef = useRef(false);

  // The name we announce. A player with a character announces its name; the
  // sheetless joiner types one into the lobby, which lands here.
  const [customName, setCustomName] = useState<string | undefined>();
  const displayName = character?.name || customName || "Player";
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  // Set once the transport exists, so answering a sync request can announce us.
  const announceRef = useRef<(name: string) => void>(() => {});
  // An assignment pointed at this client, waiting on the player's answer.
  const [pendingAssignmentId, setPendingAssignmentId] = useState<
    string | undefined
  >();
  // The open character took damage while concentrating — the prompt's data.
  const [concentrationCheck, setConcentrationCheck] = useState<
    { spell: string; damage: number; dc: number } | undefined
  >();
  // The DM called for initiative and this client hasn't answered yet.
  const [initiativeCalled, setInitiativeCalled] = useState(false);

  // Every local change: persist, then publish. `silent` is for changes that
  // *came from* a peer — re-publishing those is the sync loop the character
  // layer avoids with `suppressBroadcast`, for the same reason.
  const update = useCallback(
    (change: (current: Encounter) => Encounter, silent = false) => {
      setEncounter((current) => {
        const changed = change(current);
        if (changed === current) return current;
        const next = silent ? changed : bumpRevision(changed, clientId);
        writeLocalStorage(ENCOUNTER_STORAGE_KEY, next);
        // Edited by hand with no session open: this is prep now, whatever table
        // it came from, and prep is the one thing hosting must not throw away.
        if (!silent && !connectedRef.current) {
          removeLocalStorage(ENCOUNTER_SESSION_STORAGE_KEY);
        }
        if (!silent) broadcastRef.current?.(next);
        return next;
      });
    },
    [clientId],
  );

  // Everything that happens when a peer's encounter arrives — as an answer to
  // our own sync request, or as one of their ordinary broadcasts. The only
  // difference between those is `adopt`, and only the connection machine gets
  // to say so.
  const applyRemoteState = useCallback(
    (incoming: Encounter, adopt: boolean) => {
      // Every decision here is `receiveState`, which is pure and covered by the
      // multi-client simulator. This hook only knows how to store and send.
      const receipt = receiveState(encounterRef.current, incoming, {
        clientId,
        characterUuid: characterRef.current?.uuid,
        dmToken: dmTokenRef.current,
        adopt,
      });
      update(() => receipt.encounter, !receipt.publish);
      // The DM set our HP. It lands on the character itself — the participant
      // is only a projection of the sheet, so leaving the sheet untouched would
      // publish the old number right back on its next change. Only `currHp`:
      // max HP and AC derive from the sheet, and the sheet is the authority on
      // its own formulas.
      const sheet = characterRef.current;
      if (receipt.ownVitals && sheet) {
        if (receipt.ownVitals.currHp !== sheet.currHp) {
          dispatch(updateAt(charPath(FIELD.currHp), receipt.ownVitals.currHp));
        }
        // Temp HP travels too now — a DM applying "you take 12" drains it
        // first, and leaving the sheet's copy stale would publish the old
        // number right back.
        const temp = receipt.ownVitals.tempHp;
        if (temp !== undefined && temp !== sheet.tempHp) {
          dispatch(updateAt(charPath(FIELD.tempHp), temp));
        }
      }
    },
    [clientId, update, dispatch],
  );

  const session = usePlaySession({
    clientId,
    // An ordinary broadcast from a peer wins or loses by revision; our own
    // vitals survive either way. **Never adopted** — adoption belongs to an
    // answer we asked for, which is what stops a latecomer's stale copy
    // replacing a fight in progress.
    onRemoteState: (incoming) => applyRemoteState(incoming, false),
    // Someone just arrived and knows nothing. Answer them directly, without
    // bumping the revision — this is a repeat, not a change. Presence rides
    // along: the reply is also how the newcomer learns who is already here.
    onSyncRequest: (fromClientId, requestId) => {
      syncResponseRef.current(fromClientId, requestId, encounterRef.current);
      announceRef.current(displayNameRef.current);
    },
    // The room answered ours. Whether that *replaces* what we hold is the
    // connection machine's call, and it is scoped to the request we sent: a
    // stray answer — to a previous join, or arriving after we concluded the
    // room was empty — merges like any other state.
    onSyncResponse: (incoming, requestId) => {
      const adopt = adoptsResponse(connectionRef.current, requestId);
      advance({ type: "sync-response", requestId });
      applyRemoteState(incoming, adopt);
    },
    onLeave: (fromClientId) => {
      presenceRef.current?.left(fromClientId);
      update((current) => withoutClient(current, fromClientId));
    },
    onPresence: (fromClientId, name) =>
      presenceRef.current?.saw(fromClientId, { name }),
    // Queue a peer's rolled damage. Deduped by id (a re-send is a repeat, not
    // a second hit) and capped — a queue nobody is reading must not grow all
    // night.
    onCallInitiative: () => setInitiativeCalled(true),
    // Through a ref: the chatter layer is created *after* the transport
    // (it needs the senders), and the transport needs its handlers *at*
    // creation. Same knot `broadcastRef` unties, tied the other way round.
    onRollReport: (report) => talkRef.current?.onRollReport(report),
    onRollVerdict: (verdict) => talkRef.current?.onRollVerdict(verdict),
    onRollCall: (call) => talkRef.current?.onRollCall(call),
    onHealingOffer: (offer) => talkRef.current?.onHealingOffer(offer),
    // The DM pointed a sheet at us. Nothing has travelled yet — this only
    // raises the prompt, and the sheet moves when the player accepts, through
    // the ordinary claim flow. Ignoring a stale id is the ghost-safe half:
    // if the participant is gone by the time we look, nothing renders.
    onAssignSheet: (participantId) => setPendingAssignmentId(participantId),
    // Someone asked to play an offered sheet. Only its owner answers, and only
    // if the offer stands — the claimable flag is the consent, checked at send
    // time rather than trusted from the asker.
    onClaimSheet: (participantId, fromClientId) => {
      const current = encounterRef.current;
      const offered = current.participants.find(
        (p) =>
          p.id === participantId &&
          p.claimable &&
          p.ownerClientId === clientId &&
          p.characterUuid,
      );
      if (!offered) return;
      const sheet = storedCharactersRef.current.find(
        (c) => c.uuid === offered.characterUuid,
      );
      if (!sheet) return;
      sendSheetRef.current(fromClientId, participantId, sheet);
    },
    // A sheet arrived for us — everyone in the realm sees it, and the envelope
    // has already dropped the copies addressed to somebody else. Loaded as a
    // borrowed character: played, never persisted, because the DM still owns
    // the stored copy and a local save would fork it.
    onSheet: (_participantId, incoming) => {
      const result = hydrateCharacter(incoming);
      if (!result.ok) {
        console.error("The offered sheet failed validation", result.errors);
        return;
      }
      markBorrowed(result.character.uuid);
      // Opening it is the whole pickup: the participant effect below sees the
      // open character and claims the participant, which is what tells the
      // table the sheet is now live in this browser.
      dispatch(loadPersistedCharacter(result.character));
    },
  });
  sendSheetRef.current = session.sendSheet;
  syncResponseRef.current = session.sendSyncResponse;
  broadcastRef.current = session.broadcastState;
  announceRef.current = session.announcePresence;

  // Who is connected right now. The heartbeat and the timeout come with the
  // shared hook, which is the whole point of moving it there: this layer used
  // to announce once on connect and never again, so a player whose laptop shut
  // mid-fight stayed in the DM's "hand a sheet to…" picker all evening.
  const presence = usePresence<PresenceName>({
    connected: session.status === "connected",
    payload: useMemo(() => ({ name: displayName }), [displayName]),
    announce: useCallback(
      (payload: PresenceName) => session.announcePresence(payload.name),
      [session.announcePresence],
    ),
    same: samePresenceName,
  });
  presenceRef.current = presence;
  const present: PresentClient[] = presence.roster;

  // What the table says to each other, as opposed to what it agrees on: rolls,
  // rulings, asks and offers. Split out by lifetime — all of it is born from an
  // arriving message and dies with the socket — but still mounted here, because
  // this is where the transport is.
  const talk = useTableTalkState({
    clientId,
    displayName,
    connected: session.status === "connected",
    encounter,
    character,
    dispatch,
    selfParticipantId: participantFor(encounter, character?.uuid)?.id,
  });
  talkRef.current = talk;
  talk.bind(session);

  // Move the machine on. **The ref leads and the state follows**, rather than
  // the ref mirroring the state on render: a peer's answer can arrive in the
  // same tick as the request that asked for it, and a handler reading a state
  // that React has not re-rendered yet would decide not to adopt it.
  const advance = useCallback((event: ConnectionEvent) => {
    connectionRef.current = connectionReducer(connectionRef.current, event);
    setConnection(connectionRef.current);
  }, []);

  // Both ways into a session, which differ in less than they used to: what the
  // table opens with, and whether the room's answer replaces our state or
  // merges with it. Everything else — asking, waiting, giving up on an empty
  // room — is the same sequence.
  const enterSession = useCallback(
    async (intent: SessionIntent, code?: string): Promise<JoinResult> => {
      advance({ type: "connect", intent });
      // Read before connecting, because connecting is what rewrites it.
      const belongsTo: string | undefined = readLocalStorage(
        ENCOUNTER_SESSION_STORAGE_KEY,
      );
      const result =
        intent.kind === "host"
          ? await session.host(code)
          : await session.join(code!);
      if (!result.ok) {
        // Never opened a realm, so there is nothing to be in. Claiming a seat
        // or clearing an encounter on the strength of it would cost this
        // browser the table it is still holding for a session that does exist.
        advance({ type: "closed", error: result.message });
        return result;
      }

      const requestId = randomUUID();
      advance({ type: "opened", code: result.code, requestId });

      // **Silently** — entering a room is not an edit. This update used to
      // broadcast, which sent the local state into the room *before* adoption
      // ever ran: a joiner who runs their own table on other nights (so the
      // seat-reclaim below genuinely rewrites their stored encounter) would
      // publish their whole other fight — high revision, seat claim and all —
      // and win the document race on every peer, wiping the room they were
      // walking into. Everything a newcomer holds reaches the room through
      // the handshake instead: the re-add and seat rules in `receiveState`
      // publish exactly what the room turns out to lack, and no more.
      // Pinned by "does not let a DM-elsewhere arrival wipe the room" in
      // `session-lifecycle.test.ts`.
      update((current) => {
        const base = encounterForTable(current, belongsTo, intent);
        // Opening a table *is* being its DM — the seat is taken at creation
        // rather than raced for afterwards. Walking back into one you ran takes
        // it back: the token is this browser either way, and the realm a DM
        // returns to is routinely empty, so waiting for a peer to remind us
        // would mean waiting forever.
        return intent.kind === "host"
          ? claimDmSeat(base, clientId, dmTokenRef.current)
          : reclaimDmSeat(base, clientId, dmTokenRef.current);
      }, true);

      session.sendSyncRequest(requestId);
      // The wait has an end, and the end is an answer of its own: nobody is
      // here, so what we hold stands. A late reply still merges the ordinary
      // way — this closes the *waiting*, not the listening.
      setTimeout(
        () => advance({ type: "sync-window-closed", requestId }),
        SYNC_WINDOW_MS,
      );
      return result;
    },
    [advance, session, update, clientId],
  );

  // Remember a session on the character once the connection actually succeeded —
  // recording a code the moment it's typed would fill the rejoin list with
  // typos. Keyed on the connected code, so it fires once per connection rather
  // than per render.
  const connectedCode =
    session.status === "connected" ? session.code : undefined;
  connectedRef.current = !!connectedCode;
  // Remembered for this browser whether hosted or joined, and only once the
  // connection succeeded.
  const [lastSession, setLastSession] = useState<string | undefined>(() =>
    readLocalStorage(LAST_SESSION_STORAGE_KEY),
  );
  useEffect(() => {
    if (!connectedCode) return;
    writeLocalStorage(LAST_SESSION_STORAGE_KEY, connectedCode);
    setLastSession(connectedCode);
    // The encounter on screen is this table's from here on, which is what lets
    // the *next* table know not to inherit it.
    writeLocalStorage(ENCOUNTER_SESSION_STORAGE_KEY, connectedCode);
    // The same fact, recorded per code rather than as a single "last one", so
    // the front door can offer every table this browser plays at. Entries merge,
    // which is what lets the lobby record the seat and the sheets brought
    // without either surface knowing about the other.
    //
    // The open sheet is recorded as "who I played" only for a seat that plays
    // one: a DM usually has some sheet open — an NPC they're voicing, a party
    // character they're checking — and labelling their rejoin row "as Guard
    // Captain" would be reading a coincidence as a choice.
    const seat = sessionMemoryFor(connectedCode)?.seat;
    rememberSessionLocally({
      code: connectedCode,
      lastJoined: Date.now(),
      ...(seat === "dm"
        ? {}
        : {
            playAsUuid: characterRef.current?.uuid,
            playAsName: characterRef.current?.name,
          }),
    });
  }, [connectedCode]);
  // Pending assignments and queued reports are facts about a connection, and
  // this browser no longer has one. (The roster is too, and clears itself —
  // announcing and forgetting both belong to the presence hook now.)
  const disconnected = session.status !== "connected";
  useEffect(() => {
    if (!disconnected) return;
    advance({ type: "closed" });
    setPendingAssignmentId(undefined);
    setCustomName(undefined);
    setInitiativeCalled(false);
    talk.reset();
  }, [disconnected]);

  // The call is answered by the fight starting, whoever rolled what.
  const combatUnderway = isInCombat(encounter);
  useEffect(() => {
    if (combatUnderway) setInitiativeCalled(false);
  }, [combatUnderway]);

  // The concentration watcher: the open character's HP dropped while their
  // participant holds a spell. It watches the *sheet*, not the projection, so
  // it catches every way damage lands — the player's own edit, a DM oversight
  // write, an accepted damage report — without caring which one it was.
  // Temp HP counts: 5e's check keys off damage *taken*, absorbed or not, so
  // the drop is measured across both pools. The cost is a rare false prompt
  // when temp HP simply expires — advisory, so a "Kept it" costs one click.
  const prevHpRef = useRef<{ uuid?: UUID; currHp?: number; tempHp?: number }>(
    {},
  );
  useEffect(() => {
    const prev = prevHpRef.current;
    prevHpRef.current = {
      uuid: character?.uuid,
      currHp: character?.currHp,
      tempHp: character?.tempHp,
    };
    if (!character || prev.uuid !== character.uuid) return;
    if (prev.currHp === undefined) return;
    const damage =
      Math.max(0, prev.currHp - character.currHp) +
      Math.max(0, (prev.tempHp ?? 0) - character.tempHp);
    if (damage <= 0) return;
    const concentration = participantFor(
      encounterRef.current,
      character.uuid,
    )?.concentration;
    if (!concentration) return;
    setConcentrationCheck({
      spell: concentration.spell,
      damage,
      dc: concentrationDc(damage),
    });
  }, [character?.currHp, character?.tempHp, character?.uuid]);

  const characterUuidForSession = character?.uuid;
  useEffect(() => {
    if (!connectedCode || !characterUuidForSession) return;
    dispatch(
      updateAt(
        charPath(FIELD.playSessions),
        rememberSession(
          characterRef.current?.playSessions,
          connectedCode,
          Date.now(),
        ),
      ),
    );
  }, [connectedCode, characterUuidForSession, dispatch]);

  // Keep a participant in step with the open character: created the first time
  // that character is opened, and renamed if the character is. Every other
  // participant is typed in by hand and owned by the player.
  const uuid = character?.uuid;
  const name = character?.name;
  useEffect(() => {
    if (!uuid) return;
    update((current) => {
      const existing = current.participants.find(
        (p) => p.characterUuid === uuid,
      );
      if (!existing) {
        return addParticipant(current, {
          id: selfId(uuid),
          name: name || "You",
          characterUuid: uuid,
          ownerClientId: clientId,
          initiative: 0,
        });
      }
      // Opening a sheet someone else put in the order takes it over. A DM who
      // brought a character contributed a static projection; the browser with
      // the sheet actually open has the live one, so ownership follows it.
      const owned = claimParticipant(current, existing.id, clientId);
      return name ? renameParticipant(owned, existing.id, name) : owned;
    });
  }, [uuid, name, clientId, update]);

  // Publish the projection the rest of the party sees. `setVitals` returns the
  // same object when nothing moved, and `update` skips an unchanged result, so
  // this doesn't turn every render into a broadcast.
  useEffect(() => {
    if (!character || !uuid) return;
    update((current) => {
      const mine = current.participants.find((p) => p.characterUuid === uuid);
      if (!mine) return current;
      return setVitals(current, mine.id, characterVitals(character));
    });
  }, [character, uuid, update]);

  const self = participantFor(encounter, uuid);

  const next = useCallback((): TurnAdvance | undefined => {
    let result: TurnAdvance | undefined;
    update((current) => {
      result = advanceTurn(current);
      return result.encounter;
    });
    return result;
  }, [update]);

  const providerData = useMemo<EncounterContextData>(
    () => ({
      encounter,
      self,
      inCombat: isInCombat(encounter),
      current: currentParticipant(encounter),
      selfConditions: self?.conditions.map((c) => c.name) ?? [],

      start: () => update(startCombat),
      end: () => update(endCombat),
      next,

      addCombatant: (combatantName, initiative, opts) =>
        update((current) => {
          const count = Math.max(1, Math.floor(opts?.count ?? 1));
          let next = current;
          for (let i = 0; i < count; i += 1) {
            const id = `combatant:${crypto.randomUUID()}`;
            next = addParticipant(next, {
              id,
              name: count > 1 ? `${combatantName} ${i + 1}` : combatantName,
              initiative,
            });
            if (opts?.maxHp && opts.maxHp > 0) {
              next = setVitals(next, id, {
                currHp: opts.maxHp,
                maxHp: opts.maxHp,
                ac: opts.ac && opts.ac > 0 ? opts.ac : 0,
              });
            }
          }
          return next;
        }),
      removeCombatant: (id) =>
        update((current) => removeParticipant(current, id)),
      clearFallen: () => update(clearFallen),
      fallen: fallenParticipants(encounter),
      setCombatantHidden: (id, hidden) =>
        update((current) => setHidden(current, id, hidden)),
      setCombatantSide: (id, side) =>
        update((current) => setSide(current, id, side)),
      // Re-seats mid-combat: editing a number is declaring where the row acts,
      // so the row moves there (and whoever is acting keeps acting).
      setCombatantInitiative: (id, initiative) =>
        update((current) => reseatParticipant(current, id, initiative)),

      setSlotSpent: (id, slot, spent) =>
        update((current) => setSpent(current, id, slot, spent)),
      setCombatantVitals: (id, vitals) =>
        update((current) => setVitals(current, id, vitals)),
      giveCondition: (id, condition) =>
        update((current) => addCondition(current, id, condition)),
      takeCondition: (id, conditionName) =>
        update((current) => removeCondition(current, id, conditionName)),
      concentrateOn: (id, concentration) =>
        update((current) => setConcentration(current, id, concentration)),

      clientId,
      sessionCode: session.code,
      sessionStatus: session.status,
      sessionError: session.error,
      // Both ways in go through one sequence — see `enterSession`.
      hostSession: (reopenCode) =>
        enterSession({ kind: "host", reopening: !!reopenCode }, reopenCode),
      joinSession: (joinCode, joinDisplayName) => {
        if (joinDisplayName?.trim()) setCustomName(joinDisplayName.trim());
        return enterSession({ kind: "join" }, joinCode);
      },
      leaveSession: () => {
        setConnection(OFFLINE);
        // Leaving on purpose is the one case where we shouldn't offer to go
        // straight back in.
        removeLocalStorage(LAST_SESSION_STORAGE_KEY);
        setLastSession(undefined);
        session.leave();
      },
      setSheetOffered: (id, claimable) =>
        update((current) => offerSheet(current, id, claimable)),
      claimables: claimableSheets(encounter, clientId),
      present,
      // Assigning is offering plus a nudge: the claimable flag is still what
      // consents to travel (checked at send time by the owner), so a ghost
      // target costs nothing — no reply, and the offer stands for pickup.
      assignSheetTo: (participantId, toClientId) => {
        update((current) => offerSheet(current, participantId, true));
        session.assignSheet(toClientId, participantId);
      },
      pendingAssignment: pendingAssignmentId
        ? encounter.participants.find(
            (p) => p.id === pendingAssignmentId && p.claimable,
          )
        : undefined,
      acceptAssignment: () => {
        if (pendingAssignmentId) session.requestSheet(pendingAssignmentId);
        setPendingAssignmentId(undefined);
      },
      declineAssignment: () => setPendingAssignmentId(undefined),
      concentrationCheck,
      clearConcentrationCheck: () => setConcentrationCheck(undefined),
      sharing: encounter.sharing ?? DEFAULT_SHARING,
      setSharingLevel: (level) =>
        update((current) => setSharing(current, level)),
      hideDeathSaves: !!encounter.hideDeathSaves,
      setDeathSavesHidden: (hide) =>
        update((current) => setHideDeathSaves(current, hide)),
      // "Alright everyone, roll initiative": roll for every sheet this client
      // brought (their stored copies carry the modifiers), then prompt the
      // rest of the table to roll their own.
      callForInitiative: () => {
        update((current) => {
          let next = current;
          for (const p of current.participants) {
            if (!p.characterUuid || p.ownerClientId !== clientId) continue;
            const sheet = storedCharactersRef.current.find(
              (c) => c.uuid === p.characterUuid,
            );
            if (!sheet) continue;
            next = setInitiative(
              next,
              p.id,
              rollD20Check(initiativeModifierFor(sheet)).total,
            );
          }
          return next;
        });
        session.sendCallInitiative();
      },
      initiativeCalled,
      dismissInitiativeCall: () => setInitiativeCalled(false),
      claimSheet: session.requestSheet,
      bringCharacters: (characters) =>
        update((current) =>
          characters.reduce(
            (encounter, brought) =>
              setVitals(
                addParticipant(encounter, {
                  id: selfId(brought.uuid),
                  name: brought.name || "Unnamed",
                  characterUuid: brought.uuid,
                  ownerClientId: clientId,
                  initiative: 0,
                }),
                selfId(brought.uuid),
                characterVitals(brought),
              ),
            current,
          ),
        ),
      lastSession,
      rememberedSessions: character?.playSessions ?? [],
      forgetRememberedSession: (code) =>
        dispatch(
          updateAt(
            charPath(FIELD.playSessions),
            forgetSession(character?.playSessions, code),
          ),
        ),
      canRun: canRunCombat(encounter, clientId),
      hasDm: !!encounter.dmClientId,
      isDm: encounter.dmClientId === clientId,
      claimDm: () =>
        update((current) => claimDmSeat(current, clientId, dmTokenRef.current)),
      releaseDm: () => update(releaseDmSeat),
    }),
    [
      encounter,
      self,
      next,
      update,
      clientId,
      session,
      character,
      dispatch,
      lastSession,
      present,
      pendingAssignmentId,
      concentrationCheck,
      displayName,
      initiativeCalled,
    ],
  );

  return (
    <EncounterContext.Provider value={providerData}>
      <TableTalkContext.Provider value={talk.value}>
        {props.children}
      </TableTalkContext.Provider>
    </EncounterContext.Provider>
  );
}

export function useEncounter() {
  return useContext(EncounterContext);
}
