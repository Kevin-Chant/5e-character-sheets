import { UUID } from "crypto";
import { ConditionName } from "src/lib/play/conditions";

// Action-economy slots. `free`/`special` are omitted: not finite per-turn resources.
// Defined here (not in `usePlayTurn`) to avoid an import cycle; `use-turn` re-exports
// them, so anything upstream of that hook must import from here.
export type EconomySlot = "action" | "bonusAction" | "reaction";

export const ECONOMY_SLOTS: EconomySlot[] = [
  "action",
  "bonusAction",
  "reaction",
];

// The encounter: round, order, and transient per-participant state. Its own
// object, not a field on `Character` — a round belongs to no single character.
// Pure functions only; storage and React live in `use-encounter.tsx`.

export interface ActiveCondition {
  name: ConditionName;
  // Rounds left, ticked down at the start of the bearer's turn. Absent = indefinite.
  rounds?: number;
  // Who placed it (e.g. Hex's caster-only benefit check in `condition-mechanics.ts`).
  // Absent means unowned.
  from?: string;
}

export interface Concentration {
  spell: string;
  startedRound: number;
}

export type TurnEconomy = Record<EconomySlot, boolean>;

export const NOTHING_SPENT: TurnEconomy = {
  action: false,
  bonusAction: false,
  reaction: false,
};

// What the rest of the party can see of a character. Contains nothing secret,
// so the session can broadcast it without asking.
export interface ParticipantVitals {
  currHp: number;
  maxHp: number;
  ac: number;
  // Absent means 0. Sent because temp HP absorbs first, and a DM applying
  // "you take 12" needs it to do that arithmetic.
  tempHp?: number;
  // Present only while it means something (down, or saves in progress).
  // Shown to the DM always; to the party unless `Encounter.hideDeathSaves`.
  deathSaves?: { successes: number; failures: number };
}

export interface Participant {
  id: string;
  name: string;
  // Set when some browser has the character open. Absent for a hand-typed
  // combatant (monster, absent ally).
  characterUuid?: UUID;
  // Which client contributed this participant, so a client leaving takes its
  // own character with it and nothing else.
  ownerClientId?: string;
  initiative: number;
  spent: TurnEconomy;
  conditions: ActiveCondition[];
  concentration?: Concentration;
  // DM-set: this sheet may be picked up by someone at the table without one.
  // Survives a pickup — reverts to offered when the player leaves.
  claimable?: boolean;
  // Which side of the screen the row fights for (target pickers, grouping).
  // DM's call; absent falls back to the `isFoe` heuristic. Advisory only —
  // nothing rules on it.
  side?: "party" | "foe";
  // Staged but not revealed to players (ambush, second wave). The row still
  // travels with the encounter, it just isn't drawn on non-DM clients.
  hidden?: boolean;
  // Kept current by the owning client, except a DM edit — see `mergeEncounter`.
  vitals?: ParticipantVitals;

  // Five independently versioned lanes rather than one counter, because
  // different people write different fields of a row at the same instant
  // (DM writes damage, player ticks a condition). Declared once in
  // `PARTICIPANT_LANES` (`session.ts`); every mutator bumps the lane it
  // writes. All optional: absent reads as 0 for pre-lane stored encounters.

  // Bumped on every real vitals change, so merge can tell a newer write from
  // a stale echoed one.
  vitalsRev?: number;
  // Name, ownership, offer flag, hidden, side.
  identityRev?: number;
  // Conditions and concentration.
  statusRev?: number;
  // Initiative position.
  initiativeRev?: number;
  // Turn-economy spend. The chattiest lane.
  economyRev?: number;
}

// Counters a participant mutator may bump — everything except `vitalsRev`,
// which `setVitals` owns on its own path.
export type ParticipantLane =
  | "identityRev"
  | "statusRev"
  | "initiativeRev"
  | "economyRev";

// How much health the players see — DM's table-style call, not privacy.
// Lives on the encounter (not settings) so it reaches every client and
// merges LWW like any other table fact. Never touches: your own vitals, the
// DM's board, or hidden rows.
export type SharingLevel =
  | "exact" // numbers for everyone, monsters included
  | "bloodied-enemies" // allies in numbers, monsters by description
  | "bloodied" // everyone by description
  | "private"; // nothing about anyone but yourself

