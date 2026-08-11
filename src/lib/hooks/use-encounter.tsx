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
  TABLE_PRESENCE_TTL_MS,
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
import { publishTabEncounter, subscribeTabEncounters } from "src/lib/tab-sync";
import { isEncounter } from "src/lib/play/session";
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

// The encounter: round/initiative/conditions/concentration, persisted in
// localStorage independent of any character, with an optional sync overlay
// for party sessions. Sits above the sheet so the roll dialog can read
// conditions from either route.

// Exported so the test harness can reset it between renders.
export const ENCOUNTER_STORAGE_KEY = "encounter";

// The DM's durable key, in their own browser. `clientId` is regenerated per
// tab, so a seat keyed on it alone would be lost on every refresh; this is
// what `reclaimDmSeat` recognises. Only leaves this browser as the
// encounter's `dmToken`, a random uuid tied to nothing else.
export const DM_TOKEN_STORAGE_KEY = "dm-token";

// The session this browser was last in. Distinct from `Character.playSessions`
// (per-character, joined sessions only) — a DM may have no character open,
// so hosting needs its own record device-level.
export const LAST_SESSION_STORAGE_KEY = "last-session";

// Which table the persisted encounter came from, if any. Pairs a
// per-browser encounter with a per-table code so opening a new game doesn't
// resume last week's order/round/monsters. Cleared on any local edit made
// while disconnected, since that makes the encounter offline prep instead.
export const ENCOUNTER_SESSION_STORAGE_KEY = "encounter-session";

// Default answer for "did I get in" outside a provider. Constant so the two
// defaults below can't drift.
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
  selfConditions: ConditionName[];

  start: () => void;
  end: () => void;
  // Returns what the turn boundary produced, so the caller can fire triggers.
  next: () => TurnAdvance | undefined;

  // `count` makes a numbered pack ("Goblin 1..4") sharing one initiative
  // roll; `maxHp` starts them tracked immediately.
  addCombatant: (
    name: string,
    initiative: number,
    opts?: { count?: number; maxHp?: number; ac?: number },
  ) => void;
  removeCombatant: (id: string) => void;
  clearFallen: () => void;
  fallen: Participant[];
  // Hidden rows don't render on player clients.
  setCombatantHidden: (id: string, hidden: boolean) => void;
  // Overrides the no-sheet-means-foe heuristic used by target pickers.
  setCombatantSide: (id: string, side: "party" | "foe") => void;
  setCombatantInitiative: (id: string, initiative: number) => void;

  setSlotSpent: (id: string, slot: EconomySlot, spent: boolean) => void;
  // DM oversight write. For a player-owned row the rev-checked merge carries
  // it to their sheet; for a DM-owned/hand-typed row this is the record.
  setCombatantVitals: (id: string, vitals: ParticipantVitals) => void;
  giveCondition: (id: string, condition: ActiveCondition) => void;
  takeCondition: (id: string, name: ConditionName) => void;
  concentrateOn: (id: string, concentration: Concentration | undefined) => void;

  // --- Party session ---
  clientId: string;
  sessionCode?: string;
  // Most recent first. Session codes are uuids, not memorable.
  rememberedSessions: PlaySessionRef[];
  forgetRememberedSession: (code: string) => void;
  sessionStatus: SessionStatus;
  sessionError?: string;
  // For rejoining after a reload/drop. Cleared by leaving on purpose.
  lastSession?: string;
  // Opens a new table, or reopens one whose realm has closed. Resolves once
  // the realm is actually joined.
  hostSession: (reopenCode?: string) => Promise<JoinResult>;
  // `displayName` is for the sheetless joiner.
  joinSession: (code: string, displayName?: string) => Promise<JoinResult>;
  leaveSession: () => void;
  // Adds characters to the order without opening them; vitals are a snapshot
  // until whoever owns the sheet opens it and takes the participant over.
  bringCharacters: (characters: Character[]) => void;
  // Offer a brought sheet for pickup (or withdraw it). DM board only.
  setSheetOffered: (id: string, claimable: boolean) => void;
  claimables: Participant[];
  // Connected clients by display name, transient. A sheetless player has no
  // participant, so this is the only way the DM can point at them.
  present: PresentClient[];
  // Present clients not heard from lately (screen off, not disconnected).
  // See `play/liveness.ts`.
  quietClients: string[];
  // Targeted offer: marks the sheet claimable and points it at one client.
  // Travels only when the target accepts, via the ordinary claim flow.
  assignSheetTo: (participantId: string, toClientId: string) => void;
  pendingAssignment?: Participant;
  acceptAssignment: () => void;
  declineAssignment: () => void;

  // --- Concentration ---
  // Set when the open character took damage while concentrating (5e: DC 10
  // or half damage). Advisory — the player answers it.
  concentrationCheck?: { spell: string; damage: number; dc: number };
  clearConcentrationCheck: () => void;

  // --- Table policy ---
  sharing: SharingLevel;
  setSharingLevel: (level: SharingLevel) => void;
  hideDeathSaves: boolean;
  setDeathSavesHidden: (hide: boolean) => void;

  // --- The initiative call ---
  // Rolls for every sheet this client brought, then prompts the table.
  callForInitiative: () => void;
  // Cleared by rolling, dismissing, combat starting, or disconnecting.
  initiativeCalled: boolean;
  dismissInitiativeCall: () => void;
  // The whole character arrives over the session and opens as a borrowed
  // sheet: played, never persisted here.
  claimSheet: (participantId: string) => void;
  // An unclaimed DM seat means everybody can run the fight.
  canRun: boolean;
  hasDm: boolean;
  isDm: boolean;
  claimDm: () => void;
  releaseDm: () => void;
}

