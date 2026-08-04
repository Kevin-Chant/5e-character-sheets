import { Participant } from "src/lib/play/encounter";

// Is anybody behind this row?
//
// The DM's roster is a list of creatures, and half of them are people. Which
// half was invisible: a player whose phone dropped out mid-fight left a row
// that looked exactly like a player who simply hadn't acted yet — same name,
// same HP, same everything — so the table waited on a turn that was never
// coming, and the only way to find out was to ask out loud.
//
// Nothing in the encounter can answer this, and deliberately so: liveness is
// not a fact the document converges on (see `realm/presence.ts`). It's the
// crossing of two things the DM's own browser already knows — who owns the row
// (`ownerClientId`, which is in the document) and who is answering right now
// (the presence roster, which is not).

export type Liveness =
  // Not a person: a monster, an absent ally, anything typed into the order.
  | "none"
  // A sheet this browser holds — the DM's own brought copy, or their own
  // character. There is no connection to report on; it's right here.
  | "self"
  // Somebody has this sheet open and we heard from them just now.
  | "live"
  // Their client is still in the roster but has gone quiet. Overwhelmingly a
  // backgrounded phone rather than a drop, which is why it is its own word.
  | "quiet"
  // Nobody is answering for this row. Either they closed the tab without
  // saying goodbye (a graceful leave would have taken the row with it), or
  // the sheet was brought by a DM and nobody has picked it up.
  | "gone";

export interface LivenessContext {
  // This browser.
  clientId: string;
  // Client ids currently on the presence roster.
  presentIds: Set<string> | string[];
  // Of those, the ones we haven't heard from lately.
  quietIds: Set<string> | string[];
  // With no session there is nobody to be present, and every row is "self" or
  // "none" — a lone DM's board must not sprout a column of grey dots.
  connected: boolean;
}

const has = (ids: Set<string> | string[], id: string) =>
  Array.isArray(ids) ? ids.includes(id) : ids.has(id);

export function participantLiveness(
  participant: Participant,
  { clientId, presentIds, quietIds, connected }: LivenessContext,
): Liveness {
  // A row with no sheet behind it is a stat block. Nobody is meant to be
  // holding it, so there is nothing to report.
  if (!participant.characterUuid) return "none";
  if (!connected)
    return participant.ownerClientId === clientId ? "self" : "none";
  if (participant.ownerClientId === clientId) return "self";
  if (!participant.ownerClientId) return "gone";
  if (!has(presentIds, participant.ownerClientId)) return "gone";
  return has(quietIds, participant.ownerClientId) ? "quiet" : "live";
}

// What the chip says, and what hovering it explains. Here rather than in the
// component so the words are as testable as the states.
export const LIVENESS_LABEL: Record<
  Exclude<Liveness, "none" | "self">,
  string
> = {
  live: "Live",
  quiet: "Quiet",
  gone: "Away",
};

export const LIVENESS_TITLE: Record<
  Exclude<Liveness, "none" | "self">,
  string
> = {
  live: "This player's browser is answering — they're at the table.",
  quiet:
    "Connected, but we haven't heard from them for a while — usually a phone with the screen off.",
  gone: "Nobody has this sheet open right now. They may have dropped out, or not picked it up yet.",
};
