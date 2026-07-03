import { UUID } from "crypto";
import {
  Identity,
  useSharingSessions,
} from "src/lib/hooks/use-sharing-session";

interface IdentityFieldsProps {
  // The session (character uuid) whose identity to edit. Omit to edit the
  // persisted default identity (e.g. from Settings).
  uuid?: UUID;
}

// Lets a participant pick the name and highlight color they broadcast. With a
// `uuid` it edits that session's override; without one it edits the default
// used by any session that hasn't set its own.
export default function IdentityFields({ uuid }: IdentityFieldsProps) {
  const {
    defaultIdentity,
    setDefaultIdentity,
    getIdentity,
    setSessionIdentity,
  } = useSharingSessions();

  const identity = uuid ? getIdentity(uuid) : defaultIdentity;
  const update = (next: Identity) =>
    uuid ? setSessionIdentity(uuid, next) : setDefaultIdentity(next);

  return (
    <div className="identity-fields column">
      <label className="column flex-start">
        {uuid ? "Your name in this session" : "Your default name"}
        <input
          type="text"
          value={identity.name}
          onChange={(e) => update({ ...identity, name: e.target.value })}
        />
      </label>
      <label className="row identity-color">
        Highlight color
        <input
          type="color"
          value={identity.color}
          onChange={(e) => update({ ...identity, color: e.target.value })}
        />
      </label>
    </div>
  );
}