const NOOP = () => {};

// A real, empty encounter rather than `undefined` — `RollModal` renders on
// the sheet too, with no provider decision made. Exported so a test can
// override two fields without restating fifty.
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
  hostSession: async () => NO_SESSION,
  joinSession: async () => NO_SESSION,
  leaveSession: NOOP,
  bringCharacters: NOOP,
  setSheetOffered: NOOP,
  claimables: [],
  present: [],
  quietClients: [],
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

// A participant id derived from the character, so the same sheet is the same
// row regardless of who put it in the order (player or DM).
function selfId(uuid: UUID): string {
  return `self:${uuid}`;
}

// The projection the rest of the party sees. Computed from a whole character
// rather than read off one, since a DM-brought sheet is never opened here.
function characterVitals(character: Character): ParticipantVitals {
  const maxHp =
    character.maxHp ??
    getOptionalInitializer(FIELD.maxHp, undefined, character);
  // Death saves ride along only while they matter (down, or pips marked).
  // Hiding them from the party is `hideDeathSaves`'s job at render time.
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
  // The DM's stored characters, for answering sheet claims; survives a reload
  // unlike the in-memory list a lobby hands us.
  const { characters: storedCharacters } = useDatastore();
  const storedCharactersRef = useRef(storedCharacters);
  storedCharactersRef.current = storedCharacters;
  const { markBorrowed } = useSharingSessions();
  const characterRef = useRef(character);
  characterRef.current = character;
  const { clientId } = useSharingSessions();
  // Sent by whoever owns an offered sheet, in reply to a claim.
  const sendSheetRef = useRef<
    (toClientId: string, participantId: string, character: unknown) => void
  >(() => {});
  // Offers this client has already answered — see `onClaimSheet`. Re-armed by
  // re-offering, cleared with the connection.
  const answeredClaimsRef = useRef(new Set<string>());
  const talkRef = useRef<TableTalk | undefined>();
  const presenceRef = useRef<
    | {
        saw: (clientId: string, payload: PresenceName) => void;
        touch: (clientId: string) => void;
        left: (clientId: string) => void;
      }
    | undefined
  >();
  const [encounter, setEncounter] = useState<Encounter>(() =>
    readLocalStorage(ENCOUNTER_STORAGE_KEY, EMPTY_ENCOUNTER),
  );
  // Read synchronously by session callbacks registered once at connect time.
  const encounterRef = useRef(encounter);
  encounterRef.current = encounter;
  // Set once the transport exists; ref because `update` is created first.
  const broadcastRef = useRef<((encounter: Encounter) => void) | undefined>();
  // See `play/connection.ts`. Ref (as well as state) so message handlers
  // registered once can read it as it is now.
  const [connection, setConnection] = useState<ConnectionState>(OFFLINE);
  const connectionRef = useRef(connection);
  const syncResponseRef = useRef<
    (toClientId: string, requestId: string, encounter: Encounter) => void
  >(() => {});
  // Read lazily so a browser that never runs a game never writes the key.
  const dmTokenRef = useRef<string>("");
  if (!dmTokenRef.current) dmTokenRef.current = dmToken();
  // Whether this connection still has its automatic seat reclaim to spend —
  // one per connection (see `SessionSelf.dmToken`). Reset on connect, not on
  // loss, so a reconnect regains it but a second tab does not.
  const seatReclaimRef = useRef(true);
  // Whether this browser is in a session, read synchronously by `update` so
  // an offline edit can disown the stored session.
  const connectedRef = useRef(false);
  const connectedCodeRef = useRef<string | undefined>();
  // Set while applying a peer's state, so `update` can tell a local change
  // from one we were told about.
  const applyingRemoteRef = useRef(false);
  const advanceRef = useRef<(event: ConnectionEvent) => void>(() => {});

  // A player with a character announces its name; the sheetless joiner types
  // one into the lobby.
  const [customName, setCustomName] = useState<string | undefined>();
  const displayName = character?.name || customName || "Player";
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const announceRef = useRef<(name: string) => void>(() => {});
  // An assignment pointed at this client, waiting on the player's answer.
  const [pendingAssignmentId, setPendingAssignmentId] = useState<
    string | undefined
  >();
  const [concentrationCheck, setConcentrationCheck] = useState<
    { spell: string; damage: number; dc: number } | undefined
  >();
  // The DM called for initiative and this client hasn't answered yet.
  const [initiativeCalled, setInitiativeCalled] = useState(false);

  // Every local change: persist, then publish. `silent` is for changes that
  // came from a peer, to avoid re-broadcasting them.
  const update = useCallback(
    (change: (current: Encounter) => Encounter, silent = false) => {
      setEncounter((current) => {
        const changed = change(current);
        if (changed === current) return current;
        const next = silent ? changed : bumpRevision(changed, clientId);
        writeLocalStorage(ENCOUNTER_STORAGE_KEY, next);
        // Syncs every tab of this browser (localStorage is only read at
        // mount). Published on every change, including silent applies; the
        // receiver merges rather than replaces, and an unchanged merge
        // returns identically, terminating the bounce at the early return
        // above.
        publishTabEncounter({
          encounter: next,
          code: connectedRef.current ? connectedCodeRef.current : undefined,
        });
        // Edited by hand with no session open: this is prep now, and prep
        // must survive being hosted later.
        if (!silent && !connectedRef.current) {
          removeLocalStorage(ENCOUNTER_SESSION_STORAGE_KEY);
        }
        if (!silent) broadcastRef.current?.(next);
        // A real local edit cancels any standing offer to adopt a late sync
        // answer, so it isn't clobbered by a stale room copy.
        if (!silent && !applyingRemoteRef.current) {
          advanceRef.current({ type: "local-change" });
        }
        return next;
      });
    },
    [clientId],
  );

  // Applies a peer's encounter, whether an answer to our sync request or an
  // ordinary broadcast — the only difference is `adopt`.
  const applyRemoteState = useCallback(
    (incoming: Encounter, adopt: boolean) => {
      applyingRemoteRef.current = true;
      const receipt = receiveState(encounterRef.current, incoming, {
        clientId,
        characterUuid: characterRef.current?.uuid,
        // Offered only while this connection's reclaim is unspent.
        dmToken: seatReclaimRef.current ? dmTokenRef.current : undefined,
        adopt,
      });
      if (receipt.reclaimedSeat) seatReclaimRef.current = false;
      update(() => receipt.encounter, !receipt.publish);
      applyingRemoteRef.current = false;
      // DM-set HP lands on the character itself, not just the participant
      // projection, or the sheet's next change would publish the old number
      // back. Only currHp/tempHp — max HP and AC derive from the sheet.
      const sheet = characterRef.current;
      if (receipt.ownVitals && sheet) {
        if (receipt.ownVitals.currHp !== sheet.currHp) {
          dispatch(updateAt(charPath(FIELD.currHp), receipt.ownVitals.currHp));
        }
        const temp = receipt.ownVitals.tempHp;
        if (temp !== undefined && temp !== sheet.tempHp) {
          dispatch(updateAt(charPath(FIELD.tempHp), temp));
        }
      }
    },
    [clientId, update, dispatch],
  );

  // Sibling tabs' copies of the fight, merged like any peer's via
  // `applyRemoteState` (two tabs are just two clients sharing a
  // localStorage). Never adopted — no sync request was made.
  const applyRemoteStateRef = useRef(applyRemoteState);
  applyRemoteStateRef.current = applyRemoteState;
  useEffect(
    () =>
      subscribeTabEncounters((message) => {
        if (!isEncounter(message.encounter)) return;
        // A tab at a different table keeps its own fight.
        if (
          message.code &&
          connectedRef.current &&
          message.code !== connectedCodeRef.current
        ) {
          return;
        }
        applyRemoteStateRef.current(message.encounter, false);
      }),
    [],
  );

  const session = usePlaySession({
    clientId,
    // Never adopted — adoption is reserved for an answer to our own request,
    // so a latecomer's stale copy can't replace a fight in progress.
    onRemoteState: (incoming) => applyRemoteState(incoming, false),
    // A newcomer with nothing to compare against. Answered directly without
    // bumping the revision; presence rides along in the same reply.
    onSyncRequest: (fromClientId, requestId) => {
      syncResponseRef.current(fromClientId, requestId, encounterRef.current);
      announceRef.current(displayNameRef.current);
    },
    // Whether the room's answer replaces our state is the connection
    // machine's call, scoped to the request we sent — a stray answer merges
    // like any other state.
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
    // Any message from a peer counts as a heartbeat, so an active player
    // isn't marked dropped just because their phone throttled the timer.
    onPeerHeard: (fromClientId) => presenceRef.current?.touch(fromClientId),
    onCallInitiative: () => setInitiativeCalled(true),
    // Via ref: the chatter layer is created after the transport (needs its
    // senders), but the transport needs handlers at creation time.
    onRollReport: (report) => talkRef.current?.onRollReport(report),
    onRollVerdict: (verdict) => talkRef.current?.onRollVerdict(verdict),
    onRollCall: (call) => talkRef.current?.onRollCall(call),
    onRestCall: (call) => talkRef.current?.onRestCall(call),
    onHealingOffer: (offer) => talkRef.current?.onHealingOffer(offer),
    onConditionOffer: (offer) => talkRef.current?.onConditionOffer(offer),
    // Only raises the prompt; the sheet itself moves when the player accepts
    // via the ordinary claim flow. A stale id (participant already gone)
    // simply renders nothing.
    onAssignSheet: (participantId) => setPendingAssignmentId(participantId),
    // Only the offer's owner answers, and only while `claimable` still holds
    // (checked at send time, not trusted from the asker). Answered at most
    // once per offer via a ref, since two claims in the same round-trip
    // window both read the pre-claim state and would otherwise both be sent
    // the sheet. `setSheetOffered` re-arms it for a claimant who vanished
    // before opening.
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
      if (answeredClaimsRef.current.has(participantId)) return;
      const sheet = storedCharactersRef.current.find(
        (c) => c.uuid === offered.characterUuid,
      );
      if (!sheet) return;
      answeredClaimsRef.current.add(participantId);
      sendSheetRef.current(fromClientId, participantId, sheet);
    },
    // Envelope has already dropped copies addressed to somebody else. Loaded
    // as a borrowed character: played, never persisted (the DM still owns
    // the stored copy).
    onSheet: (_participantId, incoming) => {
      const result = hydrateCharacter(incoming);
      if (!result.ok) {
        console.error("The offered sheet failed validation", result.errors);
        return;
      }
      markBorrowed(result.character.uuid);
      // The participant effect below sees the open character and claims the
      // row, telling the table the sheet is now live in this browser.
      dispatch(loadPersistedCharacter(result.character));
    },
  });
  sendSheetRef.current = session.sendSheet;
  syncResponseRef.current = session.sendSyncResponse;
  broadcastRef.current = session.broadcastState;
  announceRef.current = session.announcePresence;

  const presence = usePresence<PresenceName>({
    connected: session.status === "connected",
    payload: useMemo(() => ({ name: displayName }), [displayName]),
    announce: useCallback(
      (payload: PresenceName) => session.announcePresence(payload.name),
      [session.announcePresence],
    ),
    same: samePresenceName,
    // Longer than the shared default — a table is played on phones.
    ttlMs: TABLE_PRESENCE_TTL_MS,
  });
  presenceRef.current = presence;
  const present: PresentClient[] = presence.roster;
  const quietClients = presence.quiet;

  // Rolls, rulings, asks and offers — mounted here because this is where the
  // transport is.
  const talk = useTableTalkState({
    clientId,
    displayName,
    connected: session.status === "connected",
    encounter,
    character,
    dispatch,
    selfParticipantId: participantFor(encounter, character?.uuid)?.id,
    // The one encounter write the chatter layer makes: a condition accepted
    // from an offer, landing on the player's own row.
    applyConditionTo: useCallback(
      (
        participantId: string,
        condition: { name: string; rounds?: number; from?: string },
      ) => update((current) => addCondition(current, participantId, condition)),
      [update],
    ),
  });
  talkRef.current = talk;
  talk.bind(session);

  // The ref leads and the state follows, not the reverse: a peer's answer
  // can arrive in the same tick as the request, before React re-renders, so
  // a handler reading state directly could miss adopting it.
  const advance = useCallback((event: ConnectionEvent) => {
    connectionRef.current = connectionReducer(connectionRef.current, event);
    setConnection(connectionRef.current);
  }, []);
  advanceRef.current = advance;

  // Host and join differ only in what the table opens with and whether the
  // room's answer replaces or merges with our state.
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
        // No realm was opened, so there's nothing to claim a seat in or
        // clear — that would cost the browser a table it still holds.
        advance({ type: "closed", error: result.message });
        return result;
      }

      const requestId = randomUUID();
      // A new connection gets a fresh reclaim, covering refresh/crash/drop.
      seatReclaimRef.current = true;
      advance({ type: "opened", code: result.code, requestId });

      // Silent: entering a room is not an edit. A non-silent update here
      // would broadcast local state into the room before adoption ran,
      // letting a joiner's unrelated stored fight (high revision, seat
      // claim) win the document race and wipe the room. What a newcomer
      // holds reaches the room only through the handshake's re-add/seat
      // rules in `receiveState`. Pinned by "does not let a DM-elsewhere
      // arrival wipe the room" in `session-lifecycle.test.ts`.
      update((current) => {
        const base = encounterForTable(current, belongsTo, intent);
        // Hosting claims the seat at creation; rejoining a table you ran
        // reclaims it — the token is this browser either way, and the DM
        // shouldn't wait on a peer to confirm an often-empty realm.
        return intent.kind === "host"
          ? claimDmSeat(base, clientId, dmTokenRef.current)
          : reclaimDmSeat(base, clientId, dmTokenRef.current);
      }, true);

      session.sendSyncRequest(requestId);
      // If nobody answers in time, what we hold stands; a late reply still
      // merges normally — this only closes the waiting, not the listening.
      setTimeout(
        () => advance({ type: "sync-window-closed", requestId }),
        SYNC_WINDOW_MS,
      );
      return result;
    },
    [advance, session, update, clientId],
  );

  // Recorded only once the connection succeeds, keyed on the connected code
  // so this fires once per connection rather than per render (recording on
  // every keystroke would fill the rejoin list with typos).
  const connectedCode =
    session.status === "connected" ? session.code : undefined;
  connectedRef.current = !!connectedCode;
  connectedCodeRef.current = connectedCode;
  const [lastSession, setLastSession] = useState<string | undefined>(() =>
    readLocalStorage(LAST_SESSION_STORAGE_KEY),
  );
  useEffect(() => {
    if (!connectedCode) return;
    writeLocalStorage(LAST_SESSION_STORAGE_KEY, connectedCode);
    setLastSession(connectedCode);
    // Marks the on-screen encounter as this table's, so the next table
    // doesn't inherit it.
    writeLocalStorage(ENCOUNTER_SESSION_STORAGE_KEY, connectedCode);
    // Per-code (not a single "last one") so the front door can offer every
    // table this browser plays at; entries merge across seat/sheet writes.
    // Only recorded for a seat that plays a sheet — a DM's open sheet is
    // usually incidental (an NPC, a check), not "who I played". And only
    // when one exists: writing undefined would erase a sheet the browser is
    // already known to have played, which a reconnect does before the
    // character is reopened.
    const seat = sessionMemoryFor(connectedCode)?.seat;
    const sheet = characterRef.current;
    rememberSessionLocally({
      code: connectedCode,
      lastJoined: Date.now(),
      ...(seat === "dm" || !sheet
        ? {}
        : { playAsUuid: sheet.uuid, playAsName: sheet.name }),
    });
  }, [connectedCode]);
  // Pending assignments/queued reports are facts about a connection this
  // browser no longer has (the roster clears itself via the presence hook).
  const disconnected = session.status !== "connected";
  useEffect(() => {
    if (!disconnected) return;
    advance({ type: "closed" });
    setPendingAssignmentId(undefined);
    setCustomName(undefined);
    setInitiativeCalled(false);
    answeredClaimsRef.current.clear();
    talk.reset();
  }, [disconnected]);

  const combatUnderway = isInCombat(encounter);
  useEffect(() => {
    if (combatUnderway) setInitiativeCalled(false);
  }, [combatUnderway]);

  // Watches the open character's sheet HP (not the participant projection)
  // for a drop while concentrating, so it catches damage from any source.
  // Temp HP counts toward the drop too (5e checks damage taken, absorbed or
  // not) — costs an occasional false prompt when temp HP simply expires.
  const prevHpRef = useRef<{ uuid?: UUID; currHp?: number; tempHp?: number }>(
    {},
  );
  // The prompt goes with the character it described; switching characters
  // clears it.
  useEffect(() => {
    setConcentrationCheck(undefined);
  }, [character?.uuid]);
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

  // The seat, not the sheet: a DM's open sheet is a document they are
  // consulting (an NPC, a check, a player's stats), so none of the effects
  // below — which put the open character into the shared order — are theirs.
  // They seat combatants from the board instead.
  const holdsDmSeat = encounter.dmClientId === clientId;

  const characterUuidForSession = character?.uuid;
  useEffect(() => {
    if (!connectedCode || !characterUuidForSession || holdsDmSeat) return;
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
  }, [connectedCode, characterUuidForSession, holdsDmSeat, dispatch]);

  // What this browser is playing at this table, kept current as it changes —
  // a reconnect reopens whatever is recorded here.
  useEffect(() => {
    if (!connectedCode || !characterUuidForSession) return;
    if (sessionMemoryFor(connectedCode)?.seat === "dm") return;
    rememberSessionLocally({
      code: connectedCode,
      lastJoined: Date.now(),
      playAsUuid: characterUuidForSession,
      playAsName: characterRef.current?.name,
    });
  }, [connectedCode, characterUuidForSession]);

  // Keeps a participant in step with the open character: created on first
  // open, renamed if the character is. Every other participant is
  // hand-typed and player-owned.
  const uuid = character?.uuid;
  const name = character?.name;
  useEffect(() => {
    if (!uuid || holdsDmSeat) return;
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
      // Opening a sheet someone else put in the order takes ownership: a
      // DM-brought character is a static projection, the open sheet is live.
      const owned = claimParticipant(current, existing.id, clientId);
      return name ? renameParticipant(owned, existing.id, name) : owned;
    });
  }, [uuid, name, clientId, holdsDmSeat, update]);

  // Publishes the projection the party sees (`setVitals`/`update` both
  // no-op on an unchanged result, so this doesn't broadcast every render).
  //
  // On first opening a character at a live, connected table, adopts the
  // row's HP into the sheet instead (row -> sheet) rather than the reverse:
  // a DM oversight write only reaches a closed sheet via the row, and
  // publishing the sheet's stale number first would silently revert it.
  // Only currHp/tempHp — max HP and AC derive from the sheet's own formulas.
  // Skipped while offline, where the sheet is the document of record.
  const adoptedVitalsForRef = useRef<UUID | undefined>();
  useEffect(() => {
    if (!character || !uuid || holdsDmSeat) return;
    if (adoptedVitalsForRef.current !== uuid) {
      adoptedVitalsForRef.current = uuid;
      const vitals = connectedRef.current
        ? encounterRef.current.participants.find(
            (p) => p.characterUuid === uuid,
          )?.vitals
        : undefined;
      if (vitals) {
        let adopted = false;
        if (vitals.currHp !== character.currHp) {
          dispatch(updateAt(charPath(FIELD.currHp), vitals.currHp));
          adopted = true;
        }
        if (vitals.tempHp !== undefined && vitals.tempHp !== character.tempHp) {
          dispatch(updateAt(charPath(FIELD.tempHp), vitals.tempHp));
          adopted = true;
        }
        // Re-renders with the reconciled sheet next; publishing now would
        // broadcast the number being replaced.
        if (adopted) return;
      }
    }
    update((current) => {
      const mine = current.participants.find((p) => p.characterUuid === uuid);
      if (!mine) return current;
      return setVitals(current, mine.id, characterVitals(character));
    });
  }, [character, uuid, holdsDmSeat, update]);

  const self = holdsDmSeat ? undefined : participantFor(encounter, uuid);

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
      setSheetOffered: (id, claimable) => {
        // Re-offering re-arms the one-answer-per-offer guard in
        // `onClaimSheet`, so a sheet whose claimant never opened it can be
        // offered again.
        if (claimable) answeredClaimsRef.current.delete(id);
        update((current) => offerSheet(current, id, claimable));
      },
      claimables: claimableSheets(encounter, clientId),
      present,
      quietClients,
      // Offering plus a nudge — a ghost target costs nothing since the
      // offer still stands for pickup.
      assignSheetTo: (participantId, toClientId) => {
        answeredClaimsRef.current.delete(participantId);
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
      isDm: holdsDmSeat,
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
      quietClients,
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
