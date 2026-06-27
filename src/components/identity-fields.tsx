import { useSharingSessions } from "src/lib/hooks/use-sharing-session";

// Lets a participant pick the name and highlight color they broadcast to a live
// session. Used in both the join and host-toggle flows.
export default function IdentityFields() {
  const { identity, setIdentity } = useSharingSessions();
  return (
    <div className="identity-fields column">
      <label className="column flex-start">
        Your name in the session
        <input
          type="text"
          value={identity.name}
          onChange={(e) => setIdentity({ ...identity, name: e.target.value })}
        />
      </label>
      <label className="row identity-color">
        Highlight color
        <input
          type="color"
          value={identity.color}
          onChange={(e) => setIdentity({ ...identity, color: e.target.value })}
        />
      </label>
    </div>
  );
}