export const SHARING_LEVELS: SharingLevel[] = [
  "exact",
  "bloodied-enemies",
  "bloodied",
  "private",
];

export const DEFAULT_SHARING: SharingLevel = "bloodied-enemies";

export const SHARING_LABELS: Record<SharingLevel, string> = {
  exact: "Open numbers — exact HP for everyone, monsters included",
  "bloodied-enemies": "Bloodied enemies — party in numbers, monsters by look",
  bloodied: "Bloodied everyone — health by look only",
  private: "Private — nobody sees anyone else's health",
};

// What one player client may render of a participant's vitals.
export function vitalsVisibility(
  level: SharingLevel | undefined,
  isCharacter: boolean,
): "exact" | "descriptor" | "none" {
  switch (level ?? DEFAULT_SHARING) {
    case "exact":
      return "exact";
    case "bloodied-enemies":
      return isCharacter ? "exact" : "descriptor";
    case "bloodied":
      return "descriptor";
    case "private":
      return "none";
  }
}

// The across-the-table read: 5e's community shorthand for "at or under half".
export function healthDescriptor(
  vitals: ParticipantVitals,
): "Healthy" | "Bloodied" | "Down" {
  if (vitals.currHp <= 0) return "Down";
  if (vitals.maxHp > 0 && vitals.currHp * 2 <= vitals.maxHp) return "Bloodied";
  return "Healthy";
}

export interface Encounter {
  // 0 = not in combat. The encounter object always exists (turn economy and
  // conditions are useful outside a fight too).
  round: number;
  turnIndex: number;
  participants: Participant[];
  // Combat lane: `round`+`turnIndex` move together as one atomic pair on
  // start/end/advance, because 5e has no additive turn advance — two
  // concurrent "next turn"s must collapse to one, not merge into an index
  // past the round's end. Roster inserts shift `turnIndex` but don't bump
  // this counter; merge clamps the index against the merged roster instead.
  turnSeq?: number;
  // Policy lane: `sharing` + `hideDeathSaves`, versioned apart from combat so
  // a toggle flip can't race a turn advance.
  policyRev?: number;
  // Who holds the DM seat right now. UI gate only — decides which controls
  // render, never who may write, since the encounter must keep working with
  // no session at all (solo prep, one-shot, testing). Unclaimed = everyone
  // gets the controls.
  dmClientId?: string;
  // Durable half of the seat. `dmClientId` is per-tab (a reload mints a new
  // one); this token outlives the tab so the DM can reclaim it. Leaving
  // clears `dmClientId` but keeps this.
  dmToken?: string;
  // Seat lane, bumped on claim/release/reclaim. A peer that has never heard
  // of the DM must not erase them by winning a revision race (two players
  // joining at once, one adopting the other's stale state) — that race also
  // takes `dmToken` with it, making the loss unrecoverable rather than
  // merely unheld.
  seatRev?: number;
  // Absent means `DEFAULT_SHARING`.
  sharing?: SharingLevel;
  // Death saves show to the party by default; DM always sees them.
  hideDeathSaves?: boolean;
  // Document lane: bumped on every local write. Decides only the roster
  // (which rows exist, in what order) — every field with its own lane
  // resolves on that lane instead. Membership merge is bespoke/asymmetric,
  // see `mergeEncounter`. Absent on a purely local encounter; reads as `?? 0`.
  revision?: number;
  revisedBy?: string;
}

export const EMPTY_ENCOUNTER: Encounter = {
  round: 0,
  turnIndex: 0,
  participants: [],
};

export function isInCombat(encounter: Encounter): boolean {
  return encounter.round > 0;
}

export function currentParticipant(
  encounter: Encounter,
): Participant | undefined {
  return encounter.participants[encounter.turnIndex];
}

export function participantFor(
  encounter: Encounter,
  characterUuid: UUID | undefined,
): Participant | undefined {
  if (!characterUuid) return undefined;
  return encounter.participants.find((p) => p.characterUuid === characterUuid);
}

