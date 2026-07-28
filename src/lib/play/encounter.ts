import { UUID } from "crypto";
import { ConditionName } from "src/lib/play/conditions";

// The three parts of the action economy a turn spends. `free` and `special` are
// deliberately absent: neither is a finite per-turn resource, and giving them a
// slot would imply a budget 5e doesn't have.
//
// These live here rather than with the `usePlayTurn` hook because the economy is
// encounter state — the hook is a view onto it, and having the hook own the type
// made the import graph a cycle. `use-turn` re-exports them for the components
// that render the economy; **anything upstream of the hook must import them from
// here**, or the cycle comes back (a component pulls in `use-encounter`, which
// pulls in `use-turn`, which needs the half-initialised `use-encounter`).
export type EconomySlot = "action" | "bonusAction" | "reaction";

export const ECONOMY_SLOTS: EconomySlot[] = [
  "action",
  "bonusAction",
  "reaction",
];

// The encounter: round, order, and the transient state a fight puts on the
// people in it.
//
// **It is its own object, never a field on `Character`.** With one player that
// looks like an arbitrary distinction — a round counter could live on the sheet
// — but a round belongs to no single character, and every player holding their
// own copy of "whose turn is it" is the bug that makes a shared encounter
// impossible later. Keeping it separate is what makes the session layer an
// increment rather than a migration.
//
// Everything here is pure. Storage and React live in `use-encounter.tsx`.

export interface ActiveCondition {
  name: ConditionName;
  // Rounds left, ticked down at the start of the bearer's turn. Absent means
  // indefinite — "until someone removes it", which is most of them.
  rounds?: number;
}

export interface Concentration {
  spell: string;
  // The round it started, so the rail can say how long it's been held.
  startedRound: number;
}

export type TurnEconomy = Record<EconomySlot, boolean>;

export const NOTHING_SPENT: TurnEconomy = {
  action: false,
  bonusAction: false,
  reaction: false,
};

// The slice of a character the rest of the party can see. Deliberately tiny:
// this is what's visible across a table anyway — how hurt someone looks, what
// they're wearing, what's wrong with them. Nothing here is a secret, which is
// what lets the session broadcast it without asking.
export interface ParticipantVitals {
  currHp: number;
  maxHp: number;
  ac: number;
  // Optional so older stored encounters need no migration; absent means 0.
  // On the wire because damage is: temp HP absorbs first, and a DM applying
  // "you take 12" can't do that arithmetic against a number they can't see.
  tempHp?: number;
  // Death-save progress, present only while it means something (down, or
  // saves in progress). In the projection because a table watches these
  // together — the DM always sees them; the party by default, behind
  // `Encounter.hideDeathSaves`.
  deathSaves?: { successes: number; failures: number };
}

export interface Participant {
  id: string;
  name: string;
  // Set for a character *some* browser has open — in a party session, every
  // player contributes one. Absent for someone typed into the order by hand
  // (a monster, an absent ally).
  characterUuid?: UUID;
  // Which client contributed this participant, so a client leaving takes its own
  // character with it and nothing else.
  ownerClientId?: string;
  initiative: number;
  // Advisory: what this participant has spent on the current turn.
  spent: TurnEconomy;
  conditions: ActiveCondition[];
  concentration?: Concentration;
  // Set by the DM: this sheet may be picked up and played by someone at the
  // table who came without one. **Offering is a deliberate per-sheet act** —
  // bringing a sheet into the order shows its projection, offering it is what
  // consents to the whole sheet travelling. The flag survives a pickup, so the
  // sheet reverts to offered when its player leaves.
  claimable?: boolean;
  // Staged but not revealed: the ambush in the trees, the second wave. Hidden
  // rows render only for whoever runs the table — on player clients they
  // vanish from the rail, and a hidden combatant's turn reads as "the DM is
  // up to something". This is dramaturgy, not privacy: the row still travels
  // with the encounter (a shared object has no per-recipient copies), it just
  // isn't drawn. Real secrets never enter the encounter at all.
  hidden?: boolean;
  // Kept current by the owning client — with one deliberate exception, a DM
  // edit. See `mergeEncounter`.
  vitals?: ParticipantVitals;
  // Bumped on every real vitals change. This is what lets the merge tell "the
  // DM just set your HP" (a newer write, accept it) apart from "a peer echoed a
  // stale copy of you" (an older one, keep your own) — without it those two
  // arrive looking identical, and the fix for one is the bug in the other.
  vitalsRev?: number;
  // Bumped on every change to the *rest* of the row — initiative, conditions,
  // concentration, spent, the offer flag. The row is two independently
  // versioned lanes, not one, because the two are written by different people
  // at the same instant all evening: the DM types your damage while you tick
  // the spell you're holding. Resolving the row as one blob means one of those
  // two disappears. See `mergeEncounter`.
  rev?: number;
}

