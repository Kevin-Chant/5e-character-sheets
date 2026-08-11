import { UUID } from "crypto";
import {
  Identity,
  useSharingSessions,
} from "src/lib/hooks/use-sharing-session";

interface IdentityFieldsProps {
  // Session (character uuid) to edit; omit to edit the persisted default.
  uuid?: UUID;
}

// Picks the name and highlight color a participant broadcasts. With `uuid`
// edits that session's override; without, edits the shared default.
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