// Edit one participant's row, bumping the counter of the lane the edit
// belongs to. `setVitals` owns the fifth lane on its own path.
function mapParticipant(
  encounter: Encounter,
  id: string,
  lane: ParticipantLane,
  change: (participant: Participant) => Participant,
): Encounter {
  return mapRow(encounter, id, (p) => ({
    ...change(p),
    [lane]: (p[lane] ?? 0) + 1,
  }));
}

function mapRow(
  encounter: Encounter,
  id: string,
  change: (participant: Participant) => Participant,
): Encounter {
  return {
    ...encounter,
    participants: encounter.participants.map((p) =>
      p.id === id ? change(p) : p,
    ),
  };
}

// --- Roster -----------------------------------------------------------------

// Adding an id already in the order is a no-op, not a duplicate — covers a DM
// bringing a character in and its player then opening it themselves (same id,
// derived from the character uuid).
//
// Out of combat the newcomer is appended (array order is meaningless there).
// Mid-combat the array *is* turn order, so a late arrival is spliced into
// initiative position rather than appended:
// - A tie goes after everyone already holding that count (deterministic).
// - A slot that already passed this round stays passed: inserting at or
//   before the current turn shifts `turnIndex` up one so the current actor
//   keeps acting; the newcomer first acts next round.
export function addParticipant(
  encounter: Encounter,
  participant: Omit<Participant, "spent" | "conditions">,
): Encounter {
  if (encounter.participants.some((p) => p.id === participant.id)) {
    return encounter;
  }
  return insertParticipant(encounter, {
    ...participant,
    spent: NOTHING_SPENT,
    conditions: [],
  });
}

// Placement half of `addParticipant`, taking a whole participant so a merge
// can re-seat one with existing conditions/spent economy without wiping them.
// No duplicate check — callers own that.
export function insertParticipant(
  encounter: Encounter,
  participant: Participant,
): Encounter {
  if (!isInCombat(encounter)) {
    return {
      ...encounter,
      participants: [...encounter.participants, participant],
    };
  }
  const at = encounter.participants.findIndex(
    (p) => p.initiative < participant.initiative,
  );
  const index = at === -1 ? encounter.participants.length : at;
  const participants = [
    ...encounter.participants.slice(0, index),
    participant,
    ...encounter.participants.slice(index),
  ];
  return {
    ...encounter,
    participants,
    turnIndex:
      index <= encounter.turnIndex
        ? encounter.turnIndex + 1
        : encounter.turnIndex,
  };
}

export function removeParticipant(encounter: Encounter, id: string): Encounter {
  const index = encounter.participants.findIndex((p) => p.id === id);
  if (index === -1) return encounter;
  const participants = encounter.participants.filter((p) => p.id !== id);
  // Keep the current turn on the same participant despite the shift.
  const turnIndex =
    index < encounter.turnIndex ? encounter.turnIndex - 1 : encounter.turnIndex;
  return {
    ...encounter,
    participants,
    turnIndex: participants.length === 0 ? 0 : turnIndex % participants.length,
  };
}

// Hand-typed combatants at zero HP. Character-backed rows are exempt — a
// downed character is making death saves, not leaving the fight.
export function fallenParticipants(encounter: Encounter): Participant[] {
  return encounter.participants.filter(
    (p) => !p.characterUuid && p.vitals !== undefined && p.vitals.currHp <= 0,
  );
}

// Sweep the fallen off the table in one move. Goes through `removeParticipant`
// so the turn index stays on whoever is acting.
export function clearFallen(encounter: Encounter): Encounter {
  return fallenParticipants(encounter).reduce(
    (current, p) => removeParticipant(current, p.id),
    encounter,
  );
}

export function setInitiative(
  encounter: Encounter,
  id: string,
  initiative: number,
): Encounter {
  return mapParticipant(encounter, id, "initiativeRev", (p) => ({
    ...p,
    initiative,
  }));
}