// How much of the table's health the players get to see — the DM's call,
// because it's table style, not privacy: some tables narrate wounds, some
// read numbers out. On the encounter (not in settings) because policy has to
// reach every client, and LWW merges it like any other table fact. What it
// never touches: your own vitals (always yours to see), the DM's board
// (running the table needs the numbers), and hidden rows (a separate axis).
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
  // 0 means "not in combat". The encounter object always exists — the turn
  // economy and conditions are useful outside a fight too — so `round` is what
  // distinguishes tracking a fight from merely being open.
  round: number;
  turnIndex: number;
  participants: Participant[];
  // Who holds the DM seat *right now*, by client id. A **UI gate only**: it
  // decides which controls render, never who may write. That isn't about absent
  // DMs — it's that the encounter has to keep working with no session at all
  // (solo prep, a one-shot, testing), so an unclaimed seat means everybody gets
  // the controls.
  dmClientId?: string;
  // The durable half of the seat. `clientId` is **per-tab**, so a reload mints a
  // new one and would otherwise cost the DM their seat on every refresh; the
  // token lives in the DM's own browser and outlives the tab, which is what lets
  // them walk back in and reclaim. Leaving clears `dmClientId` but keeps this,
  // so the table isn't gated on someone who's gone while the seat still knows
  // whose it is.
  dmToken?: string;
  // The table's health-sharing policy. Absent means `DEFAULT_SHARING`.
  sharing?: SharingLevel;
  // Table policy like `sharing`: death saves show to the party by default
  // (the DM's view never hides them); some tables keep the drama private.
  hideDeathSaves?: boolean;
  // Last-write-wins bookkeeping for the party session. Absent on a purely local
  // encounter, which is why every read is `?? 0` rather than a migration.
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

