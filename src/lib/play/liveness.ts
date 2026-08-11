import { Participant } from "src/lib/play/encounter";

// Whether a live client is behind a roster row. Not stored in the encounter
// document — it's derived by crossing `ownerClientId` (in the document)
// against the presence roster (not).

export type Liveness =
  // Not a person: a monster, an absent ally, anything typed into the order.
  | "none"
  // A sheet this browser holds.
  | "self"
  // Owner present and heard from recently.
  | "live"
  // Owner present but stale — usually a backgrounded phone, not a drop.
  | "quiet"
  // No owner present: left without a graceful leave, or a brought sheet
  // nobody picked up.
  | "gone";

export interface LivenessContext {
  clientId: string;
  presentIds: Set<string> | string[];
  quietIds: Set<string> | string[];
  // With no session, every row is "self" or "none" rather than "gone".
  connected: boolean;
}

const has = (ids: Set<string> | string[], id: string) =>
  Array.isArray(ids) ? ids.includes(id) : ids.has(id);

export function participantLiveness(
  participant: Participant,
  { clientId, presentIds, quietIds, connected }: LivenessContext,
): Liveness {
  if (!participant.characterUuid) return "none";
  if (!connected)
    return participant.ownerClientId === clientId ? "self" : "none";
  if (participant.ownerClientId === clientId) return "self";
  if (!participant.ownerClientId) return "gone";
  if (!has(presentIds, participant.ownerClientId)) return "gone";
  return has(quietIds, participant.ownerClientId) ? "quiet" : "live";
}

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