// Change an initiative mid-fight and move the row where the number now says.
// Out of combat it's just `setInitiative`. In combat the row is lifted out
// and re-inserted via the late-arrival rules, guaranteeing the current actor
// keeps acting even if it's the row being moved.
export function reseatParticipant(
  encounter: Encounter,
  id: string,
  initiative: number,
): Encounter {
  if (!isInCombat(encounter)) return setInitiative(encounter, id, initiative);
  const moving = encounter.participants.find((p) => p.id === id);
  if (!moving) return encounter;
  if (moving.initiative === initiative) return encounter;
  const currentId = currentParticipant(encounter)?.id;
  const lifted = removeParticipant(encounter, id);
  const seated = insertParticipant(lifted, {
    ...moving,
    initiative,
    // Lifted/re-inserted rather than mapped, so the lane bump is manual here.
    initiativeRev: (moving.initiativeRev ?? 0) + 1,
  });
  const turnIndex = seated.participants.findIndex((p) => p.id === currentId);
  return turnIndex === -1 ? seated : { ...seated, turnIndex };
}

// Highest first; ties broken by name for a stable sort (5e's own tiebreak —
// DEX check or coin flip — isn't something the sheet should invent).
export function inInitiativeOrder(participants: Participant[]): Participant[] {
  return [...participants].sort(
    (a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name),
  );
}

// --- Running the fight ------------------------------------------------------

// What a turn boundary produced: the trigger events worth planning against
// and the conditions that ran out.
export interface TurnAdvance {
  encounter: Encounter;
  active?: Participant;
  expired: ConditionName[];
  newRound: boolean;
}

// Sort into initiative order and start round 1.
export function startCombat(encounter: Encounter): Encounter {
  const participants = inInitiativeOrder(encounter.participants).map((p) => ({
    ...p,
    spent: NOTHING_SPENT,
    economyRev: (p.economyRev ?? 0) + 1,
  }));
  return {
    ...encounter,
    round: 1,
    turnIndex: 0,
    turnSeq: (encounter.turnSeq ?? 0) + 1,
    participants,
  };
}

// Drop back out of combat. Conditions and concentration survive — only the
// round, order position, and per-turn economy reset.
export function endCombat(encounter: Encounter): Encounter {
  return {
    ...encounter,
    round: 0,
    turnIndex: 0,
    turnSeq: (encounter.turnSeq ?? 0) + 1,
    participants: encounter.participants.map((p) => ({
      ...p,
      spent: NOTHING_SPENT,
      economyRev: (p.economyRev ?? 0) + 1,
    })),
  };
}

// Move to the next participant, wrapping into a new round. The incoming
// participant's economy resets (reaction included — 5e refreshes it at the
// start of your turn) and their conditions tick down on the way in, so a
// condition with 1 round left stays visible for that whole turn.
export function advanceTurn(encounter: Encounter): TurnAdvance {
  if (encounter.participants.length === 0 || !isInCombat(encounter)) {
    return { encounter, expired: [], newRound: false };
  }

  const nextIndex = (encounter.turnIndex + 1) % encounter.participants.length;
  const newRound = nextIndex === 0;
  const expired: ConditionName[] = [];

  const participants = encounter.participants.map((p, i) => {
    if (i !== nextIndex) return p;
    const conditions = p.conditions.flatMap((condition) => {
      if (condition.rounds === undefined) return [condition];
      const rounds = condition.rounds - 1;
      if (rounds <= 0) {
        expired.push(condition.name);
        return [];
      }
      return [{ ...condition, rounds }];
    });
    // Both lanes bump even if the values happen not to change — "whose turn
    // began" must itself be ordered against a peer's concurrent edit.
    return {
      ...p,
      spent: NOTHING_SPENT,
      conditions,
      economyRev: (p.economyRev ?? 0) + 1,
      statusRev: (p.statusRev ?? 0) + 1,
    };
  });

  return {
    encounter: {
      ...encounter,
      round: newRound ? encounter.round + 1 : encounter.round,
      turnIndex: nextIndex,
      turnSeq: (encounter.turnSeq ?? 0) + 1,
      participants,
    },
    active: participants[nextIndex],
    expired,
    newRound,
  };
}

// --- Per-participant state --------------------------------------------------

export function setSpent(
  encounter: Encounter,
  id: string,
  slot: EconomySlot,
  spent: boolean,
): Encounter {
  return mapParticipant(encounter, id, "economyRev", (p) => ({
    ...p,
    spent: { ...p.spent, [slot]: spent },
  }));
}