// Edit one participant's row, bumping its `rev`. Everything that changes a
// participant goes through here — except `setVitals`, which owns the other
// lane and bumps `vitalsRev` instead. Keeping the two counters apart is what
// lets a DM's damage and a player's concentration, written at the same
// moment, both survive; see `mergeEncounter`.
function mapParticipant(
  encounter: Encounter,
  id: string,
  change: (participant: Participant) => Participant,
): Encounter {
  return mapRow(encounter, id, (p) => ({
    ...change(p),
    rev: (p.rev ?? 0) + 1,
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

// Adding an id that's already in the order is a no-op rather than a duplicate.
// The case that matters: a DM brings a character into the session and the player
// who owns it then opens it themselves. Both derive the same participant id from
// the character uuid, and the fight should contain one of them.
//
// Out of combat the newcomer is appended — array position means nothing there,
// every view sorts for display. **Mid-combat the array is the turn order**, so
// a late arrival (reinforcements, a player joining round 3) is spliced into
// initiative position instead of acting last regardless of what they rolled.
// Two rules fall out of that:
//
// - **A tie goes after everyone already holding that count.** Deterministic,
//   and the DM breaks ties the way a table does — by nudging a number — rather
//   than by this function inventing a coin flip.
// - **A slot that already passed this round stays passed.** Inserting at or
//   before the current turn means the newcomer's count came and went; they
//   first act next round, and `turnIndex` moves up one so whoever is acting
//   right now keeps acting.
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

// The placement half of `addParticipant`, taking a whole participant so the
// session merge can re-seat one that already carries conditions and a spent
// economy (a joiner being restored to a fight in progress) without wiping
// them. No duplicate check — the callers own that.
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
  // Removing someone earlier in the order would otherwise shift the current
  // turn onto whoever moved up into their place.
  const turnIndex =
    index < encounter.turnIndex ? encounter.turnIndex - 1 : encounter.turnIndex;
  return {
    ...encounter,
    participants,
    turnIndex: participants.length === 0 ? 0 : turnIndex % participants.length,
  };
}

// The fallen: hand-typed combatants at zero HP. Character-backed rows are
// exempt — a downed character is making death saves, not leaving the fight,
// and their row belongs to whoever is playing them.
export function fallenParticipants(encounter: Encounter): Participant[] {
  return encounter.participants.filter(
    (p) => !p.characterUuid && p.vitals !== undefined && p.vitals.currHp <= 0,
  );
}

// Sweep the fallen off the table in one move — the between-fights reset that
// otherwise costs a DM one click per dead goblin. Goes through
// `removeParticipant` so the turn index stays on whoever is acting.
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
  return mapParticipant(encounter, id, (p) => ({ ...p, initiative }));
}

// Change an initiative mid-fight and move the row where the number now says —
// the DM splitting a pack that was added on one roll ("the two captains act
// separately after all"). Out of combat it's just `setInitiative`: nothing is
// seated yet. In combat the participant is lifted out and re-inserted through
// the same rules as a late arrival, with one extra guarantee: whoever is
// acting keeps acting, even if it's the row being moved.
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
  const seated = insertParticipant(lifted, { ...moving, initiative });
  const turnIndex = seated.participants.findIndex((p) => p.id === currentId);
  return turnIndex === -1 ? seated : { ...seated, turnIndex };
}

// Highest first, and ties broken by name so the order is stable across
// re-sorts rather than depending on insertion. (5e breaks initiative ties with
// a DEX check or a coin flip; neither is something the sheet should invent.)
export function inInitiativeOrder(participants: Participant[]): Participant[] {
  return [...participants].sort(
    (a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name),
  );
}

// --- Running the fight ------------------------------------------------------

// What a turn boundary produced, for the caller to act on: the trigger events
// worth planning against, and the conditions that ran out.
export interface TurnAdvance {
  encounter: Encounter;
  // The participant whose turn just started, if any.
  active?: Participant;
  // Conditions that expired on the incoming participant, by name.
  expired: ConditionName[];
  // True when the order wrapped and the round counter moved.
  newRound: boolean;
}

// Sort into initiative order and start round 1 on whoever is first.
export function startCombat(encounter: Encounter): Encounter {
  const participants = inInitiativeOrder(encounter.participants).map((p) => ({
    ...p,
    spent: NOTHING_SPENT,
  }));
  return { ...encounter, round: 1, turnIndex: 0, participants };
}

// Drop back out of combat. Conditions and concentration **survive** — a fight
// ending is not a rest, and a poisoned character is still poisoned afterwards.
// Only the round, the order position and the per-turn economy reset.
export function endCombat(encounter: Encounter): Encounter {
  return {
    ...encounter,
    round: 0,
    turnIndex: 0,
    participants: encounter.participants.map((p) => ({
      ...p,
      spent: NOTHING_SPENT,
    })),
  };
}

// Move to the next participant, wrapping into a new round.
//
// A turn *starting* is what does the work: the incoming participant's economy
// resets (including their reaction, which in 5e refreshes at the start of your
// turn, not the end) and their conditions tick down. Doing it on the way in
// rather than on the way out means a condition with "1 round" left is still
// visible for the whole of the turn it applies to.
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
    return { ...p, spent: NOTHING_SPENT, conditions };
  });

  return {
    encounter: {
      ...encounter,
      round: newRound ? encounter.round + 1 : encounter.round,
      turnIndex: nextIndex,
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
  return mapParticipant(encounter, id, (p) => ({
    ...p,
    spent: { ...p.spent, [slot]: spent },
  }));
}

export function clearSpent(encounter: Encounter, id: string): Encounter {
  return mapParticipant(encounter, id, (p) => ({ ...p, spent: NOTHING_SPENT }));
}

// Adding a condition already held replaces it, so re-applying with a fresh
// duration refreshes rather than stacking a second copy.
export function addCondition(
  encounter: Encounter,
  id: string,
  condition: ActiveCondition,
): Encounter {
  return mapParticipant(encounter, id, (p) => ({
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
  return mapParticipant(encounter, id, (p) => ({
    ...p,
    conditions: p.conditions.filter((c) => c.name !== name),
  }));
}

// Damage as tables speak it — "you take 12" — resolved against the vitals the
// way 5e resolves it: temporary hit points absorb first, the remainder comes
// off current HP, floored at 0. Returns what actually happened so a caller
// can say so (a concentration DC is set by damage *taken*, absorbed or not).
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

// The other half of the table's arithmetic — "you regain 10". Healing never
// restores temporary hit points and never overshoots the maximum.
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
  // Identical vitals must not produce a new object: this is written from an
  // effect on every character change, and a fresh encounter each time would
  // broadcast a revision bump per keystroke.
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
  // `mapRow`, not `mapParticipant`: a vitals write must leave the row's own
  // `rev` alone, or it would collide with the edits it is meant to coexist
  // with.
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
  return mapParticipant(encounter, id, (p) => ({ ...p, claimable }));
}

// The offered sheets someone without a character could pick up right now. "In
// play" is expressed by ownership: a sheet sitting with the DM's client is a
// static projection waiting for a player, one owned by anybody else has a
// browser keeping it live.
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

// Take over a participant someone else contributed.
//
// This is what happens when a DM brings a character into the session and the
// player it belongs to then opens it: the DM's copy is a static projection, the
// player's is live, and the live one should win. Ownership decides whose vitals
// are authoritative in `mergeEncounter` and who takes the participant with them
// when they leave, so it has to move with the sheet.
export function claimParticipant(
  encounter: Encounter,
  id: string,
  clientId: string,
): Encounter {
  const existing = encounter.participants.find((p) => p.id === id);
  if (!existing || existing.ownerClientId === clientId) return encounter;
  return mapParticipant(encounter, id, (p) => ({
    ...p,
    ownerClientId: clientId,
  }));
}

// Take the seat. Both halves move together: the tab that holds it now, and the
// browser that may take it back later.
export function claimDmSeat(
  encounter: Encounter,
  clientId: string,
  token: string,
): Encounter {
  return { ...encounter, dmClientId: clientId, dmToken: token };
}

// Give it up for good — the opposite of `withoutClient`, which only puts the
// seat down. Releasing drops the token too, so coming back doesn't silently
// make you the DM again.
export function releaseDmSeat(encounter: Encounter): Encounter {
  return { ...encounter, dmClientId: undefined, dmToken: undefined };
}

// Pick the seat back up in a new tab. This is what makes a refresh, a crash or a
// dropped connection cost the DM nothing: the token is the same browser, so the
// seat recognises them without anyone pressing a button.
export function reclaimDmSeat(
  encounter: Encounter,
  clientId: string,
  token: string | undefined,
): Encounter {
  if (!token || encounter.dmToken !== token) return encounter;
  if (encounter.dmClientId === clientId) return encounter;
  return { ...encounter, dmClientId: clientId };
}

// Whether this client should be offered the controls that move the fight along.
// An unclaimed seat means everyone can, which is the right default for a table
// whose DM isn't in the app at all.
export function canRunCombat(encounter: Encounter, clientId: string): boolean {
  return !encounter.dmClientId || encounter.dmClientId === clientId;
}

export function setSharing(
  encounter: Encounter,
  sharing: SharingLevel,
): Encounter {
  if ((encounter.sharing ?? DEFAULT_SHARING) === sharing) return encounter;
  return { ...encounter, sharing };
}

export function setHideDeathSaves(
  encounter: Encounter,
  hide: boolean,
): Encounter {
  if (!!encounter.hideDeathSaves === hide) return encounter;
  return { ...encounter, hideDeathSaves: hide };
}

export function setHidden(
  encounter: Encounter,
  id: string,
  hidden: boolean,
): Encounter {
  const existing = encounter.participants.find((p) => p.id === id);
  if (!existing || !!existing.hidden === hidden) return encounter;
  return mapParticipant(encounter, id, (p) => ({ ...p, hidden }));
}

// What a player client draws. The turn order itself is untouched — a hidden
// ambusher still occupies its slot, the players just can't see whose it is.
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
  return mapParticipant(encounter, id, (p) => ({ ...p, concentration }));
}
