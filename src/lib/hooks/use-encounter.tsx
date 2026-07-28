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
  reseatParticipant,
  setConcentration,
  setHidden,
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
  PresentClient,
  receiveState,
  rememberSession,
  withoutClient,
  withoutPresence,
  withPresence,
} from "src/lib/play/session";

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
import { SessionStatus, usePlaySession } from "src/lib/hooks/use-play-session";
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
  hostSession: (reopenCode?: string) => Promise<void>;
  // `displayName` is for the sheetless joiner, who has no character name to
  // announce — the lobby asks what the table should call them.
  joinSession: (code: string, displayName?: string) => Promise<void>;
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
  hostSession: async () => {},
  joinSession: async () => {},
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
  // True between asking to join and the room's first reply. See `mergeEncounter`
  // — a joiner takes the room's state rather than racing it on revision. Only
  // joining sets this: a host creating a realm is the room, and adopting the
  // next arrival's empty state would wipe its own fight.
  const adoptNextStateRef = useRef(false);
  // Read lazily so a browser that never runs a game never writes the key.
  const dmTokenRef = useRef<string>("");
  if (!dmTokenRef.current) dmTokenRef.current = dmToken();

  // Who else is connected, by display name. Transient by design: not part of
  // the encounter (liveness merged by revision would be a category error), so
  // it lives here and clears when the connection does.
  const [present, setPresent] = useState<PresentClient[]>([]);
  // The name we announce. A player with a character announces its name; the
  // sheetless joiner types one into the lobby, which lands here.
  const [customName, setCustomName] = useState<string | undefined>();
  const displayName = character?.name || customName || "Player";
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  // Set once the transport exists, so the hello reply can announce us.
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
        if (!silent) broadcastRef.current?.(next);
        return next;
      });
    },
    [clientId],
  );

  const session = usePlaySession({
    clientId,
    // A peer's state wins or loses by revision; our own vitals survive either
    // way. Applied silently — echoing it back would be an infinite exchange.
    onRemoteState: (incoming) => {
      const adopt = adoptNextStateRef.current;
      adoptNextStateRef.current = false;
      // Every decision here is `receiveState`, which is pure and covered by the
      // multi-client simulator. This hook only knows how to store and send.
      const receipt = receiveState(encounterRef.current, incoming, {
        clientId,
        characterUuid: character?.uuid,
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
    // Someone just arrived and knows nothing. Reply with what we have, without
    // bumping the revision — this is a repeat, not a change. Presence rides
    // along: the reply is how the newcomer learns who is already here.
    onHello: () => {
      broadcastRef.current?.(encounterRef.current);
      announceRef.current(displayNameRef.current);
    },
    onLeave: (fromClientId) => {
      setPresent((current) => withoutPresence(current, fromClientId));
      update((current) => withoutClient(current, fromClientId));
    },
    onPresence: (fromClientId, name) =>
      setPresent((current) => withPresence(current, fromClientId, name)),
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
    onAssignSheet: (participantId, toClientId) => {
      if (toClientId !== clientId) return;
      setPendingAssignmentId(participantId);
    },
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
    // A sheet arrived. Everyone in the realm sees it; only the addressee loads
    // it, as a borrowed character — played, never persisted, because the DM
    // still owns the stored copy and a local save would fork it.
    onSheet: (participantId, incoming, toClientId) => {
      if (toClientId !== clientId) return;
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
  broadcastRef.current = session.broadcastState;
  announceRef.current = session.announcePresence;

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

  // Remember a session on the character once the connection actually succeeded —
  // recording a code the moment it's typed would fill the rejoin list with
  // typos. Keyed on the connected code, so it fires once per connection rather
  // than per render.
  const connectedCode =
    session.status === "connected" ? session.code : undefined;
  // Remembered for this browser whether hosted or joined, and only once the
  // connection succeeded.
  const [lastSession, setLastSession] = useState<string | undefined>(() =>
    readLocalStorage(LAST_SESSION_STORAGE_KEY),
  );
  useEffect(() => {
    if (!connectedCode) return;
    writeLocalStorage(LAST_SESSION_STORAGE_KEY, connectedCode);
    setLastSession(connectedCode);
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
  // Say who we are on connect, and again whenever the name changes (opening a
  // character mid-session renames us to it). Peers upsert, so re-announcing is
  // idempotent.
  useEffect(() => {
    if (!connectedCode) return;
    announceRef.current(displayName);
  }, [connectedCode, displayName]);

  // Presence, pending assignments and queued reports are facts about a
  // connection, and this browser no longer has one.
  const disconnected = session.status !== "connected";
  useEffect(() => {
    if (!disconnected) return;
    setPresent([]);
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
      if (name && existing.name !== name) {
        return {
          ...owned,
          participants: owned.participants.map((p) =>
            p.characterUuid === uuid ? { ...p, name } : p,
          ),
        };
      }
      return owned;
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
      // Whoever opens the realm is running the table — that's what the entry
      // path said they were doing. Claiming happens locally and rides out on the
      // first `hello` reply, since a realm we just created has nobody in it yet.
      hostSession: async (reopenCode) => {
        await session.host(reopenCode);
        update((current) => claimDmSeat(current, clientId, dmTokenRef.current));
      },
      joinSession: async (joinCode, joinDisplayName) => {
        if (joinDisplayName?.trim()) setCustomName(joinDisplayName.trim());
        adoptNextStateRef.current = true;
        await session.join(joinCode);
      },
      leaveSession: () => {
        adoptNextStateRef.current = false;
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