export function clearSpent(encounter: Encounter, id: string): Encounter {
  return mapParticipant(encounter, id, "economyRev", (p) => ({
    ...p,
    spent: NOTHING_SPENT,
  }));
}

// Re-adding a condition already held replaces it (refresh, not stack).
export function addCondition(
  encounter: Encounter,
  id: string,
  condition: ActiveCondition,
): Encounter {
  return mapParticipant(encounter, id, "statusRev", (p) => ({
    ...p,
    conditions: [
      ...p.conditions.filter((c) => c.name !== condition.name),
      condition,
    ],
  }));
}

export function removeCondition(
  encounter: Encounter,
  id: string,
  name: ConditionName,
): Encounter {
  return mapParticipant(encounter, id, "statusRev", (p) => ({
    ...p,
    conditions: p.conditions.filter((c) => c.name !== name),
  }));
}

// Temp HP absorbs first, remainder comes off current HP, floored at 0.
export function applyDamage(
  vitals: ParticipantVitals,
  amount: number,
): ParticipantVitals {
  const damage = Math.max(0, Math.floor(amount));
  const temp = vitals.tempHp ?? 0;
  const absorbed = Math.min(temp, damage);
  return {
    ...vitals,
    tempHp: temp - absorbed,
    currHp: Math.max(0, vitals.currHp - (damage - absorbed)),
  };
}

// Healing never restores temp HP and never overshoots the maximum.
export function applyHealing(
  vitals: ParticipantVitals,
  amount: number,
): ParticipantVitals {
  const healing = Math.max(0, Math.floor(amount));
  return {
    ...vitals,
    currHp: Math.min(vitals.maxHp, vitals.currHp + healing),
  };
}

export function setVitals(
  encounter: Encounter,
  id: string,
  vitals: ParticipantVitals,
): Encounter {
  const existing = encounter.participants.find((p) => p.id === id)?.vitals;
  // No-op on identical vitals: written from an effect on every character
  // change, so a new object each time would broadcast a bump per keystroke.
  if (
    existing &&
    existing.currHp === vitals.currHp &&
    existing.maxHp === vitals.maxHp &&
    existing.ac === vitals.ac &&
    (existing.tempHp ?? 0) === (vitals.tempHp ?? 0) &&
    (existing.deathSaves?.successes ?? 0) ===
      (vitals.deathSaves?.successes ?? 0) &&
    (existing.deathSaves?.failures ?? 0) === (vitals.deathSaves?.failures ?? 0)
  ) {
    return encounter;
  }
  // `mapRow`, not `mapParticipant`: leaves the other lanes' revs untouched.
  return mapRow(encounter, id, (p) => ({
    ...p,
    vitals,
    vitalsRev: (p.vitalsRev ?? 0) + 1,
  }));
}

// Offer a brought sheet for pickup, or withdraw the offer.
export function offerSheet(
  encounter: Encounter,
  id: string,
  claimable: boolean,
): Encounter {
  const existing = encounter.participants.find((p) => p.id === id);
  if (!existing || !!existing.claimable === claimable) return encounter;
  return mapParticipant(encounter, id, "identityRev", (p) => ({
    ...p,
    claimable,
  }));
}

// Offered sheets someone without a character could pick up right now: still
// owned by the DM's client (a static projection), not yet claimed by them.
export function claimableSheets(
  encounter: Encounter,
  clientId: string,
): Participant[] {
  return encounter.participants.filter(
    (p) =>
      p.claimable &&
      p.characterUuid &&
      p.ownerClientId === encounter.dmClientId &&
      p.ownerClientId !== clientId,
  );
}

// The DM's explicit `side` wins; without one, no character sheet = foe. The
// explicit flag exists because the heuristic fails both ways (a hand-typed
// NPC ally, a sheet-backed villain). Advisory grouping only.
export function isFoe(participant: Participant): boolean {
  return participant.side
    ? participant.side === "foe"
    : !participant.characterUuid;
}

