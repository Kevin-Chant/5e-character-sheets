import { useCharacter } from "src/lib/hooks/use-character";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";

// A compact "who's here" view of the other participants in the open
// character's live session, shown in the top bar.
export default function PresenceRoster() {
  const { character } = useCharacter();
  const { getParticipants } = useSharingSessions();
  if (!character) return null;
  const participants = getParticipants(character.uuid);
  if (participants.length === 0) return null;

  return (
    <div className="presence-roster" title="People in this live session">
      {participants.map((p) => (
        <span key={p.clientId} className="presence-chip">
          <span className="presence-dot" style={{ backgroundColor: p.color }} />
          {p.name}
        </span>
      ))}
    </div>
  );
}