// Flip a row's side — the DM's roster toggle. Identity lane.
export function setSide(
  encounter: Encounter,
  id: string,
  side: "party" | "foe",
): Encounter {
  const existing = encounter.participants.find((p) => p.id === id);
  if (!existing || existing.side === side) return encounter;
  return mapParticipant(encounter, id, "identityRev", (p) => ({ ...p, side }));
}

// Take over a participant someone else contributed (e.g. a DM-brought
// character, once its player opens it). Ownership decides whose vitals are
// authoritative in `mergeEncounter` and who takes the row when they leave.
export function claimParticipant(
  encounter: Encounter,
  id: string,
  clientId: string,
): Encounter {
  const existing = encounter.participants.find((p) => p.id === id);
  if (!existing || existing.ownerClientId === clientId) return encounter;
  return mapParticipant(encounter, id, "identityRev", (p) => ({
    ...p,
    ownerClientId: clientId,
  }));
}

// Rename a row when its character is renamed.
export function renameParticipant(
  encounter: Encounter,
  id: string,
  name: string,
): Encounter {
  const existing = encounter.participants.find((p) => p.id === id);
  if (!existing || existing.name === name) return encounter;
  return mapParticipant(encounter, id, "identityRev", (p) => ({ ...p, name }));
}

// Take the seat: sets both the current tab and the reclaim token.
export function claimDmSeat(
  encounter: Encounter,
  clientId: string,
  token: string,
): Encounter {
  return {
    ...encounter,
    dmClientId: clientId,
    dmToken: token,
    seatRev: (encounter.seatRev ?? 0) + 1,
  };
}

// Give it up for good (unlike `withoutClient`, which only puts the seat
// down): drops the token too, so coming back doesn't silently reclaim it.
export function releaseDmSeat(encounter: Encounter): Encounter {
  return {
    ...encounter,
    dmClientId: undefined,
    dmToken: undefined,
    seatRev: (encounter.seatRev ?? 0) + 1,
  };
}

// Pick the seat back up in a new tab: a refresh/crash/reconnect is
// recognised via the matching token, no button needed.
export function reclaimDmSeat(
  encounter: Encounter,
  clientId: string,
  token: string | undefined,
): Encounter {
  if (!token || encounter.dmToken !== token) return encounter;
  if (encounter.dmClientId === clientId) return encounter;
  return {
    ...encounter,
    dmClientId: clientId,
    seatRev: (encounter.seatRev ?? 0) + 1,
  };
}

// Whether this client should be offered the combat controls. Unclaimed seat
// means everyone can.
export function canRunCombat(encounter: Encounter, clientId: string): boolean {
  return !encounter.dmClientId || encounter.dmClientId === clientId;
}

export function setSharing(
  encounter: Encounter,
  sharing: SharingLevel,
): Encounter {
  if ((encounter.sharing ?? DEFAULT_SHARING) === sharing) return encounter;
  return { ...encounter, sharing, policyRev: (encounter.policyRev ?? 0) + 1 };
}

export function setHideDeathSaves(
  encounter: Encounter,
  hide: boolean,
): Encounter {
  if (!!encounter.hideDeathSaves === hide) return encounter;
  return {
    ...encounter,
    hideDeathSaves: hide,
    policyRev: (encounter.policyRev ?? 0) + 1,
  };
}

export function setHidden(
  encounter: Encounter,
  id: string,
  hidden: boolean,
): Encounter {
  const existing = encounter.participants.find((p) => p.id === id);
  if (!existing || !!existing.hidden === hidden) return encounter;
  return mapParticipant(encounter, id, "identityRev", (p) => ({
    ...p,
    hidden,
  }));
}

// What a player client draws. Turn order itself is untouched.
export function visibleParticipants(
  participants: Participant[],
): Participant[] {
  return participants.filter((p) => !p.hidden);
}

// The 5e concentration check: DC 10 or half the damage taken, whichever is
// higher (halves round down).
export function concentrationDc(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}

export function setConcentration(
  encounter: Encounter,
  id: string,
  concentration: Concentration | undefined,
): Encounter {
  return mapParticipant(encounter, id, "statusRev", (p) => ({
    ...p,
    concentration,
  }));
}
